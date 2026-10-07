import type { Analysis, Vantage } from "../lib/types";
import { CATEGORY_COLORS } from "../lib/palette";

const FEATURE_LABEL: Record<string, string> = {
  ai_overview: "AI Overview",
  knowledge_graph: "Knowledge",
  answer_box: "Answer",
  top_stories: "Stories",
  local_results: "Local",
  related_questions: "PAA",
  inline_videos: "Videos",
  inline_images: "Images",
  shopping_results: "Shopping",
  immersive_products: "Products",
  discussions_and_forums: "Forums",
  twitter_results: "X",
  perspectives: "Perspectives",
};

export default function Anatomy({ analysis, vmap }: { analysis: Analysis; vmap: Record<string, Vantage> }) {
  const ids = analysis.order;
  const feats = analysis.all_features;
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <div>
        <div className="label mb-3">Who gets heard: the kind of websites in each top 10</div>
        <div className="space-y-1.5">
          {ids.map((id) => {
            const t = analysis.taxonomy[id];
            const total = Object.values(t).reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={id} className="flex items-center gap-3">
                <div className="w-24 shrink-0 truncate text-[12.5px] text-muted">{vmap[id]?.label}</div>
                <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-paper-2">
                  {analysis.categories.map((c) =>
                    t[c] ? (
                      <div key={c} title={`${c}: ${t[c]}`} className="h-full transition-all duration-700 first:rounded-l-md last:rounded-r-md" style={{ width: `${(t[c] / total) * 100}%`, background: CATEGORY_COLORS[c], opacity: 0.85 }} />
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
          {analysis.categories.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
              {c}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="label mb-3">What else is on the page (AI answer, videos, local map, etc.)</div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {feats.map((f) => (
                  <th key={f} className="px-0.5 pb-1 text-center text-[11.5px] font-normal text-muted">
                    {FEATURE_LABEL[f] || f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id}>
                  <td className="whitespace-nowrap pr-2 text-[12.5px] text-ink-2">{vmap[id]?.label}</td>
                  {feats.map((f) => {
                    const on = analysis.features[id]?.includes(f);
                    return (
                      <td key={f} className="text-center">
                        <div className={`mx-auto h-5 w-full min-w-7 rounded-md ${on ? "bg-teal" : "bg-paper-2"}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="xl:col-span-2">
        <div className="label mb-3">Words that show up unusually often in each place's results</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ids.map((id) => (
            <div key={id} className="rounded-xl border border-rule bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px]">{vmap[id]?.label}</span>
                <span className="text-[11.5px] text-muted">{(analysis.scripts[id] || []).some(([s]) => s !== "Latin") ? (analysis.scripts[id] || []).map(([s, n]) => `${s === "Latin" ? "English/Latin" : s} ${n}`).join(" · ") : ""}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(analysis.terms[id] || []).map((t) => (
                  <span key={t.term} className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[12px]" style={{ fontSize: 11 + Math.min(5, t.z) }}>
                    {t.term}
                  </span>
                ))}
                {!(analysis.terms[id] || []).length && <span className="text-[12px] text-faint">—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
