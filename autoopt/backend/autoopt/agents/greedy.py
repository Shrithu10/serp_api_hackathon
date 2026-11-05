from __future__ import annotations

from ..problems.base import CAP_CONSTRUCTIVE
from .base import Agent


class GreedyAgent(Agent):
    key = "greedy"
    name = "Greedy Heuristics"
    description = (
        "Runs every constructive heuristic of the problem (dispatching rules, "
        "savings, sweep, density ratios...) deterministically once, then keeps "
        "generating randomized (GRASP) variants, each followed by a short local "
        "improvement."
    )
    requires = frozenset({CAP_CONSTRUCTIVE})
    param_spec = [
        {"key": "randomness", "label": "Randomization (0-1)", "default": 0.3, "min": 0, "max": 1, "step": 0.05},
        {"key": "improve_steps", "label": "Local improvement moves", "default": 150, "min": 0, "max": 10000},
    ]

    def initialize(self):
        self.heur = self.problem.constructive_heuristics()
        self.names = list(self.heur)
        self.idx = 0
        self.per_heuristic = {n: {"runs": 0, "best": None} for n in self.names}
        self.migrant = None

    def step(self):
        if self.migrant is not None:
            sol, sc = self.migrant
            self.migrant = None
            name = "migrant"
        else:
            name = self.names[self.idx % len(self.names)]
            first_round = self.idx < len(self.names)
            alpha = 0.0 if first_round else float(self.params["randomness"])
            self.idx += 1
            sol = self.heur[name](self.rng, alpha)
            sc, _ = self.evaluate(sol)
        if self.problem.neighborhoods() and int(self.params["improve_steps"]) > 0:
            sol, sc = self.hill_climb(sol, sc, int(self.params["improve_steps"]))
        self.iterations += 1
        if name in self.per_heuristic:
            rec = self.per_heuristic[name]
            rec["runs"] += 1
            if sc < 1e5 and (rec["best"] is None or sc < rec["_score"]):
                rec["_score"] = sc
                rec["best"] = round(-sc if self.problem.sense == "max" else sc, 3)

    def receive(self, sol, score):
        self.migrants_offered += 1
        if score < self.best_score:
            self.migrant = (self.problem.copy(sol), score)
            self.migrants_accepted += 1
            return True
        return False

    def telemetry(self):
        return {
            "heuristics": {
                n: {"runs": r["runs"], "best": r["best"]}
                for n, r in getattr(self, "per_heuristic", {}).items()
            }
        }
