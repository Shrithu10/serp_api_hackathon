"""Problem registry."""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Callable

from . import jobshop, knapsack, vrp
from .base import Problem


@dataclass(frozen=True)
class ProblemType:
    key: str
    title: str
    description: str
    sense: str
    objective_name: str
    instance_model: Any
    problem_cls: type[Problem]
    generator: Callable[[dict, random.Random], dict]
    generator_params: list[dict]


REGISTRY: dict[str, ProblemType] = {
    "jobshop": ProblemType(
        key="jobshop",
        title="Job Shop Scheduling",
        description=(
            "Jobs are ordered chains of operations. Each operation runs on one of its "
            "compatible machines with a machine-specific duration; extra precedence "
            "constraints can link jobs. Minimise the makespan."
        ),
        sense="min",
        objective_name="makespan",
        instance_model=jobshop.JobShopInstance,
        problem_cls=jobshop.JobShopProblem,
        generator=jobshop.generate,
        generator_params=jobshop.GENERATOR_PARAMS,
    ),
    "vrp": ProblemType(
        key="vrp",
        title="Capacitated Vehicle Routing",
        description=(
            "A fleet of capacity-limited vehicles leaves one depot. Visit every customer "
            "exactly once without overloading any vehicle or using more vehicles than "
            "available. Minimise total distance."
        ),
        sense="min",
        objective_name="total distance",
        instance_model=vrp.VrpInstance,
        problem_cls=vrp.VrpProblem,
        generator=vrp.generate,
        generator_params=vrp.GENERATOR_PARAMS,
    ),
    "knapsack": ProblemType(
        key="knapsack",
        title="Multi-dimensional Knapsack",
        description=(
            "Pick items to maximise total value while respecting several resource "
            "capacities at once, and never picking both items of a conflict pair."
        ),
        sense="max",
        objective_name="total value",
        instance_model=knapsack.KnapsackInstance,
        problem_cls=knapsack.KnapsackProblem,
        generator=knapsack.generate,
        generator_params=knapsack.GENERATOR_PARAMS,
    ),
}


def build_problem(type_key: str, data: dict) -> Problem:
    if type_key not in REGISTRY:
        raise ValueError(f"unknown problem type {type_key!r}")
    pt = REGISTRY[type_key]
    inst = pt.instance_model.model_validate(data)
    return pt.problem_cls(inst)


def generate_instance(type_key: str, params: dict, seed: int | None = None) -> dict:
    pt = REGISTRY[type_key]
    rng = random.Random(seed)
    data = pt.generator(params, rng)
    # Round-trip through the model so generated data is always valid.
    return pt.instance_model.model_validate(data).model_dump(mode="json")
