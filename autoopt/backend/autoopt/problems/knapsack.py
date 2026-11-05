"""Multi-dimensional 0/1 knapsack with conflict pairs.

Choose a subset of items that maximises total value, such that for every
resource dimension the summed weight stays within capacity, and no two items
of a conflict pair are chosen together.

Encoding used by the metaheuristics: a permutation of the items read as a
priority list. The decoder adds items in that order whenever they still fit
and do not conflict, so every candidate is feasible and every optimal subset
is reachable (put its items first).
"""
from __future__ import annotations

import random

import numpy as np
from pydantic import BaseModel, Field, model_validator
from scipy.optimize import linprog

from .base import (
    CAP_CONSTRUCTIVE,
    CAP_CPSAT,
    CAP_CROSSOVER,
    CAP_NEIGHBORHOOD,
    CAP_RANDOM,
    CpsatFormulation,
    Evaluation,
    Problem,
    ox_crossover,
    perm_move,
)


class Item(BaseModel):
    name: str
    value: int = Field(ge=0)
    weights: list[int]


class KnapsackInstance(BaseModel):
    items: list[Item] = Field(min_length=1)
    capacities: list[int] = Field(min_length=1)
    dimension_names: list[str] | None = None
    conflicts: list[tuple[int, int]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> "KnapsackInstance":
        d = len(self.capacities)
        for i, it in enumerate(self.items):
            if len(it.weights) != d:
                raise ValueError(f"item {i} has {len(it.weights)} weights, expected {d}")
            if any(w < 0 for w in it.weights):
                raise ValueError(f"item {i} has a negative weight")
        if any(c < 0 for c in self.capacities):
            raise ValueError("capacities must be non-negative")
        for a, b in self.conflicts:
            if not (0 <= a < len(self.items) and 0 <= b < len(self.items)) or a == b:
                raise ValueError(f"bad conflict pair ({a}, {b})")
        if self.dimension_names is not None and len(self.dimension_names) != d:
            raise ValueError("dimension_names must match capacities")
        return self


class KnapsackProblem(Problem):
    type_name = "knapsack"
    title = "Multi-dimensional Knapsack"
    sense = "max"
    objective_name = "total value"
    capabilities = frozenset({CAP_RANDOM, CAP_NEIGHBORHOOD, CAP_CROSSOVER, CAP_CONSTRUCTIVE, CAP_CPSAT})

    def __init__(self, instance: KnapsackInstance):
        super().__init__(instance)
        self.n = len(instance.items)
        self.d = len(instance.capacities)
        self.val = [it.value for it in instance.items]
        self.w = [list(it.weights) for it in instance.items]
        self.cap = list(instance.capacities)
        self.conf: list[set[int]] = [set() for _ in range(self.n)]
        for a, b in instance.conflicts:
            self.conf[a].add(b)
            self.conf[b].add(a)
        self._lp = None

    def size(self):
        return self.n

    def lp_relaxation(self):
        """LP relaxation via SciPy/HiGHS: an upper bound plus dual prices of
        each capacity row (used by the LP-guided greedy heuristic)."""
        if self._lp is None:
            A = [[self.w[i][k] for i in range(self.n)] for k in range(self.d)]
            b = list(self.cap)
            for a, c in self.instance.conflicts:
                row = [0] * self.n
                row[a] = row[c] = 1
                A.append(row)
                b.append(1)
            res = linprog(
                c=-np.array(self.val, dtype=float),
                A_ub=np.array(A, dtype=float),
                b_ub=np.array(b, dtype=float),
                bounds=[(0, 1)] * self.n,
                method="highs",
            )
            if res.status == 0:
                duals = [-float(x) for x in res.ineqlin.marginals[: self.d]]
                self._lp = {"bound": -float(res.fun), "duals": duals}
            else:
                self._lp = {"bound": None, "duals": [1.0 / max(1, c) for c in self.cap]}
        return self._lp

    def summary(self):
        lp = self.lp_relaxation()
        return {
            "size": self.n,
            "items": self.n,
            "dimensions": self.d,
            "conflicts": len(self.instance.conflicts),
            "lp_upper_bound": round(lp["bound"], 3) if lp["bound"] is not None else None,
        }

    # ---- encoding -----------------------------------------------------------
    def random_solution(self, rng):
        p = list(range(self.n))
        rng.shuffle(p)
        return p

    def copy(self, sol):
        return list(sol)

    def neighborhoods(self):
        return ["swap", "insert", "promote"]

    def apply_move(self, sol, kind, rng):
        if kind == "promote":
            # Move a random item into the first part of the list, which is
            # where the decoder commits items.
            p = list(sol)
            i = rng.randrange(self.n)
            g = p.pop(i)
            p.insert(rng.randrange(max(1, self.n // 3)), g)
            return p
        return perm_move(sol, kind, rng)

    def crossover(self, a, b, rng):
        return ox_crossover(a, b, rng)

    def _select(self, perm):
        load = [0] * self.d
        chosen = []
        chosen_set = set()
        value = 0
        cap, w, conf = self.cap, self.w, self.conf
        for i in perm:
            wi = w[i]
            ok = True
            for k in range(self.d):
                if load[k] + wi[k] > cap[k]:
                    ok = False
                    break
            if not ok or (conf[i] and not conf[i].isdisjoint(chosen_set)):
                continue
            for k in range(self.d):
                load[k] += wi[k]
            chosen.append(i)
            chosen_set.add(i)
            value += self.val[i]
        return value, chosen, load

    def evaluate(self, sol):
        value, _, _ = self._select(sol)
        return Evaluation(objective=float(value), feasible=True)

    def decode(self, sol):
        value, chosen, load = self._select(sol)
        inst = self.instance
        return {
            "objective": float(value),
            "total_value": value,
            "selected": sorted(chosen),
            "loads": load,
            "capacities": list(self.cap),
            "dimension_names": inst.dimension_names or [f"R{k + 1}" for k in range(self.d)],
            "items": [it.model_dump() for it in inst.items],
            "conflicts": [list(c) for c in inst.conflicts],
        }

    def validate(self, decoded):
        errs = []
        inst = self.instance
        sel = decoded["selected"]
        if len(set(sel)) != len(sel):
            errs.append("an item is selected twice")
        s = set(sel)
        for k, c in enumerate(inst.capacities):
            tot = sum(inst.items[i].weights[k] for i in sel)
            if tot > c:
                errs.append(f"capacity {k} exceeded ({tot} > {c})")
        for a, b in inst.conflicts:
            if a in s and b in s:
                errs.append(f"conflicting items {a} and {b} both selected")
        if sum(inst.items[i].value for i in sel) != decoded["total_value"]:
            errs.append("reported value does not match the selection")
        return errs

    def to_json(self, sol):
        return list(sol)

    def from_json(self, data):
        return list(data)

    # ---- constructive heuristics -------------------------------------------
    def _ratio_greedy(self, key):
        def build(rng, alpha):
            scored = []
            for i in range(self.n):
                s = key(i)
                if alpha > 0:
                    s *= 1 + alpha * 0.4 * (rng.random() - 0.5)
                scored.append((s, i))
            scored.sort(reverse=True)
            return [i for _, i in scored]

        return build

    def constructive_heuristics(self):
        norm = [1.0 / max(1, c) for c in self.cap]
        duals = self.lp_relaxation()["duals"]

        def density(i):
            return self.val[i] / (1e-9 + sum(self.w[i][k] * norm[k] for k in range(self.d)))

        def lp_density(i):
            return self.val[i] / (1e-9 + sum(self.w[i][k] * max(duals[k], 1e-6) for k in range(self.d)))

        return {
            "Value density (normalised)": self._ratio_greedy(density),
            "LP-dual weighted density": self._ratio_greedy(lp_density),
            "Highest value first": self._ratio_greedy(lambda i: float(self.val[i])),
            "Lightest first": self._ratio_greedy(lambda i: -sum(self.w[i][k] * norm[k] for k in range(self.d))),
        }

    # ---- CP-SAT -------------------------------------------------------------
    def cpsat_limit(self):
        if self.n > 5000:
            return False, "more than 5000 items"
        return True, ""

    def build_cpsat(self, hint=None):
        from ortools.sat.python import cp_model

        model = cp_model.CpModel()
        x = [model.NewBoolVar(f"x{i}") for i in range(self.n)]
        for k in range(self.d):
            model.Add(sum(self.w[i][k] * x[i] for i in range(self.n)) <= self.cap[k])
        for a, b in self.instance.conflicts:
            model.AddBoolOr([x[a].Not(), x[b].Not()])
        model.Maximize(sum(self.val[i] * x[i] for i in range(self.n)))
        if hint is not None:
            _, chosen, _ = self._select(hint)
            cs = set(chosen)
            for i in range(self.n):
                model.AddHint(x[i], 1 if i in cs else 0)

        def extract(src):
            sel = [i for i in range(self.n) if src.Value(x[i])]
            s = set(sel)
            return sel + [i for i in range(self.n) if i not in s]

        return CpsatFormulation(
            model=model,
            extract=extract,
            notes=[f"{self.n} boolean variables", f"{self.d} capacity constraints",
                   f"{len(self.instance.conflicts)} conflict clauses"],
        )


def generate(params: dict, rng: random.Random) -> dict:
    n = int(params.get("items", 40))
    d = int(params.get("dimensions", 3))
    tight = float(params.get("tightness", 0.4))
    n_conf = int(params.get("conflicts", 5))
    correlated = bool(params.get("correlated", True))
    items = []
    for i in range(n):
        w = [rng.randint(5, 60) for _ in range(d)]
        if correlated:
            v = int(sum(w) / d + rng.randint(0, 25))
        else:
            v = rng.randint(5, 100)
        items.append({"name": f"Item {i + 1}", "value": v, "weights": w})
    caps = [int(tight * sum(it["weights"][k] for it in items)) for k in range(d)]
    conflicts = set()
    while len(conflicts) < min(n_conf, n * (n - 1) // 2):
        a, b = sorted(rng.sample(range(n), 2))
        conflicts.add((a, b))
    names = ["Weight", "Volume", "Budget", "Power", "Crew", "Time", "Heat", "Fuel"]
    return {
        "items": items,
        "capacities": caps,
        "dimension_names": [names[k] if k < len(names) else f"R{k + 1}" for k in range(d)],
        "conflicts": sorted([list(c) for c in conflicts]),
    }


GENERATOR_PARAMS = [
    {"key": "items", "label": "Items", "default": 40, "min": 2, "max": 2000},
    {"key": "dimensions", "label": "Resource dimensions", "default": 3, "min": 1, "max": 8},
    {"key": "tightness", "label": "Capacity tightness (0-1)", "default": 0.4, "min": 0.05, "max": 0.95, "step": 0.05},
    {"key": "conflicts", "label": "Conflict pairs", "default": 5, "min": 0, "max": 200},
    {"key": "correlated", "label": "Value correlated with weight", "default": True, "type": "bool"},
]
