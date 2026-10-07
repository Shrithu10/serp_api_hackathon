import { useEffect, useMemo, useState } from "react";
import type { Config, Vantage } from "../lib/types";
import { normalizeDomain } from "../lib/derive";
import Help from "./Help";

export interface ScanOptions {
  query: string;
  lens: string;
  vantageIds: string[];
  custom: Vantage[];
  home: string;
  site: string;
}

const LENS_LABEL: Record<string, { title: string; sub: string }> = {
  cities: { title: "Indian cities", sub: "Same search from 12 cities" },
  languages: { title: "Indian languages", sub: "Asked in 10 languages" },
  world: { title: "India vs world", sub: "India and 8 other countries" },
};

interface LocRow {
  name: string;
  location: string;
  gl: string;
  lat: number;
  lng: number;
  type: string;
}

function PlaceSearch({ onAdd }: { onAdd: (v: Vantage) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LocRow[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setRows([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then(setRows)
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add another place, e.g. Varanasi" className="field w-64 py-1.5 text-[13.5px]" />
      {rows.length > 0 && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-rule-2 bg-card shadow-lg">
          {rows.map((r) => (
            <button
              key={r.location}
              type="button"
              onClick={() => {
                onAdd({
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
                });
                setQ("");
                setRows([]);
              }}
              className="flex w-full justify-between gap-3 border-b border-rule px-3 py-2 text-left text-[13.5px] last:border-0 hover:bg-paper-2"
            >
              <span className="truncate">{r.location.replace(/,/g, ", ")}</span>
              <span className="shrink-0 text-[12px] text-muted">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  config: Config | null;
  initial?: Partial<ScanOptions>;
  creditsLeft?: number | null;
  compact?: boolean;
  onSubmit: (o: ScanOptions) => void;
  onLensChange?: (id: string) => void;
  busy?: boolean;
}

export default function ScanForm({ config, initial, creditsLeft, compact, onSubmit, onLensChange, busy }: Props) {
  const [query, setQuery] = useState(initial?.query ?? "");
  const [lensId, setLensId] = useState(initial?.lens ?? "cities");
  const lens = config?.lenses.find((l) => l.id === lensId);
  const [selected, setSelected] = useState<string[]>(initial?.vantageIds ?? []);
  const [custom, setCustom] = useState<Vantage[]>(initial?.custom ?? []);
  const [home, setHome] = useState(initial?.home ?? "");
  const [site, setSite] = useState(initial?.site ?? "");
  const [more, setMore] = useState(!compact && !!initial?.site);

  // Re-sync when a use-case card or example fills the form from outside.
  useEffect(() => {
    if (initial?.query !== undefined) setQuery(initial.query);
    if (initial?.lens) setLensId(initial.lens);
    if (initial?.site !== undefined) {
      setSite(initial.site);
      if (initial.site) setMore(true);
    }
  }, [initial?.query, initial?.lens, initial?.site]);

  useEffect(() => {
    onLensChange?.(lensId);
  }, [lensId, onLensChange]);

  useEffect(() => {
    if (!lens) return;
    setSelected((cur) => {
      const valid = cur.filter((id) => lens.vantages.some((v) => v.id === id));
      return valid.length ? valid : lens.vantages.map((v) => v.id);
    });
  }, [lens]);

  const places = useMemo(() => [...(lens?.vantages.filter((v) => selected.includes(v.id)) ?? []), ...custom], [lens, selected, custom]);

  useEffect(() => {
    if (!places.length) return;
    if (!places.some((p) => p.id === home)) {
      let saved = "";
      try {
        saved = localStorage.getItem("parallax.home." + lensId) || "";
      } catch {
        /* storage unavailable */
      }
      setHome(places.some((p) => p.id === saved) ? saved : places[0].id);
    }
  }, [places, home, lensId]);

  const estimate = places.length + 2;
  const tooMany = creditsLeft != null && config?.live && estimate > creditsLeft;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || places.length < 2) return;
    try {
      localStorage.setItem("parallax.home." + lensId, home);
    } catch {
      /* ignore */
    }
    onSubmit({ query: query.trim(), lens: lensId, vantageIds: selected, custom, home, site: normalizeDomain(site) });
  };

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="q">Search</label>
        <input
          id="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you search on Google?"
          className={`field min-w-0 flex-1 ${compact ? "py-2 text-[15px]" : "py-3.5 text-[18px]"}`}
          autoFocus={!compact}
        />
        <button type="submit" disabled={!query.trim() || places.length < 2 || busy || !config} className={`btn btn-primary justify-center ${compact ? "" : "px-6 text-[15px]"}`}>
          {busy ? "Searching…" : `Search ${places.length} ${lensId === "languages" ? "languages" : "places"}`}
        </button>
      </div>

      <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`} role="radiogroup" aria-label="Compare across">
        {config?.lenses.map((l) => {
          const on = l.id === lensId;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLensId(l.id)}
              className={`flex flex-col items-start justify-start rounded-md border px-3.5 py-2.5 text-left transition ${on ? "border-ink bg-card shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-rule-2 hover:border-ink-2"}`}
            >
              <div className="flex items-center gap-2 text-[14.5px] font-medium">
                <span className={`h-3.5 w-3.5 rounded-full border ${on ? "border-[4px] border-ink" : "border-rule-2"}`} />
                {LENS_LABEL[l.id]?.title ?? l.name}
              </div>
              {!compact && <div className="ml-[22px] text-[13px] text-muted">{LENS_LABEL[l.id]?.sub ?? l.tagline}</div>}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
        <label className="flex items-center gap-2">
          <span className="text-ink-2">{lensId === "languages" ? "Your language" : "You are in"}</span>
          <select value={home} onChange={(e) => setHome(e.target.value)} className="field py-1.5 text-[14px]">
            {places.map((p) => (
              <option key={p.id} value={p.id}>{p.label}{lensId === "languages" && p.lang_name !== p.label ? ` (${p.lang_name})` : ""}</option>
            ))}
          </select>
          <Help>We use this to show what you would miss by only searching from here. You can change it later on the results page.</Help>
        </label>
        <button type="button" onClick={() => setMore((m) => !m)} className="text-ink-2 underline decoration-rule-2 hover:decoration-ink">
          {more ? "Hide options" : `Choose places (${places.length}) · track a website`}
        </button>
      </div>

      {more && (
        <div className="mt-4 space-y-4 rounded-md border border-rule bg-card p-4">
          <div>
            <div className="mb-2 flex items-center text-[13.5px] font-medium">
              Places to compare
              <Help>Each place costs one SerpApi search. Untick places to save searches. Results you have fetched in the last 6 hours are reused for free.</Help>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {lens?.vantages.map((v) => {
                const on = selected.includes(v.id);
                return (
                  <label key={v.id} className={`chip cursor-pointer select-none ${on ? "border-ink" : "text-muted"}`}>
                    <input type="checkbox" checked={on} onChange={() => setSelected(on ? selected.filter((x) => x !== v.id) : [...selected, v.id])} className="accent-[#1a1814]" />
                    {v.label}
                  </label>
                );
              })}
              {custom.map((v) => (
                <span key={v.id} className="chip border-ink bg-hl/40">
                  {v.label}
                  <button type="button" aria-label={`Remove ${v.label}`} onClick={() => setCustom(custom.filter((c) => c.id !== v.id))} className="text-muted hover:text-ink">×</button>
                </span>
              ))}
              <PlaceSearch onAdd={(v) => !custom.some((c) => c.id === v.id) && setCustom([...custom, v])} />
            </div>
          </div>
          <div>
            <label className="mb-2 flex items-center text-[13.5px] font-medium" htmlFor="site">
              Track a website <span className="ml-1 font-normal text-muted">(optional)</span>
              <Help>Enter your business, newspaper or any site. We show where it ranks in every place, where it is missing and who ranks above it. This costs no extra searches.</Help>
            </label>
            <input id="site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. yourshop.in" className="field w-full max-w-sm py-1.5 text-[14px]" />
          </div>
        </div>
      )}

      <div className={`mt-3 text-[13px] ${tooMany ? "text-accent" : "text-muted"}`}>
        {config?.live
          ? tooMany
            ? `This needs about ${estimate} searches but your SerpApi account has ${creditsLeft} left. Untick some places.`
            : `Uses about ${estimate} SerpApi searches${creditsLeft != null ? ` (you have ${creditsLeft} left)` : ""}. Repeats within 6 hours are free.`
          : "Demo mode: uses no searches. Results are sample data until you add a SerpApi key."}
      </div>
    </form>
  );
}
