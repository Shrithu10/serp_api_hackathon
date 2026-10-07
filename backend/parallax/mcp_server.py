"""PARALLAX as an MCP server: lets any AI agent ask "does this query look
different across India / across languages / across the world?"

Run:  python -m parallax.mcp_server            (stdio, for Claude Desktop / Claude Code / Cursor)
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from mcp.server.mcpserver import MCPServer  # noqa: E402

from .engine import run_scan  # noqa: E402
from .vantages import LENSES  # noqa: E402

server = MCPServer(
    name="parallax",
    instructions=(
        "PARALLAX measures how Google search results differ by place and language using SerpApi. "
        "Use parallax_scan before trusting that a search result is 'what everyone sees', or to compare "
        "how a topic is presented across Indian cities, Indian languages, or countries."
    ),
)


@server.tool(description="Search Google for `query` from many vantage points at once and measure how different the results are. lens: 'cities' (12 Indian cities), 'languages' (10 Indian languages), or 'world' (India vs 8 countries).")
async def parallax_scan(query: str, lens: str = "cities") -> dict:
    vantages = (LENSES.get(lens) or LENSES["cities"]).vantages
    results, a = await run_scan(query, vantages)
    if not a.get("ok"):
        return {"error": a.get("reason")}
    label = {v.id: v.label for v in vantages}
    return {
        "query": query,
        "lens": lens,
        "parallax_index": a["index"],
        "verdict": a["verdict"],
        "realities": [[label[i] for i in c] for c in a["clusters"]],
        "most_different": [label[a["most_different"]["a"]], label[a["most_different"]["b"]], a["most_different"]["sim"]],
        "shared_core": [c["domain"] for c in a["consensus"]],
        "exclusives": {label[i]: [e["domain"] for e in ex] for i, ex in a["exclusives"].items() if ex},
        "top_results": {label[i]: [o["domain"] for o in r["organic"][:5]] for i, r in results.items()},
        "ai_overview_rate": a["ai_rate"],
        "top3_concentration": {"level": a["concentration"]["level"], "top2_share": a["concentration"]["top2_share"], "top_sites": [t["domain"] for t in a["concentration"]["top"][:4]]},
        "ai_answer_wording_overlap": a["ai_text"]["avg_similarity"] if a["ai_text"] else None,
        "facts": a["facts"],
    }


@server.tool(description="List PARALLAX lenses and their vantage points.")
def parallax_lenses() -> list[dict]:
    return [{"id": lens.id, "name": lens.name, "tagline": lens.tagline, "vantages": [v.label for v in lens.vantages]} for lens in LENSES.values()]


if __name__ == "__main__":
    server.run()
