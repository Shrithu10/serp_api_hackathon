import { useState } from "react";
import type { Vantage } from "../lib/types";

interface Props {
  query: string;
  lens: string;
  vantages: Vantage[];
  wording?: Record<string, string>;
  scanId: string | null;
  live: boolean;
  creditsLeft: number | null;
  onClose: () => void;
  onCreated: (watchId: string) => void;
}

const OPTIONS = [
  { h: 24, label: "Every day", per: 30 },
  { h: 72, label: "Every 3 days", per: 10 },
  { h: 168, label: "Every week", per: 4.3 },
];

/** Start tracking the current search, with the credit cost spelled out first. */
export default function TrackDialog({ query, lens, vantages, wording, scanId, live, creditsLeft, onClose, onCreated }: Props) {
  const [h, setH] = useState(168);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const perRun = vantages.length + 2;
  const monthly = Math.round(perRun * (OPTIONS.find((o) => o.h === h)?.per ?? 4.3));

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const custom = vantages.filter((v) => v.id.startsWith("c-"));
      const r = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          lens,
          vantage_ids: vantages.filter((v) => !v.id.startsWith("c-")).map((v) => v.id),
          custom: custom.map((v) => ({ label: v.label, location: v.location, gl: v.gl, hl: v.hl, lat: v.lat, lng: v.lng, region: v.region })),
          wording: wording ?? {},
          interval_h: h,
          scan_id: scanId,
        }),
      });
      if (!r.ok) throw new Error("Could not start tracking");
      onCreated((await r.json()).id);
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-md bg-paper p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[26px]">Track “{query}”</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
          Parallax will re-run this search from the same {vantages.length} places automatically and show how the results change over time. This search counts as the first run.
        </p>
        <div className="mt-5 grid gap-2" role="radiogroup" aria-label="How often">
          {OPTIONS.map((o) => (
            <label key={o.h} className={`flex cursor-pointer items-center justify-between rounded-md border px-4 py-3 ${h === o.h ? "border-ink bg-card" : "border-rule-2"}`}>
              <span className="flex items-center gap-2.5">
                <input type="radio" name="every" checked={h === o.h} onChange={() => setH(o.h)} className="accent-[#1a1814]" />
                {o.label}
              </span>
              {live && <span className="text-[13px] text-muted">≈ {Math.round(perRun * o.per)} searches / month</span>}
            </label>
          ))}
        </div>
        <p className={`mt-4 text-[13.5px] ${live && creditsLeft != null && monthly > creditsLeft ? "text-accent" : "text-ink-2"}`}>
          {live
            ? `Each run uses about ${perRun} SerpApi searches, so this costs ≈ ${monthly} a month${creditsLeft != null ? ` (you have ${creditsLeft} left)` : ""}. You can pause or delete it any time. Runs happen while Parallax is running.`
            : "Demo mode: runs use sample data and no searches."}
        </p>
        {err && <p className="mt-2 text-accent">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={create} disabled={busy} className="btn btn-primary">{busy ? "Starting…" : "Start tracking"}</button>
        </div>
      </div>
    </div>
  );
}
