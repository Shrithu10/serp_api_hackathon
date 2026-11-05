"""SQLite persistence for saved instances and finished runs."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path

DEFAULT_PATH = Path(os.environ.get("AUTOOPT_DB", Path(__file__).resolve().parent.parent / ".data" / "autoopt.sqlite3"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    summary TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    instance_id TEXT,
    instance TEXT NOT NULL,
    config TEXT NOT NULL,
    status TEXT NOT NULL,
    stop_reason TEXT,
    best_objective REAL,
    best_agent TEXT,
    gap REAL,
    elapsed REAL,
    created_at REAL NOT NULL,
    finished_at REAL,
    snapshot TEXT
);
CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at DESC);
"""


class Database:
    def __init__(self, path: str | Path = DEFAULT_PATH):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        with self._lock:
            self.conn.executescript(SCHEMA)
            self.conn.commit()

    def _exec(self, sql: str, args: tuple = ()):
        with self._lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur

    def _all(self, sql: str, args: tuple = ()):
        with self._lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    # ---- instances ----------------------------------------------------------
    def save_instance(self, name: str, type_: str, data: dict, summary: dict | None = None) -> str:
        iid = uuid.uuid4().hex[:12]
        self._exec(
            "INSERT INTO instances (id, name, type, data, summary, created_at) VALUES (?,?,?,?,?,?)",
            (iid, name, type_, json.dumps(data), json.dumps(summary or {}), time.time()),
        )
        return iid

    def list_instances(self) -> list[dict]:
        rows = self._all("SELECT id, name, type, summary, created_at FROM instances ORDER BY created_at DESC")
        for r in rows:
            r["summary"] = json.loads(r["summary"] or "{}")
        return rows

    def get_instance(self, iid: str) -> dict | None:
        rows = self._all("SELECT * FROM instances WHERE id = ?", (iid,))
        if not rows:
            return None
        r = rows[0]
        r["data"] = json.loads(r["data"])
        r["summary"] = json.loads(r["summary"] or "{}")
        return r

    def delete_instance(self, iid: str) -> bool:
        return self._exec("DELETE FROM instances WHERE id = ?", (iid,)).rowcount > 0

    def count_instances(self) -> int:
        return self._all("SELECT COUNT(*) AS n FROM instances")[0]["n"]

    # ---- runs ---------------------------------------------------------------
    def create_run(self, rid: str, name: str, type_: str, instance_id: str | None, instance: dict, config: dict):
        self._exec(
            "INSERT INTO runs (id, name, type, instance_id, instance, config, status, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (rid, name, type_, instance_id, json.dumps(instance), json.dumps(config), "running", time.time()),
        )

    def finish_run(self, rid: str, snapshot: dict):
        bounds = snapshot.get("bounds") or {}
        self._exec(
            "UPDATE runs SET status=?, stop_reason=?, best_objective=?, best_agent=?, gap=?, elapsed=?, "
            "finished_at=?, snapshot=? WHERE id=?",
            (
                "finished",
                snapshot.get("stop_reason"),
                snapshot.get("best_objective"),
                snapshot.get("best_agent"),
                bounds.get("gap"),
                snapshot.get("elapsed"),
                time.time(),
                json.dumps(snapshot),
                rid,
            ),
        )

    def mark_interrupted(self):
        self._exec("UPDATE runs SET status='interrupted', stop_reason='server restarted' WHERE status='running'")

    def list_runs(self, limit: int = 100) -> list[dict]:
        return self._all(
            "SELECT id, name, type, instance_id, status, stop_reason, best_objective, best_agent, gap, elapsed, "
            "created_at, finished_at FROM runs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )

    def get_run(self, rid: str) -> dict | None:
        rows = self._all("SELECT * FROM runs WHERE id = ?", (rid,))
        if not rows:
            return None
        r = rows[0]
        for k in ("instance", "config", "snapshot"):
            r[k] = json.loads(r[k]) if r[k] else None
        return r

    def delete_run(self, rid: str) -> bool:
        return self._exec("DELETE FROM runs WHERE id = ?", (rid,)).rowcount > 0
