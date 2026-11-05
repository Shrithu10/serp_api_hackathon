"""Runs coordinators in worker threads and fans their events out to
WebSocket subscribers on the asyncio loop."""
from __future__ import annotations

import asyncio
import threading
import uuid
from dataclasses import dataclass, field

from .coordinator import Coordinator, RunConfig
from .db import Database
from .problems import build_problem


@dataclass
class LiveRun:
    id: str
    name: str
    type: str
    coordinator: Coordinator
    thread: threading.Thread | None = None
    subscribers: set[asyncio.Queue] = field(default_factory=set)


class RunManager:
    def __init__(self, db: Database, max_concurrent: int = 4):
        self.db = db
        self.live: dict[str, LiveRun] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.max_concurrent = max_concurrent

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def running_count(self) -> int:
        return sum(1 for r in self.live.values() if r.coordinator.state == "running")

    def start(self, type_: str, data: dict, config: RunConfig, name: str, instance_id: str | None) -> str:
        if self.running_count() >= self.max_concurrent:
            raise RuntimeError(f"at most {self.max_concurrent} runs can be active at once")
        # Finished runs live on in SQLite; drop them from memory.
        for k in [k for k, r in self.live.items() if r.coordinator.state == "finished" and not r.subscribers]:
            del self.live[k]
        problem = build_problem(type_, data)
        rid = uuid.uuid4().hex[:12]
        run = LiveRun(id=rid, name=name, type=type_, coordinator=None)  # type: ignore[arg-type]

        def emit(msg: dict):
            if self.loop is None:
                return
            for q in list(run.subscribers):
                self.loop.call_soon_threadsafe(_put, q, msg)

        run.coordinator = Coordinator(problem, config, emit)
        self.db.create_run(rid, name, type_, instance_id, data, config.model_dump())
        self.live[rid] = run

        def work():
            try:
                run.coordinator.run()
            finally:
                self.db.finish_run(rid, run.coordinator.snapshot())

        run.thread = threading.Thread(target=work, name=f"run-{rid}", daemon=True)
        run.thread.start()
        return rid

    def stop(self, rid: str) -> bool:
        run = self.live.get(rid)
        if not run:
            return False
        run.coordinator.stop()
        return True

    def stop_all(self):
        for r in self.live.values():
            r.coordinator.stop()
        for r in self.live.values():
            if r.thread:
                r.thread.join(timeout=8)

    def snapshot(self, rid: str) -> dict | None:
        run = self.live.get(rid)
        if run:
            snap = run.coordinator.snapshot()
            snap.update(id=rid, name=run.name, type=run.type)
            return snap
        row = self.db.get_run(rid)
        if not row:
            return None
        snap = row["snapshot"] or {"state": row["status"], "agents": [], "global_series": []}
        snap.update(id=rid, name=row["name"], type=row["type"])
        if row["status"] == "interrupted":
            snap["state"] = "interrupted"
            snap["stop_reason"] = row["stop_reason"]
        return snap

    def subscribe(self, rid: str) -> asyncio.Queue | None:
        run = self.live.get(rid)
        if not run:
            return None
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        run.subscribers.add(q)
        return q

    def unsubscribe(self, rid: str, q: asyncio.Queue):
        run = self.live.get(rid)
        if run:
            run.subscribers.discard(q)

    def is_live(self, rid: str) -> bool:
        run = self.live.get(rid)
        return bool(run and run.coordinator.state != "finished")


def _put(q: asyncio.Queue, msg: dict):
    if q.full():
        # Drop stale ticks first; never drop the final message.
        if msg.get("type") == "tick":
            return
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            pass
    q.put_nowait(msg)
