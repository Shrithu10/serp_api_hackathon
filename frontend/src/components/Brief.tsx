import type { ReactNode } from "react";

/** Tiny Markdown renderer: **bold**, _italic_, bullets, paragraphs. Enough for the field report. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i} className="text-muted">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

export default function Brief({ text, streaming, ai, model }: { text: string; streaming: boolean; ai: boolean; model: string | null }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const [head, ...rest] = lines;
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative h-9 w-9">
            <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-violet to-cyan ${streaming ? "animate-pulse" : ""}`} />
            <div className="absolute inset-[3px] rounded-full bg-ink" />
            <div className="absolute inset-[9px] rounded-full bg-gradient-to-br from-violet to-cyan" />
          </div>
          <div>
            <div className="text-sm font-medium">{ai ? "AI analyst" : "Computed report"}</div>
            <div className="font-mono text-[10px] text-dim">{ai ? model : "deterministic · no LLM"}</div>
          </div>
        </div>
        <p className="text-[12.5px] leading-relaxed text-dim">
          {ai
            ? "Claude reads the divergence metrics plus every vantage's ranked results, then writes up what a person in each place would come away believing."
            : "Add ANTHROPIC_API_KEY to have Claude write this report. Until then, PARALLAX narrates the computed metrics."}
        </p>
      </div>
      <div className="min-h-[160px] text-[15.5px] leading-[1.75] text-fg/85">
        {!text && <div className="shimmer h-24 rounded-xl" />}
        {head && <div className="mb-4 font-serif text-[26px] leading-snug text-fg">{inline(head.replace(/^#+\s*/, ""))}</div>}
        <div className={streaming ? "caret" : ""}>
          {rest.map((l, i) => {
            const bullet = /^\s*[-*•]\s+/.test(l);
            const clean = l.replace(/^\s*[-*•]\s+/, "").replace(/^#+\s*/, "");
            if (bullet)
              return (
                <div key={i} className="mb-2.5 flex gap-3">
                  <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
                  <span>{inline(clean)}</span>
                </div>
              );
            if (clean.toLowerCase().startsWith("blind spot"))
              return (
                <div key={i} className="mt-4 rounded-xl border border-red/30 bg-red/[0.06] px-4 py-3 text-[14.5px]">
                  {inline(clean)}
                </div>
              );
            return <p key={i} className="mb-2.5">{inline(clean)}</p>;
          })}
        </div>
      </div>
    </div>
  );
}
