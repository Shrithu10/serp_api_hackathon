"""Turn raw SerpApi Google responses into a compact, comparable shape."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit

# Second-level suffixes we treat as part of the registrable domain.
_MULTI_SUFFIXES = {
    "co.in", "gov.in", "nic.in", "ac.in", "org.in", "net.in", "edu.in", "res.in", "firm.in", "gen.in", "ind.in",
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "gov.au", "edu.au", "com.sg", "gov.sg",
    "edu.sg", "com.bd", "gov.bd", "co.za", "com.br", "co.jp", "com.pk", "gov.pk", "co.nz", "com.my", "gov.ae",
    "co.ae", "com.ng", "gov.ng",
}

_TRACKING = re.compile(r"^(utm_|gclid|fbclid|ref$|ref_|srsltid|mc_|igshid|si$)")


def registrable_domain(url_or_host: str) -> str:
    host = urlsplit(url_or_host).hostname if "//" in url_or_host else url_or_host
    host = (host or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    tail2 = ".".join(parts[-2:])
    if tail2 in _MULTI_SUFFIXES:
        return ".".join(parts[-3:])
    return tail2


def url_key(url: str) -> str:
    """Canonical form of a result URL, so the same page matches across locales."""
    try:
        s = urlsplit(url)
    except ValueError:
        return url
    host = (s.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m.") or host.startswith("en."):
        host = host.split(".", 1)[1] if host.count(".") > 1 else host
    path = re.sub(r"/+$", "", s.path or "") or "/"
    query = [(k, v) for k, v in parse_qsl(s.query) if not _TRACKING.match(k.lower())]
    q = ("?" + urlencode(sorted(query))) if query else ""
    return f"{host}{path}{q}"


_SCRIPTS = [
    ("Devanagari", 0x0900, 0x097F),
    ("Bengali", 0x0980, 0x09FF),
    ("Gurmukhi", 0x0A00, 0x0A7F),
    ("Gujarati", 0x0A80, 0x0AFF),
    ("Odia", 0x0B00, 0x0B7F),
    ("Tamil", 0x0B80, 0x0BFF),
    ("Telugu", 0x0C00, 0x0C7F),
    ("Kannada", 0x0C80, 0x0CFF),
    ("Malayalam", 0x0D00, 0x0D7F),
    ("Arabic", 0x0600, 0x06FF),
]


def dominant_script(text: str) -> str:
    counts: dict[str, int] = {}
    latin = 0
    for ch in text:
        o = ord(ch)
        if ch.isascii() and ch.isalpha():
            latin += 1
            continue
        for name, lo, hi in _SCRIPTS:
            if lo <= o <= hi:
                counts[name] = counts.get(name, 0) + 1
                break
    if counts:
        name, n = max(counts.items(), key=lambda kv: kv[1])
        if n >= latin * 0.5:
            return name
    return "Latin"


def _ai_overview(raw: dict) -> dict:
    ai = raw.get("ai_overview") or {}
    if not ai or ai.get("error"):
        return {"present": False}
    parts: list[str] = []
    for block in ai.get("text_blocks") or []:
        if block.get("snippet"):
            parts.append(block["snippet"])
        for item in block.get("list") or []:
            line = " ".join(x for x in (item.get("title"), item.get("snippet")) if x)
            if line:
                parts.append("• " + line)
    refs = []
    for r in ai.get("references") or []:
        link = r.get("link") or ""
        refs.append({
            "title": r.get("title") or "",
            "link": link,
            "source": r.get("source") or "",
            "domain": registrable_domain(link) if link else (r.get("source") or "").lower(),
        })
    text = "\n".join(parts).strip()
    if not text and not refs:
        # Only a page_token: the caller is expected to follow it up.
        return {"present": True, "pending": bool(ai.get("page_token")), "text": "", "refs": []}
    return {"present": True, "text": text[:1600], "refs": refs[:12]}


FEATURE_KEYS = {
    "ai_overview": "AI Overview",
    "knowledge_graph": "Knowledge panel",
    "answer_box": "Answer box",
    "top_stories": "Top stories",
    "local_results": "Local pack",
    "related_questions": "People also ask",
    "inline_videos": "Videos",
    "inline_images": "Images",
    "shopping_results": "Shopping",
    "immersive_products": "Products",
    "discussions_and_forums": "Forums",
    "twitter_results": "X / Twitter",
    "perspectives": "Perspectives",
}


def normalize(raw: dict) -> dict:
    organic = []
    for i, r in enumerate(raw.get("organic_results") or []):
        link = r.get("link")
        if not link:
            continue
        title = r.get("title") or ""
        organic.append({
            "rank": len(organic) + 1,
            "position": r.get("position", i + 1),
            "title": title,
            "link": link,
            "key": url_key(link),
            "domain": registrable_domain(link),
            "source": r.get("source") or "",
            "snippet": (r.get("snippet") or "")[:320],
            "date": r.get("date") or "",
            "favicon": r.get("favicon") or "",
            "script": dominant_script(title + " " + (r.get("snippet") or "")),
        })
        if len(organic) >= 10:
            break

    features = [k for k in FEATURE_KEYS if raw.get(k)]

    local = []
    lr = raw.get("local_results")
    places = lr.get("places") if isinstance(lr, dict) else lr if isinstance(lr, list) else []
    for p in places or []:
        local.append({"title": p.get("title") or "", "rating": p.get("rating"), "type": p.get("type") or ""})

    stories = [
        {"title": s.get("title") or "", "source": (s.get("source") or {}).get("name") if isinstance(s.get("source"), dict) else s.get("source") or "", "link": s.get("link") or ""}
        for s in (raw.get("top_stories") or [])[:6] if isinstance(s, dict)
    ]

    kg = raw.get("knowledge_graph") or {}
    info = raw.get("search_information") or {}
    return {
        "organic": organic,
        "features": features,
        "ai_overview": _ai_overview(raw),
        "local": local[:6],
        "top_stories": stories,
        "questions": [q.get("question") for q in (raw.get("related_questions") or [])[:6] if q.get("question")],
        "related": [r.get("query") for r in (raw.get("related_searches") or [])[:8] if r.get("query")],
        "knowledge": {"title": kg.get("title"), "type": kg.get("type"), "description": (kg.get("description") or "")[:300]} if kg else None,
        "total_results": info.get("total_results"),
        "time_taken": info.get("time_taken_displayed"),
        "search_id": (raw.get("search_metadata") or {}).get("id"),
    }
