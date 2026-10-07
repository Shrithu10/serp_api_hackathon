import Favicon from "./Favicon";
import { useMemo, useState } from "react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import { domainMatches } from "../lib/derive";
import { groupColor } from "../lib/palette";

/** Every place's first page, side by side. Click a website to highlight it everywhere. */
export default function ByPlace({ a, vmap, results, site, onOpen }: { a: Analysis; vmap: Record<string, Vantage>; results: Record<string, VantageResult>; site: string; onOpen: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? pick;
  const groupOf = useMemo(() => Object.fromEntries(a.clusters.flatMap((c, i) => c.map((id) => [id, i]))), [a.clusters]);
  const order = useMemo(() => a.clusters.flat(), [a.clusters]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const id of order) new Set(results[id]?.organic.map((o) => o.domain)).forEach((d) => (m[d] = (m[d] || 0) + 1));
    return m;
  }, [order, results]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-2">
        <span>Click any website to highlight it in every column.</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-hl" /> selected website</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-accent" /> appears only in this place</span>
        {site && <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-teal" /> {site}</span>}
        {pick && <button onClick={() => setPick(null)} className="underline">clear selection</button>}
      </div>
      <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 pb-3 md:-mx-8 md:px-8">
        <div className="flex gap-3" style={{ minWidth: order.length * 212 }}>
          {order.map((id) => {
            const r = results[id];
            const g = groupOf[id];
            return (
              <div key={id} className="w-[200px] shrink-0">
                <button onClick={() => onOpen(id)} className="mb-2 w-full border-b-2 pb-1.5 text-left" style={{ borderColor: groupColor(g) }}>
                  <div className="truncate font-serif text-[17px] font-semibold">{vmap[id]?.label}</div>
                  <div className="truncate text-[12px] text-muted">
                    Group {g + 1}
                    {r?.ai_overview.present ? " · AI answer" : ""}
                    {r?.local.length ? " · local results" : ""}
                  </div>
                </button>
                <ol className="space-y-1">
                  {r?.organic.map((o) => {
                    const on = focus === o.domain;
                    const mine = site && domainMatches(o.domain, o.link, site);
                    const lonely = counts[o.domain] === 1;
                    return (
                      <li key={o.key}>
                        <button
                          onClick={() => setPick(pick === o.domain ? null : o.domain)}
                          onMouseEnter={() => setHover(o.domain)}
                          onMouseLeave={() => setHover(null)}
                          title={`${o.title}\n${o.link}`}
                          className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] transition ${
                            mine ? "bg-teal text-paper" : on ? "bg-hl" : focus ? "opacity-35" : ""
                          } ${lonely && !on && !mine ? "outline outline-1 -outline-offset-1 outline-accent/60" : ""}`}
                        >
                          <span className="num w-4 shrink-0 text-right text-[11.5px] opacity-60">{o.rank}</span>
                          <Favicon domain={o.domain} className="h-3.5 w-3.5" />
                          <span className="min-w-0 truncate">{o.domain}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
      {focus && (
        <p className="mt-3 text-[14px]">
          <b>{focus}</b> is on page one in <b>{counts[focus] ?? 0}</b> of {order.length} places.
        </p>
      )}
    </div>
  );
}
