"""The plain-language summary of a scan, generated directly from the computed
numbers (no AI service involved)."""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator


async def stream_brief(query: str, vantages: list[dict], results: dict[str, dict], analysis: dict, synthetic: bool) -> AsyncIterator[str]:
    async for chunk in _offline(analysis, vantages):
        yield chunk


async def _offline(analysis: dict, vantages: list[dict]) -> AsyncIterator[str]:
    vmap = {v["id"]: v for v in vantages}
    name = lambda i: vmap[i]["label"]  # noqa: E731
    p = analysis.get("plain") or {}
    ms, md = analysis["most_similar"], analysis["most_different"]
    groups = len(analysis["clusters"])
    differ, length = p.get("avg_differ", 0), round(p.get("avg_len", 10))
    if differ <= 2:
        head = "Mostly no: people in different places see nearly the same results for this."
    elif differ <= 5:
        head = f"Somewhat: on average {differ:g} of the top {length:g} links change from one place to another."
    else:
        head = f"Yes, a lot: on average {differ:g} of the top {length:g} links change from one place to another."
    text = [f"**{head}**\n\n"]
    text.append(f"- **{name(md['a'])}** and **{name(md['b'])}** see the most different pages; **{name(ms['a'])}** and **{name(ms['b'])}** see almost the same one.\n")
    if p.get("top1_domain"):
        text.append(f"- The #1 result is **{p['top1_domain']}** in {p.get('top1_agree')} of {p.get('places')} places, and the places fall into {groups} groups that see similar results.\n")
    if analysis["consensus"]:
        text.append(f"- Almost everyone sees {', '.join(c['domain'] for c in analysis['consensus'][:3])}. Google's AI answer appeared in {p.get('ai_count', 0)} of {p.get('places')} places.\n")
    best = max(analysis["exclusives"].items(), key=lambda kv: len(kv[1]))
    if best[1]:
        text.append(f"\nWhat to do: read beyond your own results. For example, only {name(best[0])} sees {', '.join(e['domain'] for e in best[1][:3])}.")
    for part in text:
        for word in re.split(r"(\s+)", part):
            yield word
            await asyncio.sleep(0.006)
