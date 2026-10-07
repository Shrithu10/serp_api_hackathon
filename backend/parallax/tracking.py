"""Tracked searches: re-run a saved search on a schedule and keep every run,
so you can see how Google's answers shift over days and weeks.

Runs happen while Parallax is running; a run that came due while it was
stopped happens on the next start (once, not once per missed interval).
"""

from __future__ import annotations

import asyncio
import logging
import time

from . import storage
from .engine import full_scan, gateway
from .serp import SerpGateway, redact
from .vantages import ALL_VANTAGES, LENSES, Vantage, custom_vantage

log = logging.getLogger("parallax.tracking")
CHECK_EVERY = 60  # seconds


def vantages_for(config: dict, lens: str) -> list[Vantage]:
    ids = config.get("vantage_ids") or []
    out = [ALL_VANTAGES[i] for i in ids if i in ALL_VANTAGES] if ids else list((LENSES.get(lens) or LENSES["cities"]).vantages)
    for c in config.get("custom") or []:
        try:
            out.append(custom_vantage(c))
        except (KeyError, TypeError, ValueError):
            pass
    return out


def estimate_requests(config: dict, lens: str) -> int:
    """SerpApi searches per run (one per place plus two for Trends; AI follow-ups vary)."""
    return len(vantages_for(config, lens)) + 2


async def run_watch(w: dict, gw: SerpGateway | None = None, created_at: float | None = None) -> str:
    vantages = vantages_for(w["config"], w["lens"])
    if gw is None:
        if w["example"]:
            # The ready-made example stays sample data and never spends credits.
            gw = SerpGateway(offline=True, latency=False, salt=f"seed-{w['runs']}")
        else:
            # Demo samples drift a little per run so the timeline isn't flat; live data is real either way.
            gw = gateway if gateway.live else SerpGateway(salt=f"{w['id']}-{w['runs']}")
    payload = await full_scan(w["query"], w["lens"], vantages, wording=w["config"].get("wording"), gw=gw)
    sid = storage.save(w["query"], w["lens"], gw.live, payload, watch=w["id"], example=w["example"], created_at=created_at)
    now = created_at or time.time()
    storage.update_watch(w["id"], last_run=now, next_run=now + w["interval_h"] * 3600, runs=w["runs"] + 1, last_error=None)
    return sid


async def scheduler() -> None:
    while True:
        try:
            for w in storage.due_watches():
                try:
                    await run_watch(w)
                except Exception as e:  # keep the loop alive; show the error in the UI
                    log.warning("tracked search %s failed: %s", w["id"], e)
                    storage.update_watch(w["id"], last_error=redact(e)[:300], next_run=time.time() + 3600)
        except Exception as e:  # noqa: BLE001
            log.warning("tracking scheduler error: %s", e)
        await asyncio.sleep(CHECK_EVERY)


async def seed_example(query: str = "monsoon flooding", lens: str = "cities", days: int = 8) -> str | None:
    """A paused, ready-made tracked search with a week of sample history (never spends credits)."""
    if any(w["example"] for w in storage.list_watches()):
        return None
    now = time.time()
    wid = storage.create_watch(query, lens, {}, 24, active=False, example=True)
    for i in range(days):
        w = storage.get_watch(wid)
        await run_watch(w, gw=SerpGateway(offline=True, latency=False, salt=f"seed-{i}"), created_at=now - (days - 1 - i) * 86400)
    storage.update_watch(wid, next_run=None)
    return wid
