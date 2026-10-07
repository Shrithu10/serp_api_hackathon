"""Verify every built-in place name against SerpApi's Locations API (free, no key).

If Google doesn't recognise a `location` string, a search silently falls back to
country level. This catches that before any credits are spent.
"""

from __future__ import annotations

import serpapi

from .vantages import ALL_VANTAGES


def _norm(s: str) -> str:
    return ",".join(p.strip().lower() for p in s.split(","))


def check_locations() -> list[dict]:
    client = serpapi.Client(timeout=20)
    seen: dict[str, dict] = {}
    unreachable = None
    for v in ALL_VANTAGES.values():
        if v.location in seen:
            continue
        if unreachable:
            seen[v.location] = {"location": v.location, "ok": None, "error": unreachable, "suggestion": None}
            continue
        city = v.location.split(",")[0].strip()
        try:
            rows = list(client.locations(q=city, limit=10))
        except Exception as e:  # network / API problem: report, don't guess
            if "connect" in type(e).__name__.lower() or "connect" in str(e).lower() or "Max retries" in str(e):
                unreachable = "SerpApi unreachable"
            seen[v.location] = {"location": v.location, "ok": None, "error": unreachable or str(e)[:120], "suggestion": None}
            continue
        names = [r.get("canonical_name", "") for r in rows]
        ok = any(_norm(n) == _norm(v.location) for n in names)
        same_country = [n for n in names if n.lower().endswith(v.location.split(",")[-1].strip().lower())]
        seen[v.location] = {"location": v.location, "ok": ok, "error": None, "suggestion": None if ok else (same_country or names or [None])[0]}
    return list(seen.values())
