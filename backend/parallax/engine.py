"""Scan primitives shared by the web API and the MCP server."""

from __future__ import annotations

import asyncio
import time

from .analysis import analyze
from .normalize import normalize
from .serp import SerpError, SerpGateway
from .vantages import Vantage

gateway = SerpGateway()


async def search_vantage(v: Vantage, q: str, follow_ai: bool) -> dict:
    t0 = time.perf_counter()
    params = v.params(q)
    approx = False
    try:
        raw, origin = await gateway.search(params)
    except SerpError as e:
        if "location" not in str(e).lower():
            raise
        # Unknown location string: fall back to country + language targeting.
        params.pop("location", None)
        raw, origin = await gateway.search(params)
        approx = True
    calls = [origin]
    ai = raw.get("ai_overview") or {}
    if follow_ai and ai.get("page_token") and not ai.get("text_blocks"):
        # Some AI Overviews load lazily; SerpApi exposes them via a follow-up engine.
        try:
            extra, o2 = await gateway.search({"engine": "google_ai_overview", "page_token": ai["page_token"]})
            calls.append(o2)
            if extra.get("ai_overview"):
                raw = {**raw, "ai_overview": extra["ai_overview"]}
        except Exception:
            pass
    data = normalize(raw)
    data.update({"q": q, "origin": origin, "approx": approx, "ms": round((time.perf_counter() - t0) * 1000), "calls": calls})
    return data


async def trends_for(q: str) -> dict:
    base = {"engine": "google_trends", "q": q[:90], "geo": "IN"}
    geo_task = gateway.search({**base, "data_type": "GEO_MAP_0", "region": "REGION"})
    ts_task = gateway.search({**base, "data_type": "TIMESERIES", "date": "today 12-m"})
    out: dict = {"regions": [], "timeline": [], "calls": []}
    for name, task in (("geo", geo_task), ("ts", ts_task)):
        try:
            raw, origin = await task
        except Exception as e:
            out[f"{name}_error"] = str(e)
            continue
        out["calls"].append(origin)
        if name == "geo":
            out["regions"] = [
                {"code": r.get("geo"), "name": r.get("location"), "value": r.get("extracted_value", 0)}
                for r in raw.get("interest_by_region") or []
            ]
        else:
            for p in (raw.get("interest_over_time") or {}).get("timeline_data") or []:
                vals = p.get("values") or [{}]
                out["timeline"].append({"date": p.get("date"), "t": int(p.get("timestamp") or 0), "v": vals[0].get("extracted_value", 0)})
    return out



async def run_scan(q: str, vantages: list[Vantage], follow_ai: bool = True) -> tuple[dict[str, dict], dict]:
    """Run a complete scan (no streaming). Returns (results, analysis)."""
    outs = await asyncio.gather(*(search_vantage(v, q, follow_ai) for v in vantages), return_exceptions=True)
    results = {v.id: r for v, r in zip(vantages, outs) if isinstance(r, dict)}
    return results, analyze(q, [v.to_dict() for v in vantages], results)
