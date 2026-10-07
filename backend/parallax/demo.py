"""Offline demo mode.

When no SERPAPI_API_KEY is configured, PARALLAX can still be explored end to
end. Responses are either:

1. **Recorded** - real SerpApi responses captured earlier with
   `PARALLAX_RECORD=1` (stored in `backend/fixtures/`), replayed verbatim, or
2. **Synthetic** - deterministic, clearly-labelled sample data shaped like a
   SerpApi response, so the UI and analytics can be exercised without credits.

The UI always shows a DEMO badge in this mode. Synthetic data is never
presented as real search results.
"""

from __future__ import annotations

import hashlib
import math
import random

_TOPICS = {
    "shopping": ["buy", "price", "under", "best", "phone", "laptop", "iphone", "samsung", "deal", "cheap", "review", "vs", "tv", "earbuds", "shoes"],
    "local": ["near me", "restaurant", "biryani", "cafe", "hospital", "food", "street", "things to do", "places", "hotel", "weekend"],
    "health": ["ayurveda", "diabetes", "symptoms", "cure", "diet", "yoga", "dengue", "covid", "health", "vitamin", "medicine", "ozempic"],
    "civic": ["election", "minister", "policy", "protest", "budget", "law", "government", "court", "tax", "upi", "aadhaar", "war", "border"],
    "tech": ["ai", "chatgpt", "startup", "coding", "python", "job", "salary", "layoffs", "gpu"],
}

_GLOBAL = {
    "general": [("wikipedia.org", 9), ("youtube.com", 7), ("britannica.com", 5), ("reddit.com", 5), ("quora.com", 4), ("indiatimes.com", 4), ("ndtv.com", 4), ("hindustantimes.com", 4), ("indianexpress.com", 4), ("bbc.com", 3), ("theguardian.com", 2), ("nytimes.com", 2), ("instagram.com", 2), ("medium.com", 2)],
    "shopping": [("amazon.in", 9), ("flipkart.com", 9), ("smartprix.com", 7), ("91mobiles.com", 6), ("gadgets360.com", 6), ("youtube.com", 5), ("croma.com", 5), ("reliancedigital.in", 4), ("reddit.com", 4), ("techradar.com", 3), ("gsmarena.com", 4), ("amazon.com", 2), ("bestbuy.com", 2), ("noon.com", 2)],
    "local": [("zomato.com", 9), ("swiggy.com", 7), ("tripadvisor.in", 7), ("justdial.com", 6), ("instagram.com", 5), ("youtube.com", 4), ("lbb.in", 5), ("magicpin.in", 4), ("reddit.com", 3), ("timesofindia.com", 3), ("eazydiner.com", 4)],
    "health": [("who.int", 7), ("mayoclinic.org", 7), ("ncbi.nlm.nih.gov", 6), ("practo.com", 5), ("1mg.com", 5), ("ayush.gov.in", 5), ("healthline.com", 6), ("webmd.com", 4), ("wikipedia.org", 5), ("youtube.com", 4), ("pharmeasy.in", 4), ("apollo247.com", 4)],
    "civic": [("thehindu.com", 7), ("indianexpress.com", 7), ("hindustantimes.com", 6), ("ndtv.com", 6), ("pib.gov.in", 6), ("wikipedia.org", 6), ("theprint.in", 5), ("scroll.in", 4), ("thewire.in", 4), ("livemint.com", 4), ("reuters.com", 3), ("bbc.com", 3), ("x.com", 3), ("youtube.com", 4)],
    "tech": [("wikipedia.org", 6), ("youtube.com", 6), ("reddit.com", 6), ("medium.com", 4), ("techcrunch.com", 5), ("livemint.com", 4), ("economictimes.com", 5), ("theverge.com", 4), ("github.com", 4), ("linkedin.com", 4), ("analyticsindiamag.com", 4), ("inc42.com", 4)],
}

