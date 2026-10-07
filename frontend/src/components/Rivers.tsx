import { useMemo, useState, type ReactElement } from "react";
import { motion } from "motion/react";
import type { Analysis, Vantage } from "../lib/types";
import { CATEGORY_COLORS, seriesColor } from "../lib/palette";
import { useSize } from "../lib/useSize";

/** Bump chart: every line is a website, every column a vantage. Watch sources rise, sink and vanish. */
export default function Rivers({ analysis, vmap }: { analysis: Analysis; vmap: Record<string, Vantage> }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const ids = analysis.order;
  const W = Math.max(640, width);
  const left = 170;
  const right = 150;
  const top = 36;
  const rowH = 34;
  const H = top + rowH * 11 + 30;
  const x = (i: number) => left + (ids.length === 1 ? 0 : (i * (W - left - right)) / (ids.length - 1));
  const y = (rank: number | null) => (rank == null ? top + rowH * 10.6 : top + (rank - 1) * rowH);

  const rivers = analysis.rivers;
  const color = useMemo(() => Object.fromEntries(rivers.map((r, i) => [r.domain, seriesColor(i)])), [rivers]);

  const curve = (x0: number, y0: number, x1: number, y1: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  };

  return (
    <div ref={ref} className="relative w-full overflow-x-auto">
      <svg width={W} height={H} className="block">
        {/* rank guides */}
        {Array.from({ length: 10 }, (_, k) => (
          <g key={k}>
            <line x1={left - 20} x2={W - right + 20} y1={y(k + 1)} y2={y(k + 1)} stroke="rgba(26,24,20,0.08)" />
            <text x={4} y={y(k + 1) + 4} fontSize={11} fill="#777166">
              #{k + 1}
            </text>
          </g>
        ))}
        <line x1={left - 20} x2={W - right + 20} y1={y(null)} y2={y(null)} stroke="rgba(200,68,42,0.35)" strokeDasharray="2 4" />
        <text x={4} y={y(null) + 4} fontSize={11} fill="#c8442a">
          not on page 1
        </text>
        {ids.map((id, i) => (
          <g key={id}>
            <line x1={x(i)} x2={x(i)} y1={top - 14} y2={y(null) + 10} stroke="rgba(26,24,20,0.08)" />
            <text x={x(i)} y={14} textAnchor="middle" fontSize={12} fontWeight={500} fill="#1a1814">
              {vmap[id]?.label}
            </text>
          </g>
        ))}

        {rivers.map((r, ri) => {
          const dim = hover && hover !== r.domain;
          const c = color[r.domain];
          const segs: ReactElement[] = [];
          for (let i = 0; i < ids.length - 1; i++) {
            const a = r.ranks[ids[i]];
            const b = r.ranks[ids[i + 1]];
            if (a == null && b == null) continue;
            const both = a != null && b != null;
            segs.push(
              <motion.path
                key={i}
                d={curve(x(i), y(a), x(i + 1), y(b))}
                fill="none"
                stroke={c}
                strokeWidth={both ? (hover === r.domain ? 4 : 2.4) : 1.2}
                strokeDasharray={both ? undefined : "3 5"}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: dim ? 0.08 : both ? 0.9 : 0.35 }}
                animate={{ opacity: dim ? 0.08 : both ? 0.9 : 0.35 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: ri * 0.04 + i * 0.03 }}
              />,
            );
          }
          const first = ids.findIndex((id) => r.ranks[id] != null);
          const last = ids.length - 1 - [...ids].reverse().findIndex((id) => r.ranks[id] != null);
          return (
            <g key={r.domain} onMouseEnter={() => setHover(r.domain)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              {segs}
              {ids.map((id, i) => {
                const rank = r.ranks[id];
                if (rank == null) return null;
                return (
                  <g key={id} opacity={dim ? 0.12 : 1}>
                    <circle cx={x(i)} cy={y(rank)} r={hover === r.domain ? 10 : 7.5} fill="#fbf9f4" stroke={c} strokeWidth={2} />
                    {hover === r.domain && (
                      <text x={x(i)} y={y(rank) + 3.5} textAnchor="middle" fontSize={9.5} fill="#1a1814">
                        {rank}
                      </text>
                    )}
                  </g>
                );
              })}
              {hover === r.domain && first > 0 && (
                <text x={x(first)} y={y(r.ranks[ids[first]]) - 14} textAnchor="middle" fontSize={12} fill={c} fontWeight={600}>
                  {r.domain}
                </text>
              )}
              {first === 0 && (
                <text x={x(first) - 16} y={y(r.ranks[ids[first]]) + 4} textAnchor="end" fontSize={11.5} fill={c} opacity={dim ? 0.15 : 1}>
                  {r.domain}
                </text>
              )}
              {last === ids.length - 1 && (
                <text x={x(last) + 16} y={y(r.ranks[ids[last]]) + 4} fontSize={11.5} fill={c} opacity={dim ? 0.15 : 0.9}>
                  {r.domain}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-muted">
        {rivers.map((r) => (
          <button key={r.domain} onMouseEnter={() => setHover(r.domain)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 transition ${hover && hover !== r.domain ? "opacity-40" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: color[r.domain] }} />
            {r.domain}
            <span className="rounded px-1 text-[11px]" style={{ color: CATEGORY_COLORS[r.category], background: CATEGORY_COLORS[r.category] + "1a" }}>
              {r.category}
            </span>
            <span className="text-[11.5px] text-muted">in {Math.round(r.share * 100)}% of places</span>
          </button>
        ))}
      </div>
    </div>
  );
}
