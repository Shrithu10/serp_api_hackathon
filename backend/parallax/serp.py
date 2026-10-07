"""SerpApi gateway: live calls through the official `serpapi` SDK, a local
response cache to stretch the free tier, and an offline demo fallback."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
from pathlib import Path

import serpapi

from . import demo

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(os.getenv("PARALLAX_CACHE_DIR", ROOT / ".cache"))
FIXTURE_DIR = ROOT / "fixtures"
CACHE_TTL = int(os.getenv("PARALLAX_CACHE_TTL", 6 * 3600))
# Location-targeted, non-English searches can take SerpApi well over a minute. Giving up early
# wastes the search (it may still finish, and be billed, on SerpApi's side), so wait long.
TIMEOUT = int(os.getenv("PARALLAX_TIMEOUT", 120))
# SerpApi reuses identical searches for about an hour at no charge, so a retry of a search that
# finished on its side costs nothing extra.
RETRIES = 2


def redact(text: object) -> str:
    """Error text with any api_key removed: request-library messages can embed the full URL."""
    return re.sub(r"(api_key=)[^&\s'\"]+", r"\1REDACTED", str(text))


def _key(params: dict) -> str:
    clean = {k: v for k, v in sorted(params.items()) if k != "api_key"}
    return hashlib.sha256(json.dumps(clean, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]


class SerpGateway:
    def __init__(self, api_key: str | None = None, offline: bool = False, latency: bool = True, salt: str = ""):
        # salt varies demo samples between runs (used for tracked searches); real data is unaffected.
        self.salt = salt
        self.api_key = None if offline else api_key or os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY")
        self.latency = latency
        # SERPAPI_KEY_VIA_PROXY=1: the key is attached outside the app (e.g. an egress proxy adding an
        # Authorization header for serpapi.com), so requests are sent without one and still count as live.
        self.via_proxy = not offline and os.getenv("SERPAPI_KEY_VIA_PROXY") == "1"
        self.client = serpapi.Client(api_key=self.api_key, timeout=TIMEOUT) if (self.api_key or self.via_proxy) else None
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
                if self.record:
                    self._write(FIXTURE_DIR / f"{key}.json", cached)
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
            if self.latency:
                await asyncio.sleep(0.15)
            return recorded, "recorded"
        # Simulated network latency so the streaming UI behaves like the real thing.
        if self.latency:
            await asyncio.sleep(0.35 + (int(key[:4], 16) % 1400) / 1000)
        engine = params.get("engine")
        if engine == "google_trends":
            return demo.trends(params, self.salt), "synthetic"
        if engine == "google_ai_overview":
            return {"ai_overview": {"error": "demo"}}, "synthetic"
        return demo.google(params, self.salt), "synthetic"

    def _live_search(self, params: dict, retries: int = RETRIES) -> dict:
        for attempt in range(retries + 1):
            data = self._live_search_once(params)
            # "We couldn't get valid results for this search. Please try again later." is transient too.
            if not (data.get("_transient") or "try again" in str(data.get("error", "")).lower()):
                return data
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
        return {"error": data["error"]}

    def _live_search_once(self, params: dict) -> dict:
        """One SerpApi call. Errors worth retrying are marked _transient."""
        try:
            return self.client.search(dict(params)).as_dict()
        except (serpapi.TimeoutError, serpapi.HTTPConnectionError) as e:
            return {"error": f"SerpApi did not respond in time ({type(e).__name__})", "_transient": True}
        except serpapi.HTTPError as e:
            if getattr(e, "status_code", 0) in (429, 500, 502, 503, 504):
                return {"error": e.error or f"SerpApi is busy (HTTP {e.status_code})", "_transient": True}
            # Otherwise SerpApi's JSON error body says what went wrong.
            # A 4xx/5xx Response is falsy, so test for None; never fall back to str(e),
            # which embeds the request URL (and with it the api_key).
            if getattr(e, "error", None):
                return {"error": e.error}
            resp = getattr(e, "response", None)
            try:
                return resp.json() if resp is not None else {"error": f"SerpApi request failed ({type(e).__name__})"}
            except Exception:
                return {"error": f"SerpApi request failed (HTTP {getattr(e, 'status_code', '?')})"}

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
