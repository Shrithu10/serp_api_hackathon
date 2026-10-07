import { motion } from "motion/react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import { favicon, vantageColor } from "../lib/palette";

interface Props {
  analysis: Analysis;
  vmap: Record<string, Vantage>;
  results: Record<string, VantageResult>;
  onSelect: (id: string) => void;
}

/** Each cluster is a "reality": a group of vantages that see roughly the same page. */
export default function Realities({ analysis, vmap, results, onSelect }: Props) {
  const n = analysis.clusters.length;
  return (
    <div>
      <div className="mb-6 font-serif text-[clamp(28px,4.4vw,56px)] leading-[1.05]">
        This query splits {analysis.ids.every((id) => vmap[id]?.gl === "in") ? "India" : "the planet"} into{" "}
        <span className="anaglyph italic" style={{ ["--ax" as string]: 3, ["--ay" as string]: 0 }}>
          {n} {n === 1 ? "reality" : "realities"}
        </span>
        .
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {analysis.clusters.map((c, ci) => {
          const color = vantageColor(ci);
          // Domains every member of this reality sees.
          const sets = c.map((id) => new Set(results[id]?.organic.map((o) => o.domain)));
          const shared = [...(sets[0] || [])].filter((d) => sets.every((s) => s.has(d)));
          const firstRanks = c.map((id) => results[id]?.organic[0]?.domain).filter(Boolean);
          const top = firstRanks.sort((a, b) => firstRanks.filter((x) => x === b).length - firstRanks.filter((x) => x === a).length)[0];
          return (
            <motion.div
              key={ci}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: ci * 0.08, duration: 0.6 }}
              className="relative overflow-hidden rounded-2xl border border-line bg-black/30 p-5"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: color, opacity: 0.18 }} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="eyebrow" style={{ color }}>Reality {String(ci + 1).padStart(2, "0")}</div>
                  <div className="font-mono text-[11px] text-dim">{c.length} vantage{c.length > 1 ? "s" : ""}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.map((id) => (
                    <button key={id} onClick={() => onSelect(id)} className="rounded-full border px-2.5 py-1 text-[12.5px] transition hover:bg-white/5" style={{ borderColor: color + "55" }}>
                      {vmap[id]?.label}
                    </button>
                  ))}
                </div>
                {top && (
                  <div className="mt-4 flex items-center gap-2 text-[13px] text-muted">
                    <span className="eyebrow !text-[10px]">#1</span>
                    <img src={favicon(top)} className="h-4 w-4 rounded" alt="" loading="lazy" />
                    <span className="text-fg">{top}</span>
                  </div>
                )}
                {c.length > 1 && (
                  <div className="mt-3 text-[12.5px] leading-relaxed text-muted">
                    <span className="text-dim">Shared by all: </span>
                    {shared.slice(0, 6).join(" · ") || "nothing — they only agree in pairs"}
                  </div>
                )}
                {c.length === 1 && (
                  <div className="mt-3 text-[12.5px] leading-relaxed text-muted">
                    <span className="text-dim">A reality of one. Exclusive sources: </span>
                    {(analysis.exclusives[c[0]] || []).slice(0, 4).map((e) => e.domain).join(" · ") || "—"}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
