import Favicon from "./Favicon";
import { useMemo, useState } from "react";
import type { Vantage, VantageResult } from "../lib/types";
import { normalizeDomain, siteReport } from "../lib/derive";

interface Props {
  site: string;
  setSite: (s: string) => void;
  ids: string[];
  vmap: Record<string, Vantage>;
  results: Record<string, VantageResult>;
  suggestions: string[];
}

function rankColor(rank: number | null) {
  if (rank == null) return "#c8442a";
  if (rank <= 3) return "#2f7d4f";
  if (rank <= 6) return "#b9861b";
  return "#8a5a2b";
}

export default function SiteReport({ site, setSite, ids, vmap, results, suggestions }: Props) {
  const [draft, setDraft] = useState(site);
  const rep = useMemo(() => (site ? siteReport(site, ids, results) : null), [site, ids, results]);

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSite(normalizeDomain(draft));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="yourwebsite.in" className="field w-64 py-1.5" aria-label="Website to track" />
      <button className="btn btn-primary py-1.5">Check</button>
      {site && (
        <button type="button" onClick={() => { setSite(""); setDraft(""); }} className="text-[13.5px] text-muted underline">
          Clear
        </button>
      )}
    </form>
  );

  if (!rep)
    return (
      <div className="max-w-2xl">
        {form}
        <p className="mt-3 text-[14px] text-ink-2">
          Enter any website to see where it ranks in each place. This uses the results already fetched, so it's free. Try{" "}
          {suggestions.slice(0, 3).map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              <button onClick={() => { setDraft(s); setSite(s); }} className="underline decoration-rule-2 hover:decoration-ink">{s}</button>
            </span>
          ))}
          .
        </p>
      </div>
    );

  const missing = rep.rows.filter((r) => r.rank == null);

  return (
    <div>
      {form}
      <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-4">
        <div className="bg-card p-4">
          <div className="font-serif text-[36px] font-semibold leading-none tabular-nums">{rep.foundIn}<span className="text-[20px] text-muted">/{ids.length}</span></div>
          <div className="mt-1.5 text-[13.5px] text-ink-2">places show <b>{site}</b> on page one</div>
        </div>
        <div className="bg-card p-4">
          <div className="font-serif text-[36px] font-semibold leading-none tabular-nums">{rep.best ? `#${rep.best}` : "–"}</div>
          <div className="mt-1.5 text-[13.5px] text-ink-2">best rank</div>
        </div>
        <div className="bg-card p-4">
          <div className="font-serif text-[36px] font-semibold leading-none tabular-nums">{rep.avg ? `#${rep.avg}` : "–"}</div>
          <div className="mt-1.5 text-[13.5px] text-ink-2">average rank where it appears</div>
        </div>
        <div className="bg-card p-4">
          <div className="font-serif text-[36px] font-semibold leading-none tabular-nums">{rep.aiCitedIn}<span className="text-[20px] text-muted">/{ids.length}</span></div>
          <div className="mt-1.5 text-[13.5px] text-ink-2">places where Google's AI answer cites it</div>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-5 text-[15px]">
          <b className="text-accent">Not on page one in:</b> {missing.map((m) => vmap[m.id]?.label).join(", ")}.
        </p>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-ink text-left text-[12.5px] text-muted">
                <th className="py-2 font-medium">Place</th>
                <th className="py-2 font-medium">Rank (1–10)</th>
                <th className="py-2 font-medium">Ranking above you</th>
              </tr>
            </thead>
            <tbody>
              {[...rep.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((r) => (
                <tr key={r.id} className="border-b border-rule align-top">
                  <td className="py-2.5 pr-3 font-medium">
                    {vmap[r.id]?.label}
                    {r.aiCited && <span className="ml-2 rounded bg-teal-soft px-1.5 py-0.5 text-[11.5px] font-normal text-teal">AI cites</span>}
                  </td>
                  <td className="w-52 py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-paper-2">
                        {r.rank != null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((11 - r.rank) / 10) * 100}%`, background: rankColor(r.rank) }} />}
                      </div>
                      <span className="num w-20 whitespace-nowrap text-right" style={{ color: rankColor(r.rank) }}>{r.rank ? `#${r.rank}` : "not found"}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-[13px] text-ink-2">
                    {r.ahead.slice(0, 4).map((o) => o.domain).join(", ") || <span className="text-good">nobody, you're #1</span>}
                    {r.ahead.length > 4 && <span className="text-muted"> +{r.ahead.length - 4}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside>
          <div className="font-semibold">Who beats you most often</div>
          <p className="mt-1 text-[13px] text-muted">Sites ranked above {site} (or at the top where it's missing), counted across places.</p>
          <ul className="mt-3 space-y-2">
            {rep.competitors.map(([d, n]) => (
              <li key={d} className="flex items-center gap-2 text-[14px]">
                <Favicon domain={d} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">{d}</span>
                <span className="num text-[12.5px] text-muted">{n} places</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
