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
from .engine import full_scan
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
        for w in storage.list_watches():
            if w["example"]:
                storage.delete_watch(w["id"])
    have = {(s["query"], s["lens"]) for s in storage.list_examples()}
    gw = SerpGateway(offline=True, latency=False)
    ids = []
    for q, lens in EXAMPLES:
        if (q, lens) in have:
            continue
        payload = await full_scan(q, lens, LENSES[lens].vantages, gw=gw)
        if not payload["analysis"].get("ok"):
            continue
        ids.append(storage.save(q, lens, False, payload, example=True))
    from .tracking import seed_example

    await seed_example()
    return ids


if __name__ == "__main__":
    made = asyncio.run(build(replace=True))
    print(f"Built {len(made)} example scans.")
