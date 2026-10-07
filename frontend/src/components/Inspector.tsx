import Favicon from "./Favicon";
import { motion } from "motion/react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";

const ORIGIN: Record<string, string> = { live: "Live from Google", cache: "Saved copy (under 6 h old)", recorded: "Recorded result", synthetic: "Demo sample" };

export default function Inspector({ v, r, a, onClose, onDiff }: { v: Vantage; r: VantageResult; a: Analysis | null; onClose: () => void; onDiff: (id: string) => void }) {
  const lone = a?.loneliness[v.id];
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="absolute bottom-3 left-3 top-3 z-10 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-md border border-rule-2 bg-card shadow-xl"
    >
      <div className="flex items-start justify-between border-b border-rule p-4">
        <div className="min-w-0">
          <div className="font-serif text-[22px] font-semibold leading-tight">{v.label}</div>
          <div className="truncate text-[12.5px] text-muted">{v.location.replace(/,(\S)/g, ", $1")} · {v.lang_name}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="px-2 text-[18px] text-muted hover:text-ink">×</button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-3 text-[12px]">
        <span className="rounded bg-paper-2 px-1.5 py-0.5 text-ink-2">{ORIGIN[r.origin]}</span>
        {lone != null && <span className="rounded bg-paper-2 px-1.5 py-0.5 text-ink-2">{Math.round(lone * 100)}% alike to others</span>}
        {r.approx && <span className="rounded bg-[#fbf3dc] px-1.5 py-0.5 text-gold">country-level only</span>}
        {r.ai_overview.present && <span className="rounded bg-teal-soft px-1.5 py-0.5 text-teal">AI answer shown</span>}
      </div>
      {r.q && r.q !== a?.query && <div className="px-4 pt-2 text-[13px] text-ink-2">Searched as: “{r.q}”</div>}
      <ol className="flex-1 overflow-y-auto px-2 py-2">
        {r.organic.map((o) => (
          <li key={o.key}>
            <a href={o.link} target="_blank" rel="noreferrer" className="flex gap-2.5 rounded px-2 py-1.5 hover:bg-paper-2">
              <span className="num w-5 shrink-0 pt-0.5 text-right text-[12px] text-muted">{o.rank}</span>
              <Favicon domain={o.domain} className="mt-1 h-4 w-4" />
              <div className="min-w-0">
                <div className="truncate text-[13.5px]">{o.title}</div>
                <div className="truncate text-[12px] text-muted">{o.domain}</div>
              </div>
            </a>
          </li>
        ))}
        {r.local.length > 0 && (
          <li className="mx-2 mt-2 rounded border border-rule p-2.5">
            <div className="label">Local results (map pack)</div>
            {r.local.map((l) => (
              <div key={l.title} className="mt-1 flex justify-between text-[13px]">
                <span className="truncate">{l.title}</span>
                {l.rating && <span className="num text-gold">★ {l.rating}</span>}
              </div>
            ))}
          </li>
        )}
      </ol>
      {a && (
        <button onClick={() => onDiff(v.id)} className="btn btn-ghost m-3 justify-center">
          Compare with the most different place →
        </button>
      )}
    </motion.div>
  );
}
