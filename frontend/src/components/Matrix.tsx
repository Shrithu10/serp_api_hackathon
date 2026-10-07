import { useState } from "react";
import type { Analysis, Vantage } from "../lib/types";
import { simColor } from "../lib/palette";

type Mode = "blend" | "url" | "domain";

export default function Matrix({ analysis, vmap, selected, onSelect, onPair }: { analysis: Analysis; vmap: Record<string, Vantage>; selected: string | null; onSelect: (id: string) => void; onPair: (a: string, b: string) => void }) {
  const [mode, setMode] = useState<Mode>("blend");
  const [hover, setHover] = useState<[number, number] | null>(null);
  const m = mode === "blend" ? analysis.matrix : mode === "url" ? analysis.url_matrix : analysis.domain_matrix;
  const ids = analysis.order;
  const n = ids.length;
  const cell = Math.max(22, Math.min(40, 440 / n));
  const pad = 96;

  return (
    <div>
      <div className="mb-4 flex w-fit items-center gap-1 rounded-md border border-rule-2 p-1 text-[13px]">
        {(["blend", "url", "domain"] as Mode[]).map((k) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded px-3 py-1 transition ${mode === k ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
            {k === "blend" ? "Overall" : k === "url" ? "Same pages" : "Same websites"}
          </button>
        ))}
      </div>
      <div className="relative overflow-x-auto">
        <svg width={pad + n * cell + 8} height={pad + n * cell + 8} className="mx-auto block">
          {ids.map((id, i) => (
            <g key={id}>
              <text
                x={pad - 6}
                y={pad + i * cell + cell / 2 + 4}
                textAnchor="end"
                className="cursor-pointer"
                fontSize={12}
                fill={selected === id || hover?.[0] === i ? "#1a1814" : "#777166"}
                onClick={() => onSelect(id)}
              >
                {vmap[id]?.label}
              </text>
              <text
                transform={`translate(${pad + i * cell + cell / 2 + 4}, ${pad - 6}) rotate(-90)`}
                
                fontSize={12}
                fill={selected === id || hover?.[1] === i ? "#1a1814" : "#777166"}
              >
                {vmap[id]?.label}
              </text>
            </g>
          ))}
          {m.map((row, i) =>
            row.map((s, j) => (
              <rect
                key={`${i}-${j}`}
                x={pad + j * cell + 1}
                y={pad + i * cell + 1}
                width={cell - 2}
                height={cell - 2}
                rx={4}
                fill={i === j ? "rgba(26,24,20,0.08)" : simColor(s)}
                stroke={hover && hover[0] === i && hover[1] === j ? "#1a1814" : "transparent"}
                strokeWidth={1.5}
                className="cursor-pointer transition-[fill] duration-500"
                onMouseEnter={() => setHover([i, j])}
                onMouseLeave={() => setHover(null)}
                onClick={() => i !== j && onPair(ids[i], ids[j])}
              />
            )),
          )}
        </svg>
      </div>
      <div className="mt-4 flex min-h-[44px] flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {hover && hover[0] !== hover[1] ? (
            <>
              <span className="text-ink">{vmap[ids[hover[0]]]?.label}</span>
              <span className="text-faint"> ↔ </span>
              <span className="text-ink">{vmap[ids[hover[1]]]?.label}</span>
              <span className="ml-3 text-ink-2">
                share <b className="num text-ink">{analysis.shared_links[hover[0]][hover[1]]}</b> of their top links and <b className="num text-ink">{analysis.shared_sources[hover[0]][hover[1]]}</b> sources ·{" "}
                <b className="num text-teal">{Math.round(m[hover[0]][hover[1]] * 100)}%</b> alike
              </span>
              <span className="ml-2 text-[12px] text-muted">(click to compare)</span>
            </>
          ) : (
            <span className="text-ink-2">Hover a square to see how much two places share. Darker means more alike.</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          different
          <div className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((s) => simColor(s)).join(",")})` }} />
          alike
        </div>
      </div>
    </div>
  );
}
