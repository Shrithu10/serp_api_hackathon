import { useCallback, useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import type { Watch } from "../lib/types";
import { timeAgo } from "../lib/derive";
import { useSize } from "../lib/useSize";
import Favicon from "./Favicon";
import Help from "./Help";

const LENS: Record<string, string> = { cities: "Indian cities", languages: "Indian languages", world: "India vs world" };

export function every(h: number) {
  if (h % 168 === 0) return h === 168 ? "every week" : `every ${h / 168} weeks`;
  if (h % 24 === 0) return h === 24 ? "every day" : `every ${h / 24} days`;
  return `every ${h} h`;
}

function when(sec: number | null) {
  if (!sec) return "—";
  const d = sec - Date.now() / 1000;
  if (d <= 60) return "any minute now";
  if (d < 3600) return `in ${Math.round(d / 60)} min`;
  if (d < 86400) return `in ${Math.round(d / 3600)} h`;
  return `in ${Math.round(d / 86400)} days`;
}

const day = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** One line over time, with every run marked. */
function Line({ title, help, values, times, fmt, max, color }: { title: string; help: string; values: (number | null)[]; times: number[]; fmt: (v: number) => string; max: number; color: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const W = Math.max(200, width - 34); // inner width (card has 16px padding each side)
  const H = 120;
  const pad = { l: 4, r: 4, t: 14, b: 22 };
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  const x = d3.scaleLinear().domain([0, Math.max(1, values.length - 1)]).range([pad.l, W - pad.r]);
  const y = d3.scaleLinear().domain([0, max]).range([H - pad.b, pad.t]);
  const line = d3.line<readonly [number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(d3.curveMonotoneX);
  const last = pts[pts.length - 1];
  const first = pts[0];
  // Compare the numbers as displayed, so the label never disagrees with what you read.
  const shown = (v: number) => Number(fmt(v).replace("%", ""));
  const delta = last && first ? Math.round((shown(last[1]) - shown(first[1])) * 10) / 10 : 0;
  return (
    <div ref={ref} className="rounded-md border border-rule bg-card p-4">
      <div className="flex items-center text-[13.5px] font-medium">
        {title}
        <Help>{help}</Help>
      </div>
      {last && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-[26px] font-semibold">{fmt(last[1])}</span>
          {pts.length > 1 && (
            <span className="text-[12.5px] text-muted">
              {delta === 0 ? "no change since the first run" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}${fmt(0).endsWith("%") ? " pts" : ""} since the first run`}
            </span>
          )}
        </div>
      )}
      <svg width={W} height={H} className="mt-2 block overflow-visible">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#dcd5c7" />
        <path d={line(pts) || ""} fill="none" stroke={color} strokeWidth={2} />
        {pts.map(([i, v]) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#fbf9f4" stroke={color} strokeWidth={1.6}>
            <title>{`${day(times[i])}: ${fmt(v)}`}</title>
          </circle>
        ))}
        {times.length > 0 && (
          <>
            <text x={pad.l} y={H - 4} fontSize={11} fill="#777166">{day(times[0])}</text>
            <text x={W - pad.r} y={H - 4} fontSize={11} fill="#777166" textAnchor="end">{day(times[times.length - 1])}</text>
          </>
        )}
      </svg>
    </div>
  );
}

function Detail({ w, onChange, onOpenScan, onDeleted, live }: { w: Watch; onChange: (w: Watch) => void; onOpenScan: (id: string) => void; onDeleted: () => void; live: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runs = w.history;
  const times = runs.map((r) => r.created_at);
  const vlabel = Object.fromEntries(w.vantages.map((v) => [v.id, v.label]));
  const places = w.vantages.map((v) => v.id);
  const lastN = runs.slice(-10);
  const changes = useMemo(() => {
    let n = 0;
    for (let i = 1; i < runs.length; i++)
      for (const p of places) if (runs[i].summary.top1_by_place?.[p] && runs[i - 1].summary.top1_by_place?.[p] && runs[i].summary.top1_by_place?.[p] !== runs[i - 1].summary.top1_by_place?.[p]) n++;
    return n;
  }, [runs, places]);

  const patch = async (body: object) => {
    const r = await fetch(`/api/watches/${w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) onChange(await r.json());
  };
  const runNow = async () => {
    if (live && !confirm(`Run now? This uses about ${w.requests_per_run} SerpApi searches (less if results were fetched in the last 6 hours).`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/watches/${w.id}/run`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).detail || "Run failed");
      onChange((await r.json()).watch);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Stop tracking and delete all of its runs?")) return;
    await fetch(`/api/watches/${w.id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[13.5px] text-muted">
            {LENS[w.lens] ?? w.lens} · {w.vantages.length} places · {w.example ? "ready-made example (sample data)" : every(w.interval_h)}
          </div>
          <h2 className="mt-1 text-[34px] leading-tight">“{w.query}”</h2>
          <div className="mt-1 text-[14px] text-ink-2">
            {w.runs} {w.runs === 1 ? "run" : "runs"} since {day(w.created_at)} ·{" "}
            {w.example ? "paused (example)" : w.active ? `next run ${when(w.next_run)}` : "paused"}
            {w.last_error && <span className="text-accent"> · last run failed: {w.last_error}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={runNow} disabled={busy} className="btn btn-primary">{busy ? "Running…" : "Run now"}</button>
          {!w.example && (
            <>
              <button onClick={() => patch({ active: !w.active })} className="btn btn-ghost">{w.active ? "Pause" : "Resume"}</button>
              <select value={w.interval_h} onChange={(e) => patch({ interval_h: Number(e.target.value) })} className="field py-2 text-[14px]" aria-label="How often">
                <option value={24}>Every day</option>
                <option value={72}>Every 3 days</option>
                <option value={168}>Every week</option>
              </select>
            </>
          )}
          <button onClick={remove} className="btn btn-ghost text-accent">Delete</button>
        </div>
      </div>
      {err && <p className="mt-3 text-accent">{err}</p>}

      {runs.length < 2 ? (
        <p className="mt-8 rounded-md border border-rule bg-card p-5 text-ink-2">
          The timeline appears after the second run. {w.active ? `The next one is ${when(w.next_run)}, or press “Run now”.` : "Press “Run now” to add a run."}
        </p>
      ) : (
        <>
          <p className="mt-6 max-w-3xl font-serif text-[21px] leading-snug">
            Over {runs.length} runs, a place's #1 result changed <b>{changes}</b> {changes === 1 ? "time" : "times"}.{" "}
            {Math.round(runs[0].summary.score) === Math.round(runs[runs.length - 1].summary.score) ? (
              <>The difference score held steady at <b>{Math.round(runs[0].summary.score)}</b>.</>
            ) : (
              <>
                The difference score went from <b>{Math.round(runs[0].summary.score)}</b> to <b>{Math.round(runs[runs.length - 1].summary.score)}</b>.
              </>
            )}
          </p>
          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <Line title="Difference score" help="How different the places' result pages are (0 = identical everywhere, 100 = nothing in common)." values={runs.map((r) => r.summary.score)} times={times} fmt={(v) => `${Math.round(v)}`} max={100} color="#1a1814" />
            <Line title="Links that differ" help="On average, how many of the top 10 links differ between two places." values={runs.map((r) => r.summary.avg_differ)} times={times} fmt={(v) => v.toFixed(1)} max={10} color="#1e6a70" />
            <Line title="Top-2 sites' share of top-3 spots" help="How much of every place's #1–#3 results the two biggest websites hold. Rising means fewer voices." values={runs.map((r) => (r.summary.top2_share != null ? r.summary.top2_share * 100 : null))} times={times} fmt={(v) => `${Math.round(v)}%`} max={100} color="#c8442a" />
          </div>
        </>
      )}

      {runs.length > 0 && (
        <div className="mt-10">
          <h3 className="flex items-center text-[21px]">
            The #1 result in each place, run by run
            <Help>Highlighted cells are where a place's top result changed since the run before.</Help>
          </h3>
          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-paper pr-4 text-left font-medium text-muted">Place</th>
                  {lastN.map((r) => (
                    <th key={r.id} className="px-1 pb-2 font-normal">
                      <button onClick={() => onOpenScan(r.id)} className="whitespace-nowrap text-ink-2 underline decoration-rule-2 hover:decoration-ink" title="Open this run">
                        {day(r.created_at)}
                        <span className="block text-[11px] text-muted">{new Date(r.created_at * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p}>
                    <td className="sticky left-0 whitespace-nowrap bg-paper py-1 pr-4 text-ink-2">{vlabel[p]}</td>
                    {lastN.map((r, i) => {
                      const d = r.summary.top1_by_place?.[p];
                      const prev = i > 0 ? lastN[i - 1].summary.top1_by_place?.[p] : runs[runs.length - lastN.length - 1]?.summary.top1_by_place?.[p];
                      const changed = !!d && !!prev && d !== prev;
                      return (
                        <td key={r.id} className="px-1 py-1">
                          <div className={`flex w-36 items-center gap-1.5 rounded px-1.5 py-1 ${changed ? "bg-hl" : "bg-card"}`} title={d}>
                            {d ? <Favicon domain={d} className="h-3.5 w-3.5" /> : null}
                            <span className="truncate">{d ?? "—"}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5 text-[13.5px] text-ink-2">
        <span>
          Each run uses about <b>{w.requests_per_run}</b> SerpApi searches
          {!w.example && w.active && <> (≈ <b>{Math.round((w.requests_per_run * 30 * 24) / w.interval_h)}</b> a month at this frequency)</>}. Runs happen while Parallax is running; a missed run happens on next start.
        </span>
        <span>
          Total billed so far: <b>{runs.reduce((n, r) => n + (r.summary.credits ?? 0), 0)}</b> credits
        </span>
      </div>
    </div>
  );
}

export default function Tracking({ selected, onSelect, onOpenScan, live }: { selected?: string; onSelect: (id?: string) => void; onOpenScan: (id: string) => void; live: boolean }) {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/watches")
      .then((r) => r.json())
      .then(setWatches)
      .catch(() => setWatches([]));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const current = watches?.find((w) => w.id === selected) ?? (selected ? undefined : watches?.[0]);

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-10 md:px-8">
      <h1 className="text-[36px]">Tracked searches</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Google's results move as news breaks and sites compete. Track a search to re-run it automatically and see how each place's results change over days and weeks. Start one from any results page with “Track this search”.
      </p>
      {watches === null ? (
        <p className="mt-8 text-muted">Loading…</p>
      ) : watches.length === 0 ? (
        <p className="mt-8 text-ink-2">Nothing tracked yet.</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
          <nav className="space-y-1">
            {watches.map((w) => (
              <button
                key={w.id}
                onClick={() => onSelect(w.id)}
                className={`block w-full rounded-md border px-3 py-2.5 text-left transition ${current?.id === w.id ? "border-ink bg-card" : "border-transparent hover:bg-card"}`}
              >
                <div className="truncate font-serif text-[17px] font-semibold">“{w.query}”</div>
                <div className="text-[12.5px] text-muted">
                  {w.example ? "Example · sample data" : `${every(w.interval_h)} · ${w.active ? "on" : "paused"}`} · {w.runs} runs
                  {w.last_run ? ` · ${timeAgo(w.last_run)}` : ""}
                </div>
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {current ? (
              <Detail
                key={current.id}
                w={current}
                live={live}
                onChange={(nw) => setWatches((ws) => ws?.map((x) => (x.id === nw.id ? nw : x)) ?? null)}
                onOpenScan={onOpenScan}
                onDeleted={() => {
                  onSelect(undefined);
                  load();
                }}
              />
            ) : (
              <p className="text-ink-2">That tracked search no longer exists.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
