from __future__ import annotations

import math

from ..problems.base import CAP_CONSTRUCTIVE, CAP_NEIGHBORHOOD, CAP_RANDOM
from .base import Agent


class AnnealingAgent(Agent):
    key = "annealing"
    name = "Simulated Annealing"
    description = (
        "Walks the neighbourhood from one candidate, accepting worse moves with "
        "probability exp(-delta/T). Temperature is auto-calibrated, cooled "
        "geometrically and reheated from the best solution when it gets cold."
    )
    requires = frozenset({CAP_RANDOM, CAP_NEIGHBORHOOD})
    param_spec = [
        {"key": "initial_temperature", "label": "Initial temperature (0 = auto)", "default": 0, "min": 0, "max": 1e6},
        {"key": "cooling", "label": "Cooling factor", "default": 0.97, "min": 0.5, "max": 0.9999, "step": 0.001},
        {"key": "moves_per_temperature", "label": "Moves per temperature", "default": 100, "min": 1, "max": 10000},
        {"key": "min_temperature_ratio", "label": "Reheat below T0 x", "default": 0.001, "min": 1e-6, "max": 0.5, "step": 0.001},
        {"key": "adopt_migrants", "label": "Adopt migrant probability", "default": 0.5, "min": 0, "max": 1, "step": 0.05},
        {"key": "greedy_start", "label": "Start from heuristic", "default": False, "type": "bool"},
    ]

    def initialize(self):
        heur = self.problem.constructive_heuristics() if CAP_CONSTRUCTIVE in self.problem.capabilities else {}
        if self.params["greedy_start"] and heur:
            cur = self.rng.choice(list(heur.values()))(self.rng, 0.3)
        else:
            cur = self.problem.random_solution(self.rng)
        self.cur = cur
        self.cur_score, _ = self.evaluate(cur)
        self.moves = self.problem.neighborhoods()
        t0 = float(self.params["initial_temperature"])
        if t0 <= 0:
            # Calibrate so an average worsening move is accepted with p = 0.5.
            deltas = []
            for _ in range(60):
                c = self.problem.apply_move(cur, self.rng.choice(self.moves), self.rng)
                sc, _ = self.evaluate(c)
                d = sc - self.cur_score
                if 0 < d < 1e5:
                    deltas.append(d)
            t0 = (sum(deltas) / len(deltas)) / math.log(2) if deltas else 1.0
        self.T0 = max(t0, 1e-9)
        self.T = self.T0
        self.accepted = 0
        self.tried = 0
        self.reheats = 0
        self.acc_rate = 0.0

    def step(self):
        acc = 0
        k = int(self.params["moves_per_temperature"])
        for _ in range(k):
            cand = self.problem.apply_move(self.cur, self.rng.choice(self.moves), self.rng)
            sc, _ = self.evaluate(cand)
            d = sc - self.cur_score
            if d <= 0 or self.rng.random() < math.exp(-d / self.T):
                self.cur, self.cur_score = cand, sc
                acc += 1
        self.tried += k
        self.accepted += acc
        self.acc_rate = acc / k
        self.iterations += 1
        self.T *= float(self.params["cooling"])
        if self.T < self.T0 * float(self.params["min_temperature_ratio"]):
            # Reheat and restart from the best known solution.
            self.reheats += 1
            self.T = self.T0 * 0.5
            self.cur, self.cur_score = self.problem.copy(self.best), self.best_score

    def receive(self, sol, score):
        self.migrants_offered += 1
        if score < self.cur_score and self.rng.random() < float(self.params["adopt_migrants"]):
            self.cur, self.cur_score = self.problem.copy(sol), score
            self.migrants_accepted += 1
            return True
        return False

    def telemetry(self):
        sense = -1 if self.problem.sense == "max" else 1
        cur = getattr(self, "cur_score", None)
        return {
            "temperature": round(getattr(self, "T", 0.0), 5),
            "acceptance_rate": round(getattr(self, "acc_rate", 0.0), 3),
            "current": round(sense * cur, 3) if cur is not None and cur < 1e5 else None,
            "reheats": getattr(self, "reheats", 0),
        }
