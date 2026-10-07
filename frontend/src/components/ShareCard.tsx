import { useRef, useState } from "react";
import { motion } from "motion/react";
import { toPng } from "html-to-image";
import type { Analysis, Vantage } from "../lib/types";
import { groupColor, simColor } from "../lib/palette";
import { headline } from "./Summary";

export default function ShareCard({ analysis, lens, vmap, onClose }: { analysis: Analysis; lens: string; vmap: Record<string, Vantage>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const n = analysis.order.length;
  const cell = Math.min(22, 260 / n);
  const p = analysis.plain;

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#f5f1e8" });
      const a = document.createElement("a");
      a.href = url;
      a.download = `parallax-${analysis.query.replace(/\W+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <motion.div initial={{ y: 12 }} animate={{ y: 0 }} className="max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-full overflow-auto rounded-md border border-rule-2 shadow-2xl">
          <div ref={ref} style={{ width: 1200, height: 630 }} className="relative flex gap-12 bg-paper p-14 text-ink">
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <svg width="22" height="22" viewBox="0 0 64 64"><circle cx="26" cy="32" r="15" fill="none" stroke="#1a1814" strokeWidth="5" /><circle cx="38" cy="32" r="15" fill="none" stroke="#c8442a" strokeWidth="5" /></svg>
                Parallax
              </div>
              <div className="mt-10 text-[17px] text-muted">I searched Google from {n} {lens === "languages" ? "languages" : "places"} for</div>
              <div className="mt-2 line-clamp-2 font-serif text-[56px] font-semibold leading-[1.02]">“{analysis.query}”</div>
              <div className="mt-6 font-serif text-[28px] leading-snug">{headline(analysis, lens).text}</div>
              <div className="mt-auto grid grid-cols-3 gap-6 border-t border-rule pt-6">
                <div>
                  <div className="font-serif text-[48px] font-semibold leading-none">{p.avg_differ}<span className="text-[24px] font-normal text-muted">/{p.avg_len}</span></div>
                  <div className="mt-2 text-[14px] text-ink-2">top links differ between two places</div>
                </div>
                <div>
                  <div className="font-serif text-[48px] font-semibold leading-none">{p.groups}</div>
                  <div className="mt-2 text-[14px] text-ink-2">groups that see similar results</div>
                </div>
                <div>
                  <div className="font-serif text-[48px] font-semibold leading-none">{p.top1_agree}<span className="text-[24px] font-normal text-muted">/{p.places}</span></div>
                  <div className="mt-2 text-[14px] text-ink-2">agree on the #1 result</div>
                </div>
              </div>
            </div>
            <div className="flex w-[320px] flex-col justify-between">
              <svg width={cell * n + 40} height={cell * n + 40}>
                {analysis.order.map((id, i) => (
                  <text key={id} x={34} y={40 + i * cell + cell / 2 + 3} textAnchor="end" fontSize={9} fill="#777166" fontFamily="IBM Plex Mono">{vmap[id]?.code}</text>
                ))}
                {analysis.matrix.map((row, i) => row.map((s, j) => <rect key={`${i}-${j}`} x={40 + j * cell + 1} y={40 + i * cell + 1} width={cell - 2} height={cell - 2} rx={2} fill={i === j ? "#dcd5c7" : simColor(s)} />))}
              </svg>
              <div className="space-y-1.5">
                {analysis.clusters.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: groupColor(i) }} />
                    <span className="truncate text-ink-2">{c.map((id) => vmap[id]?.label).join(", ")}</span>
                  </div>
                ))}
              </div>
              <div className="text-[12px] text-muted">Data: Google via SerpApi · #BuiltWithSerpApi</div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn bg-card">Close</button>
          <button onClick={download} disabled={busy} className="btn btn-primary">{busy ? "Rendering…" : "Download image"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
