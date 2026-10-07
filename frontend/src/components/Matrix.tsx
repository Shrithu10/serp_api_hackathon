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
  const pad = 46;

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-full border border-line p-1 text-[12px] w-fit">
        {(["blend", "url", "domain"] as Mode[]).map((k) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-full px-3 py-1 transition ${mode === k ? "bg-fg text-ink" : "text-muted hover:text-fg"}`}>
            {k === "blend" ? "Blended" : k === "url" ? "Same pages" : "Same sources"}
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
                className="cursor-pointer font-mono"
                fontSize={10.5}
                fill={selected === id || hover?.[0] === i ? "#fff" : "#8a93a3"}
                onClick={() => onSelect(id)}
              >
                {vmap[id]?.code}
              </text>
              <text
                transform={`translate(${pad + i * cell + cell / 2 + 4}, ${pad - 6}) rotate(-90)`}
                className="font-mono"
                fontSize={10.5}
                fill={selected === id || hover?.[1] === i ? "#fff" : "#8a93a3"}
              >
                {vmap[id]?.code}
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
                fill={i === j ? "rgba(255,255,255,0.05)" : simColor(s)}
                stroke={hover && hover[0] === i && hover[1] === j ? "#fff" : "transparent"}
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
              <span className="text-fg">{vmap[ids[hover[0]]]?.label}</span>
              <span className="text-dim"> ↔ </span>
              <span className="text-fg">{vmap[ids[hover[1]]]?.label}</span>
              <span className="ml-3 font-mono text-cyan">{Math.round(m[hover[0]][hover[1]] * 100)}% alike</span>
              <span className="ml-2 text-[11px] text-dim">click to diff</span>
            </>
          ) : (
            <span className="text-dim">Rank-biased overlap (p = 0.9): agreement near the top of the page counts most.</span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-dim">
          0%
          <div className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((s) => simColor(s)).join(",")})` }} />
          100%
        </div>
      </div>
    </div>
  );
}
