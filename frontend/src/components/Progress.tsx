import type { ScanState } from "../lib/types";

/** Friendly live checklist while searches are in flight. */
export default function Progress({ state }: { state: ScanState }) {
  const total = state.vantages.length;
  const done = Object.values(state.statuses).filter((s) => s !== "pending").length;
  const stage =
    state.status === "scanning"
      ? done < total
        ? `Searching Google from ${total} places… ${done} of ${total} back`
        : "Comparing the results…"
      : state.status === "analyzing"
        ? "Writing up what we found…"
        : "Done";
  return (
    <div>
      <div className="flex items-center justify-between text-[14px]">
        <span className="font-medium">{stage}</span>
        <span className="num text-muted">{Math.round((done / Math.max(1, total)) * 100)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
      </div>
      <ul className="mt-4 grid gap-x-6 sm:grid-cols-2">
        {state.vantages.map((v) => {
          const st = state.statuses[v.id];
          const r = state.results[v.id];
          return (
            <li key={v.id} className="flex items-center gap-3 border-b border-rule py-2 text-[14px]">
              <span className="flex h-5 w-5 items-center justify-center">
                {st === "ok" ? (
                  <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#2f7d4f" strokeWidth="2.2" /></svg>
                ) : st === "error" ? (
                  <span className="text-accent">✕</span>
                ) : (
                  <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {v.label}
                {v.lang_name !== "English" && v.label !== v.lang_name && <span className="text-muted"> · {v.lang_name}</span>}
              </span>
              <span className="text-[12.5px] text-muted">
                {st === "ok" && r ? `${r.organic.length} links${r.ai_overview.present ? " · AI answer" : ""}` : st === "error" ? "failed" : "searching"}
              </span>
            </li>
          );
        })}
      </ul>
      {Object.keys(state.errors).length > 0 && (
        <p className="mt-3 text-[13px] text-accent">
          Some places failed: {Object.entries(state.errors).map(([id, e]) => `${state.vantages.find((v) => v.id === id)?.label} (${e.slice(0, 80)})`).join("; ")}. The comparison uses the places that worked.
        </p>
      )}
    </div>
  );
}
