"""Agent registry."""
from .annealing import AnnealingAgent
from .base import Agent
from .cpsat import CpsatAgent
from .genetic import GeneticAgent
from .greedy import GreedyAgent
from .local_search import LocalSearchAgent

AGENTS: dict[str, type[Agent]] = {
    a.key: a for a in (GreedyAgent, GeneticAgent, AnnealingAgent, LocalSearchAgent, CpsatAgent)
}

__all__ = ["AGENTS", "Agent"]
