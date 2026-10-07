import type { Analysis, Organic, ScanPayload, Vantage, VantageResult } from "./types";

export function normalizeDomain(input: string) {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s;
}

export function domainMatches(resultDomain: string, link: string, site: string) {
  if (!site) return false;
  if (resultDomain === site) return true;
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    return host === site || host.endsWith("." + site);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- blind spots

export interface BlindSpot {
  domain: string;
  title: string;
  link: string;
  places: string[];
  bestRank: number;
}

/** Links other places see that `home` does not (matched by source, so localised editions don't count as new). */
export function blindSpots(home: string, ids: string[], results: Record<string, VantageResult>) {
  const mine = new Set(results[home]?.organic.map((o) => o.domain));
  const missing = new Map<string, BlindSpot>();
  for (const id of ids) {
    if (id === home) continue;
    for (const o of results[id]?.organic ?? []) {
      if (mine.has(o.domain)) continue;
      const cur = missing.get(o.domain);
      if (cur) {
        if (!cur.places.includes(id)) cur.places.push(id);
        if (o.rank < cur.bestRank) Object.assign(cur, { bestRank: o.rank, title: o.title, link: o.link });
      } else missing.set(o.domain, { domain: o.domain, title: o.title, link: o.link, places: [id], bestRank: o.rank });
    }
  }
  const others = new Set<string>();
  for (const id of ids) if (id !== home) results[id]?.organic.forEach((o) => others.add(o.domain));
  const onlyMine = (results[home]?.organic ?? []).filter((o) => !others.has(o.domain));
  const list = [...missing.values()].sort((a, b) => b.places.length - a.places.length || a.bestRank - b.bestRank);
  return { missing: list, onlyMine };
}

// --------------------------------------------------------------- site report

export interface SiteRow {
  id: string;
  rank: number | null;
  hit: Organic | null;
  ahead: Organic[];
  aiCited: boolean;
}

export function siteReport(site: string, ids: string[], results: Record<string, VantageResult>) {
  const rows: SiteRow[] = ids.map((id) => {
    const r = results[id];
    const hit = r?.organic.find((o) => domainMatches(o.domain, o.link, site)) ?? null;
    const ahead = (r?.organic ?? []).filter((o) => !domainMatches(o.domain, o.link, site) && (!hit || o.rank < hit.rank)).slice(0, hit ? 9 : 3);
    const aiCited = !!r?.ai_overview?.refs?.some((x) => domainMatches(x.domain, x.link, site));
    return { id, rank: hit?.rank ?? null, hit, ahead, aiCited };
  });
  const found = rows.filter((r) => r.rank != null);
  const competitors = new Map<string, number>();
  for (const r of rows) for (const o of r.ahead) competitors.set(o.domain, (competitors.get(o.domain) || 0) + 1);
  return {
    rows,
    foundIn: found.length,
    best: found.length ? Math.min(...found.map((r) => r.rank!)) : null,
    avg: found.length ? Math.round((found.reduce((a, r) => a + r.rank!, 0) / found.length) * 10) / 10 : null,
    aiCitedIn: rows.filter((r) => r.aiCited).length,
    competitors: [...competitors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

// --------------------------------------------------------- changes over time

export interface PlaceChange {
  id: string;
  added: Organic[];
  dropped: Organic[];
  newTop: string | null;
  oldTop: string | null;
}

export function changesSince(prev: ScanPayload, cur: { results: Record<string, VantageResult>; analysis: Analysis | null }) {
  const out: PlaceChange[] = [];
  for (const id of Object.keys(cur.results)) {
    const a = prev.results[id];
    const b = cur.results[id];
    if (!a || !b) continue;
    const oldKeys = new Set(a.organic.map((o) => o.domain));
    const newKeys = new Set(b.organic.map((o) => o.domain));
    out.push({
      id,
      added: b.organic.filter((o) => !oldKeys.has(o.domain)),
      dropped: a.organic.filter((o) => !newKeys.has(o.domain)),
      newTop: b.organic[0]?.domain ?? null,
      oldTop: a.organic[0]?.domain ?? null,
    });
  }
  const scoreDelta = cur.analysis?.ok && prev.analysis?.ok ? Math.round((cur.analysis.index - prev.analysis.index) * 10) / 10 : null;
  return { places: out, scoreDelta, totalAdded: out.reduce((n, p) => n + p.added.length, 0), topChanged: out.filter((p) => p.newTop !== p.oldTop).length };
}

// ------------------------------------------------------------------- exports

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(query: string, vantages: Vantage[], results: Record<string, VantageResult>) {
  const head = ["query", "place", "location", "language", "query_used", "rank", "title", "url", "domain", "ai_overview_shown", "ai_overview_cites_this"];
  const rows = [head.join(",")];
  for (const v of vantages) {
    const r = results[v.id];
    if (!r) continue;
    const cited = new Set((r.ai_overview.refs || []).map((x) => x.domain));
    for (const o of r.organic) {
      rows.push([query, v.label, v.location, v.hl, r.q, o.rank, o.title, o.link, o.domain, r.ai_overview.present ? "yes" : "no", cited.has(o.domain) ? "yes" : "no"].map(csvCell).join(","));
    }
  }
  return rows.join("\n");
}

export function toMarkdown(p: { query: string; vantages: Vantage[]; results: Record<string, VantageResult>; analysis: Analysis; brief: string; live: boolean; when: Date }) {
  const vmap = Object.fromEntries(p.vantages.map((v) => [v.id, v]));
  const a = p.analysis;
  const L: string[] = [];
  L.push(`# PARALLAX report: "${p.query}"`, "");
  L.push(`_${p.when.toLocaleString()} · ${p.vantages.length} places · ${p.live ? "live Google results via SerpApi" : "demo data"}_`, "");
  L.push("## In short", "");
  L.push(`- On average **${a.plain.avg_differ} of the top ${a.plain.avg_len} links** differ between two places.`);
  L.push(`- The #1 result (**${a.plain.top1_domain}**) is the same in ${a.plain.top1_agree} of ${a.plain.places} places.`);
  L.push(`- Places fall into **${a.plain.groups} groups** that see similar results.`);
  L.push(`- Most different: ${vmap[a.most_different.a]?.label} vs ${vmap[a.most_different.b]?.label}. Most alike: ${vmap[a.most_similar.a]?.label} and ${vmap[a.most_similar.b]?.label}.`);
  L.push(`- Difference score: ${a.index}/100 (${a.verdict}).`, "");
  if (p.brief) L.push("## Analysis", "", p.brief.trim(), "");
  L.push("## Top 5 by place", "");
  for (const id of a.order) {
    const r = p.results[id];
    if (!r) continue;
    L.push(`### ${vmap[id]?.label}${r.q !== p.query ? ` — "${r.q}"` : ""}`);
    r.organic.slice(0, 5).forEach((o) => L.push(`${o.rank}. [${o.title}](${o.link}) — ${o.domain}`));
    L.push("");
  }
  const ex = Object.entries(a.exclusives).filter(([, v]) => v.length);
  if (ex.length) {
    L.push("## Sources seen in only one place", "");
    for (const [id, list] of ex) L.push(`- **${vmap[id]?.label}:** ${list.map((e) => e.domain).join(", ")}`);
    L.push("");
  }
  L.push("---", "Generated with PARALLAX (SerpApi Google Search, AI Overview and Trends APIs).");
  return L.join("\n");
}

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "scan";
}

export function timeAgo(sec: number) {
  const d = Date.now() / 1000 - sec;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} days ago`;
  return new Date(sec * 1000).toLocaleDateString();
}
