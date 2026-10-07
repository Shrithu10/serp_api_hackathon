import { motion } from "motion/react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import { favicon } from "../lib/palette";

const ORIGIN: Record<string, string> = { live: "live", cache: "cached", recorded: "recorded", synthetic: "synthetic" };

export default function Inspector({ v, r, a, onClose, onDiff }: { v: Vantage; r: VantageResult; a: Analysis | null; onClose: () => void; onDiff: (id: string) => void }) {
  const lone = a?.loneliness[v.id];
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -20, filter: "blur(6px)" }}
      className="glass absolute bottom-4 left-4 top-20 z-10 flex w-[min(360px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl"
    >
      <div className="flex items-start justify-between border-b border-line p-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-cyan">{v.code} · {v.gl.toUpperCase()} · hl={v.hl}</div>
          <div className="font-serif text-2xl leading-tight">{v.label}</div>
          <div className="truncate text-[11.5px] text-dim">{v.location}</div>
        </div>
        <button onClick={onClose} className="rounded-full px-2 text-muted hover:text-fg">✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-3 font-mono text-[10px]">
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted">{ORIGIN[r.origin]}</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted">{r.ms}ms</span>
        {lone != null && <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted">avg similarity {Math.round(lone * 100)}%</span>}
        {r.approx && <span className="rounded bg-amber/10 px-1.5 py-0.5 text-amber">country-level</span>}
        {r.features.map((f) => (
          <span key={f} className="rounded bg-cyan/10 px-1.5 py-0.5 text-cyan/80">{f.replace(/_/g, " ")}</span>
        ))}
      </div>
      {r.q && <div className="px-4 pt-2 text-[12px] text-muted">q: “{r.q}”</div>}
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {r.organic.map((o) => (
          <a key={o.key} href={o.link} target="_blank" rel="noreferrer" className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-[10.5px] text-dim">{o.rank}</span>
            <img src={favicon(o.domain)} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded" loading="lazy" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px]">{o.title}</div>
              <div className="truncate font-mono text-[10px] text-dim">{o.domain}</div>
            </div>
          </a>
        ))}
        {r.local.length > 0 && (
          <div className="mx-2 mt-2 rounded-lg border border-line p-2.5">
            <div className="eyebrow !text-[9.5px]">Local pack</div>
            {r.local.map((l) => (
              <div key={l.title} className="mt-1 flex justify-between text-[12px]">
                <span className="truncate">{l.title}</span>
                {l.rating && <span className="font-mono text-amber">★ {l.rating}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {a && (
        <button onClick={() => onDiff(v.id)} className="m-3 rounded-xl border border-red/30 bg-red/[0.06] py-2 text-[12.5px] text-fg transition hover:bg-red/10">
          Diff against its most different vantage →
        </button>
      )}
    </motion.div>
  );
}
