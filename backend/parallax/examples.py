"""Ready-made example scans, so the first thing anyone sees is a finished
comparison rather than an empty search box.

Examples are built through an offline gateway: if real SerpApi responses were
recorded for these queries (`python -m parallax.record "<query>"`), the
examples use that real data; otherwise they use labelled demo samples.
Either way they cost nothing to open.

    python -m parallax.examples          # (re)build the examples
"""

from __future__ import annotations

import asyncio

from . import storage
from .brief import _offline
from .engine import run_scan, trends_for
from .serp import SerpGateway
from .vantages import LENSES

EXAMPLES = [
    ("monsoon flooding", "cities"),
    ("is ayurveda effective", "languages"),
    ("best phone under 30000", "cities"),
    ("is india safe for tourists", "world"),
    ("air pollution", "cities"),
    ("who is the best cricketer", "cities"),
]


async def build(replace: bool = False) -> list[str]:
    if replace:
        for s in storage.list_examples():
            storage.delete(s["id"])
    have = {(s["query"], s["lens"]) for s in storage.list_examples()}
    gw = SerpGateway(offline=True, latency=False)
    ids = []
    for q, lens in EXAMPLES:
        if (q, lens) in have:
            continue
        vantages = LENSES[lens].vantages
        results, analysis = await run_scan(q, vantages, gw=gw)
        if not analysis.get("ok"):
            continue
        tr = await trends_for(q, gw=gw)
        origins = tr.pop("calls", []) + [c for r in results.values() for c in r["calls"]]
        vdicts = [v.to_dict() for v in vantages]
        text = "".join([c async for c in _offline(analysis, vdicts)]) if analysis.get("ok") else ""
        done = {"elapsed": 0, "credits": 0, "cached": 0, "requests": len(origins), "synthetic": "synthetic" in origins, "recorded": origins.count("recorded")}
        ids.append(storage.save(q, lens, False, {
            "query": q, "lens": lens, "vantages": vdicts, "queries": {v.id: q for v in vantages}, "results": results,
            "errors": {}, "analysis": analysis, "trends": tr, "brief": text, "done": done,
        }, example=True))
    return ids


if __name__ == "__main__":
    made = asyncio.run(build(replace=True))
    print(f"Built {len(made)} example scans.")
