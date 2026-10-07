import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Organic, Vantage, VantageResult } from "../lib/types";
import { favicon } from "../lib/palette";

const ROW = 76;
const GAP = 8;
const GUTTER = 140;

function Card({ o, side, match, hover, setHover }: { o: Organic; side: "a" | "b"; match: "page" | "source" | null; hover: string | null; setHover: (k: string | null) => void }) {
  const lit = hover === o.domain;
  return (
    <a
      href={o.link}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHover(o.domain)}
      onMouseLeave={() => setHover(null)}
      style={{ height: ROW }}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 transition ${
        lit ? "border-cyan/60 bg-cyan/[0.06]" : match ? "border-line bg-white/[0.025]" : "border-red/25 bg-red/[0.04]"
      } ${side === "b" ? "flex-row-reverse text-right" : ""}`}
    >
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span className="font-mono text-[11px] text-dim">#{o.rank}</span>
        <img src={favicon(o.domain)} alt="" className="mt-1 h-4 w-4 rounded" loading="lazy" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-fg group-hover:underline">{o.title}</div>
        <div className={`mt-1 flex items-center gap-2 font-mono text-[10.5px] text-muted ${side === "b" ? "justify-end" : ""}`}>
          <span className="truncate">{o.domain}</span>
          {!match && <span className="shrink-0 rounded bg-red/15 px-1.5 text-red">only here</span>}
          {match === "source" && <span className="shrink-0 rounded bg-violet/15 px-1.5 text-violet">other page</span>}
        </div>
      </div>
    </a>
  );
}

export default function SerpDiff({ ids, vmap, results, pair, setPair }: { ids: string[]; vmap: Record<string, Vantage>; results: Record<string, VantageResult>; pair: [string, string]; setPair: (p: [string, string]) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [a, b] = pair;
  const A = results[a]?.organic ?? [];
  const B = results[b]?.organic ?? [];

  const links = useMemo(() => {
    const out: { i: number; j: number; kind: "page" | "source"; domain: string }[] = [];
    const usedB = new Set<number>();
    A.forEach((o, i) => {
      const j = B.findIndex((p) => p.key === o.key);
      if (j >= 0) {
        out.push({ i, j, kind: "page", domain: o.domain });
        usedB.add(j);
      }
    });
    A.forEach((o, i) => {
      if (out.find((l) => l.i === i)) return;
      const j = B.findIndex((p, k) => !usedB.has(k) && p.domain === o.domain);
      if (j >= 0) {
        out.push({ i, j, kind: "source", domain: o.domain });
        usedB.add(j);
      }
    });
    return out;
  }, [A, B]);

  const matchA = (i: number) => links.find((l) => l.i === i)?.kind ?? null;
  const matchB = (j: number) => links.find((l) => l.j === j)?.kind ?? null;
  const rows = Math.max(A.length, B.length);
  const H = rows * (ROW + GAP);
  const yc = (k: number) => k * (ROW + GAP) + ROW / 2;
  const samePages = links.filter((l) => l.kind === "page").length;

  const Select = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-line bg-ink-2 px-3 py-2 font-serif text-xl outline-none focus:border-cyan/50 md:text-2xl">
      {ids.map((id) => (
        <option key={id} value={id}>
          {vmap[id]?.label} {vmap[id]?.region ? `· ${vmap[id].region}` : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={a} onChange={(v) => setPair([v, b])} />
          <button onClick={() => setPair([b, a])} className="rounded-full border border-line px-3 py-2 font-mono text-xs text-muted hover:text-fg">⇄</button>
          <Select value={b} onChange={(v) => setPair([a, v])} />
        </div>
        <div className="flex gap-5 font-mono text-[12px]">
          <div><span className="text-2xl text-cyan">{samePages}</span><span className="text-dim"> same pages</span></div>
          <div><span className="text-2xl text-violet">{links.length - samePages}</span><span className="text-dim"> same source</span></div>
          <div><span className="text-2xl text-red">{A.length + B.length - 2 * links.length}</span><span className="text-dim"> unmatched</span></div>
        </div>
      </div>
      {(results[a]?.q !== results[b]?.q) && (
        <div className="mb-4 grid grid-cols-2 gap-4 font-mono text-[11.5px] text-muted">
          <div>q = “{results[a]?.q}”</div>
          <div className="text-right">q = “{results[b]?.q}”</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `1fr ${GUTTER}px 1fr` }}>
          <div className="flex flex-col" style={{ gap: GAP }}>
            {A.map((o, i) => (
              <Card key={o.key + i} o={o} side="a" match={matchA(i)} hover={hover} setHover={setHover} />
            ))}
          </div>
          <svg width={GUTTER} height={H} className="overflow-visible">
            {links.map((l) => {
              const y0 = yc(l.i);
              const y1 = yc(l.j);
              const lit = hover === l.domain;
              return (
                <motion.path
                  key={`${a}-${b}-${l.i}-${l.j}`}
                  d={`M0,${y0} C${GUTTER / 2},${y0} ${GUTTER / 2},${y1} ${GUTTER},${y1}`}
                  fill="none"
                  stroke={l.kind === "page" ? "#5ef2ff" : "#9b8cff"}
                  strokeWidth={lit ? 3 : l.kind === "page" ? 1.8 : 1.3}
                  strokeDasharray={l.kind === "page" ? undefined : "4 4"}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: hover && !lit ? 0.15 : 0.85 }}
                  transition={{ duration: 0.8, delay: l.i * 0.05 }}
                />
              );
            })}
            {A.map((_o, i) => !matchA(i) && <circle key={"a" + i} cx={6} cy={yc(i)} r={3} fill="#ff4d6d" opacity={0.7} />)}
            {B.map((o, j) => !matchB(j) && <circle key={"b" + j + o.rank} cx={GUTTER - 6} cy={yc(j)} r={3} fill="#ff4d6d" opacity={0.7} />)}
          </svg>
          <div className="flex flex-col" style={{ gap: GAP }}>
            {B.map((o, j) => (
              <Card key={o.key + j} o={o} side="b" match={matchB(j)} hover={hover} setHover={setHover} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
