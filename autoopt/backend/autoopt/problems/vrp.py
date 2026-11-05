"""Capacitated Vehicle Routing (CVRP).

A fleet of identical vehicles with a load capacity starts and ends at one
depot. Every customer must be visited exactly once, no route may carry more
than the capacity, and at most `vehicles` routes may be used. Objective:
minimise total Euclidean travel distance.

Encoding used by the metaheuristics: a "giant tour" (a permutation of the
customers). The decoder cuts it into routes with Prins' optimal split, which
is exact for a given order. Using more routes than vehicles is a violation.
"""
from __future__ import annotations

import math
import random

import numpy as np
from pydantic import BaseModel, Field, model_validator
from scipy.spatial.distance import cdist

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

SCALE = 100  # CP-SAT works on integer distances in hundredths


class Point(BaseModel):
    x: float
    y: float


class Customer(BaseModel):
    name: str
    x: float
    y: float
    demand: int = Field(ge=0)


class VrpInstance(BaseModel):
    depot: Point
    customers: list[Customer] = Field(min_length=1)
    vehicles: int = Field(ge=1)
    capacity: int = Field(ge=1)

    @model_validator(mode="after")
    def _check(self) -> "VrpInstance":
        for c in self.customers:
            if c.demand > self.capacity:
                raise ValueError(f"customer {c.name} demand {c.demand} exceeds vehicle capacity")
        total = sum(c.demand for c in self.customers)
        if total > self.vehicles * self.capacity:
            raise ValueError(
                f"total demand {total} exceeds fleet capacity {self.vehicles * self.capacity}"
            )
        return self


