"""Vantage points: the places (and languages) PARALLAX looks at Google from.

Every vantage maps to a concrete set of SerpApi Google Search parameters.
`location` strings use Google's canonical names (see the free SerpApi
Locations API: https://serpapi.com/locations-api).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class Vantage:
    id: str
    label: str  # human name, e.g. "Chennai"
    code: str  # 3-letter tag used in dense charts
    lat: float
    lng: float
    location: str  # SerpApi `location`
    gl: str = "in"  # SerpApi `gl` (country)
    hl: str = "en"  # SerpApi `hl` (interface language)
    google_domain: str = "google.co.in"
    lang_name: str = "English"
    region: str = ""  # sub-label, e.g. "Tamil Nadu"
    translate: bool = False  # language lens: rewrite the query into `hl`

    def params(self, q: str) -> dict:
        return {
            "engine": "google",
            "q": q,
            "location": self.location,
            "gl": self.gl,
            "hl": self.hl,
            "google_domain": self.google_domain,
        }

    def to_dict(self) -> dict:
        return asdict(self)


def _v(id, label, code, lat, lng, location, region, **kw) -> Vantage:
    return Vantage(id=id, label=label, code=code, lat=lat, lng=lng, location=location, region=region, **kw)


CITIES: list[Vantage] = [
    _v("mumbai", "Mumbai", "BOM", 19.076, 72.8777, "Mumbai, Maharashtra, India", "Maharashtra"),
    _v("delhi", "New Delhi", "DEL", 28.6139, 77.209, "New Delhi, Delhi, India", "Delhi"),
    _v("bengaluru", "Bengaluru", "BLR", 12.9716, 77.5946, "Bengaluru, Karnataka, India", "Karnataka"),
    _v("chennai", "Chennai", "MAA", 13.0827, 80.2707, "Chennai, Tamil Nadu, India", "Tamil Nadu"),
    _v("kolkata", "Kolkata", "CCU", 22.5726, 88.3639, "Kolkata, West Bengal, India", "West Bengal"),
    _v("hyderabad", "Hyderabad", "HYD", 17.385, 78.4867, "Hyderabad, Telangana, India", "Telangana"),
    _v("pune", "Pune", "PNQ", 18.5204, 73.8567, "Pune, Maharashtra, India", "Maharashtra"),
    _v("ahmedabad", "Ahmedabad", "AMD", 23.0225, 72.5714, "Ahmedabad, Gujarat, India", "Gujarat"),
    _v("jaipur", "Jaipur", "JAI", 26.9124, 75.7873, "Jaipur, Rajasthan, India", "Rajasthan"),
    _v("lucknow", "Lucknow", "LKO", 26.8467, 80.9462, "Lucknow, Uttar Pradesh, India", "Uttar Pradesh"),
    _v("guwahati", "Guwahati", "GAU", 26.1445, 91.7362, "Guwahati, Assam, India", "Assam"),
    _v("kochi", "Kochi", "COK", 9.9312, 76.2673, "Kochi, Kerala, India", "Kerala"),
]

LANGUAGES: list[Vantage] = [
    _v("en-delhi", "English", "ENG", 28.6139, 77.209, "New Delhi, Delhi, India", "New Delhi", hl="en", lang_name="English"),
    _v("hi-lucknow", "हिन्दी", "HIN", 26.8467, 80.9462, "Lucknow, Uttar Pradesh, India", "Hindi · Lucknow", hl="hi", lang_name="Hindi", translate=True),
    _v("bn-kolkata", "বাংলা", "BEN", 22.5726, 88.3639, "Kolkata, West Bengal, India", "Bengali · Kolkata", hl="bn", lang_name="Bengali", translate=True),
    _v("ta-chennai", "தமிழ்", "TAM", 13.0827, 80.2707, "Chennai, Tamil Nadu, India", "Tamil · Chennai", hl="ta", lang_name="Tamil", translate=True),
    _v("te-hyderabad", "తెలుగు", "TEL", 17.385, 78.4867, "Hyderabad, Telangana, India", "Telugu · Hyderabad", hl="te", lang_name="Telugu", translate=True),
    _v("mr-pune", "मराठी", "MAR", 18.5204, 73.8567, "Pune, Maharashtra, India", "Marathi · Pune", hl="mr", lang_name="Marathi", translate=True),
    _v("gu-ahmedabad", "ગુજરાતી", "GUJ", 23.0225, 72.5714, "Ahmedabad, Gujarat, India", "Gujarati · Ahmedabad", hl="gu", lang_name="Gujarati", translate=True),
    _v("kn-bengaluru", "ಕನ್ನಡ", "KAN", 12.9716, 77.5946, "Bengaluru, Karnataka, India", "Kannada · Bengaluru", hl="kn", lang_name="Kannada", translate=True),
    _v("ml-kochi", "മലയാളം", "MAL", 9.9312, 76.2673, "Kochi, Kerala, India", "Malayalam · Kochi", hl="ml", lang_name="Malayalam", translate=True),
    _v("pa-ludhiana", "ਪੰਜਾਬੀ", "PAN", 30.901, 75.8573, "Ludhiana, Punjab, India", "Punjabi · Ludhiana", hl="pa", lang_name="Punjabi", translate=True),
]

WORLD: list[Vantage] = [
    _v("w-delhi", "New Delhi", "DEL", 28.6139, 77.209, "New Delhi, Delhi, India", "India"),
    _v("w-mumbai", "Mumbai", "BOM", 19.076, 72.8777, "Mumbai, Maharashtra, India", "India"),
    _v("w-newyork", "New York", "NYC", 40.7128, -74.006, "New York, New York, United States", "United States", gl="us", google_domain="google.com"),
    _v("w-sf", "San Francisco", "SFO", 37.7749, -122.4194, "San Francisco, California, United States", "United States", gl="us", google_domain="google.com"),
    _v("w-london", "London", "LON", 51.5074, -0.1278, "London, England, United Kingdom", "United Kingdom", gl="uk", google_domain="google.co.uk"),
    _v("w-dubai", "Dubai", "DXB", 25.2048, 55.2708, "Dubai, Dubai, United Arab Emirates", "UAE", gl="ae", google_domain="google.ae"),
    _v("w-singapore", "Singapore", "SIN", 1.3521, 103.8198, "Singapore", "Singapore", gl="sg", google_domain="google.com.sg"),
    _v("w-toronto", "Toronto", "YYZ", 43.6532, -79.3832, "Toronto, Ontario, Canada", "Canada", gl="ca", google_domain="google.ca"),
    _v("w-sydney", "Sydney", "SYD", -33.8688, 151.2093, "Sydney, New South Wales, Australia", "Australia", gl="au", google_domain="google.com.au"),
    _v("w-dhaka", "Dhaka", "DAC", 23.8103, 90.4125, "Dhaka, Dhaka Division, Bangladesh", "Bangladesh", gl="bd", google_domain="google.com.bd"),
]


@dataclass
class Lens:
    id: str
    name: str
    tagline: str
    vantages: list[Vantage] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "tagline": self.tagline,
            "vantages": [v.to_dict() for v in self.vantages],
        }


LENSES: dict[str, Lens] = {
    "cities": Lens("cities", "12 Indias", "Same query, same language, twelve Indian cities.", CITIES),
    "languages": Lens("languages", "10 Tongues", "One question asked in ten Indian languages.", LANGUAGES),
    "world": Lens("world", "India vs World", "How India's Google compares to the rest of the planet.", WORLD),
}

ALL_VANTAGES: dict[str, Vantage] = {v.id: v for lens in LENSES.values() for v in lens.vantages}


def custom_vantage(raw: dict) -> Vantage:
    """Build a vantage from a SerpApi Locations API row picked in the UI."""
    label = str(raw.get("label") or raw.get("name") or raw["location"]).strip()
    gl = str(raw.get("gl") or "in").lower()
    return Vantage(
        id="c-" + "".join(ch for ch in label.lower() if ch.isalnum())[:24],
        label=label,
        code=(label[:3]).upper(),
        lat=float(raw.get("lat") or 0),
        lng=float(raw.get("lng") or 0),
        location=str(raw["location"]),
        gl=gl,
        hl=str(raw.get("hl") or "en"),
        google_domain=str(raw.get("google_domain") or ("google.co.in" if gl == "in" else "google.com")),
        region=str(raw.get("region") or ""),
    )
