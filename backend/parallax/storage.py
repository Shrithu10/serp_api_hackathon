"""Scan history in a local SQLite file, so past scans reopen instantly and
for free, and a repeat scan can be compared with the previous one."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(os.getenv("PARALLAX_DB", Path(__file__).resolve().parent.parent / ".data" / "parallax.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    query TEXT NOT NULL,
    lens TEXT NOT NULL,
    live INTEGER NOT NULL,
    summary TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_query ON scans (query, lens, created_at);
CREATE TABLE IF NOT EXISTS watches (
    id TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    query TEXT NOT NULL,
    lens TEXT NOT NULL,
    config TEXT NOT NULL,
    interval_h REAL NOT NULL,
    active INTEGER NOT NULL,
    example INTEGER NOT NULL DEFAULT 0,
    last_run REAL,
    next_run REAL,
    runs INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);
"""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.executescript(_SCHEMA)
    return c


def _norm(q: str) -> str:
    return " ".join(q.lower().split())


def save(query: str, lens: str, live: bool, payload: dict, example: bool = False, watch: str | None = None, created_at: float | None = None) -> str:
    a = payload.get("analysis") or {}
    plain = a.get("plain") or {}
    summary = {
        "places": len(payload.get("vantages") or []),
        "score": a.get("index"),
        "verdict": a.get("verdict"),
        "groups": len(a.get("clusters") or []),
        "avg_differ": plain.get("avg_differ"),
        "avg_len": plain.get("avg_len"),
        "top1": plain.get("top1_domain"),
        "synthetic": (payload.get("done") or {}).get("synthetic", False),
        "example": example,
        "top2_share": (a.get("concentration") or {}).get("top2_share"),
        "ai_count": plain.get("ai_count"),
        "credits": (payload.get("done") or {}).get("credits", 0),
        "top1_by_place": {vid: r["organic"][0]["domain"] for vid, r in (payload.get("results") or {}).items() if r.get("organic")},
        "watch": watch,
    }
    sid = secrets.token_urlsafe(6)
    with _conn() as c:
        c.execute(
            "INSERT INTO scans (id, created_at, query, lens, live, summary, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, created_at or time.time(), query, lens, int(live), json.dumps(summary), json.dumps(payload, ensure_ascii=False)),
        )
    return sid


def _row(r: sqlite3.Row, full: bool) -> dict:
    out = {
        "id": r["id"],
        "created_at": r["created_at"],
        "query": r["query"],
        "lens": r["lens"],
        "live": bool(r["live"]),
        "summary": json.loads(r["summary"]),
    }
    if full:
        out["payload"] = json.loads(r["payload"])
    return out


def list_scans(limit: int = 50, query: str | None = None) -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT id, created_at, query, lens, live, summary FROM scans ORDER BY created_at DESC LIMIT ?", (limit * 4 + 20,)).fetchall()
    # Personal history: your own searches, not examples or scheduled tracking runs.
    out = [s for s in (_row(r, False) for r in rows) if not s["summary"].get("example") and not s["summary"].get("watch")]
    if query:
        out = [s for s in out if _norm(query) in _norm(s["query"])]
    return out[:limit]


def list_examples() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT id, created_at, query, lens, live, summary FROM scans ORDER BY created_at ASC").fetchall()
    return [s for s in (_row(r, False) for r in rows) if s["summary"].get("example") and not s["summary"].get("watch")]


def get(sid: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM scans WHERE id = ?", (sid,)).fetchone()
    return _row(r, True) if r else None


def previous(sid: str) -> dict | None:
    """The most recent earlier scan of the same query and lens."""
    with _conn() as c:
        cur = c.execute("SELECT query, lens, created_at FROM scans WHERE id = ?", (sid,)).fetchone()
        if not cur:
            return None
        rows = c.execute(
            "SELECT * FROM scans WHERE lens = ? AND created_at < ? ORDER BY created_at DESC LIMIT 200",
            (cur["lens"], cur["created_at"]),
        ).fetchall()
    for r in rows:
        if _norm(r["query"]) == _norm(cur["query"]) and not json.loads(r["summary"]).get("example"):
            return _row(r, True)
    return None


def delete(sid: str) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM scans WHERE id = ?", (sid,)).rowcount > 0


# ---------------------------------------------------------------- tracking


def _watch_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "query": r["query"],
        "lens": r["lens"],
        "config": json.loads(r["config"]),
        "interval_h": r["interval_h"],
        "active": bool(r["active"]),
        "example": bool(r["example"]),
        "last_run": r["last_run"],
        "next_run": r["next_run"],
        "runs": r["runs"],
        "last_error": r["last_error"],
    }


def create_watch(query: str, lens: str, config: dict, interval_h: float, active: bool = True, example: bool = False, next_run: float | None = None) -> str:
    wid = "w" + secrets.token_urlsafe(5)
    now = time.time()
    with _conn() as c:
        c.execute(
            "INSERT INTO watches (id, created_at, query, lens, config, interval_h, active, example, next_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (wid, now, query, lens, json.dumps(config, ensure_ascii=False), interval_h, int(active), int(example), next_run if next_run is not None else now),
        )
    return wid


def get_watch(wid: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM watches WHERE id = ?", (wid,)).fetchone()
    return _watch_row(r) if r else None


def list_watches() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM watches ORDER BY example ASC, created_at DESC").fetchall()
    return [_watch_row(r) for r in rows]


def due_watches(now: float | None = None) -> list[dict]:
    now = now or time.time()
    with _conn() as c:
        rows = c.execute("SELECT * FROM watches WHERE active = 1 AND next_run <= ? ORDER BY next_run", (now,)).fetchall()
    return [_watch_row(r) for r in rows]


def update_watch(wid: str, **fields) -> None:
    allowed = {"interval_h", "active", "last_run", "next_run", "runs", "last_error"}
    sets = {k: (int(v) if isinstance(v, bool) else v) for k, v in fields.items() if k in allowed}
    if not sets:
        return
    with _conn() as c:
        c.execute(f"UPDATE watches SET {', '.join(f'{k} = ?' for k in sets)} WHERE id = ?", (*sets.values(), wid))


def watch_runs(wid: str) -> list[dict]:
    """Every saved run of a tracked search, oldest first (summaries only)."""
    with _conn() as c:
        rows = c.execute("SELECT id, created_at, query, lens, live, summary FROM scans ORDER BY created_at ASC").fetchall()
    return [s for s in (_row(r, False) for r in rows) if s["summary"].get("watch") == wid]


def attach_to_watch(sid: str, wid: str) -> bool:
    with _conn() as c:
        r = c.execute("SELECT summary FROM scans WHERE id = ?", (sid,)).fetchone()
        if not r:
            return False
        summary = json.loads(r["summary"])
        summary["watch"] = wid
        c.execute("UPDATE scans SET summary = ? WHERE id = ?", (json.dumps(summary), sid))
    return True


def delete_watch(wid: str) -> bool:
    runs = [s["id"] for s in watch_runs(wid)]
    with _conn() as c:
        for sid in runs:
            c.execute("DELETE FROM scans WHERE id = ?", (sid,))
        return c.execute("DELETE FROM watches WHERE id = ?", (wid,)).rowcount > 0