class VrpProblem(Problem):
    type_name = "vrp"
    title = "Capacitated Vehicle Routing"
    sense = "min"
    objective_name = "total distance"
    capabilities = frozenset({CAP_RANDOM, CAP_NEIGHBORHOOD, CAP_CROSSOVER, CAP_CONSTRUCTIVE, CAP_CPSAT})

    def __init__(self, instance: VrpInstance):
        super().__init__(instance)
        pts = np.array([[instance.depot.x, instance.depot.y]] + [[c.x, c.y] for c in instance.customers])
        self.points = pts
        dm = cdist(pts, pts)
        self.D: list[list[float]] = dm.tolist()  # node 0 = depot, customer i = node i+1
        self.n = len(instance.customers)
        self.dem = [c.demand for c in instance.customers]
        self.cap = instance.capacity
        self.K = instance.vehicles
        # Distances indexed by customer index for the hot loops.
        self.d0 = [self.D[0][i + 1] for i in range(self.n)]
        self.dc = [[self.D[i + 1][j + 1] for j in range(self.n)] for i in range(self.n)]

    def size(self) -> int:
        return self.n

    def summary(self) -> dict:
        return {
            "size": self.n,
            "customers": self.n,
            "vehicles": self.K,
            "capacity": self.cap,
            "total_demand": sum(self.dem),
            "min_vehicles": math.ceil(sum(self.dem) / self.cap),
        }

    # ---- encoding -----------------------------------------------------------
    def random_solution(self, rng):
        p = list(range(self.n))
        rng.shuffle(p)
        return p

    def copy(self, sol):
        return list(sol)

    def neighborhoods(self):
        return ["swap", "insert", "reverse"]

    def apply_move(self, sol, kind, rng):
        return perm_move(sol, kind, rng)

    def crossover(self, a, b, rng):
        return ox_crossover(a, b, rng)

    # ---- decoder (Prins split) ----------------------------------------------
    def _split(self, tour):
        n = self.n
        inf = float("inf")
        V = [inf] * (n + 1)
        R = [0] * (n + 1)  # routes used, for tie-breaking towards fewer routes
        P = [0] * (n + 1)
        V[0] = 0.0
        d0, dc, dem, cap = self.d0, self.dc, self.dem, self.cap
        for i in range(n):
            if V[i] == inf:
                continue
            load = 0
            cost = 0.0
            prev = -1
            vi, ri = V[i], R[i] + 1
            for j in range(i, n):
                c = tour[j]
                load += dem[c]
                if load > cap:
                    break
                if prev < 0:
                    cost = d0[c] * 2
                else:
                    cost += dc[prev][c] + d0[c] - d0[prev]
                prev = c
                v = vi + cost
                if v < V[j + 1] - 1e-9 or (abs(v - V[j + 1]) <= 1e-9 and ri < R[j + 1]):
                    V[j + 1] = v
                    R[j + 1] = ri
                    P[j + 1] = i
        routes = []
        j = n
        while j > 0:
            i = P[j]
            routes.append(list(tour[i:j]))
            j = i
        routes.reverse()
        return V[n], routes

    def evaluate(self, sol) -> Evaluation:
        cost, routes = self._split(sol)
        over = max(0, len(routes) - self.K)
        return Evaluation(objective=cost, feasible=over == 0, violation=float(over))

    def _route_dist(self, r):
        if not r:
            return 0.0
        d = self.d0[r[0]] + self.d0[r[-1]]
        for a, b in zip(r, r[1:]):
            d += self.dc[a][b]
        return d

    def decode(self, sol) -> dict:
        cost, routes = self._split(sol)
        out = []
        for k, r in enumerate(routes):
            out.append(
                {
                    "vehicle": k,
                    "stops": r,
                    "load": sum(self.dem[c] for c in r),
                    "distance": round(self._route_dist(r), 4),
                }
            )
        inst = self.instance
        return {
            "objective": round(cost, 4),
            "total_distance": round(cost, 4),
            "routes": out,
            "depot": inst.depot.model_dump(),
            "customers": [c.model_dump() for c in inst.customers],
            "capacity": self.cap,
            "vehicles": self.K,
        }

    def validate(self, decoded: dict) -> list[str]:
        errs = []
        inst = self.instance
        seen: dict[int, int] = {}
        total = 0.0
        if len(decoded["routes"]) > inst.vehicles:
            errs.append(f"{len(decoded['routes'])} routes used but only {inst.vehicles} vehicles")
        for r in decoded["routes"]:
            load = 0
            prev = (inst.depot.x, inst.depot.y)
            dist = 0.0
            for c in r["stops"]:
                if not (0 <= c < len(inst.customers)):
                    errs.append(f"unknown customer {c}")
                    continue
                seen[c] = seen.get(c, 0) + 1
                cu = inst.customers[c]
                load += cu.demand
                dist += math.dist(prev, (cu.x, cu.y))
                prev = (cu.x, cu.y)
            dist += math.dist(prev, (inst.depot.x, inst.depot.y))
            total += dist
            if load > inst.capacity:
                errs.append(f"vehicle {r['vehicle']} overloaded ({load} > {inst.capacity})")
        for c in range(len(inst.customers)):
            if seen.get(c, 0) != 1:
                errs.append(f"customer {c} visited {seen.get(c, 0)} times")
        if abs(total - decoded["total_distance"]) > 1e-3 * max(1.0, total):
            errs.append("reported distance does not match the routes")
        return errs

    def to_json(self, sol):
        return list(sol)

    def from_json(self, data):
        return list(data)

    # ---- constructive heuristics -------------------------------------------
    def constructive_heuristics(self):
        return {
            "Nearest neighbour": self._nearest_neighbour,
            "Clarke-Wright savings": self._savings,
            "Sweep": self._sweep,
        }

    def _nearest_neighbour(self, rng, alpha):
        left = set(range(self.n))
        tour = []
        while left:
            load, cur = 0, -1
            while True:
                cands = [c for c in left if load + self.dem[c] <= self.cap]
                if not cands:
                    break
                dist = (lambda c: self.d0[c]) if cur < 0 else (lambda c: self.dc[cur][c])
                cands.sort(key=dist)
                k = max(1, int(round(alpha * min(5, len(cands))))) if alpha > 0 else 1
                c = cands[rng.randrange(k)]
                left.remove(c)
                tour.append(c)
                load += self.dem[c]
                cur = c
        return tour

    def _savings(self, rng, alpha):
        routes = {i: [i] for i in range(self.n)}
        where = {i: i for i in range(self.n)}
        load = {i: self.dem[i] for i in range(self.n)}
        sav = []
        for i in range(self.n):
            for j in range(i + 1, self.n):
                s = self.d0[i] + self.d0[j] - self.dc[i][j]
                if alpha > 0:
                    s *= 1 + alpha * 0.3 * (rng.random() - 0.5)
                sav.append((s, i, j))
        sav.sort(reverse=True)
        for s, i, j in sav:
            ri, rj = where[i], where[j]
            if ri == rj or load[ri] + load[rj] > self.cap:
                continue
            a, b = routes[ri], routes[rj]
            # Only join at route ends.
            if a[-1] == i and b[0] == j:
                new = a + b
            elif a[0] == i and b[-1] == j:
                new = b + a
            elif a[-1] == i and b[-1] == j:
                new = a + b[::-1]
            elif a[0] == i and b[0] == j:
                new = a[::-1] + b
            else:
                continue
            routes[ri] = new
            load[ri] += load[rj]
            del routes[rj], load[rj]
            for c in new:
                where[c] = ri
        tour = []
        for r in routes.values():
            tour.extend(r)
        return tour

    def _sweep(self, rng, alpha):
        dx = self.points[1:, 0] - self.points[0, 0]
        dy = self.points[1:, 1] - self.points[0, 1]
        ang = np.arctan2(dy, dx)
        offset = rng.uniform(-math.pi, math.pi) if alpha > 0 else 0.0
        ang = (ang - offset) % (2 * math.pi)
        return [int(i) for i in np.argsort(ang, kind="stable")]

    # ---- CP-SAT -------------------------------------------------------------
    def cpsat_limit(self):
        if self.n > 60:
            return False, f"{self.n} customers is above the CP-SAT routing model limit of 60"
        return True, ""

    def build_cpsat(self, hint=None) -> CpsatFormulation:
        from ortools.sat.python import cp_model

        model = cp_model.CpModel()
        N = self.n + 1
        dem = [0] + self.dem
        arcs, lit = [], {}
        for i in range(N):
            for j in range(N):
                if i == j:
                    continue
                v = model.NewBoolVar(f"a{i}_{j}")
                lit[(i, j)] = v
                arcs.append((i, j, v))
        model.AddMultipleCircuit(arcs)
        load = [None] + [model.NewIntVar(dem[j], self.cap, f"u{j}") for j in range(1, N)]
        for (i, j), v in lit.items():
            if i != 0 and j != 0:
                model.Add(load[j] >= load[i] + dem[j]).OnlyEnforceIf(v)
        model.Add(sum(lit[(0, j)] for j in range(1, N)) <= self.K)
        cost = {k: int(round(self.D[k[0]][k[1]] * SCALE)) for k in lit}
        model.Minimize(sum(cost[k] * v for k, v in lit.items()))

        if hint is not None:
            _, routes = self._split(hint)
            used = set()
            for r in routes:
                nodes = [0] + [c + 1 for c in r] + [0]
                for a, b in zip(nodes, nodes[1:]):
                    used.add((a, b))
                acc = 0
                for c in r:
                    acc += self.dem[c]
                    model.AddHint(load[c + 1], acc)
            for k, v in lit.items():
                model.AddHint(v, 1 if k in used else 0)

        def extract(src):
            succ = {}
            starts = []
            for (i, j), v in lit.items():
                if src.Value(v):
                    if i == 0:
                        starts.append(j)
                    else:
                        succ[i] = j
            tour = []
            for s in sorted(starts):
                cur = s
                guard = 0
                while cur != 0 and guard <= N:
                    tour.append(cur - 1)
                    cur = succ.get(cur, 0)
                    guard += 1
            return tour

        return CpsatFormulation(
            model=model,
            extract=extract,
            scale=SCALE,
            notes=[
                f"{len(arcs)} arc literals with multiple-circuit constraint",
                "capacity via load propagation on arcs",
                f"at most {self.K} routes leave the depot",
                "distances rounded to 1/100 inside the model",
            ],
        )


