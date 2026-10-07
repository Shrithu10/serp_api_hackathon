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
"""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.executescript(_SCHEMA)
    return c


def _norm(q: str) -> str:
    return " ".join(q.lower().split())


def save(query: str, lens: str, live: bool, payload: dict, example: bool = False) -> str:
    a = payload.get("analysis") or {}
    plain = a.get("plain") or {}
    summary = {
        "places": len(payload.get("vantages") or []),
        "score": a.get("index"),
        "verdict": a.get("verdict"),
        "groups": len(a.get("clusters") or []),
        "avg_differ": plain.get("avg_differ"),
        "top1": plain.get("top1_domain"),
        "synthetic": (payload.get("done") or {}).get("synthetic", False),
        "example": example,
        "top2_share": (a.get("concentration") or {}).get("top2_share"),
    }
    sid = secrets.token_urlsafe(6)
    with _conn() as c:
        c.execute(
            "INSERT INTO scans (id, created_at, query, lens, live, summary, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, time.time(), query, lens, int(live), json.dumps(summary), json.dumps(payload, ensure_ascii=False)),
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
    out = [s for s in (_row(r, False) for r in rows) if not s["summary"].get("example")]
    if query:
        out = [s for s in out if _norm(query) in _norm(s["query"])]
    return out[:limit]


def list_examples() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT id, created_at, query, lens, live, summary FROM scans ORDER BY created_at ASC").fetchall()
    return [s for s in (_row(r, False) for r in rows) if s["summary"].get("example")]


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