# Regional voices that tend to surface in each place.
_REGIONAL = {
    "Mumbai": [("mid-day.com", 5), ("freepressjournal.in", 4), ("loksatta.com", 3), ("mumbailive.com", 3)],
    "New Delhi": [("hindustantimes.com", 4), ("aajtak.in", 3), ("delhi.gov.in", 3), ("jagran.com", 3)],
    "Bengaluru": [("deccanherald.com", 5), ("prajavani.net", 3), ("thenewsminute.com", 3), ("bangaloremirror.indiatimes.com", 3)],
    "Chennai": [("thehindu.com", 5), ("dtnext.in", 4), ("dinamalar.com", 3), ("tn.gov.in", 3)],
    "Kolkata": [("telegraphindia.com", 5), ("anandabazar.com", 4), ("millenniumpost.in", 3), ("wb.gov.in", 2)],
    "Hyderabad": [("deccanchronicle.com", 5), ("telanganatoday.com", 4), ("eenadu.net", 3), ("siasat.com", 3)],
    "Pune": [("punemirror.com", 5), ("lokmat.com", 4), ("punekarnews.in", 3)],
    "Ahmedabad": [("divyabhaskar.co.in", 5), ("deshgujarat.com", 4), ("gujaratsamachar.com", 3)],
    "Jaipur": [("patrika.com", 5), ("bhaskar.com", 4), ("firstindia.co.in", 3)],
    "Lucknow": [("amarujala.com", 5), ("livehindustan.com", 4), ("up.gov.in", 3)],
    "Guwahati": [("sentinelassam.com", 5), ("assamtribune.com", 4), ("eastmojo.com", 4), ("northeastnow.com", 3)],
    "Kochi": [("manoramaonline.com", 5), ("mathrubhumi.com", 4), ("onmanorama.com", 4), ("kerala.gov.in", 2)],
    "Ludhiana": [("tribuneindia.com", 5), ("jagbani.punjabkesari.in", 4), ("babushahi.com", 3)],
    "New York": [("nytimes.com", 6), ("cnn.com", 5), ("nbcnews.com", 4), ("forbes.com", 4), ("amazon.com", 3)],
    "San Francisco": [("sfchronicle.com", 5), ("theverge.com", 4), ("techcrunch.com", 4), ("amazon.com", 3), ("wired.com", 3)],
    "London": [("bbc.co.uk", 6), ("theguardian.com", 5), ("independent.co.uk", 4), ("telegraph.co.uk", 3)],
    "Dubai": [("khaleejtimes.com", 6), ("gulfnews.com", 5), ("thenationalnews.com", 4), ("noon.com", 3)],
    "Singapore": [("straitstimes.com", 6), ("channelnewsasia.com", 5), ("shopee.sg", 3), ("lazada.sg", 3)],
    "Toronto": [("cbc.ca", 6), ("thestar.com", 5), ("globalnews.ca", 4)],
    "Sydney": [("abc.net.au", 6), ("smh.com.au", 5), ("theaustralian.com.au", 3)],
    "Dhaka": [("thedailystar.net", 6), ("prothomalo.com", 5), ("dhakatribune.com", 4), ("bdnews24.com", 3)],
}

_NATIVE = {
    "hi": [("bhaskar.com", "दैनिक भास्कर"), ("amarujala.com", "अमर उजाला"), ("livehindustan.com", "लाइव हिन्दुस्तान"), ("aajtak.in", "आज तक"), ("jagran.com", "दैनिक जागरण")],
    "bn": [("anandabazar.com", "আনন্দবাজার পত্রিকা"), ("bartamanpatrika.com", "বর্তমান"), ("sangbadpratidin.in", "সংবাদ প্রতিদিন")],
    "ta": [("dinamalar.com", "தினமலர்"), ("dailythanthi.com", "தினத்தந்தி"), ("vikatan.com", "விகடன்")],
    "te": [("eenadu.net", "ఈనాడు"), ("sakshi.com", "సాక్షి"), ("andhrajyothy.com", "ఆంధ్రజ్యోతి")],
    "mr": [("lokmat.com", "लोकमत"), ("loksatta.com", "लोकसत्ता"), ("esakal.com", "सकाळ")],
    "gu": [("divyabhaskar.co.in", "દિવ્ય ભાસ્કર"), ("gujaratsamachar.com", "ગુજરાત સમાચાર"), ("sandesh.com", "સંદેશ")],
    "kn": [("prajavani.net", "ಪ್ರಜಾವಾಣಿ"), ("vijaykarnataka.com", "ವಿಜಯ ಕರ್ನಾಟಕ"), ("udayavani.com", "ಉದಯವಾಣಿ")],
    "ml": [("manoramaonline.com", "മലയാള മനോരമ"), ("mathrubhumi.com", "മാതൃഭൂമി"), ("deshabhimani.com", "ദേശാഭിമാനി")],
    "pa": [("jagbani.punjabkesari.in", "ਜਗ ਬਾਣੀ"), ("punjabitribuneonline.com", "ਪੰਜਾਬੀ ਟ੍ਰਿਬਿਊਨ"), ("ajitjalandhar.com", "ਅਜੀਤ")],
}

