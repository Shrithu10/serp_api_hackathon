from __future__ import annotations

import os
import threading
import time

from ..problems.base import CAP_CPSAT
from .base import Agent


class CpsatAgent(Agent):
    key = "cpsat"
    name = "CP-SAT Solver"
    description = (
        "Formulates the instance as an exact constraint programming model and "
        "solves it with OR-Tools CP-SAT in native threads. Reports solver status, "
        "the proven bound and the optimality gap. Uses the incumbent from the "
        "other agents as a solution hint."
    )
    requires = frozenset({CAP_CPSAT})
    background = True
    param_spec = [
        {"key": "time_limit", "label": "Time limit, s (0 = run budget)", "default": 0, "min": 0, "max": 3600},
        {"key": "workers", "label": "Search workers", "default": max(1, min(8, (os.cpu_count() or 2) - 1)), "min": 1, "max": 32},
        {"key": "warm_start_wait", "label": "Wait for hint, s", "default": 0.5, "min": 0, "max": 30, "step": 0.1},
        {"key": "use_hint", "label": "Use incumbent as hint", "default": True, "type": "bool"},
    ]

    @classmethod
    def supports(cls, problem):
        ok, reason = super().supports(problem)
        if not ok:
            return ok, reason
        ok, why = problem.cpsat_limit()
        return (ok, why or "instance fits the exact model")

    def __init__(self, problem, params, seed):
        super().__init__(problem, params, seed)
        self.seed = seed
        self.run_budget = None
        self._thread = None
        self._lock = threading.Lock()
        self._found = []
        self._stop = threading.Event()
        self.solver_status = "NOT_STARTED"
        self.bound = None
        self.model_objective = None
        self.gap = None
        self.wall = 0.0
        self.notes: list[str] = []
        self.hinted = False
        self.stats = {}

    def initialize(self):
        self.status = "waiting"
        self.message = "waiting for a warm-start hint"

    def _launch(self):
        from ortools.sat.python import cp_model

        hint = None
        if self.params["use_hint"]:
            inc = self.incumbent()
            if inc is not None:
                hint = inc[0]
        self.hinted = hint is not None
        t_build = time.monotonic()
        form = self.problem.build_cpsat(hint)
        self.notes = form.notes + [f"model built in {time.monotonic() - t_build:.2f}s"]
        self.scale = form.scale
        limit = float(self.params["time_limit"]) or (self.run_budget or 30)
        if self.run_budget:
            limit = min(limit, max(0.5, self.run_budget - (time.monotonic() - self.started_at)))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = limit
        solver.parameters.num_workers = int(self.params["workers"])
        solver.parameters.random_seed = self.seed % (2**31)
        agent = self

        class Cb(cp_model.CpSolverSolutionCallback):
            def on_solution_callback(self):
                sol = form.extract(self)
                with agent._lock:
                    agent._found.append(sol)
                    agent.model_objective = self.ObjectiveValue() / form.scale
                    agent.bound = self.BestObjectiveBound() / form.scale
                    agent.wall = self.WallTime()
                if agent._stop.is_set():
                    self.StopSearch()

        cb = Cb()
        self._solver = solver

        def run():
            st = solver.Solve(form.model, cb)
            with self._lock:
                self.solver_status = solver.StatusName(st)
                self.wall = solver.WallTime()
                if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                    self.model_objective = solver.ObjectiveValue() / form.scale
                    self.bound = solver.BestObjectiveBound() / form.scale
                self.stats = {
                    "conflicts": solver.NumConflicts(),
                    "branches": solver.NumBranches(),
                }
                self._finished = True

        self._finished = False
        self.solver_status = "SOLVING"
        self.status = "running"
        self.message = "solving" + (" with hint" if self.hinted else "")
        self._thread = threading.Thread(target=run, name="cpsat", daemon=True)
        self._thread.start()

    def step(self):
        if self._thread is None:
            waited = time.monotonic() - self.started_at
            if self.incumbent() is not None or waited >= float(self.params["warm_start_wait"]):
                self._launch()
            return
        with self._lock:
            found, self._found = self._found, []
        for sol in found:
            self.evaluate(sol)
            self.iterations += 1
        if self.bound is not None and self.model_objective is not None:
            denom = max(abs(self.model_objective), 1e-9)
            self.gap = abs(self.model_objective - self.bound) / denom
        if getattr(self, "_finished", False):
            self.done = True
            self.status = "optimal" if self.solver_status == "OPTIMAL" else (
                "finished" if self.solver_status == "FEASIBLE" else self.solver_status.lower()
            )
            self.message = {
                "OPTIMAL": "proved optimal",
                "FEASIBLE": "time limit reached with a feasible solution",
                "INFEASIBLE": "model proved infeasible",
                "UNKNOWN": "no solution within the time limit",
            }.get(self.solver_status, self.solver_status)

    def stop(self):
        self._stop.set()
        solver = getattr(self, "_solver", None)
        if solver is not None and not getattr(self, "_finished", True):
            solver.stop_search()
            if self._thread is not None:
                self._thread.join(timeout=5)
            self.step()  # collect last solutions and final status
        super().stop()

    @property
    def proven_optimal(self):
        return self.solver_status == "OPTIMAL"

    def telemetry(self):
        return {
            "solver_status": self.solver_status,
            "bound": round(self.bound, 4) if self.bound is not None else None,
            "model_objective": round(self.model_objective, 4) if self.model_objective is not None else None,
            "gap": round(self.gap, 6) if self.gap is not None else None,
            "wall_time": round(self.wall, 3),
            "hinted": self.hinted,
            "model": self.notes,
            **self.stats,
        }
