export const CATEGORY_COLORS: Record<string, string> = {
  News: "#ff8a5b",
  Government: "#ffd166",
  Academic: "#9b8cff",
  Reference: "#5ef2ff",
  Social: "#ff5fa2",
  Commerce: "#7cf29a",
  "Other web": "#5b6475",
};

const VANTAGE_PALETTE = [
  "#5ef2ff", "#ff4d6d", "#ffb547", "#9b8cff", "#b6f36b", "#ff5fa2", "#4dd4ac", "#ff8a5b",
  "#6aa8ff", "#f2e85e", "#c58bff", "#5effc1", "#ff7ad9", "#9fe6ff", "#ffa07a", "#d4ff5e",
];

export function vantageColor(index: number) {
  return VANTAGE_PALETTE[index % VANTAGE_PALETTE.length];
}

/** Similarity 0..1 → colour from deep ink through violet to cyan. */
export function simColor(s: number) {
  const stops: [number, [number, number, number]][] = [
    [0, [18, 20, 30]],
    [0.25, [64, 34, 92]],
    [0.5, [155, 80, 190]],
    [0.75, [110, 150, 255]],
    [1, [94, 242, 255]],
  ];
  const x = Math.max(0, Math.min(1, s));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (x <= p1) {
      const t = (x - p0) / (p1 - p0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]} ${c[1]} ${c[2]})`;
    }
  }
  return "rgb(94 242 255)";
}

export function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
