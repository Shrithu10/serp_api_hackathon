import { useState } from "react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import { favicon } from "../lib/palette";

/** Does Google's AI say the same thing everywhere? Presence + cited sources per vantage. */
export default function AiLens({ analysis, vmap, results }: { analysis: Analysis; vmap: Record<string, Vantage>; results: Record<string, VantageResult> }) {
  const ids = analysis.order;
  const [open, setOpen] = useState<string | null>(ids.find((i) => analysis.ai[i]?.present) ?? null);
  const allRefs = [...new Set(ids.flatMap((i) => analysis.ai[i]?.refs || []))];
  const counts = Object.fromEntries(allRefs.map((d) => [d, ids.filter((i) => analysis.ai[i]?.refs.includes(d)).length]));
  allRefs.sort((a, b) => counts[b] - counts[a]);
  const cols = allRefs.slice(0, 12);
  const present = ids.filter((i) => analysis.ai[i]?.present).length;
  const ov = open ? results[open]?.ai_overview : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-4 flex flex-wrap gap-6">
          <div>
            <div className="font-serif text-5xl">
              {present}
              <span className="text-2xl text-dim">/{ids.length}</span>
            </div>
            <div className="eyebrow mt-1">vantages got an AI Overview</div>
          </div>
          <div>
            <div className="font-serif text-5xl">{analysis.ai_ref_overlap == null ? "—" : `${Math.round(analysis.ai_ref_overlap * 100)}%`}</div>
            <div className="eyebrow mt-1">citation overlap</div>
          </div>
        </div>
        {cols.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-[11px]">
              <thead>
                <tr>
                  <th />
                  {cols.map((d) => (
                    <th key={d} className="h-28 align-bottom">
                      <div className="w-5 origin-bottom-left translate-x-3 -rotate-60 whitespace-nowrap text-left font-mono font-normal text-muted">{d}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => (
                  <tr key={id} onClick={() => setOpen(id)} className="cursor-pointer">
                    <td className={`pr-2 font-mono ${open === id ? "text-cyan" : "text-muted"}`}>{vmap[id]?.code}</td>
                    {cols.map((d) => {
                      const on = analysis.ai[id]?.refs.includes(d);
                      return <td key={d}><div className={`h-5 w-5 rounded-[5px] ${on ? "bg-violet shadow-[0_0_12px_rgba(155,140,255,0.6)]" : analysis.ai[id]?.present ? "bg-white/[0.05]" : "bg-transparent border border-dashed border-white/[0.06]"}`} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-dim">No AI Overview citations for this query.</div>
        )}
      </div>
      <div className="rounded-2xl border border-violet/25 bg-violet/[0.04] p-5">
        <div className="flex items-center justify-between">
          <div className="eyebrow !text-violet">AI Overview · {open ? vmap[open]?.label : "—"}</div>
          <div className="flex gap-1">
            {ids.map((id) => (
              <button key={id} onClick={() => setOpen(id)} title={vmap[id]?.label} className={`h-2 w-2 rounded-full ${open === id ? "bg-violet" : analysis.ai[id]?.present ? "bg-violet/30" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
        {ov?.present ? (
          <>
            <div className="mt-3 max-h-[260px] overflow-y-auto whitespace-pre-line pr-2 text-[14px] leading-relaxed text-fg/85">{ov.text || "AI Overview present (content loads lazily)."}</div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(ov.refs || []).slice(0, 8).map((r, i) => (
                <a key={i} href={r.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11.5px] text-muted hover:text-fg">
                  <img src={favicon(r.domain)} alt="" className="h-3.5 w-3.5 rounded" loading="lazy" />
                  {r.domain}
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 font-serif text-2xl italic text-dim">Google's AI stayed silent here.</div>
        )}
      </div>
    </div>
  );
}
