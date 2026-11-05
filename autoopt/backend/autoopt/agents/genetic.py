from __future__ import annotations

from ..problems.base import CAP_CROSSOVER, CAP_NEIGHBORHOOD, CAP_RANDOM, CAP_CONSTRUCTIVE
from .base import Agent


class GeneticAgent(Agent):
    key = "genetic"
    name = "Genetic Algorithm"
    description = (
        "Evolves a population with tournament selection, problem-specific crossover, "
        "neighbourhood mutation and elitism. One step = one generation."
    )
    requires = frozenset({CAP_RANDOM, CAP_CROSSOVER, CAP_NEIGHBORHOOD})
    param_spec = [
        {"key": "population", "label": "Population size", "default": 40, "min": 4, "max": 500},
        {"key": "tournament", "label": "Tournament size", "default": 3, "min": 2, "max": 10},
        {"key": "crossover_rate", "label": "Crossover rate", "default": 0.9, "min": 0, "max": 1, "step": 0.05},
        {"key": "mutation_rate", "label": "Mutation rate", "default": 0.3, "min": 0, "max": 1, "step": 0.05},
        {"key": "elitism", "label": "Elite individuals", "default": 2, "min": 0, "max": 20},
        {"key": "seed_with_heuristics", "label": "Seed with heuristics", "default": True, "type": "bool"},
    ]

    def initialize(self):
        P = int(self.params["population"])
        pop = []
        heur = self.problem.constructive_heuristics() if CAP_CONSTRUCTIVE in self.problem.capabilities else {}
        if self.params["seed_with_heuristics"] and heur:
            for build in list(heur.values())[: max(1, P // 10)]:
                pop.append(build(self.rng, 0.3))
        while len(pop) < P:
            pop.append(self.problem.random_solution(self.rng))
        self.pop = [(self.evaluate(s)[0], s) for s in pop]
        self.generation = 0
        self.mean = 0.0
        self.diversity = 1.0

    def _tournament(self):
        k = int(self.params["tournament"])
        best = None
        for _ in range(k):
            cand = self.pop[self.rng.randrange(len(self.pop))]
            if best is None or cand[0] < best[0]:
                best = cand
        return best[1]

    def step(self):
        P = int(self.params["population"])
        moves = self.problem.neighborhoods()
        self.pop.sort(key=lambda x: x[0])
        nxt = self.pop[: int(self.params["elitism"])]
        while len(nxt) < P:
            a = self._tournament()
            if self.rng.random() < self.params["crossover_rate"]:
                child = self.problem.crossover(a, self._tournament(), self.rng)
            else:
                child = self.problem.copy(a)
            if self.rng.random() < self.params["mutation_rate"]:
                child = self.problem.apply_move(child, self.rng.choice(moves), self.rng)
            nxt.append((self.evaluate(child)[0], child))
        self.pop = nxt
        self.generation += 1
        self.iterations += 1
        scores = [s for s, _ in self.pop]
        finite = [s for s in scores if s < 1e5]
        self.mean = sum(finite) / len(finite) if finite else scores[0]
        self.diversity = len({round(s, 6) for s in scores}) / len(scores)

    def receive(self, sol, score):
        self.migrants_offered += 1
        self.pop.sort(key=lambda x: x[0])
        if score < self.pop[-1][0]:
            self.pop[-1] = (score, self.problem.copy(sol))
            self.migrants_accepted += 1
            return True
        return False

    def telemetry(self):
        sense = -1 if self.problem.sense == "max" else 1
        return {
            "generation": getattr(self, "generation", 0),
            "population_mean": round(sense * getattr(self, "mean", 0.0), 3),
            "diversity": round(getattr(self, "diversity", 1.0), 3),
        }
