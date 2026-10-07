"""Native-script wording for common searches, used by the language lens.

No AI or translation service is involved at runtime. For other searches the
person types their own wording per language in the form (pre-filled from
here when we have it); a blank language falls back to the original query.
"""

from __future__ import annotations

BUILTIN: dict[str, dict[str, str]] = {
    "is ayurveda effective": {
        "hi": "क्या आयुर्वेद प्रभावी है", "bn": "আয়ুর্বেদ কি কার্যকর", "ta": "ஆயுர்வேதம் பயனுள்ளதா",
        "te": "ఆయుర్వేదం ప్రభావవంతంగా ఉందా", "mr": "आयुर्वेद प्रभावी आहे का", "gu": "શું આયુર્વેદ અસરકારક છે",
        "kn": "ಆಯುರ್ವೇದ ಪರಿಣಾಮಕಾರಿಯೇ", "ml": "ആയുർവേദം ഫലപ്രദമാണോ", "pa": "ਕੀ ਆਯੁਰਵੇਦ ਅਸਰਦਾਰ ਹੈ",
    },
    "symptoms of dengue": {
        "hi": "डेंगू के लक्षण", "bn": "ডেঙ্গুর লক্ষণ", "ta": "டெங்கு அறிகுறிகள்", "te": "డెంగ్యూ లక్షణాలు",
        "mr": "डेंग्यूची लक्षणे", "gu": "ડેન્ગ્યુના લક્ષણો", "kn": "ಡೆಂಗ್ಯೂ ಲಕ್ಷಣಗಳು", "ml": "ഡെങ്കിപ്പനി ലക്ഷണങ്ങൾ",
        "pa": "ਡੇਂਗੂ ਦੇ ਲੱਛਣ",
    },
    "air pollution": {
        "hi": "वायु प्रदूषण", "bn": "বায়ু দূষণ", "ta": "காற்று மாசுபாடு", "te": "వాయు కాలుష్యం", "mr": "वायू प्रदूषण",
        "gu": "વાયુ પ્રદૂષણ", "kn": "ವಾಯು ಮಾಲಿನ್ಯ", "ml": "വായു മലിനീകരണം", "pa": "ਹਵਾ ਪ੍ਰਦੂਸ਼ਣ",
    },
    "how to invest in gold": {
        "hi": "सोने में निवेश कैसे करें", "bn": "সোনায় কীভাবে বিনিয়োগ করবেন", "ta": "தங்கத்தில் முதலீடு செய்வது எப்படி",
        "te": "బంగారంలో పెట్టుబడి ఎలా పెట్టాలి", "mr": "सोन्यात गुंतवणूक कशी करावी", "gu": "સોનામાં રોકાણ કેવી રીતે કરવું",
        "kn": "ಚಿನ್ನದಲ್ಲಿ ಹೂಡಿಕೆ ಮಾಡುವುದು ಹೇಗೆ", "ml": "സ്വർണ്ണത്തിൽ എങ്ങനെ നിക്ഷേപിക്കാം", "pa": "ਸੋਨੇ ਵਿੱਚ ਨਿਵੇਸ਼ ਕਿਵੇਂ ਕਰੀਏ",
    },
    "who invented zero": {
        "hi": "शून्य का आविष्कार किसने किया", "bn": "শূন্য কে আবিষ্কার করেন", "ta": "பூஜ்ஜியத்தை கண்டுபிடித்தவர் யார்",
        "te": "సున్నాను ఎవరు కనుగొన్నారు", "mr": "शून्याचा शोध कोणी लावला", "gu": "શૂન્યની શોધ કોણે કરી",
        "kn": "ಸೊನ್ನೆಯನ್ನು ಕಂಡುಹಿಡಿದವರು ಯಾರು", "ml": "പൂജ്യം കണ്ടുപിടിച്ചത് ആര്", "pa": "ਜ਼ੀਰੋ ਦੀ ਖੋਜ ਕਿਸਨੇ ਕੀਤੀ",
    },
    "monsoon flooding": {
        "hi": "मानसून बाढ़", "bn": "বর্ষার বন্যা", "ta": "பருவமழை வெள்ளம்", "te": "వర్షాకాల వరదలు", "mr": "पावसाळी पूर",
        "gu": "ચોમાસું પૂર", "kn": "ಮುಂಗಾರು ಪ್ರವಾಹ", "ml": "മൺസൂൺ വെള്ളപ്പൊക്കം", "pa": "ਮਾਨਸੂਨ ਹੜ੍ਹ",
    },
}


def _norm(q: str) -> str:
    return " ".join(q.lower().replace("?", "").split())


def lookup(q: str) -> dict[str, str]:
    """hl -> native wording for a known search, or {}."""
    return dict(BUILTIN.get(_norm(q), {}))


def resolve(q: str, vantages, overrides: dict[str, str] | None = None) -> dict[str, str]:
    """vantage id -> query to send. Typed wording beats built-in; blank keeps the original."""
    builtin = lookup(q)
    overrides = {k: v.strip() for k, v in (overrides or {}).items() if v and v.strip()}
    out = {}
    for v in vantages:
        out[v.id] = (overrides.get(v.hl) or builtin.get(v.hl) or q) if v.translate else q
    return out
