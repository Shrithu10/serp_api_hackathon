import { useRef, useState } from "react";
import { motion } from "motion/react";
import { toPng } from "html-to-image";
import type { Analysis, Vantage } from "../lib/types";
import { simColor, vantageColor } from "../lib/palette";

export default function ShareCard({ analysis, vmap, onClose }: { analysis: Analysis; vmap: Record<string, Vantage>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const n = analysis.order.length;
  const cell = Math.min(22, 260 / n);

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#06070a" });
      const a = document.createElement("a");
      a.href = url;
      a.download = `parallax-${analysis.query.replace(/\W+/g, "-").toLowerCase()}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} className="max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-full overflow-auto rounded-2xl border border-line">
          <div ref={ref} style={{ width: 1200, height: 630 }} className="relative overflow-hidden bg-ink p-14 font-sans text-fg">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-red/25 blur-[120px]" />
            <div className="absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan/20 blur-[120px]" />
            <div className="relative flex h-full gap-12">
              <div className="flex flex-1 flex-col">
                <div className="anaglyph font-serif text-5xl" style={{ ["--ax" as string]: 3, ["--ay" as string]: 0 }}>PARALLAX</div>
                <div className="mt-8 font-mono text-sm uppercase tracking-[0.2em] text-muted">I searched</div>
                <div className="mt-2 line-clamp-2 font-serif text-[54px] italic leading-[1.02]">“{analysis.query}”</div>
                <div className="mt-6 text-xl text-muted">
                  from {n} vantages and got <span className="text-fg">{analysis.clusters.length} different realities</span>.
                </div>
                <div className="mt-auto flex items-end gap-10">
                  <div>
                    <div className="font-serif text-[120px] leading-[0.8]">{Math.round(analysis.index)}</div>
                    <div className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">Parallax index · {analysis.verdict}</div>
                  </div>
                  <div className="pb-2 text-[15px] leading-relaxed text-muted">
                    <div>
                      Furthest apart: <span className="text-red">{vmap[analysis.most_different.a]?.label} ↔ {vmap[analysis.most_different.b]?.label}</span>
                    </div>
                    <div>
                      Odd one out: <span className="text-fg">{vmap[analysis.outlier]?.label}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex w-[330px] flex-col justify-between">
                <svg width={cell * n + 40} height={cell * n + 40}>
                  {analysis.order.map((id, i) => (
                    <text key={id} x={34} y={40 + i * cell + cell / 2 + 3} textAnchor="end" fontSize={9} fill="#8a93a3" fontFamily="monospace">
                      {vmap[id]?.code}
                    </text>
                  ))}
                  {analysis.matrix.map((row, i) => row.map((s, j) => <rect key={`${i}${j}`} x={40 + j * cell + 1} y={40 + i * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill={i === j ? "#1a1d26" : simColor(s)} />))}
                </svg>
                <div className="space-y-1.5">
                  {analysis.clusters.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: vantageColor(i) }} />
                      <span className="truncate text-muted">{c.map((id) => vmap[id]?.label).join(", ")}</span>
                    </div>
                  ))}
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">#BuiltWithSerpApi</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm text-muted hover:text-fg">Close</button>
          <button onClick={download} disabled={busy} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
            {busy ? "Rendering…" : "Download PNG"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
