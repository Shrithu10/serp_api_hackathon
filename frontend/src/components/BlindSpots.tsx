import Favicon from "./Favicon";
import { useMemo, useState } from "react";
import type { Vantage, VantageResult } from "../lib/types";
import { blindSpots } from "../lib/derive";

export default function BlindSpots({ home, setHome, ids, vmap, results }: { home: string; setHome: (id: string) => void; ids: string[]; vmap: Record<string, Vantage>; results: Record<string, VantageResult> }) {
  const { missing, onlyMine } = useMemo(() => blindSpots(home, ids, results), [home, ids, results]);
  const [all, setAll] = useState(false);
  const others = ids.length - 1;
  const shown = all ? missing : missing.slice(0, 8);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[15px]">
        <span>If you search from</span>
        <select value={home} onChange={(e) => setHome(e.target.value)} className="field py-1.5 font-medium">
          {ids.map((id) => (
            <option key={id} value={id}>{vmap[id]?.label}</option>
          ))}
        </select>
        <span>
          you never see <b className="num">{missing.length}</b> sources that other places are shown.
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-2 grid grid-cols-[1fr_130px] gap-4 border-b border-ink pb-2 text-[12.5px] font-medium text-muted">
            <span>Sources missing from your results</span>
            <span>Shown in other places</span>
          </div>
          <ol>
            {shown.map((m) => (
              <li key={m.domain} className="grid grid-cols-[1fr_130px] items-center gap-4 border-b border-rule py-3">
                <div className="flex min-w-0 gap-3">
                  <Favicon domain={m.domain} className="mt-1 h-4 w-4" />
                  <div className="min-w-0">
                    <a href={m.link} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{m.title}</a>
                    <div className="truncate text-[13px] text-muted">
                      {m.domain} · best rank #{m.bestRank} · {m.places.slice(0, 4).map((p) => vmap[p]?.label).join(", ")}
                      {m.places.length > 4 ? ` +${m.places.length - 4}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(m.places.length / others) * 100}%` }} />
                  </div>
                  <span className="num w-10 text-right text-[12.5px] text-ink-2">{m.places.length}/{others}</span>
                </div>
              </li>
            ))}
          </ol>
          {missing.length > 8 && (
            <button onClick={() => setAll(!all)} className="mt-3 text-[14px] underline decoration-rule-2">
              {all ? "Show fewer" : `Show all ${missing.length}`}
            </button>
          )}
          {!missing.length && <p className="text-ink-2">Nothing. Every source anyone else sees, you see too.</p>}
        </div>
        <aside>
          <div className="rounded-md border border-rule bg-card p-4">
            <div className="font-semibold">Only you see these</div>
            <p className="mt-1 text-[13px] text-muted">Sources in {vmap[home]?.label}'s results that no other place was shown.</p>
            <ul className="mt-3 space-y-2">
              {onlyMine.map((o) => (
                <li key={o.key} className="flex gap-2 text-[14px]">
                  <span className="num w-7 shrink-0 text-muted">#{o.rank}</span>
                  <a href={o.link} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">{o.domain}</a>
                </li>
              ))}
              {!onlyMine.length && <li className="text-[14px] text-ink-2">None. Everything here also appears elsewhere.</li>}
            </ul>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Why it matters: most people never scroll past the first page. If a source isn't on yours, for most readers it doesn't exist. Reading a few of the sources above is the quickest way out of the bubble.
          </p>
        </aside>
      </div>
    </div>
  );
}
