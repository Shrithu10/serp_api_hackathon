import { motion } from "motion/react";
import type { Analysis, Vantage } from "../lib/types";
import { CATEGORY_COLORS, favicon } from "../lib/palette";

export default function Exclusives({ analysis, vmap }: { analysis: Analysis; vmap: Record<string, Vantage> }) {
  const ids = [...analysis.ids].sort((a, b) => (analysis.exclusives[b]?.length || 0) - (analysis.exclusives[a]?.length || 0));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {ids.map((id, k) => {
          const ex = analysis.exclusives[id] || [];
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: k * 0.05 }}
              className="w-[270px] shrink-0 snap-start rounded-2xl border border-line bg-black/30 p-4"
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="eyebrow !text-[10px]">Only in</div>
                  <div className="font-serif text-2xl">{vmap[id]?.label}</div>
                </div>
                <div className={`font-mono text-3xl ${ex.length ? "text-red" : "text-dim"}`}>{ex.length}</div>
              </div>
              <div className="mt-3 space-y-2">
                {ex.slice(0, 5).map((e) => (
                  <a key={e.link} href={e.link} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-lg p-1.5 text-[12.5px] transition hover:bg-white/5">
                    <img src={favicon(e.domain)} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded" loading="lazy" />
                    <div className="min-w-0">
                      <div className="truncate text-fg">{e.domain}</div>
                      <div className="truncate text-[11.5px] text-dim">#{e.rank} · {e.title}</div>
                    </div>
                    <span className="ml-auto mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[e.category] }} />
                  </a>
                ))}
                {!ex.length && <div className="py-4 text-[12.5px] text-dim">Nothing unique — every source here appears elsewhere too.</div>}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.03] p-5">
        <div className="eyebrow !text-cyan">The shared core</div>
        <div className="mt-1 text-[13px] text-muted">Sources at least ¾ of vantages agree on.</div>
        <div className="mt-4 space-y-2.5">
          {analysis.consensus.map((c) => (
            <div key={c.domain} className="flex items-center gap-3 text-[13px]">
              <img src={favicon(c.domain)} alt="" className="h-4 w-4 rounded" loading="lazy" />
              <span className="min-w-0 flex-1 truncate">{c.domain}</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-cyan" style={{ width: `${c.share * 100}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-[11px] text-dim">~#{c.avg_rank}</span>
            </div>
          ))}
          {!analysis.consensus.length && <div className="text-[13px] text-red">No source is shared by ¾ of vantages. There is no common ground.</div>}
        </div>
      </div>
    </div>
  );
}
