"""Agent base class.

An agent owns an independent search state and a random generator. The
coordinator drives it by calling `step()` repeatedly inside the time slice it
was given. Whenever the agent's own best improves, the candidate is queued in
`pending` and the coordinator validates it before it can become the global
incumbent.
"""
from __future__ import annotations

import math
import random
import time
from typing import Any, Callable

from ..problems.base import Evaluation, Problem


class Agent:
    key = ""
    name = ""
    description = ""
    requires: frozenset[str] = frozenset()
    # Background agents run in their own native threads (CP-SAT); the
    # coordinator only polls them instead of giving them time slices.
    background = False
    param_spec: list[dict] = []

    def __init__(self, problem: Problem, params: dict | None, seed: int):
        self.problem = problem
        self.params = {p["key"]: p["default"] for p in self.param_spec}
        for k, v in (params or {}).items():
            if k in self.params:
                self.params[k] = v
        self.rng = random.Random(seed)
        self.best: Any = None
        self.best_score = math.inf
        self.best_eval: Evaluation | None = None
        self.iterations = 0
        self.evaluations = 0
        self.improvements = 0
        self.migrants_offered = 0
        self.migrants_accepted = 0
        self.status = "idle"
        self.done = False
        self.message = ""
        self.pending: list[tuple[Any, Evaluation]] = []
        self.started_at: float | None = None
        self.time_to_best: float | None = None
        self.cpu_time = 0.0
        # Set by the coordinator: returns (solution, score) of the incumbent.
        self.incumbent: Callable[[], tuple[Any, float] | None] = lambda: None

    # ---- capability check ---------------------------------------------------
    @classmethod
    def supports(cls, problem: Problem) -> tuple[bool, str]:
        missing = cls.requires - problem.capabilities
        if missing:
            return False, f"{problem.title} does not provide: {', '.join(sorted(missing))}"
        return True, "all required capabilities available"

    # ---- helpers ------------------------------------------------------------
    def evaluate(self, sol) -> tuple[float, Evaluation]:
        ev = self.problem.evaluate(sol)
        self.evaluations += 1
        sc = self.problem.score(ev)
        if sc < self.best_score - 1e-9:
            self.best = self.problem.copy(sol)
            self.best_score = sc
            self.best_eval = ev
            self.improvements += 1
            self.time_to_best = (time.monotonic() - self.started_at) if self.started_at else 0.0
            self.pending.append((self.best, ev))
        return sc, ev

    def objective(self) -> float | None:
        return self.best_eval.objective if self.best_eval else None

    # ---- lifecycle ----------------------------------------------------------
    def start(self) -> None:
        self.started_at = time.monotonic()
        self.status = "running"
        self.initialize()

    def initialize(self) -> None:
        pass

    def step(self) -> None:
        raise NotImplementedError

    def receive(self, sol, score: float) -> bool:
        """A migrant from the coordinator. Return True if adopted."""
        return False

    def stop(self) -> None:
        if not self.done:
            self.done = True
        if self.status == "running":
            self.status = "stopped"

    def telemetry(self) -> dict:
        return {}

    def info(self) -> dict:
        return {
            "status": self.status,
            "best_objective": self.objective(),
            "best_feasible": self.best_eval.feasible if self.best_eval else None,
            "iterations": self.iterations,
            "evaluations": self.evaluations,
            "improvements": self.improvements,
            "migrants_offered": self.migrants_offered,
            "migrants_accepted": self.migrants_accepted,
            "time_to_best": round(self.time_to_best, 3) if self.time_to_best is not None else None,
            "cpu_time": round(self.cpu_time, 3),
            "message": self.message,
            "telemetry": self.telemetry(),
        }

    @classmethod
    def catalog(cls) -> dict:
        return {
            "key": cls.key,
            "name": cls.name,
            "description": cls.description,
            "requires": sorted(cls.requires),
            "background": cls.background,
            "params": cls.param_spec,
        }

    # ---- shared local improvement ------------------------------------------
    def hill_climb(self, sol, score, steps: int):
        """Sampled first-improvement hill climbing over all neighbourhoods."""
        moves = self.problem.neighborhoods()
        if not moves:
            return sol, score
        for _ in range(steps):
            cand = self.problem.apply_move(sol, self.rng.choice(moves), self.rng)
            sc, _ = self.evaluate(cand)
            if sc <= score:
                sol, score = cand, sc
        return sol, score
