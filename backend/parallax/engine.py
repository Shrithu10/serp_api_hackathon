"""Scan primitives shared by the web API and the MCP server."""

from __future__ import annotations

import asyncio
import time

from .analysis import analyze
from .normalize import normalize
from .serp import SerpError, SerpGateway, redact
from .vantages import Vantage

gateway = SerpGateway()


async def search_vantage(v: Vantage, q: str, follow_ai: bool, gw: SerpGateway | None = None) -> dict:
    g = gw or gateway
    t0 = time.perf_counter()
    params = v.params(q)
    approx = False
    try:
        raw, origin = await g.search(params)
    except SerpError as e:
        if "location" not in str(e).lower():
            raise
        # Unknown location string: fall back to country + language targeting.
        params.pop("location", None)
        raw, origin = await g.search(params)
        approx = True
    calls = [origin]
    ai = raw.get("ai_overview") or {}
    if follow_ai and ai.get("page_token") and not ai.get("text_blocks"):
        # Some AI Overviews load lazily; SerpApi exposes them via a follow-up engine.
        try:
            extra, o2 = await g.search({"engine": "google_ai_overview", "page_token": ai["page_token"]})
            calls.append(o2)
            if extra.get("ai_overview"):
                raw = {**raw, "ai_overview": extra["ai_overview"]}
        except Exception:
            pass
    data = normalize(raw)
    data.update({"q": q, "origin": origin, "approx": approx, "ms": round((time.perf_counter() - t0) * 1000), "calls": calls})
    return data


async def trends_for(q: str, gw: SerpGateway | None = None) -> dict:
    g = gw or gateway
    base = {"engine": "google_trends", "q": q[:90], "geo": "IN"}
    geo_task = g.search({**base, "data_type": "GEO_MAP_0", "region": "REGION"})
    ts_task = g.search({**base, "data_type": "TIMESERIES", "date": "today 12-m"})
    out: dict = {"regions": [], "timeline": [], "calls": []}
    for name, task in (("geo", geo_task), ("ts", ts_task)):
        try:
            raw, origin = await task
        except Exception as e:
            out[f"{name}_error"] = redact(e)
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



async def run_scan(q: str, vantages: list[Vantage], follow_ai: bool = True, gw: SerpGateway | None = None, wording: dict | None = None) -> tuple[dict[str, dict], dict, dict[str, str]]:
    """Run a complete scan (no streaming). Returns (results, analysis, errors by vantage id).
    A place that fails is reported in errors and the comparison uses the rest."""
    from .translations import resolve

    queries = resolve(q, vantages, wording)
    outs = await asyncio.gather(*(search_vantage(v, queries[v.id], follow_ai, gw) for v in vantages), return_exceptions=True)
    results = {v.id: r for v, r in zip(vantages, outs) if isinstance(r, dict)}
    errors = {v.id: redact(r)[:300] or type(r).__name__ for v, r in zip(vantages, outs) if not isinstance(r, dict)}
    return results, analyze(q, [v.to_dict() for v in vantages], results), errors


async def full_scan(q: str, lens: str, vantages: list[Vantage], wording: dict | None = None, gw: SerpGateway | None = None) -> dict:
    """A complete, save-ready scan: results, analysis, trends, summary and cost accounting."""
    from .brief import brief_text
    from .translations import resolve

    t0 = time.perf_counter()
    results, analysis, errors = await run_scan(q, vantages, gw=gw, wording=wording)
    tr = await trends_for(q, gw=gw)
    origins = tr.pop("calls", []) + [c for r in results.values() for c in r["calls"]]
    vdicts = [v.to_dict() for v in vantages]
    text = brief_text(analysis, vdicts) if analysis.get("ok") else ""
    done = {
        "elapsed": round(time.perf_counter() - t0, 2),
        "requests": len(origins),
        "credits": origins.count("live"),
        "cached": origins.count("cache"),
        "synthetic": "synthetic" in origins,
        "recorded": origins.count("recorded"),
    }
    return {
        "query": q, "lens": lens, "vantages": vdicts, "queries": resolve(q, vantages, wording), "results": results,
        "errors": errors, "analysis": analysis, "trends": tr,
        "brief": text, "done": done,
    }
