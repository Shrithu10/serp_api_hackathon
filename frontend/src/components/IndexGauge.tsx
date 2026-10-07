import { useEffect, useState } from "react";
import { animate } from "motion/react";
import type { Analysis } from "../lib/types";

export default function IndexGauge({ analysis, progress }: { analysis: Analysis | null; progress: number }) {
  const [val, setVal] = useState(0);
  const target = analysis?.ok ? analysis.index : 0;

  useEffect(() => {
    const c = animate(0, target, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: setVal });
    return () => c.stop();
  }, [target]);

  const R = 92;
  const C = Math.PI * R; // half circle
  const frac = analysis?.ok ? val / 100 : progress;
  const ticks = Array.from({ length: 41 }, (_, i) => i / 40);

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 240 140" className="w-full max-w-[340px]">
        <defs>
          <linearGradient id="g-arc" x1="0" x2="1">
            <stop offset="0" stopColor="#5ef2ff" />
            <stop offset="0.55" stopColor="#9b8cff" />
            <stop offset="1" stopColor="#ff4d6d" />
          </linearGradient>
          <filter id="g-glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {ticks.map((t) => {
          const a = Math.PI * (1 - t);
          const r1 = R + 12;
          const r2 = Math.round(t * 40) % 5 === 0 ? R + 21 : R + 16;
          return (
            <line
              key={t}
              x1={120 + Math.cos(a) * r1}
              y1={124 - Math.sin(a) * r1}
              x2={120 + Math.cos(a) * r2}
              y2={124 - Math.sin(a) * r2}
              stroke={t <= frac ? "rgba(233,236,241,0.6)" : "rgba(255,255,255,0.1)"}
              strokeWidth={1}
            />
          );
        })}
        <path d={`M ${120 - R} 124 A ${R} ${R} 0 0 1 ${120 + R} 124`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
        <path d={`M ${120 - R} 124 A ${R} ${R} 0 0 1 ${120 + R} 124`} fill="none" stroke="url(#g-arc)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} filter="url(#g-glow)" opacity="0.6" />
        <path d={`M ${120 - R} 124 A ${R} ${R} 0 0 1 ${120 + R} 124`} fill="none" stroke="url(#g-arc)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} />
      </svg>
      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center">
        {analysis?.ok ? (
          <>
            <div className="font-serif text-[76px] leading-none tracking-tight tabular-nums">{val.toFixed(0)}</div>
            <div className="eyebrow mt-1">Parallax index</div>
          </>
        ) : (
          <>
            <div className="font-mono text-4xl tabular-nums text-cyan">{Math.round(progress * 100)}%</div>
            <div className="eyebrow mt-2">vantages reporting</div>
          </>
        )}
      </div>
      {analysis?.ok && (
        <div className="mt-2 text-center">
          <div className="font-serif text-3xl italic">{analysis.verdict}</div>
          <div className="mt-1 text-sm text-muted">{analysis.verdict_blurb}</div>
        </div>
      )}
    </div>
  );
}