_TITLE_TEMPLATES = [
    "{q}: Everything you need to know",
    "{Q} — explained",
    "What is {q}? A complete guide",
    "{Q}: latest updates and analysis",
    "{Q} | Top picks for 2026",
    "Why {q} matters right now",
    "{Q}: facts, figures and FAQs",
    "The real story behind {q}",
]
_SNIPPETS = [
    "A detailed look at {q}, with context, expert views and what it means for readers in {city}.",
    "We compared the most popular options for {q} and ranked them on value, reliability and reviews.",
    "Everything about {q}: background, recent developments, and answers to the questions people ask most.",
    "{Q} has been trending. Here is a breakdown of what changed, who it affects and what to watch next.",
]


def _seed(*parts: str) -> random.Random:
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def topic_of(q: str) -> str:
    ql = q.lower()
    for topic, words in _TOPICS.items():
        if any(w in ql for w in words):
            return topic
    return "general"


def _city(location: str) -> str:
    return (location or "").split(",")[0].strip()


def _title(domain: str, q: str, rng: random.Random) -> str:
    base = rng.choice(_TITLE_TEMPLATES).format(q=q, Q=q[:1].upper() + q[1:])
    if domain == "wikipedia.org":
        return f"{q[:1].upper() + q[1:]} - Wikipedia"
    if domain == "youtube.com":
        return f"{q[:1].upper() + q[1:]} — watch the full breakdown | YouTube"
    if domain == "reddit.com":
        return f"Honest opinions on {q}? : r/{rng.choice(['india', 'IndiaSpeaks', 'AskIndia', 'bangalore', 'mumbai', 'TwoXIndia'])}"
    if domain == "quora.com":
        return f"What do people think about {q}? - Quora"
    site = domain.split(".")[0].replace("-", " ").title()
    return f"{base} - {site}"


