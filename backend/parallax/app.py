"""PARALLAX API server: streams a multi-vantage SerpApi scan over Server-Sent Events."""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv()

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from . import brief, storage  # noqa: E402
from .analysis import analyze  # noqa: E402
from .engine import gateway, search_vantage, trends_for  # noqa: E402
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
        "ai": brief.available(),
        "model": brief.MODEL if brief.available() else None,
        "lenses": [lens.to_dict() for lens in LENSES.values()],
        "max_vantages": MAX_VANTAGES,
    }


@app.get("/api/account")
async def account():
    try:
        return await gateway.account()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


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

    async def stream():
        started = time.perf_counter()
        vdicts = [v.to_dict() for v in chosen]
        yield sse("plan", {"query": q, "lens": lens, "vantages": vdicts, "live": gateway.live, "ai": brief.available()})

        queries = {v.id: q for v in chosen}
        needs = {v.hl: v.lang_name for v in chosen if v.translate}
        if needs:
            tr = await brief.translate(q, needs)
            for v in chosen:
                if v.translate and tr.get(v.hl):
                    queries[v.id] = tr[v.hl]
            yield sse("translations", {"queries": queries, "translated": bool(tr)})

        results: dict[str, dict] = {}
        errors: dict[str, str] = {}
        origins: list[str] = []

        async def run(v: Vantage):
            try:
                return v, await search_vantage(v, queries[v.id], follow_ai), None
            except Exception as e:
                return v, None, str(e)

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
        text = ""
        if analysis.get("ok"):
            async for chunk in brief.stream_brief(q, vdicts, results, analysis, synthetic):
                text += chunk
                yield sse("brief", {"delta": chunk})
        done = {
            "elapsed": round(time.perf_counter() - started, 2),
            "requests": len(origins),
            "credits": origins.count("live"),
            "cached": origins.count("cache"),
            "synthetic": synthetic,
            "recorded": origins.count("recorded"),
        }
        if results:
            try:
                done["id"] = storage.save(q, lens, gateway.live, {
                    "query": q, "lens": lens, "vantages": vdicts, "queries": queries, "results": results,
                    "errors": errors, "analysis": analysis, "trends": tr, "brief": text, "done": done,
                })
            except Exception:  # history is a convenience; never fail a scan over it
                pass
        yield sse("done", done)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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
