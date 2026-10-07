"""PARALLAX API server: streams a multi-vantage SerpApi scan over Server-Sent Events."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv()

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import brief, storage, translations  # noqa: E402
from .analysis import analyze  # noqa: E402
from .engine import gateway, search_vantage, trends_for  # noqa: E402
from .serp import redact  # noqa: E402
from .vantages import ALL_VANTAGES, LENSES, Vantage, custom_vantage  # noqa: E402

app = FastAPI(title="PARALLAX", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MAX_VANTAGES = 16


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/api/config")
async def config():
    return {
        "live": gateway.live,
        "lenses": [lens.to_dict() for lens in LENSES.values()],
        "max_vantages": MAX_VANTAGES,
    }


@app.get("/api/account")
async def account():
    try:
        return await gateway.account()
    except Exception as e:
        return JSONResponse({"error": redact(e)}, status_code=502)


@app.get("/api/locations")
async def locations(q: str = Query("", max_length=80)):
    rows = await gateway.locations(q)
    out = []
    for r in rows:
        gps = r.get("gps") or [0, 0]
        out.append({
            "name": r.get("name"),
            "location": r.get("canonical_name"),
            "gl": (r.get("country_code") or "in").lower(),
            "lat": gps[1] if len(gps) > 1 else 0,
            "lng": gps[0] if gps else 0,
            "type": r.get("target_type"),
            "reach": r.get("reach"),
        })
    return out


@app.on_event("startup")
async def _seed_examples():
    # First run: build the ready-made examples (offline, free) in the background.
    from .examples import build

    asyncio.create_task(build())
    # Re-run tracked searches when they come due.
    from .tracking import scheduler

    asyncio.create_task(scheduler())


@app.get("/api/translations/known")
async def translations_known():
    """Searches that have built-in wording in every Indian language."""
    return sorted(translations.BUILTIN)


@app.get("/api/translations")
async def translations_for(q: str = Query("", max_length=200)):
    """Built-in native-script wording for a search, used to pre-fill the form."""
    return translations.lookup(q)


class WatchIn(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    lens: str = "cities"
    vantage_ids: list[str] = []
    custom: list[dict] = []
    wording: dict[str, str] = {}
    interval_h: float = Field(24, ge=1, le=24 * 31)
    scan_id: str | None = None  # an existing scan to count as the first run


def _watch_out(w: dict, with_runs: bool = True) -> dict:
    from .tracking import estimate_requests, vantages_for

    out = dict(w)
    out["requests_per_run"] = estimate_requests(w["config"], w["lens"])
    out["vantages"] = [v.to_dict() for v in vantages_for(w["config"], w["lens"])]
    if with_runs:
        out["history"] = storage.watch_runs(w["id"])
    return out


@app.get("/api/watches")
async def watches_list():
    return [_watch_out(w) for w in storage.list_watches()]


@app.post("/api/watches")
async def watches_create(body: WatchIn):
    if body.lens not in LENSES:
        raise HTTPException(400, "Unknown lens")
    config = {"vantage_ids": body.vantage_ids, "custom": body.custom, "wording": body.wording}
    now = time.time()
    first = storage.get(body.scan_id) if body.scan_id else None
    wid = storage.create_watch(body.query.strip(), body.lens, config, body.interval_h, next_run=now + body.interval_h * 3600 if first else now)
    if first:
        storage.attach_to_watch(body.scan_id, wid)
        storage.update_watch(wid, runs=1, last_run=first["created_at"])
    return _watch_out(storage.get_watch(wid))


@app.get("/api/watches/{wid}")
async def watches_get(wid: str):
    w = storage.get_watch(wid)
    if not w:
        raise HTTPException(404, "Tracked search not found")
    return _watch_out(w)


class WatchPatch(BaseModel):
    active: bool | None = None
    interval_h: float | None = Field(None, ge=1, le=24 * 31)


@app.patch("/api/watches/{wid}")
async def watches_patch(wid: str, body: WatchPatch):
    w = storage.get_watch(wid)
    if not w:
        raise HTTPException(404, "Tracked search not found")
    fields: dict = {}
    if body.interval_h is not None:
        fields["interval_h"] = body.interval_h
    if body.active is not None:
        fields["active"] = body.active
        if body.active:
            # Resuming: next run one interval after the last one (or now if overdue).
            fields["next_run"] = max(time.time(), (w["last_run"] or 0) + (body.interval_h or w["interval_h"]) * 3600)
    storage.update_watch(wid, **fields)
    return _watch_out(storage.get_watch(wid))


@app.post("/api/watches/{wid}/run")
async def watches_run(wid: str):
    from .tracking import run_watch

    w = storage.get_watch(wid)
    if not w:
        raise HTTPException(404, "Tracked search not found")
    sid = await run_watch(w)
    return {"scan_id": sid, "watch": _watch_out(storage.get_watch(wid))}


@app.delete("/api/watches/{wid}")
async def watches_delete(wid: str):
    return {"deleted": storage.delete_watch(wid)}


@app.get("/api/examples")
async def examples():
    return storage.list_examples()


@app.get("/api/scans")
async def scans(q: str = "", limit: int = Query(50, le=200)):
    return storage.list_scans(limit=limit, query=q or None)


@app.get("/api/scans/{sid}")
async def scan_get(sid: str):
    s = storage.get(sid)
    if not s:
        raise HTTPException(404, "Scan not found")
    return s


@app.get("/api/scans/{sid}/previous")
async def scan_previous(sid: str):
    # null (not 404) when this is the first scan of the query: it's an expected state.
    return storage.previous(sid)


@app.delete("/api/scans/{sid}")
async def scan_delete(sid: str):
    return {"deleted": storage.delete(sid)}


@app.get("/api/scan")
async def scan(
    q: str = Query(..., min_length=1, max_length=200),
    lens: str = "cities",
    vantages: str = "",
    custom: str = "",
    trends: bool = True,
    follow_ai: bool = True,
    wording: str = "",
):
    q = q.strip()
    base = LENSES.get(lens) or LENSES["cities"]
    chosen: list[Vantage] = [ALL_VANTAGES[i] for i in vantages.split(",") if i in ALL_VANTAGES] if vantages else list(base.vantages)
    if custom:
        try:
            chosen += [custom_vantage(c) for c in json.loads(custom)]
        except (ValueError, KeyError, TypeError):
            pass
    seen, uniq = set(), []
    for v in chosen:
        if v.id not in seen:
            seen.add(v.id)
            uniq.append(v)
    chosen = uniq[:MAX_VANTAGES]
    try:
        overrides = {str(k): str(v) for k, v in json.loads(wording).items()} if wording else {}
    except (ValueError, AttributeError):
        overrides = {}

    # Shared with guarded(), which saves the scan if the client disconnects.
    results: dict[str, dict] = {}
    errors: dict[str, str] = {}
    queries: dict[str, str] = {}
    saved: list[bool] = []

    async def stream():
        started = time.perf_counter()
        vdicts = [v.to_dict() for v in chosen]
        yield sse("plan", {"query": q, "lens": lens, "vantages": vdicts, "live": gateway.live})

        queries.update(translations.resolve(q, chosen, overrides))
        if any(v.translate for v in chosen):
            yield sse("translations", {"queries": queries, "translated": any(queries[v.id] != q for v in chosen)})

        origins: list[str] = []

        async def run(v: Vantage):
            try:
                return v, await search_vantage(v, queries[v.id], follow_ai), None
            except Exception as e:
                return v, None, redact(e)

        tasks = [asyncio.create_task(run(v)) for v in chosen]
        trend_task = asyncio.create_task(trends_for(q)) if trends else None

        for fut in asyncio.as_completed(tasks):
            v, data, err = await fut
            if err:
                errors[v.id] = err[:300]
                yield sse("vantage", {"id": v.id, "status": "error", "error": err[:300]})
                continue
            results[v.id] = data
            origins += data["calls"]
            yield sse("vantage", {"id": v.id, "status": "ok", "data": data})

        analysis = analyze(q, vdicts, results)
        yield sse("analysis", analysis)

        tr = None
        if trend_task:
            tr = await trend_task
            origins += tr.pop("calls", [])
            yield sse("trends", tr)

        synthetic = "synthetic" in origins
        text = brief.brief_text(analysis, vdicts) if analysis.get("ok") else ""
        done = {
            "elapsed": round(time.perf_counter() - started, 2),
            "requests": len(origins),
            "credits": origins.count("live"),
            "cached": origins.count("cache"),
            "synthetic": synthetic,
            "recorded": origins.count("recorded"),
        }
        # Save before streaming the summary, so closing the tab now doesn't lose a paid-for scan.
        persist(analysis, tr, text, done)
        for word in re.split(r"(\s+)", text):
            yield sse("brief", {"delta": word})
            await asyncio.sleep(0.006)
        yield sse("done", done)

    def persist(analysis: dict, tr: dict | None, text: str, done: dict) -> None:
        if not results or saved:
            return
        saved.append(True)
        try:
            done["id"] = storage.save(q, lens, gateway.live, {
                "query": q, "lens": lens, "vantages": [v.to_dict() for v in chosen], "queries": queries, "results": results,
                "errors": errors, "analysis": analysis, "trends": tr, "brief": text, "done": done,
            })
        except Exception:  # history is a convenience; never fail a scan over it
            pass

    async def guarded():
        try:
            async for event in stream():
                yield event
        finally:
            # Client left after every place answered but before the save above: keep the scan.
            # Places still in flight are not saved; their responses are in the disk cache, so a re-run is free.
            if results and not saved and len(results) + len(errors) == len(chosen):
                a = analyze(q, [v.to_dict() for v in chosen], results)
                origins_ = [c for r in results.values() for c in r["calls"]]
                persist(a, None, brief.brief_text(a, [v.to_dict() for v in chosen]) if a.get("ok") else "", {
                    "elapsed": 0, "requests": len(origins_), "credits": origins_.count("live"), "cached": origins_.count("cache"),
                    "synthetic": "synthetic" in origins_, "recorded": origins_.count("recorded"),
                })

    return StreamingResponse(guarded(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# Serve the built frontend when present (single-process deployment).
DIST = Path(os.getenv("PARALLAX_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        f = DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
