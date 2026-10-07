"""Divergence analytics: how different are the realities each vantage sees?

Core metric is Rank-Biased Overlap (Webber, Moffat & Zobel, 2010), which
compares two ranked lists and weighs agreement at the top more heavily than
agreement further down - exactly how people read a results page.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from itertools import combinations
from statistics import mean

P = 0.9  # RBO persistence: ~86% of the weight sits in the top 10


def rbo(a: list[str], b: list[str], p: float = P) -> float:
    """Normalised, truncated RBO in [0, 1]. Identical lists score 1."""
    k = max(len(a), len(b))
    if k == 0:
        return 1.0
    if not a or not b:
        return 0.0
    total = 0.0
    for d in range(1, k + 1):
        agreement = len(set(a[:d]) & set(b[:d])) / d
        total += p ** (d - 1) * agreement
    return min(1.0, total * (1 - p) / (1 - p ** k))


def _dedupe(seq: list[str]) -> list[str]:
    out, seen = [], set()
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


# --- source taxonomy -------------------------------------------------------

_NEWS = {
    "thehindu.com", "hindustantimes.com", "indianexpress.com", "timesofindia.com", "indiatimes.com", "ndtv.com",
    "indiatoday.in", "news18.com", "thewire.in", "scroll.in", "theprint.in", "livemint.com", "moneycontrol.com",
    "business-standard.com", "economictimes.com", "deccanherald.com", "deccanchronicle.com", "telegraphindia.com",
    "thequint.com", "firstpost.com", "tribuneindia.com", "newindianexpress.com", "outlookindia.com", "bbc.com",
    "bbc.co.uk", "cnn.com", "nytimes.com", "theguardian.com", "reuters.com", "apnews.com", "aljazeera.com",
    "washingtonpost.com", "bloomberg.com", "cnbc.com", "forbes.com", "khaleejtimes.com", "gulfnews.com",
    "straitstimes.com", "smh.com.au", "abc.net.au", "thestar.com", "cbc.ca", "thedailystar.net", "dw.com",
    "aajtak.in", "bhaskar.com", "jagran.com", "amarujala.com", "livehindustan.com", "anandabazar.com",
    "dinamalar.com", "dailythanthi.com", "eenadu.net", "sakshi.com", "lokmat.com", "loksatta.com",
    "divyabhaskar.co.in", "manoramaonline.com", "mathrubhumi.com", "prajavani.net", "sentinelassam.com",
    "mid-day.com", "dtnext.in", "telanganatoday.com", "patrika.com", "punemirror.com", "abplive.com",
    "zeenews.india.com", "india.com", "republicworld.com", "wionews.com", "financialexpress.com", "news9live.com",
    "onmanorama.com", "assamtribune.com", "eastmojo.com", "thenewsminute.com", "newslaundry.com", "punchng.com",
    "cbsnews.com", "nbcnews.com", "foxnews.com", "usatoday.com", "independent.co.uk", "telegraph.co.uk",
    "thenationalnews.com", "channelnewsasia.com", "theaustralian.com.au", "globalnews.ca", "dhakatribune.com",
    "prothomalo.com", "tbsnews.net", "jagonews24.com", "bdnews24.com",
}
_SOCIAL = {
    "reddit.com", "quora.com", "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
    "linkedin.com", "medium.com", "tiktok.com", "pinterest.com", "threads.net", "sharechat.com", "stackexchange.com",
    "stackoverflow.com",
}
_REFERENCE = {"wikipedia.org", "britannica.com", "wikihow.com", "investopedia.com", "merriam-webster.com", "dictionary.com", "wiktionary.org", "byjus.com", "jagranjosh.com", "vedantu.com", "shiksha.com", "collegedunia.com"}
_COMMERCE = {
    "amazon.in", "amazon.com", "flipkart.com", "myntra.com", "meesho.com", "nykaa.com", "croma.com",
    "reliancedigital.in", "jiomart.com", "tatacliq.com", "snapdeal.com", "ajio.com", "bigbasket.com",
    "swiggy.com", "zomato.com", "makemytrip.com", "goibibo.com", "booking.com", "tripadvisor.com",
    "tripadvisor.in", "smartprix.com", "91mobiles.com", "gadgets360.com", "apple.com", "samsung.com",
    "noon.com", "lazada.sg", "shopee.sg", "ebay.com", "walmart.com", "bestbuy.com", "daraz.com.bd",
    "justdial.com", "magicbricks.com", "99acres.com", "practo.com", "1mg.com", "pharmeasy.in", "zigwheels.com",
    "cardekho.com", "carwale.com", "bikewale.com", "policybazaar.com", "bankbazaar.com", "paisabazaar.com",
}


def classify(domain: str) -> str:
    d = domain.lower()
    if d.endswith((".gov.in", ".nic.in", ".gov", ".gov.uk", ".gov.au", ".gov.sg", ".gov.bd", ".gov.ae")) or d in {"gov.in", "nic.in", "who.int", "un.org"}:
        return "Government"
    if d.endswith((".ac.in", ".edu", ".edu.in", ".ac.uk", ".edu.au", ".res.in")) or d in {"nature.com", "sciencedirect.com", "ncbi.nlm.nih.gov", "nih.gov", "researchgate.net", "springer.com", "arxiv.org", "jstor.org"}:
        return "Academic"
    if d in _NEWS:
        return "News"
    if d in _SOCIAL:
        return "Social"
    if d in _REFERENCE:
        return "Reference"
    if d in _COMMERCE:
        return "Commerce"
    return "Other web"


CATEGORIES = ["News", "Government", "Academic", "Reference", "Social", "Commerce", "Other web"]

# --- distinctive vocabulary ------------------------------------------------

_STOP = set("""
a an the and or of to in on for with by at from as is are was were be been it its this that these those your you our we
their they he she his her them i me my not no yes but if then so than too very can will just about into over after before
how what why when where who which best top new latest vs more most all any each other also get may one two three news
com www http https india indian 2024 2025 2026 here there has have had do does did up out off near online free full list
know things using use guide official website site page read see tips ways way review reviews price prices
""".split())
_TOKEN = re.compile(r"[^\W\d_]{3,}", re.UNICODE)


def _words(text: str) -> list[str]:
    return [m.group(0).lower() for m in re.finditer(r"[^\W_]+", text, re.UNICODE) if len(m.group(0)) > 1]


def _tokens(text: str) -> list[str]:
    return [t for t in (m.group(0).lower() for m in _TOKEN.finditer(text)) if t not in _STOP]


def distinctive_terms(docs: dict[str, str], query: str, k: int = 6, ignore: set[str] | None = None) -> dict[str, list[dict]]:
    """Weighted log-odds with an informative Dirichlet prior (Monroe et al., 2008)."""
    qtok = set(_tokens(query)) | (ignore or set())
    counts = {vid: Counter(t for t in _tokens(txt) if t not in qtok) for vid, txt in docs.items()}
    pooled = Counter()
    for c in counts.values():
        pooled.update(c)
    a0 = sum(pooled.values()) or 1
    out: dict[str, list[dict]] = {}
    for vid, c in counts.items():
        n_i = sum(c.values()) or 1
        rest = pooled - c
        n_j = sum(rest.values()) or 1
        scored = []
        for w, y_i in c.items():
            if y_i < 2 and len(counts) > 2:
                continue
            a_w = pooled[w] * 0.5 + 0.01
            y_j = rest.get(w, 0)
            l_i = math.log((y_i + a_w) / (n_i + a0 * 0.5 - y_i - a_w))
            l_j = math.log((y_j + a_w) / (n_j + a0 * 0.5 - y_j - a_w))
            var = 1 / (y_i + a_w) + 1 / (y_j + a_w)
            scored.append((w, (l_i - l_j) / math.sqrt(var), y_i))
        scored.sort(key=lambda s: s[1], reverse=True)
        out[vid] = [{"term": w, "z": round(z, 2), "n": n} for w, z, n in scored[:k] if z > 0.5]
    return out


# --- clustering ------------------------------------------------------------

def _cluster(ids: list[str], sim: dict[tuple[str, str], float], threshold: float) -> tuple[list[list[str]], list[str]]:
    """Average-linkage agglomerative clustering on (1 - similarity).

    Returns the flat clusters cut at `threshold` similarity and a leaf order
    that keeps similar vantages adjacent (for the matrix view).
    """
    def s(a: str, b: str) -> float:
        return 1.0 if a == b else sim.get((a, b), sim.get((b, a), 0.0))

    clusters: list[list[str]] = [[i] for i in ids]
    order: list[list[str]] = [[i] for i in ids]
    flat: list[list[str]] | None = None
    while len(clusters) > 1:
        best = (-1.0, 0, 1)
        for x, y in combinations(range(len(clusters)), 2):
            avg = mean(s(a, b) for a in clusters[x] for b in clusters[y])
            if avg > best[0]:
                best = (avg, x, y)
        avg, x, y = best
        if flat is None and avg < threshold:
            flat = [list(c) for c in clusters]
        merged = clusters[x] + clusters[y]
        merged_order = order[x] + order[y]
        clusters = [c for i, c in enumerate(clusters) if i not in (x, y)] + [merged]
        order = [c for i, c in enumerate(order) if i not in (x, y)] + [merged_order]
    if flat is None:
        flat = [list(c) for c in clusters]
    flat.sort(key=len, reverse=True)
    return flat, order[0] if order else []


# --- main entry ------------------------------------------------------------

def verdict(index: float) -> tuple[str, str]:
    if index < 20:
        return "Shared reality", "Almost everyone sees the same internet for this query."
    if index < 40:
        return "Mild drift", "The core is shared, but the edges bend with place."
    if index < 60:
        return "Split screen", "Different places get noticeably different answers."
    if index < 80:
        return "Fractured reality", "Each vantage lives in its own version of the web."
    return "Parallel universes", "There is barely any common ground between vantages."


def analyze(query: str, vantages: list[dict], results: dict[str, dict]) -> dict:
    vmap = {v["id"]: v for v in vantages}
    ids = [v["id"] for v in vantages if results.get(v["id"], {}).get("organic")]
    if len(ids) < 2:
        return {"ok": False, "reason": "Need at least two vantages with results."}

    url_lists = {i: _dedupe([r["key"] for r in results[i]["organic"]]) for i in ids}
    dom_lists = {i: _dedupe([r["domain"] for r in results[i]["organic"]]) for i in ids}

    url_sim: dict[tuple[str, str], float] = {}
    dom_sim: dict[tuple[str, str], float] = {}
    for a, b in combinations(ids, 2):
        url_sim[(a, b)] = rbo(url_lists[a], url_lists[b])
        dom_sim[(a, b)] = rbo(dom_lists[a], dom_lists[b])

    # Blend page-level and source-level agreement. Localised editions of the
    # same site (amazon.in vs amazon.com) are a real difference, but a softer one.
    blended = {k: 0.6 * url_sim[k] + 0.4 * dom_sim[k] for k in url_sim}
    mean_sim = mean(blended.values())
    index = round(100 * (1 - mean_sim), 1)
    label, blurb = verdict(index)

    clusters, order = _cluster(ids, blended, threshold=0.5)

    def sim_of(a: str, b: str, table=blended) -> float:
        return 1.0 if a == b else table.get((a, b), table.get((b, a), 0.0))

    matrix = [[round(sim_of(a, b), 3) for b in order] for a in order]
    url_matrix = [[round(sim_of(a, b, url_sim), 3) for b in order] for a in order]
    dom_matrix = [[round(sim_of(a, b, dom_sim), 3) for b in order] for a in order]

    pairs = sorted(blended.items(), key=lambda kv: kv[1])
    loneliness = {i: mean(sim_of(i, j) for j in ids if j != i) for i in ids}
    outlier = min(loneliness, key=loneliness.get)
    anchor = max(loneliness, key=loneliness.get)

    # Domain presence, ranks, consensus and exclusives.
    n = len(ids)
    presence: dict[str, dict[str, int]] = {}
    titles: dict[str, str] = {}
    for i in ids:
        for r in results[i]["organic"]:
            presence.setdefault(r["domain"], {})
            if i not in presence[r["domain"]]:
                presence[r["domain"]][i] = r["rank"]
                titles.setdefault(r["domain"], r["title"])

    def weight(dom: str) -> float:
        return sum(1 / (rank + 1) for rank in presence[dom].values())

    consensus = [
        {"domain": d, "share": round(len(p) / n, 2), "avg_rank": round(mean(p.values()), 1), "category": classify(d)}
        for d, p in presence.items() if len(p) >= max(2, math.ceil(0.75 * n))
    ]
    consensus.sort(key=lambda c: (-c["share"], c["avg_rank"]))

    exclusives: dict[str, list[dict]] = {i: [] for i in ids}
    for i in ids:
        for r in results[i]["organic"]:
            if len(presence[r["domain"]]) == 1:
                exclusives[i].append({"domain": r["domain"], "rank": r["rank"], "title": r["title"], "link": r["link"], "category": classify(r["domain"])})

    river_domains = sorted(presence, key=weight, reverse=True)[:14]
    rivers = [
        {
            "domain": d,
            "category": classify(d),
            "ranks": {i: presence[d].get(i) for i in order},
            "spread": (max(presence[d].values()) - min(presence[d].values())) if presence[d] else 0,
            "share": round(len(presence[d]) / n, 2),
        }
        for d in river_domains
    ]

    taxonomy = {}
    for i in ids:
        c = Counter(classify(r["domain"]) for r in results[i]["organic"])
        taxonomy[i] = {cat: c.get(cat, 0) for cat in CATEGORIES}

    scripts = {i: Counter(r["script"] for r in results[i]["organic"]).most_common() for i in ids}

    docs = {i: " ".join(f"{r['title']} {r['snippet']}" for r in results[i]["organic"]) for i in ids}
    places = {t for v in vantages for t in _tokens(f"{v['label']} {v.get('region', '')} {v.get('location', '')}")}
    terms = distinctive_terms(docs, query, ignore=places)

    all_features = sorted({f for i in ids for f in results[i]["features"]})
    features = {i: results[i]["features"] for i in ids}

    ai = {}
    ai_ref_sets = {}
    for i in ids:
        ov = results[i].get("ai_overview") or {}
        ai[i] = {"present": bool(ov.get("present")), "refs": [r["domain"] for r in ov.get("refs", [])][:8], "excerpt": (ov.get("text") or "")[:280]}
        if ov.get("present") and ov.get("refs"):
            ai_ref_sets[i] = {r["domain"] for r in ov["refs"]}
    ai_jaccard = None
    if len(ai_ref_sets) >= 2:
        js = [len(ai_ref_sets[a] & ai_ref_sets[b]) / max(1, len(ai_ref_sets[a] | ai_ref_sets[b])) for a, b in combinations(ai_ref_sets, 2)]
        ai_jaccard = round(mean(js), 3)

    top1 = Counter(results[i]["organic"][0]["domain"] for i in ids)

    # Plain-language numbers: what a non-specialist can read at a glance.
    shared_links = {(a, b): len(set(url_lists[a]) & set(url_lists[b])) for a, b in combinations(ids, 2)}
    shared_sources = {(a, b): len(set(dom_lists[a]) & set(dom_lists[b])) for a, b in combinations(ids, 2)}
    differ = [max(len(url_lists[a]), len(url_lists[b])) - shared_links[(a, b)] for a, b in combinations(ids, 2)]
    avg_len = mean(len(url_lists[i]) for i in ids)
    top1_domain, top1_count = top1.most_common(1)[0]

    def count_of(table: dict, a: str, b: str) -> int:
        if a == b:
            return len(url_lists[a]) if table is shared_links else len(dom_lists[a])
        return table.get((a, b), table.get((b, a), 0))

    plain = {
        "avg_differ": round(mean(differ), 1),
        "avg_len": round(avg_len, 1),
        "avg_shared_sources": round(mean(shared_sources.values()), 1),
        "top1_domain": top1_domain,
        "top1_agree": top1_count,
        "places": n,
        "groups": len(clusters),
        "ai_count": sum(1 for i in ids if results[i].get("ai_overview", {}).get("present")),
        "local_count": sum(1 for i in ids if results[i].get("local")),
    }

    # Concentration: who owns the top-3 slots across every place?
    slots: Counter = Counter()
    for i in ids:
        for r in results[i]["organic"][:3]:
            slots[r["domain"]] += 1
    total_slots = sum(slots.values()) or 1
    ranked_slots = slots.most_common()
    cum, k_half = 0, 0
    for _, c in ranked_slots:
        cum += c
        k_half += 1
        if cum >= total_slots / 2:
            break
    top2_share = sum(c for _, c in ranked_slots[:2]) / total_slots
    hhi = sum((c / total_slots) ** 2 for c in slots.values())
    level = "concentrated" if top2_share >= 0.6 or hhi >= 0.25 else "moderate" if top2_share >= 0.4 or hhi >= 0.12 else "diverse"
    concentration = {
        "slots": total_slots,
        "distinct": len(slots),
        "top": [{"domain": d, "count": c, "share": round(c / total_slots, 3), "category": classify(d)} for d, c in ranked_slots[:6]],
        "top2_share": round(top2_share, 3),
        "k_half": k_half,
        "hhi": round(hhi, 3),
        "level": level,
    }

    # How differently is Google's AI answer worded from place to place?
    ai_words = {i: set(_words((results[i].get("ai_overview") or {}).get("text") or "")) for i in ids}
    ai_words = {i: w for i, w in ai_words.items() if len(w) >= 5}
    ai_text = None
    if len(ai_words) >= 2:
        sims = {(a, b): len(ai_words[a] & ai_words[b]) / len(ai_words[a] | ai_words[b]) for a, b in combinations(ai_words, 2)}
        lo = min(sims, key=sims.get)
        hi = max(sims, key=sims.get)
        ai_text = {
            "n": len(ai_words),
            "avg_similarity": round(mean(sims.values()), 3),
            "most_different": {"a": lo[0], "b": lo[1], "sim": round(sims[lo], 3)},
            "most_similar": {"a": hi[0], "b": hi[1], "sim": round(sims[hi], 3)},
        }

    def name(i: str) -> str:
        return vmap[i]["label"]

    facts = [
        f"PARALLAX index {index}/100 — {label.lower()}.",
        f"Most alike: {name(pairs[-1][0][0])} & {name(pairs[-1][0][1])} ({round(pairs[-1][1] * 100)}% overlap).",
        f"Most different: {name(pairs[0][0][0])} & {name(pairs[0][0][1])} ({round(pairs[0][1] * 100)}% overlap).",
        f"Odd one out: {name(outlier)}; most typical: {name(anchor)}.",
        f"{len(clusters)} distinct result 'realities' at a 50% similarity cut.",
        f"#1 result: {', '.join(f'{d} in {c} place(s)' for d, c in top1.most_common(3))}.",
    ]
    if consensus:
        facts.append(f"Shared core: {', '.join(c['domain'] for c in consensus[:5])}.")
    ex_counts = sorted(((len(v), k) for k, v in exclusives.items()), reverse=True)
    if ex_counts and ex_counts[0][0]:
        facts.append(f"{name(ex_counts[0][1])} sees {ex_counts[0][0]} sources nobody else does.")
    top_names = " and ".join(t["domain"] for t in concentration["top"][:2])
    facts.append(f"{top_names} hold {round(top2_share * 100)}% of all top-3 spots across {n} places ({concentration['distinct']} different sites in total).")
    if ai_text:
        facts.append(
            f"AI answers share on average {round(ai_text['avg_similarity'] * 100)}% of their wording; most different: "
            f"{name(ai_text['most_different']['a'])} vs {name(ai_text['most_different']['b'])} ({round(ai_text['most_different']['sim'] * 100)}%)."
        )
    ai_rate = sum(1 for i in ids if ai[i]["present"]) / n
    facts.append(f"AI Overview shown in {round(ai_rate * 100)}% of vantages" + (f"; cited-source overlap {round(ai_jaccard * 100)}%." if ai_jaccard is not None else "."))

    return {
        "ok": True,
        "query": query,
        "ids": ids,
        "order": order,
        "index": index,
        "verdict": label,
        "verdict_blurb": blurb,
        "mean_similarity": round(mean_sim, 3),
        "matrix": matrix,
        "url_matrix": url_matrix,
        "domain_matrix": dom_matrix,
        "clusters": clusters,
        "most_similar": {"a": pairs[-1][0][0], "b": pairs[-1][0][1], "sim": round(pairs[-1][1], 3)},
        "most_different": {"a": pairs[0][0][0], "b": pairs[0][0][1], "sim": round(pairs[0][1], 3)},
        "outlier": outlier,
        "anchor": anchor,
        "loneliness": {k: round(v, 3) for k, v in loneliness.items()},
        "consensus": consensus[:10],
        "exclusives": exclusives,
        "rivers": rivers,
        "taxonomy": taxonomy,
        "categories": CATEGORIES,
        "scripts": scripts,
        "terms": terms,
        "features": features,
        "all_features": all_features,
        "ai": ai,
        "ai_rate": round(ai_rate, 2),
        "ai_ref_overlap": ai_jaccard,
        "top1": top1.most_common(),
        "unique_domains": len(presence),
        "facts": facts,
        "plain": plain,
        "concentration": concentration,
        "ai_text": ai_text,
        "shared_links": [[count_of(shared_links, a, b) for b in order] for a in order],
        "shared_sources": [[count_of(shared_sources, a, b) for b in order] for a in order],
    }
