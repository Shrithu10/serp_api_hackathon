export const CATEGORY_COLORS: Record<string, string> = {
  News: "#c8442a",
  Government: "#b9861b",
  Academic: "#5a4fa3",
  Reference: "#1e6a70",
  Social: "#b5487e",
  Commerce: "#2f7d4f",
  "Other web": "#a59e91",
};

export const CATEGORY_HELP: Record<string, string> = {
  News: "Newspapers, TV and news websites",
  Government: "Official .gov.in / .nic.in and other government sites",
  Academic: "Universities, journals and research databases",
  Reference: "Encyclopedias, dictionaries and explainers",
  Social: "Reddit, Quora, YouTube, X, forums",
  Commerce: "Shops, marketplaces, price comparison, bookings",
  "Other web": "Everything else",
};

const SERIES = ["#c8442a", "#1e6a70", "#b9861b", "#5a4fa3", "#2f7d4f", "#b5487e", "#3c6fb0", "#8a5a2b", "#6e8b1f", "#a23b3b", "#2a8c8c", "#7d5ba6", "#d2691e", "#4b6b3c", "#9c4f96", "#5b7c99"];

export function seriesColor(index: number) {
  return SERIES[index % SERIES.length];
}

/** Similarity 0..1 → paper → teal. */
export function simColor(s: number) {
  const x = Math.max(0, Math.min(1, s));
  const a = [240, 234, 222];
  const b = [30, 106, 112];
  const t = Math.pow(x, 0.85);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

// Group colours avoid the accent red, which always means "most different".
const GROUPS = ["#1e6a70", "#b9861b", "#5a4fa3", "#2f7d4f", "#b5487e", "#3c6fb0", "#8a5a2b", "#6e8b1f", "#9c4f96", "#5b7c99"];

export function groupColor(index: number) {
  return GROUPS[index % GROUPS.length];
}
