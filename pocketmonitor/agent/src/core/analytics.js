'use strict';
const { dayKey, dayStart } = require('./store');

const top = (map, n) => [...map.values()].sort((a, b) => b.ms - a.ms).slice(0, n);

/** Merge adjacent app records of the same app/kind into a readable timeline. */
function buildTimeline(apps) {
  const out = [];
  for (const r of apps.slice().sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && last.x === r.x && last.k === r.k && r.s - last.e <= 5000) last.e = Math.max(last.e, r.e);
    else out.push({ s: r.s, e: r.e, k: r.k, x: r.x, n: r.n });
  }
  return out;
}

function summarize(records, dayKeyStr) {
  const apps = records.filter((r) => r.y === 'a');
  const webs = records.filter((r) => r.y === 'w');
  const appMap = new Map(); const hourly = new Array(24).fill(0);
  let activeMs = 0; let idleMs = 0; let first = null; let last = null;
  const base = dayKeyStr ? dayStart(dayKeyStr) : null;
  for (const r of apps) {
    const ms = r.e - r.s;
    const o = appMap.get(r.x) || { x: r.x, n: r.n, ms: 0, idleMs: 0 };
    if (r.k === 'a') {
      o.ms += ms; activeMs += ms;
      if (base != null) { // spread across hour buckets
        let t = r.s; while (t < r.e) { const h = Math.min(23, Math.floor((t - base) / 3600_000)); const hEnd = base + (h + 1) * 3600_000; const seg = Math.min(r.e, hEnd) - t; if (h >= 0) hourly[h] += seg; t += seg || 1; }
      }
    } else { o.idleMs += ms; idleMs += ms; }
    appMap.set(r.x, o);
    first = first == null ? r.s : Math.min(first, r.s); last = last == null ? r.e : Math.max(last, r.e);
  }
  const browserMap = new Map(); const domainMap = new Map(); const tabMap = new Map();
  for (const r of webs) {
    if (r.k !== 'a') continue;
    const ms = r.e - r.s;
    const b = browserMap.get(r.b) || { b: r.b, ms: 0 }; b.ms += ms; browserMap.set(r.b, b);
    const d = domainMap.get(r.d) || { d: r.d, ms: 0 }; d.ms += ms; domainMap.set(r.d, d);
    const tk = r.d + '\u0000' + r.t; const t = tabMap.get(tk) || { d: r.d, t: r.t, b: r.b, ms: 0, last: 0 };
    t.ms += ms; t.last = Math.max(t.last, r.e); tabMap.set(tk, t);
  }
  const timeline = buildTimeline(apps);
  const sessions = timeline.filter((s) => s.k === 'a').map((s) => ({ ...s, ms: s.e - s.s })).slice(-60).reverse();
  const recentTabs = [...tabMap.values()].sort((a, b) => b.last - a.last).slice(0, 40);
  return {
    activeMs, idleMs, first, last,
    apps: top(appMap, 25), browsers: top(browserMap, 6), domains: top(domainMap, 20),
    tabs: top(tabMap, 25), recentTabs, hourly, timeline, sessions,
  };
}

function dayReport(store, key) { return { date: key, ...summarize(store.readDay(key), key) }; }

function weekReport(store, endKey) {
  const end = dayStart(endKey);
  const days = []; const all = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(end - i * 86400_000 + 3600_000 * 12);
    const recs = store.readDay(k);
    all.push(...recs);
    const s = summarize(recs, k);
    days.push({ date: k, activeMs: s.activeMs, idleMs: s.idleMs });
  }
  const agg = summarize(all, null);
  return {
    date: endKey, days, activeMs: agg.activeMs, idleMs: agg.idleMs,
    apps: agg.apps, browsers: agg.browsers, domains: agg.domains, tabs: agg.tabs,
  };
}

module.exports = { summarize, dayReport, weekReport, buildTimeline };
