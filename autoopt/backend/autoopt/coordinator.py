"""Agent coordinator: the orchestration engine.

* Picks agents by capability (an agent only runs if the problem provides
  every operator it needs).
* Gives every agent an independent search state and random seed.
* Time-slices the Python agents in proportion to their compute weight; the
  CP-SAT agent runs in native threads and is polled.
* Validates every candidate an agent reports with the problem's independent
  checker before it may become the global incumbent.
* Migrates the incumbent to agents that are behind, at a controlled interval.
* Stops on time budget, iteration budgets, stall limit, proven optimality,
  or user request.
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from pydantic import BaseModel, Field

from .agents import AGENTS, Agent
from .problems.base import Problem


class AgentConfig(BaseModel):
    key: str
    enabled: bool = True
    weight: float = Field(default=1.0, gt=0, le=20)
    max_iterations: int | None = Field(default=None, ge=1)
    params: dict = Field(default_factory=dict)


class RunConfig(BaseModel):
    time_limit: float = Field(default=15.0, gt=0, le=3600)
    agents: list[AgentConfig] = Field(default_factory=list)
    migration: bool = True
    migration_interval: float = Field(default=1.5, gt=0, le=600)
    stall_limit: float | None = Field(default=None, gt=0)
    stop_on_optimal: bool = True
    slice_ms: float = Field(default=40.0, ge=5, le=2000)
    seed: int = 42


def default_agent_configs() -> list[AgentConfig]:
    return [AgentConfig(key=k) for k in AGENTS]


@dataclass
class AgentSlot:
    key: str
    agent: Agent | None
    config: AgentConfig
    selected: bool
    reason: str
    series: list[tuple[float, float]] = field(default_factory=list)


def select_agents(problem: Problem, configs: list[AgentConfig]) -> list[dict]:
    """Capability-based selection, as a report for the UI."""
    by_key = {c.key: c for c in configs}
    out = []
    for key, cls in AGENTS.items():
        cfg = by_key.get(key, AgentConfig(key=key, enabled=False))
        ok, why = cls.supports(problem)
        out.append(
            {
                "key": key,
                "name": cls.name,
                "compatible": ok,
                "enabled": cfg.enabled,
                "selected": ok and cfg.enabled,
                "reason": why if ok else why,
            }
        )
    return out


class Coordinator:
    def __init__(
        self,
        problem: Problem,
        config: RunConfig,
        emit: Callable[[dict], None] | None = None,
    ):
        self.problem = problem
        self.config = config
        self.emit_cb = emit or (lambda e: None)
        self.lock = threading.RLock()
        self._stop = threading.Event()
        self.state = "pending"
        self.stop_reason = ""
        self.t0: float | None = None
        self.elapsed = 0.0
        self.best_solution: Any = None
        self.best_score = math.inf
        self.best_objective: float | None = None
        self.best_decoded: dict | None = None
        self.best_agent: str | None = None
        self.best_time: float | None = None
        self.global_series: list[dict] = []
        self.events: list[dict] = []
        self.validated = 0
        self.rejected = 0
        self.infeasible = 0
        self.migrations = 0
        self.migrations_accepted = 0
        self.improvement_credit: dict[str, int] = {}

        cfgs = {c.key: c for c in (config.agents or default_agent_configs())}
        self.slots: list[AgentSlot] = []
        for i, (key, cls) in enumerate(AGENTS.items()):
            cfg = cfgs.get(key)
            if cfg is None:
                self.slots.append(AgentSlot(key, None, AgentConfig(key=key, enabled=False), False, "not requested"))
                continue
            ok, why = cls.supports(problem)
            if not cfg.enabled:
                self.slots.append(AgentSlot(key, None, cfg, False, "disabled by user"))
            elif not ok:
                self.slots.append(AgentSlot(key, None, cfg, False, why))
            else:
                agent = cls(problem, cfg.params, seed=config.seed * 1009 + i * 7919)
                agent.incumbent = self._incumbent
                if hasattr(agent, "run_budget"):
                    agent.run_budget = config.time_limit
                self.slots.append(AgentSlot(key, agent, cfg, True, why))
                self.improvement_credit[key] = 0

    # ---- helpers ------------------------------------------------------------
    def _now(self) -> float:
        return time.monotonic() - self.t0 if self.t0 is not None else 0.0

    def _incumbent(self):
        with self.lock:
            if self.best_solution is None:
                return None
            return (self.best_solution, self.best_score)

    def _event(self, kind: str, **data):
        ev = {"type": kind, "t": round(self._now(), 3), **data}
        with self.lock:
            self.events.append(ev)
            if len(self.events) > 600:
                self.events = self.events[-500:]
        self.emit_cb({"type": "event", "event": ev})

    def stop(self):
        self._stop.set()

    @property
    def active(self) -> list[AgentSlot]:
        return [s for s in self.slots if s.agent is not None]

    # ---- validation and incumbent ------------------------------------------
    def _collect(self, slot: AgentSlot):
        agent = slot.agent
        if not agent.pending:
            return
        pending, agent.pending = agent.pending, []
        # Only the agent's latest best matters; earlier ones are dominated.
        sol, ev = pending[-1]
        t = round(self._now(), 3)
        slot.series.append((t, ev.objective))
        if len(slot.series) > 1500:
            slot.series = slot.series[::2]
        sc = self.problem.score(ev)
        if not ev.feasible:
            self.infeasible += 1
            return
        # Every feasible candidate an agent reports is re-checked by the
        # independent validator, whether or not it beats the incumbent.
        decoded = self.problem.decode(sol)
        errors = self.problem.validate(decoded)
        if errors:
            self.rejected += 1
            self._event("rejected", agent=slot.key, objective=ev.objective, errors=errors[:5])
            return
        self.validated += 1
        if not self.problem.better(sc, self.best_score):
            return
        with self.lock:
            prev = self.best_objective
            self.best_solution = self.problem.copy(sol)
            self.best_score = sc
            self.best_objective = ev.objective
            self.best_decoded = decoded
            self.best_agent = slot.key
            self.best_time = t
            self.global_series.append({"t": t, "objective": ev.objective, "agent": slot.key})
            self.improvement_credit[slot.key] = self.improvement_credit.get(slot.key, 0) + 1
        self._event("incumbent", agent=slot.key, objective=ev.objective, previous=prev)
        self.emit_cb({"type": "incumbent", "solution": decoded, "agent": slot.key, "t": t})

    def _migrate(self):
        inc = self._incumbent()
        if inc is None:
            return
        sol, score = inc
        for slot in self.active:
            a = slot.agent
            if a.done or slot.key == self.best_agent:
                continue
            # Only offer when the recipient is genuinely behind.
            if not self.problem.better(score, a.best_score):
                continue
            accepted = a.receive(sol, score)
            self.migrations += 1
            if accepted:
                self.migrations_accepted += 1
            self._event(
                "migration",
                source=self.best_agent,
                target=slot.key,
                objective=self.best_objective,
                accepted=bool(accepted),
            )

    # ---- main loop ----------------------------------------------------------
    def run(self):
        cfg = self.config
        self.t0 = time.monotonic()
        self.state = "running"
        self._event(
            "start",
            agents=[s.key for s in self.active],
            skipped={s.key: s.reason for s in self.slots if not s.selected},
        )
        for slot in self.active:
            t = time.monotonic()
            try:
                slot.agent.start()
            except Exception as exc:  # an agent failing must not kill the run
                slot.agent.done = True
                slot.agent.status = "error"
                slot.agent.message = str(exc)
                self._event("agent_error", agent=slot.key, error=str(exc))
            slot.agent.cpu_time += time.monotonic() - t
            self._collect(slot)
        last_mig = last_tick = self._now()
        try:
            while True:
                now = self._now()
                if self._stop.is_set():
                    self.stop_reason = "stopped by user"
                    break
                if now >= cfg.time_limit:
                    self.stop_reason = "time budget reached"
                    break
                running = [s for s in self.active if not s.agent.done]
                if not running:
                    self.stop_reason = "all agents finished"
                    break
                if cfg.stall_limit and self.best_time is not None and now - self.best_time > cfg.stall_limit:
                    self.stop_reason = f"no improvement for {cfg.stall_limit:g}s"
                    break
                if cfg.stop_on_optimal and any(getattr(s.agent, "proven_optimal", False) for s in self.active):
                    self.stop_reason = "CP-SAT proved optimality"
                    break
                foreground = [s for s in running if not s.agent.background]
                for slot in running:
                    a = slot.agent
                    t_start = time.monotonic()
                    try:
                        if a.background:
                            a.step()
                        else:
                            budget = cfg.slice_ms / 1000.0 * slot.config.weight
                            deadline = min(t_start + budget, self.t0 + cfg.time_limit)
                            while time.monotonic() < deadline and not a.done:
                                a.step()
                                if slot.config.max_iterations and a.iterations >= slot.config.max_iterations:
                                    a.done = True
                                    a.status = "budget"
                                    a.message = "iteration budget reached"
                                if self._stop.is_set():
                                    break
                    except Exception as exc:
                        a.done = True
                        a.status = "error"
                        a.message = str(exc)
                        self._event("agent_error", agent=slot.key, error=str(exc))
                    a.cpu_time += time.monotonic() - t_start
                    self._collect(slot)
                    if a.done and a.status not in ("running",):
                        self._event("agent_done", agent=slot.key, status=a.status, message=a.message)
                if not foreground:
                    time.sleep(0.02)  # only CP-SAT left: just poll it
                now = self._now()
                if cfg.migration and now - last_mig >= cfg.migration_interval:
                    last_mig = now
                    self._migrate()
                if now - last_tick >= 0.25:
                    last_tick = now
                    self.elapsed = now
                    self.emit_cb({"type": "tick", "snapshot": self.snapshot(light=True)})
        finally:
            for slot in self.active:
                try:
                    slot.agent.stop()
                except Exception:
                    pass
                self._collect(slot)
            self.elapsed = self._now()
            self.state = "finished"
            self._event(
                "finish",
                reason=self.stop_reason,
                objective=self.best_objective,
                agent=self.best_agent,
            )
            self.emit_cb({"type": "finished", "snapshot": self.snapshot()})

    # ---- reporting ----------------------------------------------------------
    def bounds(self) -> dict:
        """Best proven bound and gap from CP-SAT (or the LP relaxation)."""
        out = {"bound": None, "gap": None, "source": None, "optimal": False}
        for s in self.active:
            if s.key == "cpsat" and s.agent.bound is not None:
                out.update(bound=s.agent.bound, source="CP-SAT", optimal=s.agent.proven_optimal)
        if out["bound"] is None and hasattr(self.problem, "lp_relaxation"):
            lp = self.problem.lp_relaxation()
            if lp.get("bound") is not None:
                out.update(bound=lp["bound"], source="LP relaxation")
        if out["bound"] is not None and self.best_objective is not None:
            b, o = out["bound"], self.best_objective
            out["gap"] = abs(o - b) / max(abs(o), 1e-9)
            if out["gap"] < 1e-6:
                out["gap"] = 0.0
        return out

    def snapshot(self, light: bool = False) -> dict:
        with self.lock:
            agents = []
            for s in self.slots:
                d = {
                    "key": s.key,
                    "name": AGENTS[s.key].name,
                    "selected": s.selected,
                    "reason": s.reason,
                    "weight": s.config.weight,
                }
                if s.agent is not None:
                    d.update(s.agent.info())
                    d["global_improvements"] = self.improvement_credit.get(s.key, 0)
                    d["series"] = s.series[-300:] if light else s.series
                agents.append(d)
            snap = {
                "state": self.state,
                "elapsed": round(self._now() if self.state == "running" else self.elapsed, 3),
                "time_limit": self.config.time_limit,
                "stop_reason": self.stop_reason,
                "type": self.problem.type_name,
                "sense": self.problem.sense,
                "objective_name": self.problem.objective_name,
                "best_objective": self.best_objective,
                "best_agent": self.best_agent,
                "best_time": self.best_time,
                "bounds": self.bounds(),
                "validated": self.validated,
                "rejected": self.rejected,
                "infeasible": self.infeasible,
                "migrations": self.migrations,
                "migrations_accepted": self.migrations_accepted,
                "global_series": self.global_series,
                "agents": agents,
            }
            if not light:
                snap["solution"] = self.best_decoded
                snap["solution_encoding"] = (
                    self.problem.to_json(self.best_solution) if self.best_solution is not None else None
                )
                snap["events"] = self.events[-300:]
            return snap
