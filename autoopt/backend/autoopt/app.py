"""FastAPI application: REST API, WebSocket progress stream, static UI."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

from .agents import AGENTS
from .coordinator import RunConfig, select_agents, default_agent_configs
from .db import Database
from .problems import REGISTRY, build_problem, generate_instance
from .runs import RunManager

FRONTEND_DIST = Path(os.environ.get("AUTOOPT_UI", Path(__file__).resolve().parents[2] / "frontend" / "dist"))

EXAMPLES = [
    ("Workshop: 8 jobs x 5 machines", "jobshop", {"jobs": 8, "machines": 5, "ops_per_job": 5, "flexibility": 2, "extra_precedences": 3}, 7),
    ("Factory: 15 jobs x 8 machines", "jobshop", {"jobs": 15, "machines": 8, "ops_per_job": 6, "flexibility": 3, "extra_precedences": 6}, 11),
    ("City deliveries: 25 customers", "vrp", {"customers": 25, "capacity": 60, "spare_vehicles": 1}, 5),
    ("Clustered region: 45 customers", "vrp", {"customers": 45, "capacity": 80, "clustered": True}, 9),
    ("Mission payload: 60 items, 3 resources", "knapsack", {"items": 60, "dimensions": 3, "conflicts": 8}, 3),
    ("Portfolio: 250 items, 5 resources", "knapsack", {"items": 250, "dimensions": 5, "tightness": 0.3, "conflicts": 30}, 4),
]


class GenerateReq(BaseModel):
    type: str
    params: dict = Field(default_factory=dict)
    seed: int | None = None

class InstanceReq(BaseModel):
    type: str
    data: dict
    name: str = "Untitled instance"

class RunReq(BaseModel):
    type: str | None = None
    data: dict | None = None
    instance_id: str | None = None
    name: str | None = None
    config: RunConfig = Field(default_factory=RunConfig)


def create_app(db_path: str | None = None) -> FastAPI:
    db = Database(db_path) if db_path else Database()
    manager = RunManager(db)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager.bind_loop(asyncio.get_running_loop())
        db.mark_interrupted()
        if db.count_instances() == 0:
            for name, t, params, seed in EXAMPLES:
                data = generate_instance(t, params, seed)
                db.save_instance(name, t, data, build_problem(t, data).summary())
        yield
        manager.stop_all()

    app = FastAPI(title="AutoOpt", version="1.0.0", lifespan=lifespan)
    app.state.db = db
    app.state.manager = manager

    def _problem(type_: str, data: dict):
        try:
            return build_problem(type_, data)
        except ValidationError as e:
            raise HTTPException(422, detail=[{"loc": err["loc"], "msg": err["msg"]} for err in e.errors()])
        except ValueError as e:
            raise HTTPException(422, detail=str(e))

    # ---- metadata -----------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "running": manager.running_count()}

    @app.get("/api/meta")
    def meta():
        return {
            "problem_types": [
                {
                    "key": pt.key,
                    "title": pt.title,
                    "description": pt.description,
                    "sense": pt.sense,
                    "objective_name": pt.objective_name,
                    "generator_params": pt.generator_params,
                    "capabilities": sorted(pt.problem_cls.capabilities),
                }
                for pt in REGISTRY.values()
            ],
            "agents": [cls.catalog() for cls in AGENTS.values()],
            "run_defaults": RunConfig().model_dump(exclude={"agents"}),
        }

    # ---- instances ----------------------------------------------------------
    @app.post("/api/instances/generate")
    def generate(req: GenerateReq):
        if req.type not in REGISTRY:
            raise HTTPException(404, "unknown problem type")
        try:
            data = generate_instance(req.type, req.params, req.seed)
        except (ValueError, ValidationError) as e:
            raise HTTPException(422, detail=str(e))
        p = build_problem(req.type, data)
        return {"type": req.type, "data": data, "summary": p.summary()}

    @app.post("/api/instances/inspect")
    def inspect(req: InstanceReq):
        p = _problem(req.type, req.data)
        return {
            "summary": p.summary(),
            "agents": select_agents(p, default_agent_configs()),
        }

    @app.get("/api/instances")
    def list_instances():
        return db.list_instances()

    @app.post("/api/instances")
    def save_instance(req: InstanceReq):
        p = _problem(req.type, req.data)
        iid = db.save_instance(req.name, req.type, req.data, p.summary())
        return db.get_instance(iid)

    @app.get("/api/instances/{iid}")
    def get_instance(iid: str):
        inst = db.get_instance(iid)
        if not inst:
            raise HTTPException(404, "instance not found")
        return inst

    @app.delete("/api/instances/{iid}")
    def delete_instance(iid: str):
        if not db.delete_instance(iid):
            raise HTTPException(404, "instance not found")
        return {"ok": True}

    # ---- runs ---------------------------------------------------------------
    @app.post("/api/runs")
    def start_run(req: RunReq):
        type_, data, name = req.type, req.data, req.name
        if req.instance_id:
            inst = db.get_instance(req.instance_id)
            if not inst:
                raise HTTPException(404, "instance not found")
            type_, data, name = inst["type"], inst["data"], name or inst["name"]
        if not type_ or data is None:
            raise HTTPException(422, "provide instance_id or type + data")
        p = _problem(type_, data)
        for a in req.config.agents:
            if a.key not in AGENTS:
                raise HTTPException(422, f"unknown agent {a.key}")
        sel = select_agents(p, req.config.agents or default_agent_configs())
        if not any(s["selected"] for s in sel):
            raise HTTPException(422, "no compatible agent is enabled for this problem")
        try:
            rid = manager.start(type_, data, req.config, name or REGISTRY[type_].title, req.instance_id)
        except RuntimeError as e:
            raise HTTPException(429, str(e))
        return {"id": rid, "agents": sel}

    @app.get("/api/runs")
    def list_runs(limit: int = 100):
        rows = db.list_runs(limit)
        for r in rows:
            if manager.is_live(r["id"]):
                snap = manager.snapshot(r["id"])
                r.update(best_objective=snap["best_objective"], best_agent=snap["best_agent"], elapsed=snap["elapsed"])
        return rows

    @app.get("/api/runs/{rid}")
    def get_run(rid: str):
        snap = manager.snapshot(rid)
        if snap is None:
            raise HTTPException(404, "run not found")
        row = db.get_run(rid)
        if row:
            snap["config"] = row["config"]
            snap["instance"] = row["instance"]
            snap["instance_id"] = row["instance_id"]
        return snap

    @app.post("/api/runs/{rid}/stop")
    def stop_run(rid: str):
        if not manager.stop(rid):
            raise HTTPException(404, "run is not active")
        return {"ok": True}

    @app.delete("/api/runs/{rid}")
    def delete_run(rid: str):
        if manager.is_live(rid):
            raise HTTPException(409, "stop the run before deleting it")
        manager.live.pop(rid, None)
        if not db.delete_run(rid):
            raise HTTPException(404, "run not found")
        return {"ok": True}

    @app.websocket("/ws/runs/{rid}")
    async def run_ws(ws: WebSocket, rid: str):
        await ws.accept()
        q = manager.subscribe(rid)
        try:
            snap = manager.snapshot(rid)
            if snap is None:
                await ws.send_json({"type": "error", "message": "run not found"})
                await ws.close()
                return
            await ws.send_json({"type": "snapshot", "snapshot": snap})
            if q is None or snap.get("state") == "finished":
                await ws.send_json({"type": "finished", "snapshot": snap})
                await ws.close()
                return
            while True:
                msg = await q.get()
                await ws.send_json(msg)
                if msg.get("type") == "finished":
                    await ws.close()
                    return
        except WebSocketDisconnect:
            pass
        finally:
            if q is not None:
                manager.unsubscribe(rid, q)

    # ---- static UI ----------------------------------------------------------
    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = FRONTEND_DIST / path
            if path and f.is_file() and FRONTEND_DIST in f.resolve().parents:
                return FileResponse(f)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app
