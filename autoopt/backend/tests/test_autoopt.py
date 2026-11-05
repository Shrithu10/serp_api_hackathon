import random

import pytest
from fastapi.testclient import TestClient

from autoopt.agents import AGENTS
from autoopt.app import create_app
from autoopt.coordinator import AgentConfig, Coordinator, RunConfig
from autoopt.problems import REGISTRY, build_problem, generate_instance

TYPES = list(REGISTRY)


@pytest.mark.parametrize("t", TYPES)
def test_operators_produce_valid_solutions(t):
    p = build_problem(t, generate_instance(t, {}, seed=2))
    rng = random.Random(0)
    base = next(iter(p.constructive_heuristics().values()))(rng, 0.0)
    assert p.validate(p.decode(base)) == []
    for _ in range(50):
        for m in p.neighborhoods():
            s = p.apply_move(base, m, rng)
            dec = p.decode(s)
            errs = [e for e in p.validate(dec) if "vehicles" not in e]  # fleet size is a soft violation
            assert errs == [], (m, errs)
        c = p.crossover(base, p.random_solution(rng), rng)
        assert [e for e in p.validate(p.decode(c)) if "vehicles" not in e] == []


@pytest.mark.parametrize("t", TYPES)
def test_validator_catches_corruption(t):
    p = build_problem(t, generate_instance(t, {}, seed=4))
    sol = next(iter(p.constructive_heuristics().values()))(random.Random(1), 0.0)
    dec = p.decode(sol)
    if t == "jobshop":
        dec["tasks"][0]["end"] += 1
    elif t == "vrp":
        dec["routes"][0]["stops"].append(dec["routes"][0]["stops"][0])
    else:
        dec["selected"] = list(range(len(dec["items"])))
    assert p.validate(dec)


@pytest.mark.parametrize("t", TYPES)
def test_cpsat_matches_heuristics_or_better(t):
    p = build_problem(t, generate_instance(t, {"jobs": 4, "machines": 3, "customers": 8, "items": 20}, seed=5))
    c = Coordinator(p, RunConfig(time_limit=10, seed=1))
    c.run()
    snap = c.snapshot()
    assert snap["best_objective"] is not None
    assert snap["rejected"] == 0
    assert p.validate(snap["solution"]) == []
    cp = next(a for a in snap["agents"] if a["key"] == "cpsat")
    assert cp["telemetry"]["solver_status"] == "OPTIMAL"
    assert snap["bounds"]["gap"] == 0.0
    # No agent may beat a proven optimum.
    for a in snap["agents"]:
        if a.get("best_objective") is not None and a["best_feasible"]:
            if p.sense == "min":
                assert a["best_objective"] >= snap["best_objective"] - 1e-6
            else:
                assert a["best_objective"] <= snap["best_objective"] + 1e-6


def test_capability_selection_skips_unsupported(monkeypatch):
    p = build_problem("knapsack", generate_instance("knapsack", {}, seed=1))
    monkeypatch.setattr(type(p), "capabilities", frozenset({"random_solution", "neighborhood"}))
    c = Coordinator(p, RunConfig(time_limit=1))
    chosen = {s.key for s in c.slots if s.selected}
    assert chosen == {"annealing", "local_search"}
    reasons = {s.key: s.reason for s in c.slots if not s.selected}
    assert "crossover" in reasons["genetic"]


def test_iteration_budget_and_migration():
    p = build_problem("vrp", generate_instance("vrp", {"customers": 25}, seed=2))
    cfg = RunConfig(
        time_limit=3,
        migration_interval=0.2,
        agents=[
            AgentConfig(key="greedy", max_iterations=5),
            AgentConfig(key="annealing", weight=2),
            AgentConfig(key="local_search"),
        ],
    )
    c = Coordinator(p, cfg)
    c.run()
    snap = c.snapshot()
    g = next(a for a in snap["agents"] if a["key"] == "greedy")
    assert g["iterations"] == 5 and g["status"] == "budget"
    assert snap["migrations"] >= 1
    assert snap["validated"] >= 1


def test_api_and_websocket(tmp_path):
    app = create_app(str(tmp_path / "t.sqlite3"))
    with TestClient(app) as client:
        meta = client.get("/api/meta").json()
        assert {p["key"] for p in meta["problem_types"]} == set(TYPES)
        assert {a["key"] for a in meta["agents"]} == set(AGENTS)
        assert len(client.get("/api/instances").json()) >= 3
        gen = client.post("/api/instances/generate", json={"type": "knapsack", "params": {"items": 30}, "seed": 1}).json()
        bad = client.post("/api/instances/inspect", json={"type": "knapsack", "data": {"items": [], "capacities": [1]}})
        assert bad.status_code == 422
        run = client.post(
            "/api/runs",
            json={"type": "knapsack", "data": gen["data"], "config": {"time_limit": 3}},
        ).json()
        with client.websocket_connect(f"/ws/runs/{run['id']}") as ws:
            first = ws.receive_json()
            assert first["type"] == "snapshot"
            while True:
                msg = ws.receive_json()
                if msg["type"] == "finished":
                    break
        final = client.get(f"/api/runs/{run['id']}").json()
        assert final["state"] == "finished"
        assert final["solution"]["total_value"] == final["best_objective"]
        assert any(r["id"] == run["id"] for r in client.get("/api/runs").json())
