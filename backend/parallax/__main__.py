"""Parallax command line.

    python -m parallax               start the web app (http://localhost:8000)
    python -m parallax check         run the startup checks only
    python -m parallax mcp           run the MCP tool server (stdio) for AI agents
    python -m parallax examples      rebuild the ready-made example scans
    python -m parallax record "q"    record real SerpApi responses (see record.py)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

VERSION = "1.0"

BANNER = r"""
██████╗  █████╗ ██████╗  █████╗ ██╗     ██╗      █████╗ ██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║     ██║     ██╔══██╗╚██╗██╔╝
██████╔╝███████║██████╔╝███████║██║     ██║     ███████║ ╚███╔╝
██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║     ██║     ██╔══██║ ██╔██╗
██║     ██║  ██║██║  ██║██║  ██║███████╗███████╗██║  ██║██╔╝ ██╗
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝"""


class Out:
    def __init__(self, stream=sys.stdout):
        self.s = stream
        self.color = stream.isatty() and os.getenv("NO_COLOR") is None

    def c(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.color else text

    def line(self, text: str = "") -> None:
        print(text, file=self.s, flush=True)

    def ok(self, text: str) -> None:
        self.line(f"  {self.c('32', '✓')} {text}")

    def warn(self, text: str) -> None:
        self.line(f"  {self.c('33', '!')} {text}")

    def bad(self, text: str) -> None:
        self.line(f"  {self.c('31', '✗')} {text}")


def banner(out: Out) -> None:
    for i, row in enumerate(BANNER.strip("\n").splitlines()):
        # Ink to vermilion, top to bottom.
        out.line(out.c("38;5;" + str([252, 250, 216, 209, 203, 167][i]), row))
    out.line(f"{out.c('1', f'[PARALLAX v{VERSION}]')} - One query. Twelve Indias.  {out.c('2', 'Search data via SerpApi')}")
    out.line()


def checks(out: Out) -> bool:
    """Real startup checks. Returns False only for problems that stop the app working."""
    healthy = True
    from . import brief, storage
    from .serp import CACHE_DIR, CACHE_TTL, FIXTURE_DIR, SerpGateway
    from .vantages import ALL_VANTAGES, LENSES

    gw = SerpGateway()
    if gw.live:
        out.ok(f"SerpApi key found: live Google results ({out.c('2', 'Search · AI Overview · Trends · Locations · Account')})")
    else:
        out.warn("No SERPAPI_API_KEY: running on labelled demo data (add it to .env for live results)")

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        probe = CACHE_DIR / ".write-test"
        probe.write_text("ok")
        probe.unlink()
        cached = len(list(CACHE_DIR.glob("*.json")))
        out.ok(f"Disk cache ready: {cached} saved responses, reused for {CACHE_TTL // 3600} h (repeat searches cost 0 credits)")
    except OSError as e:
        out.bad(f"Cache directory not writable: {e}")
        healthy = False

    recorded = len(list(FIXTURE_DIR.glob("*.json"))) if FIXTURE_DIR.exists() else 0
    if recorded:
        out.ok(f"{recorded} recorded SerpApi responses available for offline replay")

    try:
        n_hist = len(storage.list_scans(limit=1000))
        n_ex = len(storage.list_examples())
        out.ok(f"History database ready: {n_hist} saved searches, {n_ex} ready-made examples ({storage.DB_PATH.name})")
    except Exception as e:  # noqa: BLE001
        out.bad(f"History database error: {e}")
        healthy = False

    out.ok(f"{len(ALL_VANTAGES)} vantage points across {len(LENSES)} lenses (cities · languages · world)")

    if brief.available():
        out.ok(f"Claude analyst enabled ({brief.MODEL}): written analysis + query translation")
    else:
        out.warn("No ANTHROPIC_API_KEY: analysis is generated from the numbers instead of written by Claude")

    dist = Path(os.getenv("PARALLAX_DIST", ROOT / "frontend" / "dist"))
    if (dist / "index.html").exists():
        out.ok("Web interface built")
    else:
        out.bad("Web interface not built: run `cd frontend && npm install && npm run build` (or ./run.sh)")
        healthy = False

    try:
        import mcp  # noqa: F401

        out.ok("MCP tool server available: `python -m parallax mcp` (tools: parallax_scan, parallax_lenses)")
    except ImportError:
        out.warn("MCP package not installed: agent integration disabled")
    return healthy


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m parallax", description="Parallax: see how Google's results change across India.")
    ap.add_argument("command", nargs="?", default="serve", choices=["serve", "check", "mcp", "examples", "record"])
    ap.add_argument("rest", nargs="*", help=argparse.SUPPRESS)
    ap.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.getenv("PORT", 8000)))
    ap.add_argument("--reload", action="store_true", help="auto-reload on code changes (development)")
    ap.add_argument("--quiet", action="store_true", help="skip the banner")
    args = ap.parse_args()

    if args.command == "mcp":
        # stdout carries the MCP protocol, so the banner goes to stderr.
        err = Out(sys.stderr)
        if not args.quiet:
            banner(err)
            err.ok("MCP tool server on stdio: parallax_scan, parallax_lenses")
        from .mcp_server import server

        server.run()
        return

    if args.command == "record":
        sys.argv = ["parallax.record", *args.rest]
        from .record import main as record_main

        asyncio.run(record_main())
        return

    out = Out()
    if not args.quiet:
        banner(out)

    if args.command == "examples":
        from .examples import build

        made = asyncio.run(build(replace=True))
        out.ok(f"Built {len(made)} ready-made examples")
        return

    healthy = checks(out)
    if args.command == "check":
        sys.exit(0 if healthy else 1)

    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}"
    out.line()
    out.line(f"  {out.c('1', '→')} Open {out.c('1;4', url)}   {out.c('2', '(Ctrl+C to stop)')}")
    out.line()

    import uvicorn

    uvicorn.run("parallax.app:app", host=args.host, port=args.port, reload=args.reload, log_level="warning")


if __name__ == "__main__":
    main()