def google(params: dict, salt: str = "") -> dict:
    q = params.get("q", "")
    loc = params.get("location", "")
    hl = params.get("hl", "en")
    gl = params.get("gl", "in")
    city = _city(loc)
    topic = topic_of(q)
    rng = _seed("serp", q.lower(), loc, hl)
    # A salted run (tracked searches) nudges rankings slightly, like real day-to-day drift.
    drift = _seed("drift", q.lower(), loc, hl, salt) if salt else None

    pool: dict[str, float] = {}
    for d, w in _GLOBAL["general" if topic == "general" else topic]:
        pool[d] = pool.get(d, 0) + w
    if topic != "general":
        for d, w in _GLOBAL["general"][:6]:
            pool[d] = pool.get(d, 0) + w * 0.5
    for d, w in _REGIONAL.get(city, []):
        pool[d] = pool.get(d, 0) + w * (1.6 if topic in ("civic", "local") else 1.0)
    native_titles = {}
    if hl != "en":
        for d, name in _NATIVE.get(hl, []):
            pool[d] = pool.get(d, 0) + 7
            native_titles[d] = name
    if gl != "in":
        for d in list(pool):
            if d.endswith(".in") or d in ("flipkart.com", "ndtv.com", "indiatimes.com", "thehindu.com", "zomato.com", "swiggy.com"):
                pool[d] *= 0.25

    noise = {"local": 3.2, "civic": 2.4, "shopping": 1.6, "health": 1.5, "tech": 1.7, "general": 1.8}[topic]
    scored = sorted(((w + rng.gauss(0, noise) + (drift.gauss(0, noise * 0.12) if drift else 0), d) for d, w in pool.items()), reverse=True)[:10]

    organic = []
    for i, (_, d) in enumerate(scored):
        title = f"{q} - {native_titles[d]}" if d in native_titles else _title(d, q, rng)
        slug = "-".join(q.lower().split())[:60]
        path = {
            "wikipedia.org": f"https://en.wikipedia.org/wiki/{q.title().replace(' ', '_')}",
            "youtube.com": f"https://www.youtube.com/watch?v={hashlib.md5((d + q + city).encode()).hexdigest()[:11]}",
        }.get(d, f"https://www.{d}/{slug}" + ("" if rng.random() < 0.7 else f"-{city.lower().replace(' ', '-')}"))
        organic.append({
            "position": i + 1,
            "title": title,
            "link": path,
            "displayed_link": path.split("//")[1][:60],
            "source": d,
            "snippet": rng.choice(_SNIPPETS).format(q=q, Q=q[:1].upper() + q[1:], city=city or "your area"),
        })

    out: dict = {
        "search_metadata": {"id": "demo-" + hashlib.md5((q + loc + hl).encode()).hexdigest()[:12], "status": "Success"},
        "search_parameters": params,
        "search_information": {"total_results": int(rng.uniform(2e5, 9e8)), "time_taken_displayed": round(rng.uniform(0.25, 0.9), 2)},
        "organic_results": organic,
        "related_searches": [{"query": f"{q} {w}"} for w in rng.sample(["today", "in hindi", "near me", "price", "meaning", "news", "2026", "reddit", "vs", "benefits"], 5)],
        "related_questions": [{"question": f"{p} {q}?"} for p in rng.sample(["What is", "Is", "Why is", "How does", "Where can I find", "Who started"], 3)],
    }

    ai_prob = {"health": 0.85, "tech": 0.8, "general": 0.7, "shopping": 0.55, "local": 0.35, "civic": 0.4}[topic]
    if gl != "in":
        ai_prob = min(0.95, ai_prob + 0.15)
    if rng.random() < ai_prob:
        refs = rng.sample(organic[:7], k=min(4, len(organic)))
        extra = rng.choice([d for d, _ in _REGIONAL.get(city, [("wikipedia.org", 1)])])
        Q = q[:1].upper() + q[1:]
        # Sentence pool shared by all places; each place draws a different mix, so the
        # sample answers overlap partly — like real localised AI Overviews do.
        shared = rng.sample([
            f"{Q} depends on several factors, and sources weigh them differently.",
            f"Most guides agree on the basics of {q} but differ on what matters most.",
            f"Experts quoted by {refs[0]['source']} describe {q} as widely discussed.",
            f"Recent coverage of {q} focuses on cost, access and reliability.",
            f"Popular discussions about {q} often cite personal experience over evidence.",
            f"Official sources recommend checking the details before deciding on {q}.",
        ], k=3)
        local = [
            f"In {city or 'this region'}, coverage from {extra} highlights the local angle.",
            rng.choice([
                f"Readers in {city or 'this region'} are pointed to {refs[-1]['source']} for specifics.",
                f"Some regional reports from {extra} question the mainstream view.",
                f"Local availability and prices around {city or 'here'} vary noticeably.",
            ]),
        ]
        lines = shared[:2] + local + shared[2:]
        out["ai_overview"] = {
            "text_blocks": [
                {"type": "paragraph", "snippet": "[Sample AI Overview] " + " ".join(lines[:2])},
                {"type": "list", "list": [{"title": "", "snippet": t} for t in lines[2:]]},
            ],
            "references": [{"title": r["title"], "link": r["link"], "source": r["source"], "index": n} for n, r in enumerate(refs)] + [{"title": f"{q} - {extra}", "link": f"https://{extra}/{q.replace(' ', '-')}", "source": extra, "index": 9}],
        }
    if topic in ("civic", "general", "tech") and rng.random() < 0.7:
        out["top_stories"] = [{"title": f"{q[:1].upper() + q[1:]}: {w}", "source": {"name": rng.choice(list(pool))}, "link": "https://example.com"} for w in ("what we know so far", "reactions pour in", "explained")]
    if topic == "local" or ("near" in q.lower()):
        names = ["House", "Kitchen", "Darbar", "Café", "Bhavan", "Corner", "Express", "Junction"]
        out["local_results"] = {"places": [{"title": f"{city} {rng.choice(names)} #{n + 1}", "rating": round(rng.uniform(3.8, 4.8), 1), "type": "Restaurant"} for n in range(3)]}
    if topic == "shopping" and rng.random() < 0.8:
        out["immersive_products"] = [{"title": f"{q} option {n}"} for n in range(4)]
    if rng.random() < 0.6:
        out["inline_videos"] = [{"title": f"{q} video"}]
    if topic in ("general", "tech", "health") and rng.random() < 0.6:
        out["knowledge_graph"] = {"title": q.title(), "type": "Topic", "description": f"Sample knowledge panel for {q}."}
    if rng.random() < 0.35:
        out["discussions_and_forums"] = [{"title": f"{q} discussion"}]
    return out


