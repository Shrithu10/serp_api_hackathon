import { useEffect, useState } from "react";
import type { SavedScan } from "../lib/types";
import { timeAgo } from "../lib/derive";

const LENS: Record<string, string> = { cities: "Indian cities", languages: "Indian languages", world: "India vs world" };

export default function History({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<SavedScan[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/scans?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => r.json())
        .then(setRows)
        .catch(() => setRows([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this saved search?")) return;
    await fetch(`/api/scans/${id}`, { method: "DELETE" });
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-12 md:px-8">
      <h1 className="text-[36px]">Your searches</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Every search is saved on this computer. Opening one is instant and doesn't use any SerpApi searches. Run the same search again later and the results page will tell you what changed.
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by search words" className="field mt-6 w-full max-w-sm" />
      <div className="mt-6 border-t border-ink">
        {rows === null && <p className="py-6 text-muted">Loading…</p>}
        {rows?.length === 0 && <p className="py-6 text-ink-2">{q ? "Nothing matches that." : "No searches yet. Run one from “New search”."}</p>}
        {rows?.map((s) => (
          <div key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-4 sm:grid-cols-[1fr_200px_120px_auto]">
            <button onClick={() => onOpen(s.id)} className="min-w-0 text-left">
              <div className="truncate font-serif text-[20px] font-semibold hover:underline">“{s.query}”</div>
              <div className="text-[13px] text-muted">
                {LENS[s.lens] ?? s.lens} · {s.summary.places} places{s.summary.synthetic ? " · demo data" : ""}
              </div>
            </button>
            <div className="hidden text-[13.5px] text-ink-2 sm:block">
              {s.summary.avg_differ != null ? <><b className="num">{s.summary.avg_differ}</b> of {Math.round(s.summary.avg_len ?? 10)} links differ</> : "—"}
              {s.summary.top1 && <div className="truncate text-[12.5px] text-muted">#1 mostly {s.summary.top1}</div>}
            </div>
            <div className="hidden text-[13px] text-muted sm:block">{timeAgo(s.created_at)}</div>
            <div className="flex gap-2">
              <button onClick={() => onOpen(s.id)} className="btn btn-ghost py-1.5">Open</button>
              <button onClick={() => remove(s.id)} aria-label="Delete" className="px-2 text-muted hover:text-accent">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
