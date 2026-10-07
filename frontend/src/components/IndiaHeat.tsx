import { useMemo, useState } from "react";
import * as d3 from "d3";
import indiaMap from "@svg-maps/india";
import type { Trends, Vantage } from "../lib/types";
import { useSize } from "../lib/useSize";

interface SvgMap {
  viewBox: string;
  locations: { id: string; name: string; path: string }[];
}
const india = indiaMap as unknown as SvgMap;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// Google Trends names/codes → map ids (map predates a few renames & mergers).
const ALIAS: Record<string, string[]> = {
  ladakh: ["jk"],
  dadraandnagarhavelianddamananddiu: ["dn", "dd"],
  nctofdelhi: ["dl"],
  nationalcapitalterritoryofdelhi: ["dl"],
  orissa: ["or"],
  uttaranchal: ["ut"],
  pondicherry: ["py"],
};

const heat = d3.scaleSequential((t) => d3.interpolateRgbBasis(["#efe8da", "#ecc9a2", "#df8f5c", "#c8442a", "#7a2213"])(t)).domain([0, 100]);

function Timeline({ data }: { data: Trends["timeline"] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const W = Math.max(280, width);
  const H = 120;
  const x = d3.scaleLinear().domain([0, Math.max(1, data.length - 1)]).range([0, W]);
  const y = d3.scaleLinear().domain([0, 100]).range([H - 6, 6]);
  const area = d3.area<Trends["timeline"][number]>().x((_, i) => x(i)).y0(H).y1((d) => y(d.v)).curve(d3.curveMonotoneX);
  const line = d3.line<Trends["timeline"][number]>().x((_, i) => x(i)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
  const peak = data.reduce((m, d, i) => (d.v > data[m].v ? i : m), 0);
  return (
    <div ref={ref}>
      <svg width={W} height={H} className="block overflow-visible">
        <defs>
          <linearGradient id="tl" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c8442a" stopOpacity="0.25" />
            <stop offset="1" stopColor="#c8442a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area(data) || ""} fill="url(#tl)" />
        <path d={line(data) || ""} fill="none" stroke="#c8442a" strokeWidth={1.8} />
        {data.length > 0 && (
          <g>
            <circle cx={x(peak)} cy={y(data[peak].v)} r={4} fill="#b9861b" />
            <text x={Math.min(W - 120, x(peak) + 8)} y={y(data[peak].v) + 4} fontSize={11} fill="#8a5a2b">
              highest: {data[peak].date}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function IndiaHeat({ trends, vantages }: { trends: Trends; vantages: Vantage[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const byId = useMemo(() => {
    const ids = new Map(india.locations.map((l) => [norm(l.name), l.id]));
    const out: Record<string, { value: number; name: string }> = {};
    for (const r of trends.regions) {
      const n = norm(r.name || "");
      const targets = ALIAS[n] || (ids.get(n) ? [ids.get(n)!] : r.code ? [r.code.split("-")[1]?.toLowerCase()] : []);
      for (const t of targets) if (t) out[t] = { value: r.value, name: r.name };
    }
    return out;
  }, [trends]);
  const vantageStates = new Set(vantages.map((v) => norm(v.region.split("·").pop() || "")));
  const ranked = [...trends.regions].sort((a, b) => b.value - a.value);
  const h = hover ? india.locations.find((l) => l.id === hover) : null;

  if (!trends.regions.length && !trends.timeline.length)
    return <div className="text-sm text-faint">Google Trends has no regional data for this query{trends.geo_error ? ` (${trends.geo_error})` : ""}.</div>;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative mx-auto w-full max-w-[520px]">
        <svg viewBox={india.viewBox} className="w-full">
          {india.locations.map((l) => {
            const d = byId[l.id];
            const isV = vantageStates.has(norm(l.name));
            return (
              <path
                key={l.id}
                d={l.path}
                fill={d ? heat(d.value) : "#e6dfd0"}
                stroke={hover === l.id || isV ? "#1a1814" : "#fbf9f4"}
                strokeWidth={hover === l.id ? 1.6 : isV ? 1.1 : 0.6}
                onMouseEnter={() => setHover(l.id)}
                onMouseLeave={() => setHover(null)}
                className="transition-[fill] duration-700"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute left-2 top-2 rounded-xl border border-rule bg-card/90 px-3 py-2 backdrop-blur">
          <div className="text-[13px]">{h ? h.name : "Hover a state"}</div>
          <div className="num text-2xl text-accent">{h ? byId[h.id]?.value ?? "—" : "·"}</div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
          0
          <div className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 25, 50, 75, 100].map((v) => heat(v)).join(",")})` }} />
          100 = most searched
        </div>
      </div>
      <div>
        <div className="label mb-3">States searching for it most</div>
        <div className="space-y-1.5">
          {ranked.slice(0, 10).map((r, i) => (
            <div key={r.code || r.name} className="flex items-center gap-3 text-[13px]">
              <span className="num w-5 text-[12px] text-muted">{i + 1}</span>
              <span className="w-40 truncate">{r.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full" style={{ width: `${r.value}%`, background: heat(r.value) }} />
              </div>
              <span className="num w-8 text-right text-[12px] text-muted">{r.value}</span>
            </div>
          ))}
        </div>
        {trends.timeline.length > 0 && (
          <div className="mt-8">
            <div className="label mb-2">Interest in India over the past 12 months</div>
            <Timeline data={trends.timeline} />
          </div>
        )}
      </div>
    </div>
  );
}
