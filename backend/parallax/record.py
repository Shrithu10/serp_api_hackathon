"""Record real SerpApi responses as offline fixtures.

    SERPAPI_API_KEY=... python -m parallax.record "is ayurveda effective" --lens cities

Fixtures land in backend/fixtures/ and are replayed in demo mode (no key),
so a demo can run on real data without spending credits.
"""

from __future__ import annotations

import argparse
import asyncio
import os

os.environ["PARALLAX_RECORD"] = "1"

from .engine import gateway, run_scan, trends_for  # noqa: E402
from .vantages import LENSES  # noqa: E402


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("query")
    ap.add_argument("--lens", default="cities", choices=list(LENSES))
    args = ap.parse_args()
    if not gateway.live:
        raise SystemExit("Set SERPAPI_API_KEY to record real responses.")
    _, a = await run_scan(args.query, LENSES[args.lens].vantages)
    await trends_for(args.query)
    print(f"Recorded '{args.query}' ({args.lens}): PARALLAX {a.get('index')} — {a.get('verdict')}")


if __name__ == "__main__":
    asyncio.run(main())
