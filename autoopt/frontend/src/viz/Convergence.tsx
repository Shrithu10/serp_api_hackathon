import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Snapshot } from "../api";
import { AGENT_SHORT, fmt } from "../theme";

/** Best objective over time, one step line per agent plus the validated
 * global incumbent. Series are merged onto shared timestamps (forward
 * filled) so the hover tooltip can read every agent at one instant. */
export default function Convergence({ snap }: { snap: Snapshot }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const agents = snap.agents.filter((a) => a.selected && a.series && a.series.length);
  const rows = useMemo(() => {
    const times = new Set<number>();
    agents.forEach((a) => a.series!.forEach(([t]) => times.add(t)));
    snap.global_series.forEach((g) => times.add(g.t));
    times.add(snap.elapsed);
    let ts = [...times].sort((a, b) => a - b);
    if (ts.length > 700) {
      const keep = new Set(snap.global_series.map((g) => g.t));
      const step = Math.ceil(ts.length / 600);
      ts = ts.filter((t, i) => i % step === 0 || keep.has(t) || i === ts.length - 1);
    }
    const ptr: Record<string, number> = {};
    const val: Record<string, number | undefined> = {};
    let gp = 0;
    let gv: number | undefined;
    return ts.map((t) => {
      const row: Record<string, number | undefined> = { t };
      for (const a of agents) {
        const s = a.series!;
        let i = ptr[a.key] ?? 0;
        while (i < s.length && s[i][0] <= t) val[a.key] = s[i++][1];
        ptr[a.key] = i;
        row[a.key] = val[a.key];
      }
      while (gp < snap.global_series.length && snap.global_series[gp].t <= t) gv = snap.global_series[gp++].objective;
      row.incumbent = gv;
      return row;
    });
  }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ignore the first, typically very poor random candidates when framing the y axis.
  const domain = useMemo(() => {
    const vals: number[] = [];
    rows.forEach((r) => agents.forEach((a) => r[a.key] !== undefined && !hidden.has(a.key) && vals.push(r[a.key]!)));
    if (snap.bounds.bound !== null) vals.push(snap.bounds.bound);
    if (!vals.length) return ["auto", "auto"] as const;
    vals.sort((a, b) => a - b);
    const lo = snap.sense === "min" ? vals[0] : vals[Math.floor(vals.length * 0.1)];
    const hi = snap.sense === "min" ? vals[Math.ceil(vals.length * 0.9) - 1] : vals[vals.length - 1];
    const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.002, 0.5);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)] as [number, number];
  }, [rows, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <button onClick={() => toggle("incumbent")} className={`flex items-center gap-1.5 ${hidden.has("incumbent") ? "opacity-40" : ""}`}>
          <span className="h-0.5 w-4" style={{ background: "var(--incumbent)" }} />
          <span className="text-ink font-medium">Global incumbent</span>
        </button>
        {agents.map((a) => (
          <button key={a.key} onClick={() => toggle(a.key)} className={`flex items-center gap-1.5 ${hidden.has(a.key) ? "opacity-40" : ""}`}>
            <span className="h-0.5 w-4" style={{ background: `var(--agent-${a.key})` }} />
            <span className="text-sub">{AGENT_SHORT[a.key]}</span>
          </button>
        ))}
        {snap.bounds.bound !== null && (
          <span className="flex items-center gap-1.5 text-sub">
            <span className="w-4 border-t border-dashed border-sub" /> {snap.bounds.source} bound
          </span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, Math.max(snap.elapsed, 0.1)]}
              tickFormatter={(v) => `${Number(v).toFixed(v < 10 ? 1 : 0)}s`}
              tick={{ fontSize: 11, fill: "rgb(var(--mute))" }}
              stroke="rgb(var(--line))"
            />
            <YAxis
              domain={domain as any}
              allowDataOverflow
              tick={{ fontSize: 11, fill: "rgb(var(--mute))" }}
              stroke="rgb(var(--line))"
              width={56}
              tickFormatter={(v) => fmt(v, 1)}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: "rgb(var(--mute))", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 text-mute num">t = {Number(label).toFixed(2)}s</div>
                    {payload
                      .filter((p) => p.value !== undefined)
                      .map((p) => (
                        <div key={String(p.dataKey)} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          <span className="text-sub">{p.dataKey === "incumbent" ? "Incumbent" : AGENT_SHORT[String(p.dataKey)]}</span>
                          <span className="ml-auto pl-4 num text-ink">{fmt(Number(p.value), 2)}</span>
                        </div>
                      ))}
                  </div>
                ) : null
              }
            />
            {snap.bounds.bound !== null && (
              <ReferenceLine y={snap.bounds.bound} stroke="rgb(var(--sub))" strokeDasharray="4 4" ifOverflow="extendDomain" />
            )}
            {agents.map((a) => (
              <Line
                key={a.key}
                dataKey={a.key}
                type="stepAfter"
                stroke={`var(--agent-${a.key})`}
                strokeWidth={2}
                dot={false}
                hide={hidden.has(a.key)}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            <Line
              dataKey="incumbent"
              type="stepAfter"
              stroke="var(--incumbent)"
              strokeWidth={2.5}
              strokeDasharray="1 0"
              dot={false}
              hide={hidden.has("incumbent")}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
