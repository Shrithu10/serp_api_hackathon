import { useEffect, useState } from "react";
import type { Lens, Vantage } from "../lib/types";

interface LocRow {
  name: string;
  location: string;
  gl: string;
  lat: number;
  lng: number;
  type: string;
  reach?: number;
}

interface Props {
  lens: Lens;
  selected: string[];
  setSelected: (ids: string[]) => void;
  custom: Vantage[];
  setCustom: (v: Vantage[]) => void;
  live: boolean;
}

export default function VantagePicker({ lens, selected, setSelected, custom, setCustom, live }: Props) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LocRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => setRows(d))
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const total = selected.length + custom.length;
  const credits = total + 2;

  const add = (r: LocRow) => {
    const v: Vantage = {
      id: "c-" + r.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24),
      label: r.name,
      code: r.name.slice(0, 3).toUpperCase(),
      lat: r.lat,
      lng: r.lng,
      location: r.location,
      gl: r.gl,
      hl: "en",
      google_domain: r.gl === "in" ? "google.co.in" : "google.com",
      lang_name: "English",
      region: r.location.split(",").slice(1).join(", "),
      translate: false,
    };
    if (!custom.find((c) => c.id === v.id)) setCustom([...custom, v]);
    setQ("");
    setRows([]);
    setOpen(false);
  };

  return (
    <div className="mt-6 w-full max-w-4xl text-left">
      <div className="flex flex-wrap items-center gap-1.5">
        {lens.vantages.map((v) => {
          const on = selected.includes(v.id);
          return (
            <button
              key={v.id}
              onClick={() => toggle(v.id)}
              title={`${v.location} · hl=${v.hl} · gl=${v.gl}`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition ${on ? "border-cyan/30 bg-cyan/[0.07] text-fg" : "border-line text-dim line-through decoration-dim/50"}`}
            >
              <span className="font-mono text-[10px] text-muted">{v.code}</span>
              {v.label}
            </button>
          );
        })}
        {custom.map((v) => (
          <button key={v.id} onClick={() => setCustom(custom.filter((c) => c.id !== v.id))} className="flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/[0.08] px-2.5 py-1 text-[12px] text-fg">
            <span className="font-mono text-[10px] text-amber">+</span>
            {v.label}
            <span className="text-muted">×</span>
          </button>
        ))}
        <div className="relative">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="+ add any place on Earth"
            className="w-48 rounded-full border border-dashed border-line-2 bg-transparent px-3 py-1 text-[12px] text-fg outline-none focus:border-amber/50"
          />
          {open && rows.length > 0 && (
            <div className="glass absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl p-1 shadow-2xl">
              {rows.map((r) => (
                <button key={r.location} onMouseDown={() => add(r)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-white/5">
                  <span className="truncate">{r.location}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-muted">{r.type} · {r.gl}</span>
                </button>
              ))}
              <div className="px-3 py-1.5 font-mono text-[10px] text-dim">via SerpApi Locations API</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 font-mono text-[11px] text-dim">
        {total} vantages · ≈{credits} SerpApi searches {live ? "(cached repeats are free)" : "· demo mode uses no credits"}
      </div>
    </div>
  );
}
