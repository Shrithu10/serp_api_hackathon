import { useState } from "react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import Favicon from "./Favicon";
import Help from "./Help";

/** Does Google's AI answer appear everywhere, and does it lean on the same sources? */
export default function AiLens({ analysis, vmap, results }: { analysis: Analysis; vmap: Record<string, Vantage>; results: Record<string, VantageResult> }) {
  const ids = analysis.order;
  const withAi = ids.filter((i) => analysis.ai[i]?.present);
  const [open, setOpen] = useState<string | null>(withAi[0] ?? null);
  const allRefs = [...new Set(ids.flatMap((i) => analysis.ai[i]?.refs || []))];
  const counts = Object.fromEntries(allRefs.map((d) => [d, ids.filter((i) => analysis.ai[i]?.refs.includes(d)).length]));
  allRefs.sort((a, b) => counts[b] - counts[a]);
  const cols = allRefs.slice(0, 10);
  const ov = open ? results[open]?.ai_overview : null;
  const overlap = analysis.ai_ref_overlap;

  if (!withAi.length) return <p className="text-[16px] text-ink-2">Google didn't show an AI answer in any of these places for this search.</p>;

  return (
    <div>
      <p className="max-w-3xl font-serif text-[21px] leading-snug">
        Google showed an AI answer in <b>{withAi.length} of {ids.length}</b> places.
        {overlap != null && (
          <>
            {" "}Between any two of them, on average <b>{Math.round(overlap * 100)}%</b> of the cited sources are the same.
            <Help>Measured as the overlap of cited websites (shared ÷ combined) between every pair of places that got an AI answer.</Help>
          </>
        )}
        {withAi.length < ids.length && <> The rest saw no AI answer at all: {ids.filter((i) => !analysis.ai[i]?.present).map((i) => vmap[i]?.label).join(", ")}.</>}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[auto_1fr]">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[3px] text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left align-bottom text-[12px] font-medium text-muted">Cited source →</th>
                {cols.map((d) => (
                  <th key={d} className="h-28 align-bottom">
                    <div className="w-5 origin-bottom-left translate-x-3 -rotate-60 whitespace-nowrap text-left font-normal text-ink-2">{d}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const present = analysis.ai[id]?.present;
                return (
                  <tr key={id} onClick={() => present && setOpen(id)} className={present ? "cursor-pointer" : ""}>
                    <td className={`whitespace-nowrap pr-3 ${open === id ? "font-semibold text-ink" : present ? "text-ink-2" : "text-faint"}`}>{vmap[id]?.label}</td>
                    {present ? (
                      cols.map((d) => (
                        <td key={d}>
                          <div className={`h-5 w-5 rounded-sm ${analysis.ai[id]?.refs.includes(d) ? "bg-teal" : "bg-paper-2"}`} />
                        </td>
                      ))
                    ) : (
                      <td colSpan={cols.length} className="text-[12px] italic text-faint">no AI answer</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="rounded-md border border-rule bg-card p-5">
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-muted">AI answer seen in</span>
            <select value={open ?? ""} onChange={(e) => setOpen(e.target.value)} className="field py-1 font-medium">
              {withAi.map((id) => (
                <option key={id} value={id}>{vmap[id]?.label}</option>
              ))}
            </select>
          </label>
          {ov?.present && (
            <>
              <div className="mt-4 max-h-[280px] overflow-y-auto whitespace-pre-line pr-2 text-[15px] leading-relaxed">{ov.text || "Google showed an AI answer here, but its text could not be retrieved."}</div>
              {!!ov.refs?.length && (
                <>
                  <div className="mt-4 text-[12.5px] font-medium text-muted">Sources it cited</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ov.refs.slice(0, 10).map((r, i) => (
                      <a key={i} href={r.link} target="_blank" rel="noreferrer" className="chip hover:border-ink">
                        <Favicon domain={r.domain} className="h-3.5 w-3.5" />
                        {r.domain}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
