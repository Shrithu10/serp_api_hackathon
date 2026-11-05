"""Common interface every optimization problem implements.

Agents never look inside a solution. They only use the operators below, which
lets one Genetic Algorithm or Simulated Annealing implementation work on every
problem type that declares the matching capability.
"""
from __future__ import annotations

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable

# Capabilities a problem can declare. Agents list the ones they need.
CAP_RANDOM = "random_solution"
CAP_NEIGHBORHOOD = "neighborhood"
CAP_CROSSOVER = "crossover"
CAP_CONSTRUCTIVE = "constructive"
CAP_CPSAT = "cpsat"

# Weight applied to constraint violations so any feasible candidate always
# scores better than any infeasible one of similar objective.
VIOLATION_PENALTY = 1e6


@dataclass(slots=True)
class Evaluation:
    objective: float
    feasible: bool
    violation: float = 0.0


@dataclass
class CpsatFormulation:
    """A built CP-SAT model plus the glue needed to read its solutions back."""

    model: Any
    # Turns a solver (or a solution callback) into a solution in the problem's
    # own encoding, so it can be shared with the metaheuristic agents.
    extract: Callable[[Any], Any]
    # CP-SAT works on integers. objective_in_model / scale = real objective.
    scale: float = 1.0
    notes: list[str] = field(default_factory=list)


class Problem(ABC):
    type_name: str = ""
    title: str = ""
    sense: str = "min"  # "min" or "max"
    objective_name: str = "objective"
    capabilities: frozenset[str] = frozenset()

    def __init__(self, instance: Any):
        self.instance = instance

    # ---- size / description -------------------------------------------------
    @abstractmethod
    def size(self) -> int: ...

    def summary(self) -> dict:
        return {"size": self.size()}

    # ---- encoding operators -------------------------------------------------
    @abstractmethod
    def random_solution(self, rng: random.Random) -> Any: ...

    @abstractmethod
    def copy(self, sol: Any) -> Any: ...

    def neighborhoods(self) -> list[str]:
        return []

    def apply_move(self, sol: Any, kind: str, rng: random.Random) -> Any:
        raise NotImplementedError

    def crossover(self, a: Any, b: Any, rng: random.Random) -> Any:
        raise NotImplementedError

    def constructive_heuristics(self) -> dict[str, Callable[[random.Random, float], Any]]:
        """name -> fn(rng, randomness in [0, 1]) -> solution."""
        return {}

    def cpsat_limit(self) -> tuple[bool, str]:
        """Whether this instance is small enough for an exact CP-SAT model."""
        return True, ""

    def build_cpsat(self, hint: Any | None = None) -> CpsatFormulation:
        raise NotImplementedError

    # ---- evaluation ---------------------------------------------------------
    @abstractmethod
    def evaluate(self, sol: Any) -> Evaluation: ...

    @abstractmethod
    def decode(self, sol: Any) -> dict:
        """Full, human-readable result (schedule, routes, selection, ...)."""

    @abstractmethod
    def validate(self, decoded: dict) -> list[str]:
        """Independent checker: re-verifies a decoded result against the raw
        instance data, without trusting the decoder. Returns violations."""

    @abstractmethod
    def to_json(self, sol: Any) -> Any: ...

    @abstractmethod
    def from_json(self, data: Any) -> Any: ...

    def score(self, ev: Evaluation) -> float:
        """Lower is better, for every problem."""
        base = ev.objective if self.sense == "min" else -ev.objective
        return base + VIOLATION_PENALTY * ev.violation

    def better(self, a: float, b: float) -> bool:
        return a < b - 1e-9


def ox_crossover(a: list[int], b: list[int], rng: random.Random) -> list[int]:
    """Order crossover (OX1) for permutations."""
    n = len(a)
    if n < 2:
        return list(a)
    i, j = sorted(rng.sample(range(n), 2))
    child = [-1] * n
    child[i : j + 1] = a[i : j + 1]
    taken = set(a[i : j + 1])
    fill = [g for g in b if g not in taken]
    k = 0
    for idx in list(range(j + 1, n)) + list(range(0, i)):
        child[idx] = fill[k]
        k += 1
    return child


def perm_move(perm: list[int], kind: str, rng: random.Random) -> list[int]:
    """Generic permutation neighborhoods: swap, insert, reverse (2-opt)."""
    p = list(perm)
    n = len(p)
    if n < 2:
        return p
    i, j = rng.sample(range(n), 2)
    if kind == "swap":
        p[i], p[j] = p[j], p[i]
    elif kind == "insert":
        g = p.pop(i)
        p.insert(j, g)
    elif kind == "reverse":
        if i > j:
            i, j = j, i
        p[i : j + 1] = reversed(p[i : j + 1])
    else:
        raise ValueError(f"unknown move {kind}")
    return p
