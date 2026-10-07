import { useMemo, useState } from "react";
import type { Analysis, Vantage, VantageResult } from "../lib/types";
import { wordDiff, type DiffPart } from "../lib/textdiff";
import Help from "./Help";
import ShareInsight from "./ShareInsight";

function Text({ parts, tone }: { parts: DiffPart[]; tone: "left" | "right" }) {
  return (
    <p className="whitespace-pre-line text-[15px] leading-[1.75]">
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i} className="text-ink-2">{p.text}</span>
        ) : (
          <mark key={i} className={`rounded-sm px-0.5 text-ink ${tone === "left" ? "bg-accent-soft" : "bg-teal-soft"}`}>
            {p.text}
          </mark>
        ),
      )}
    </p>
  );
}

/** Two places' AI Overview answers, with the wording that differs highlighted. */
export default function AiDiff({ a, vmap, results, sample }: { a: Analysis; vmap: Record<string, Vantage>; results: Record<string, VantageResult>; sample: boolean }) {
  const withText = a.order.filter((id) => (results[id]?.ai_overview?.text || "").trim().length > 20);
  const [pair, setPair] = useState<[string, string]>(() =>
    a.ai_text ? [a.ai_text.most_different.a, a.ai_text.most_different.b] : [withText[0], withText[1]],
  );
  const [x, y] = pair;
  const d = useMemo(() => wordDiff(results[x]?.ai_overview?.text || "", results[y]?.ai_overview?.text || ""), [results, x, y]);

  if (withText.length < 2)
    return <p className="text-ink-2">Fewer than two places got an AI answer with text, so there is nothing to compare word by word.</p>;

  const pct = d.total ? Math.round((d.shared / d.total) * 100) : 0;
  const pick = (side: 0 | 1) => (
    <select
      value={pair[side]}
      onChange={(e) => setPair(side === 0 ? [e.target.value, y] : [x, e.target.value])}
      className="field py-1.5 font-serif text-[18px] font-semibold"
      aria-label={side === 0 ? "First place" : "Second place"}
    >
      {withText.map((id) => (
        <option key={id} value={id}>{vmap[id]?.label}</option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl font-serif text-[21px] leading-snug">
          Asked the same thing, Google's AI in <b>{vmap[x]?.label}</b> and <b>{vmap[y]?.label}</b> uses the same wording for {pct < 90 ? "only " : ""}
          <span className="mark">{pct}%</span> of its answer.
          <Help wide>
            Word-by-word comparison of the two AI Overview texts (longest common sequence of words). Highlighted words appear in one answer but not the other. Different wording isn't automatically a different claim, so read the highlights.
          </Help>
        </p>
        {a.ai_text && (
          <div className="text-[13.5px] text-ink-2">
            Across all {a.ai_text.n} AI answers, wording overlaps <b className="num">{Math.round(a.ai_text.avg_similarity * 100)}%</b> on average.
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-rule bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {pick(0)}
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted"><span className="h-3 w-3 rounded-sm bg-accent-soft" /> only in this answer</span>
          </div>
          <Text parts={d.left} tone="left" />
        </div>
        <div className="rounded-md border border-rule bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {pick(1)}
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted"><span className="h-3 w-3 rounded-sm bg-teal-soft" /> only in this answer</span>
          </div>
          <Text parts={d.right} tone="right" />
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Grey text is shared by both answers. The default pair is the two places whose AI answers are worded most differently.
      </p>
      <ShareInsight
        sample={sample}
        text={`Searching Google for “${a.query}” from ${vmap[x]?.label} vs ${vmap[y]?.label}: the AI Overview answers share only ${pct}% of their wording.`}
      />
    </div>
  );
}
