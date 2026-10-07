import asyncio

from parallax import app as app_mod
from parallax import engine, storage
from parallax.serp import SerpGateway


def _offline(monkeypatch, tmp_path):
    # Fully offline: never spends SerpApi credits, even when a key is set.
    offline = SerpGateway(offline=True, latency=False)
    monkeypatch.setattr(engine, "gateway", offline)
    monkeypatch.setattr(app_mod, "gateway", offline)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "t.db")


async def _read_until(event: str):
    resp = await app_mod.scan(q="air quality test", lens="world", vantages="", custom="", trends=True, follow_ai=True, wording="")
    body = resp.body_iterator
    async for chunk in body:
        if f"event: {event}" in chunk:
            break
    await body.aclose()  # what a client disconnect does to the response stream


def test_scan_is_saved_if_client_leaves_during_summary(monkeypatch, tmp_path):
    _offline(monkeypatch, tmp_path)
    asyncio.run(_read_until("brief"))
    saved = storage.list_scans()
    assert [s["query"] for s in saved] == ["air quality test"]
    assert storage.get(saved[0]["id"])["payload"]["brief"]


def test_scan_is_saved_if_client_leaves_once_all_places_answered(monkeypatch, tmp_path):
    _offline(monkeypatch, tmp_path)
    asyncio.run(_read_until("analysis"))
    assert [s["query"] for s in storage.list_scans()] == ["air quality test"]
