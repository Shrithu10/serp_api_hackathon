import requests
import serpapi

from parallax.serp import SerpGateway, redact


def _http_error(status: int, body: bytes) -> serpapi.HTTPError:
    resp = requests.Response()
    resp.status_code = status
    resp._content = body
    resp.url = "https://serpapi.com/search?q=x&api_key=SECRET123"
    return serpapi.HTTPError(requests.exceptions.HTTPError(f"{status} Client Error for url: {resp.url}", response=resp))


class _Client:
    def __init__(self, exc):
        self.exc = exc

    def search(self, params):
        raise self.exc


def _gateway(exc) -> SerpGateway:
    g = SerpGateway(offline=True)
    g.client = _Client(exc)
    return g


def test_serpapi_error_body_is_kept():
    out = _gateway(_http_error(400, b'{"error": "Unsupported location."}'))._live_search({"q": "x"}, retries=0)
    assert out == {"error": "Unsupported location."}


def test_error_without_body_never_leaks_key():
    out = _gateway(_http_error(500, b"<html>oops</html>"))._live_search({"q": "x"}, retries=0)
    assert "SECRET123" not in str(out) and out.get("error")


def test_redact():
    assert "SECRET" not in redact("Max retries exceeded with url: /search?q=x&api_key=SECRET&hl=en")


class _Flaky:
    def __init__(self, failures):
        self.failures, self.calls = failures, 0

    def search(self, params):
        self.calls += 1
        if self.calls <= self.failures:
            raise serpapi.TimeoutError("Read timed out")
        return type("R", (), {"as_dict": lambda self: {"organic_results": [1]}})()


def test_timeouts_are_retried_twice(monkeypatch):
    monkeypatch.setattr("parallax.serp.time.sleep", lambda s: None)
    g = SerpGateway(offline=True)
    g.client = _Flaky(2)
    assert g._live_search({"q": "x"}) == {"organic_results": [1]}
    g.client = _Flaky(3)
    out = g._live_search({"q": "x"})
    assert g.client.calls == 3 and "did not respond" in out["error"] and "_transient" not in out