def generate(params: dict, rng: random.Random) -> dict:
    n = int(params.get("customers", 20))
    cap = int(params.get("capacity", 50))
    lo, hi = int(params.get("min_demand", 3)), int(params.get("max_demand", 15))
    hi = min(hi, cap)
    lo = min(lo, hi)
    clustered = bool(params.get("clustered", False))
    customers = []
    centers = [(rng.uniform(10, 90), rng.uniform(10, 90)) for _ in range(max(2, n // 8))]
    for i in range(n):
        if clustered:
            cx, cy = rng.choice(centers)
            x, y = rng.gauss(cx, 8), rng.gauss(cy, 8)
        else:
            x, y = rng.uniform(0, 100), rng.uniform(0, 100)
        customers.append(
            {
                "name": f"C{i + 1}",
                "x": round(min(100, max(0, x)), 2),
                "y": round(min(100, max(0, y)), 2),
                "demand": rng.randint(lo, hi),
            }
        )
    total = sum(c["demand"] for c in customers)
    slack = int(params.get("spare_vehicles", 1))
    vehicles = math.ceil(total / cap) + slack
    return {
        "depot": {"x": 50.0, "y": 50.0},
        "customers": customers,
        "vehicles": vehicles,
        "capacity": cap,
    }


GENERATOR_PARAMS = [
    {"key": "customers", "label": "Customers", "default": 20, "min": 2, "max": 300},
    {"key": "capacity", "label": "Vehicle capacity", "default": 50, "min": 1, "max": 1000},
    {"key": "min_demand", "label": "Min demand", "default": 3, "min": 0, "max": 500},
    {"key": "max_demand", "label": "Max demand", "default": 15, "min": 1, "max": 500},
    {"key": "spare_vehicles", "label": "Spare vehicles", "default": 1, "min": 0, "max": 10},
    {"key": "clustered", "label": "Clustered customers", "default": False, "type": "bool"},
]
