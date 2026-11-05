import { useMemo, useState } from "react";
import { cat, useWidth } from "./useWidth";

type Task = { job: number; job_name: string; op: number; machine: number; machine_name: string; start: number; end: number };

export default function Gantt({ data }: { data: { tasks: Task[]; machines: string[]; jobs: string[]; makespan: number; utilization: number[] } }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Task | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [focusJob, setFocusJob] = useState<number | null>(null);
  const rowH = 30;
  const left = 64;
  const right = 56;
  const top = 8;
  const axisH = 24;
  const M = data.machines.length;
  const nJobs = data.jobs.length;
  const plotW = width - left - right;
  const x = (t: number) => left + (t / Math.max(1, data.makespan)) * plotW;
  const ticks = useMemo(() => {
    const step = niceStep(data.makespan / 8);
    const out = [];
    for (let t = 0; t <= data.makespan; t += step) out.push(t);
    return out;
  }, [data.makespan]);
  const height = top + M * rowH + axisH;
  const active = hover ? hover.job : focusJob;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label="Machine schedule Gantt chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={top + M * rowH} stroke="rgb(var(--line))" strokeWidth={1} />
            <text x={x(t)} y={top + M * rowH + 16} textAnchor="middle" fontSize={11} fill="rgb(var(--mute))" className="num">
              {t}
            </text>
          </g>
        ))}
        {data.machines.map((m, i) => (
          <g key={m}>
            <text x={left - 10} y={top + i * rowH + rowH / 2 + 4} textAnchor="end" fontSize={12} fill="rgb(var(--sub))">
              {m}
            </text>
            <text x={width - right + 8} y={top + i * rowH + rowH / 2 + 4} fontSize={11} fill="rgb(var(--mute))" className="num">
              {Math.round((data.utilization[i] ?? 0) * 100)}%
            </text>
          </g>
        ))}
        {data.tasks.map((t) => {
          const w = Math.max(1, x(t.end) - x(t.start) - 2);
          const dim = active !== null && active !== t.job;
          const y = top + t.machine * rowH + 4;
          return (
            <g
              key={`${t.job}-${t.op}`}
              onMouseEnter={(e) => {
                setHover(t);
                setPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
              }}
              onMouseMove={(e) => setPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setFocusJob(focusJob === t.job ? null : t.job)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={x(t.start) + 1}
                y={y}
                width={w}
                height={rowH - 8}
                rx={4}
                fill={nJobs > 8 && active === t.job ? "rgb(var(--accent))" : cat(t.job, nJobs)}
                opacity={dim ? 0.18 : 1}
              />
              {w > 30 && (
                <text x={x(t.start) + 1 + w / 2} y={y + (rowH - 8) / 2 + 4} textAnchor="middle" fontSize={10.5} fill="white" fontWeight={600} opacity={dim ? 0.3 : 1} pointerEvents="none">
                  {t.job_name}.{t.op + 1}
                </text>
              )}
            </g>
          );
        })}
        <line x1={x(data.makespan)} x2={x(data.makespan)} y1={top - 4} y2={top + M * rowH} stroke="rgb(var(--ink))" strokeDasharray="3 3" />
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(pos.x + 12, width - 180), top: pos.y + 12 }}
        >
          <div className="font-semibold text-ink">
            {hover.job_name} · operation {hover.op + 1}
          </div>
          <div className="text-sub num">
            {hover.machine_name} · {hover.start} → {hover.end} ({hover.end - hover.start})
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sub">
        {data.jobs.map((j, i) => (
          <button
            key={j}
            className={`flex items-center gap-1.5 rounded px-1 ${focusJob === i ? "bg-raised text-ink" : ""}`}
            onClick={() => setFocusJob(focusJob === i ? null : i)}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: nJobs > 8 && focusJob === i ? "rgb(var(--accent))" : cat(i, nJobs) }} />
            {j}
          </button>
        ))}
        <span className="ml-auto text-mute">Click a job to trace it · % = machine utilisation</span>
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
