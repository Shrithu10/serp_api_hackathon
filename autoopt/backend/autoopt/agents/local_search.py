from __future__ import annotations

from ..problems.base import CAP_NEIGHBORHOOD, CAP_RANDOM
from .base import Agent


class LocalSearchAgent(Agent):
    key = "local_search"
    name = "Local Search"
    description = (
        "Hill climbing over swap, insert and problem-specific neighbourhoods "
        "(variable neighbourhood descent). Restarts from a perturbed best "
        "solution when it reaches a local optimum."
    )
    requires = frozenset({CAP_RANDOM, CAP_NEIGHBORHOOD})
    param_spec = [
        {"key": "strategy", "label": "Strategy", "default": "first", "options": ["first", "best"]},
        {"key": "samples_per_neighborhood", "label": "Samples per neighbourhood", "default": 40, "min": 1, "max": 2000},
        {"key": "max_no_improve", "label": "Stop/restart after non-improving iterations", "default": 3, "min": 1, "max": 1000},
        {"key": "restarts", "label": "Restart when stuck (iterated LS)", "default": True, "type": "bool"},
        {"key": "max_restarts", "label": "Max restarts (0 = unlimited)", "default": 0, "min": 0, "max": 100000},
        {"key": "perturbation", "label": "Perturbation moves", "default": 4, "min": 1, "max": 100},
    ]

    def initialize(self):
        self.cur = self.problem.random_solution(self.rng)
        self.cur_score, _ = self.evaluate(self.cur)
        self.moves = self.problem.neighborhoods()
        self.no_improve = 0
        self.restarts = 0
        self.local_optima = 0
        self.move_stats = {m: {"tried": 0, "improved": 0} for m in self.moves}

    def _restart(self):
        p = self.problem.copy(self.best)
        for _ in range(int(self.params["perturbation"])):
            p = self.problem.apply_move(p, self.rng.choice(self.moves), self.rng)
        self.cur = p
        self.cur_score, _ = self.evaluate(p)
        self.restarts += 1
        self.no_improve = 0

    def step(self):
        k = int(self.params["samples_per_neighborhood"])
        improved = False
        best_first = self.params["strategy"] == "first"
        for m in self.moves:  # variable neighbourhood descent order
            best_c, best_s = None, self.cur_score
            for _ in range(k):
                cand = self.problem.apply_move(self.cur, m, self.rng)
                sc, _ = self.evaluate(cand)
                self.move_stats[m]["tried"] += 1
                if sc < best_s - 1e-12:
                    best_c, best_s = cand, sc
                    if best_first:
                        break
            if best_c is not None:
                self.move_stats[m]["improved"] += 1
                self.cur, self.cur_score = best_c, best_s
                improved = True
                break
        self.iterations += 1
        if improved:
            self.no_improve = 0
            return
        self.no_improve += 1
        if self.no_improve >= int(self.params["max_no_improve"]):
            self.local_optima += 1
            mr = int(self.params["max_restarts"])
            if self.params["restarts"] and (mr == 0 or self.restarts < mr):
                self._restart()
            else:
                self.done = True
                self.status = "converged"
                self.message = "local optimum reached"

    def receive(self, sol, score):
        self.migrants_offered += 1
        if score < self.cur_score:
            self.cur, self.cur_score = self.problem.copy(sol), score
            self.no_improve = 0
            self.migrants_accepted += 1
            return True
        return False

    def telemetry(self):
        sense = -1 if self.problem.sense == "max" else 1
        cur = getattr(self, "cur_score", None)
        return {
            "current": round(sense * cur, 3) if cur is not None and cur < 1e5 else None,
            "restarts": getattr(self, "restarts", 0),
            "local_optima": getattr(self, "local_optima", 0),
            "moves": getattr(self, "move_stats", {}),
        }
