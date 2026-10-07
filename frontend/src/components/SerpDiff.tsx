import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Organic, Vantage, VantageResult } from "../lib/types";
import Favicon from "./Favicon";

const ROW = 64;
const GAP = 6;
const GUTTER = 120;

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
      className={`group flex items-center gap-3 rounded border bg-card px-3 transition ${lit ? "border-ink" : "border-rule"} ${!match ? (side === "a" ? "border-l-[3px] border-l-accent" : "border-r-[3px] border-r-accent") : ""} ${side === "b" ? "flex-row-reverse text-right" : ""}`}
    >
      <span className="num w-6 shrink-0 text-center text-[12.5px] text-muted">{o.rank}</span>
      <Favicon domain={o.domain} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] group-hover:underline">{o.title}</div>
        <div className={`mt-0.5 flex items-center gap-2 text-[12.5px] text-muted ${side === "b" ? "justify-end" : ""}`}>
          <span className="truncate">{o.domain}</span>
          {!match && <span className="shrink-0 font-medium text-accent">only here</span>}
          {match === "source" && <span className="shrink-0">· different page</span>}
        </div>
      </div>
    </a>
  );
}

export default function SerpDiff({ ids, vmap, results, pair, setPair }: { ids: string[]; vmap: Record<string, Vantage>; results: Record<string, VantageResult>; pair: [string, string]; setPair: (p: [string, string]) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [a, b] = pair;
  const A = useMemo(() => results[a]?.organic ?? [], [results, a]);
  const B = useMemo(() => results[b]?.organic ?? [], [results, b]);

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
  const onlyA = A.length - links.length;
  const onlyB = B.length - links.length;

  const select = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1">
      <span className="text-[12.5px] text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field min-w-48 py-2 font-serif text-[19px] font-semibold">
        {ids.map((id) => (
          <option key={id} value={id}>{vmap[id]?.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-wrap items-end gap-3">
          {select("Left", a, (v) => setPair([v, b]))}
          <button onClick={() => setPair([b, a])} className="btn btn-ghost mb-[1px] py-2.5" aria-label="Swap sides">⇄</button>
          {select("Right", b, (v) => setPair([a, v]))}
        </div>
        <p className="max-w-md text-[15px] leading-snug text-ink-2">
          They share <b className="text-ink">{samePages}</b> identical {samePages === 1 ? "link" : "links"} and <b className="text-ink">{links.length - samePages}</b> more websites with a different page.{" "}
          <b className="text-accent">{onlyA}</b> results are only in {vmap[a]?.label}, <b className="text-accent">{onlyB}</b> only in {vmap[b]?.label}.
        </p>
      </div>
      {results[a]?.q !== results[b]?.q && (
        <div className="mb-3 grid grid-cols-2 gap-4 text-[13px] text-muted">
          <div>Searched as “{results[a]?.q}”</div>
          <div className="text-right">Searched as “{results[b]?.q}”</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `1fr ${GUTTER}px 1fr` }}>
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
                  stroke={l.kind === "page" ? "#1e6a70" : "#9a948a"}
                  strokeWidth={lit ? 3 : 1.6}
                  strokeDasharray={l.kind === "page" ? undefined : "4 4"}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1, opacity: hover && !lit ? 0.2 : 1 }}
                  transition={{ duration: 0.6, delay: l.i * 0.03 }}
                />
              );
            })}
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
