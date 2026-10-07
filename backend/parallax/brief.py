"""The PARALLAX field report: an analyst-style read of a scan, written by
Claude when ANTHROPIC_API_KEY is set, or assembled from the computed facts
otherwise. Also translates queries for the language lens."""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import AsyncIterator

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None

MODEL = os.getenv("PARALLAX_MODEL", "claude-opus-5-5")

SYSTEM = """You help ordinary people understand how Google search results change depending on where (and in which
language) you search. You receive computed comparison numbers plus the top results each place saw for one query.

Write for a curious non-expert. Plain words only: say "places", "links", "sources", never "vantage", "RBO" or "cluster".
Format (Markdown, max ~180 words):
- First line: one bold sentence that directly answers "Does where you search change what you see for this query?"
- Then 3 bullets. Each names specific places and specific websites, and says why it matters to a reader
  (which voices get amplified, what someone there would come away believing, what is missing).
- Last line starts with "What to do:" and gives one concrete, practical tip (for example, which sources from
  other places are worth reading, or which place's results look most different and why).

Only claim what the data shows. No preamble.
If results came from demo/synthetic data, still describe them, but do not invent real-world events."""


def available() -> bool:
    return anthropic is not None and bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


def _client():
    return anthropic.AsyncAnthropic()


def _compact(query: str, vantages: list[dict], results: dict[str, dict], analysis: dict) -> str:
    vmap = {v["id"]: v for v in vantages}
    lines = [f"QUERY: {query}", "", "METRICS:"]
    lines += [f"- {f}" for f in analysis.get("facts", [])]
    lines.append(f"- Clusters: " + " | ".join(", ".join(vmap[i]["label"] for i in c) for c in analysis.get("clusters", [])))
    lines.append("")
    for vid in analysis.get("ids", []):
        v = vmap[vid]
        r = results[vid]
        lines.append(f"## {v['label']} ({v.get('region') or v['location']}, hl={v['hl']}, q=\"{r.get('q', query)}\")")
        for o in r["organic"][:8]:
            lines.append(f"{o['rank']}. {o['domain']} — {o['title'][:90]}")
        ex = [e["domain"] for e in analysis["exclusives"].get(vid, [])][:5]
        if ex:
            lines.append(f"Only here: {', '.join(ex)}")
        terms = [t["term"] for t in analysis["terms"].get(vid, [])][:5]
        if terms:
            lines.append(f"Distinctive words: {', '.join(terms)}")
        ai = analysis["ai"].get(vid, {})
        if ai.get("present"):
            lines.append(f"AI Overview cites: {', '.join(ai.get('refs', [])[:5]) or 'n/a'}")
        lines.append("")
    return "\n".join(lines)


async def _stream(**kwargs) -> AsyncIterator[str]:
    client = _client()
    try:
        # Server-side refusal fallback keeps the report flowing if a request is declined.
        async with client.beta.messages.stream(
            betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
        ) as stream:
            async for text in stream.text_stream:
                yield text
        return
    except anthropic.BadRequestError:
        pass
    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text


async def stream_brief(query: str, vantages: list[dict], results: dict[str, dict], analysis: dict, synthetic: bool) -> AsyncIterator[str]:
    if available():
        prompt = _compact(query, vantages, results, analysis)
        if synthetic:
            prompt = "NOTE: this scan used synthetic demo data.\n\n" + prompt
        try:
            async for chunk in _stream(
                model=MODEL,
                max_tokens=4000,
                system=SYSTEM,
                output_config={"effort": "low"},
                messages=[{"role": "user", "content": prompt}],
            ):
                yield chunk
            return
        except Exception as e:  # fall through to the offline report
            yield f"\n\n_(AI analyst unavailable: {type(e).__name__}; showing computed report)_\n\n"
    async for chunk in _offline(analysis, vantages):
        yield chunk


async def _offline(analysis: dict, vantages: list[dict]) -> AsyncIterator[str]:
    vmap = {v["id"]: v for v in vantages}
    name = lambda i: vmap[i]["label"]  # noqa: E731
    p = analysis.get("plain") or {}
    ms, md = analysis["most_similar"], analysis["most_different"]
    groups = len(analysis["clusters"])
    differ, length = p.get("avg_differ", 0), p.get("avg_len", 10)
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


async def translate(query: str, langs: dict[str, str]) -> dict[str, str]:
    """Translate the query into each language (hl -> name). Returns hl -> query."""
    if not available() or not langs:
        return {}
    prompt = (
        "Translate this search query the way a native speaker would type it into Google, in each language. "
        "Keep brand names and numbers as they are. Reply with only a JSON object mapping language code to query.\n\n"
        f"Query: {query}\nLanguages: {json.dumps(langs, ensure_ascii=False)}"
    )
    try:
        chunks = []
        async for c in _stream(model=MODEL, max_tokens=2000, output_config={"effort": "low"}, messages=[{"role": "user", "content": prompt}]):
            chunks.append(c)
        raw = "".join(chunks)
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0)) if m else {}
        return {k: str(v).strip() for k, v in data.items() if k in langs and str(v).strip()}
    except Exception:
        return {}
