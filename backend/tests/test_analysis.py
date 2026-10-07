import asyncio

from parallax import demo
from parallax.analysis import analyze, classify, rbo
from parallax.normalize import dominant_script, normalize, registrable_domain, url_key
from parallax.vantages import CITIES, LANGUAGES


def test_rbo_bounds():
    assert rbo(["a", "b", "c"], ["a", "b", "c"]) == 1.0
    assert rbo(["a", "b", "c"], ["x", "y", "z"]) == 0.0
    assert rbo([], []) == 1.0


def test_rbo_rewards_top_agreement():
    top_same = rbo(["a", "b", "c", "d"], ["a", "b", "x", "y"])
    bottom_same = rbo(["x", "y", "c", "d"], ["p", "q", "c", "d"])
    assert top_same > bottom_same > 0


def test_domains_and_keys():
    assert registrable_domain("https://www.timesofindia.indiatimes.com/x") == "indiatimes.com"
    assert registrable_domain("https://pib.gov.in/release") == "pib.gov.in"
    assert registrable_domain("https://news.bbc.co.uk/a") == "bbc.co.uk"
    assert url_key("https://www.example.com/a/?utm_source=x&id=2") == url_key("http://example.com/a?id=2")


def test_script_detection():
    assert dominant_script("आयुर्वेद क्या है") == "Devanagari"
    assert dominant_script("ஆயுர்வேதம்") == "Tamil"
    assert dominant_script("Is ayurveda effective") == "Latin"


def test_classify():
    assert classify("mohfw.gov.in") == "Government"
    assert classify("iitb.ac.in") == "Academic"
    assert classify("thehindu.com") == "News"
    assert classify("reddit.com") == "Social"


def test_end_to_end_demo_scan():
    q = "best phone under 30000"
    results = {v.id: normalize(demo.google(v.params(q))) for v in CITIES}
    a = analyze(q, [v.to_dict() for v in CITIES], results)
    assert a["ok"]
    assert 0 <= a["index"] <= 100
    n = len(CITIES)
    assert len(a["matrix"]) == n and all(len(r) == n for r in a["matrix"])
    assert all(a["matrix"][i][i] == 1.0 for i in range(n))
    assert sorted(i for c in a["clusters"] for i in c) == sorted(v.id for v in CITIES)
    for river in a["rivers"]:
        assert set(river["ranks"]) == set(a["order"])


def test_language_lens_surfaces_native_sources():
    q = "symptoms of dengue"
    results = {v.id: normalize(demo.google(v.params(q))) for v in LANGUAGES}
    a = analyze(q, [v.to_dict() for v in LANGUAGES], results)
    assert a["exclusives"]["ta-chennai"] or a["exclusives"]["hi-lucknow"]


def test_identical_results_score_zero():
    q = "x"
    r = normalize(demo.google(CITIES[0].params(q)))
    a = analyze(q, [v.to_dict() for v in CITIES[:3]], {v.id: r for v in CITIES[:3]})
    assert a["index"] == 0
    assert len(a["clusters"]) == 1


def test_offline_brief_streams():
    from parallax.brief import _offline

    q = "upi"
    results = {v.id: normalize(demo.google(v.params(q))) for v in CITIES}
    a = analyze(q, [v.to_dict() for v in CITIES], results)

    async def collect():
        return "".join([c async for c in _offline(a, [v.to_dict() for v in CITIES])])

    text = asyncio.run(collect())
    assert "What to do" in text and "**" in text


def test_plain_metrics():
    q = "best phone under 30000"
    results = {v.id: normalize(demo.google(v.params(q))) for v in CITIES}
    a = analyze(q, [v.to_dict() for v in CITIES], results)
    p = a["plain"]
    assert 0 <= p["avg_differ"] <= 10
    assert p["places"] == len(CITIES)
    assert 1 <= p["top1_agree"] <= len(CITIES)
    n = len(CITIES)
    assert all(a["shared_links"][i][i] == len(results[a["order"][i]]["organic"]) for i in range(n))


def test_storage_roundtrip(tmp_path, monkeypatch):
    from parallax import storage

    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "t.db")
    first = storage.save("UPI", "cities", False, {"analysis": {"plain": {}}, "vantages": []})
    second = storage.save("upi ", "cities", False, {"analysis": {"plain": {}}, "vantages": [], "brief": "x"})
    assert storage.get(second)["payload"]["brief"] == "x"
    assert storage.previous(second)["id"] == first
    assert storage.previous(first) is None
    assert [s["id"] for s in storage.list_scans()] == [second, first]
    assert storage.delete(first) and storage.get(first) is None