# Google Trends GEO_MAP_0 shape: interest_by_region rows.
_STATES = [
    ("IN-AN", "Andaman and Nicobar Islands"), ("IN-AP", "Andhra Pradesh"), ("IN-AR", "Arunachal Pradesh"), ("IN-AS", "Assam"),
    ("IN-BR", "Bihar"), ("IN-CH", "Chandigarh"), ("IN-CT", "Chhattisgarh"), ("IN-DL", "Delhi"), ("IN-GA", "Goa"),
    ("IN-GJ", "Gujarat"), ("IN-HR", "Haryana"), ("IN-HP", "Himachal Pradesh"), ("IN-JK", "Jammu and Kashmir"),
    ("IN-JH", "Jharkhand"), ("IN-KA", "Karnataka"), ("IN-KL", "Kerala"), ("IN-MP", "Madhya Pradesh"),
    ("IN-MH", "Maharashtra"), ("IN-MN", "Manipur"), ("IN-ML", "Meghalaya"), ("IN-MZ", "Mizoram"), ("IN-NL", "Nagaland"),
    ("IN-OR", "Odisha"), ("IN-PY", "Puducherry"), ("IN-PB", "Punjab"), ("IN-RJ", "Rajasthan"), ("IN-SK", "Sikkim"),
    ("IN-TN", "Tamil Nadu"), ("IN-TG", "Telangana"), ("IN-TR", "Tripura"), ("IN-UP", "Uttar Pradesh"),
    ("IN-UT", "Uttarakhand"), ("IN-WB", "West Bengal"),
]


def trends(params: dict, salt: str = "") -> dict:
    q = params.get("q", "")
    rng = _seed("trends", q.lower(), params.get("data_type", ""), salt)
    if params.get("data_type") == "GEO_MAP_0":
        hot = set(rng.sample([c for c, _ in _STATES], 5))
        rows = []
        for code, name in _STATES:
            v = rng.uniform(8, 55) + (rng.uniform(35, 60) if code in hot else 0)
            rows.append({"geo": code, "location": name, "extracted_value": int(v)})
        top = max(r["extracted_value"] for r in rows)
        for r in rows:
            r["extracted_value"] = round(100 * r["extracted_value"] / top)
            r["value"] = str(r["extracted_value"])
        rows.sort(key=lambda r: -r["extracted_value"])
        return {"interest_by_region": rows}
    points = []
    base = rng.uniform(20, 45)
    spike = rng.randint(30, 50)
    for w in range(52):
        v = base + 10 * math.sin(w / 52 * 2 * math.pi * 2 + rng.random()) + rng.gauss(0, 4)
        v += 55 * math.exp(-((w - spike) ** 2) / 6)
        points.append({"date": f"Week {w + 1}", "timestamp": str(1727740800 + w * 604800), "values": [{"query": q, "extracted_value": max(1, int(v))}]})
    top = max(p["values"][0]["extracted_value"] for p in points)
    for p in points:
        p["values"][0]["extracted_value"] = round(100 * p["values"][0]["extracted_value"] / top)
    return {"interest_over_time": {"timeline_data": points}}


DEMO_LOCATIONS = [
    {"name": "Varanasi", "canonical_name": "Varanasi,Uttar Pradesh,India", "country_code": "IN", "gps": [82.9739, 25.3176], "target_type": "City"},
    {"name": "Srinagar", "canonical_name": "Srinagar,Jammu and Kashmir,India", "country_code": "IN", "gps": [74.7973, 34.0837], "target_type": "City"},
    {"name": "Bhopal", "canonical_name": "Bhopal,Madhya Pradesh,India", "country_code": "IN", "gps": [77.4126, 23.2599], "target_type": "City"},
    {"name": "Patna", "canonical_name": "Patna,Bihar,India", "country_code": "IN", "gps": [85.1376, 25.5941], "target_type": "City"},
    {"name": "Imphal", "canonical_name": "Imphal,Manipur,India", "country_code": "IN", "gps": [93.9368, 24.817], "target_type": "City"},
    {"name": "Panaji", "canonical_name": "Panaji,Goa,India", "country_code": "IN", "gps": [73.8278, 15.4909], "target_type": "City"},
    {"name": "Thiruvananthapuram", "canonical_name": "Thiruvananthapuram,Kerala,India", "country_code": "IN", "gps": [76.9366, 8.5241], "target_type": "City"},
    {"name": "Kathmandu", "canonical_name": "Kathmandu,Bagmati Province,Nepal", "country_code": "NP", "gps": [85.324, 27.7172], "target_type": "City"},
    {"name": "Tokyo", "canonical_name": "Tokyo,Tokyo,Japan", "country_code": "JP", "gps": [139.6917, 35.6895], "target_type": "City"},
    {"name": "Nairobi", "canonical_name": "Nairobi,Nairobi County,Kenya", "country_code": "KE", "gps": [36.8219, -1.2921], "target_type": "City"},
]


def locations(q: str, limit: int = 8) -> list[dict]:
    ql = q.lower()
    return [loc for loc in DEMO_LOCATIONS if ql in loc["canonical_name"].lower()][:limit]
