import { motion } from "framer-motion";
import type { AgentState } from "../api";
import { AgentDot, Badge } from "../components/ui";
import { AGENT_SHORT, fmt, pct } from "../theme";

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "accent" | "neutral"> = {
  running: "accent",
  waiting: "neutral",
  optimal: "good",
  finished: "good",
  converged: "neutral",
  budget: "neutral",
  stopped: "neutral",
  error: "bad",
  infeasible: "bad",
  unknown: "warn",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-mute">{k}</span>
      <span className="num text-sub text-right truncate">{v}</span>
    </div>
  );
}

export default function AgentCard({ a, isBest, objectiveName }: { a: AgentState; isBest: boolean; objectiveName: string }) {
  const t = a.telemetry || {};
  const evalRate = a.cpu_time && a.evaluations ? a.evaluations / a.cpu_time : null;
  return (
    <motion.div layout className={`card p-4 ${isBest ? "border-accent/70 ring-1 ring-accent/40" : ""}`}>
      <div className="flex items-center gap-2">
        <AgentDot agent={a.key} />
        <span className="text-sm font-semibold truncate" title={a.name}>{AGENT_SHORT[a.key] ?? a.name}</span>
        <span className="ml-auto flex items-center gap-1">
          {isBest && <Badge tone="accent">incumbent</Badge>}
          <Badge tone={STATUS_TONE[a.status || ""] ?? "neutral"}>
            {a.status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
            {a.status}
          </Badge>
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold num">{fmt(a.best_objective ?? null)}</span>
        <span className="text-xs text-mute">best {objectiveName}</span>
        {a.best_feasible === false && <Badge tone="warn">infeasible</Badge>}
      </div>
      {a.message && <div className="mt-0.5 text-xs text-sub truncate" title={a.message}>{a.message}</div>}
      <div className="mt-3 space-y-1">
        <Row k="iterations" v={fmt(a.iterations ?? 0)} />
        <Row k="evaluations" v={`${fmt(a.evaluations ?? 0)}${evalRate ? ` · ${fmt(Math.round(evalRate))}/s` : ""}`} />
        <Row k="own improvements · global" v={`${a.improvements ?? 0} · ${a.global_improvements ?? 0}`} />
        <Row k="migrants accepted" v={`${a.migrants_accepted ?? 0} / ${a.migrants_offered ?? 0}`} />
        <Row k="time to best" v={a.time_to_best != null ? `${a.time_to_best.toFixed(2)}s` : "—"} />
      </div>
      <div className="mt-3 border-t border-line pt-3 space-y-1">
        {a.key === "genetic" && (
          <>
            <Row k="generation" v={fmt(t.generation)} />
            <Row k="population mean" v={fmt(t.population_mean)} />
            <Row k="diversity" v={pct(t.diversity, 0)} />
          </>
        )}
        {a.key === "annealing" && (
          <>
            <Row k="temperature" v={fmt(t.temperature, 3)} />
            <Row k="acceptance rate" v={pct(t.acceptance_rate, 0)} />
            <Row k="current" v={fmt(t.current)} />
            <Row k="reheats" v={t.reheats} />
          </>
        )}
        {a.key === "local_search" && (
          <>
            <Row k="current" v={fmt(t.current)} />
            <Row k="local optima · restarts" v={`${t.local_optima ?? 0} · ${t.restarts ?? 0}`} />
            {t.moves &&
              Object.entries(t.moves as Record<string, { tried: number; improved: number }>).map(([m, s]) => (
                <Row key={m} k={`${m.replace("_", " ")} improving`} v={`${s.improved} / ${fmt(s.tried)}`} />
              ))}
          </>
        )}
        {a.key === "greedy" &&
          t.heuristics &&
          Object.entries(t.heuristics as Record<string, { runs: number; best: number | null }>).map(([n, s]) => (
            <Row key={n} k={n} v={`${fmt(s.best)} · ${s.runs}×`} />
          ))}
        {a.key === "cpsat" && (
          <>
            <Row k="solver status" v={t.solver_status} />
            <Row k="best bound" v={fmt(t.bound)} />
            <Row k="optimality gap" v={t.gap != null ? pct(t.gap) : "—"} />
            <Row k="wall time" v={`${fmt(t.wall_time)}s`} />
            <Row k="warm start" v={t.hinted ? "incumbent hint" : "none"} />
            {t.conflicts != null && <Row k="conflicts · branches" v={`${fmt(t.conflicts)} · ${fmt(t.branches)}`} />}
            {(t.model as string[] | undefined)?.map((n) => (
              <div key={n} className="text-[11px] text-mute">· {n}</div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}
