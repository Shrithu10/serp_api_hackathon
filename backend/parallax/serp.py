"""SerpApi gateway: live calls through the official `serpapi` SDK, a local
response cache to stretch the free tier, and an offline demo fallback."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from pathlib import Path

import serpapi

from . import demo

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(os.getenv("PARALLAX_CACHE_DIR", ROOT / ".cache"))
FIXTURE_DIR = ROOT / "fixtures"
CACHE_TTL = int(os.getenv("PARALLAX_CACHE_TTL", 6 * 3600))


def _key(params: dict) -> str:
    clean = {k: v for k, v in sorted(params.items()) if k != "api_key"}
    return hashlib.sha256(json.dumps(clean, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]


class SerpGateway:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY")
        self.client = serpapi.Client(api_key=self.api_key, timeout=45) if self.api_key else None
        self.record = os.getenv("PARALLAX_RECORD") == "1"
        self.sem = asyncio.Semaphore(int(os.getenv("PARALLAX_CONCURRENCY", 6)))
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @property
    def live(self) -> bool:
        return self.client is not None

    # -- cache helpers ---------------------------------------------------
    def _read(self, path: Path, ttl: int | None) -> dict | None:
        if not path.exists():
            return None
        if ttl is not None and time.time() - path.stat().st_mtime > ttl:
            return None
        try:
            return json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return None

    def _write(self, path: Path, data: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False))

    # -- search ----------------------------------------------------------
    async def search(self, params: dict) -> tuple[dict, str]:
        """Return (response, origin). origin is live | cache | recorded | synthetic."""
        key = _key(params)
        if self.live:
            cached = self._read(CACHE_DIR / f"{key}.json", CACHE_TTL)
            if cached is not None:
                return cached, "cache"
            async with self.sem:
                data = await asyncio.to_thread(self._live_search, params)
            if data.get("error"):
                raise SerpError(data["error"])
            self._write(CACHE_DIR / f"{key}.json", data)
            if self.record:
                self._write(FIXTURE_DIR / f"{key}.json", data)
            return data, "live"

        recorded = self._read(FIXTURE_DIR / f"{key}.json", None)
        if recorded is not None:
            await asyncio.sleep(0.15)
            return recorded, "recorded"
        # Simulated network latency so the streaming UI behaves like the real thing.
        await asyncio.sleep(0.35 + (int(key[:4], 16) % 1400) / 1000)
        engine = params.get("engine")
        if engine == "google_trends":
            return demo.trends(params), "synthetic"
        if engine == "google_ai_overview":
            return {"ai_overview": {"error": "demo"}}, "synthetic"
        return demo.google(params), "synthetic"

    def _live_search(self, params: dict) -> dict:
        try:
            return self.client.search(dict(params)).as_dict()
        except serpapi.HTTPError as e:  # SerpApi returns JSON error bodies
            resp = getattr(e, "response", None) or getattr(e.args[0] if e.args else None, "response", None)
            try:
                return resp.json()
            except Exception:
                return {"error": str(e)}

    async def account(self) -> dict:
        if not self.live:
            return {"demo": True, "plan_name": "Demo", "plan_searches_left": None, "total_searches_left": None}
        data = await asyncio.to_thread(self.client.account)
        return {
            "demo": False,
            "plan_name": data.get("plan_name"),
            "plan_searches_left": data.get("plan_searches_left"),
            "total_searches_left": data.get("total_searches_left"),
            "this_month_usage": data.get("this_month_usage"),
            "searches_per_month": data.get("searches_per_month"),
        }

    async def locations(self, q: str, limit: int = 8) -> list[dict]:
        if not q.strip():
            return []
        cache = CACHE_DIR / f"loc-{_key({'q': q.lower(), 'limit': limit})}.json"
        hit = self._read(cache, 7 * 24 * 3600)
        if hit is not None:
            return hit["rows"]
        try:
            # The Locations API is free and needs no key.
            client = self.client or serpapi.Client(timeout=15)
            rows = await asyncio.to_thread(client.locations, q=q, limit=limit)
            rows = list(rows)
        except Exception:
            rows = demo.locations(q, limit)
        self._write(cache, {"rows": rows})
        return rows


class SerpError(RuntimeError):
    pass
