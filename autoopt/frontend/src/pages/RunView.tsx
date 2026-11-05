import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight, Award, CheckCircle2, CircleStop, Flag, Gauge, Loader2, Play, RotateCcw,
  ShieldCheck, Sparkles, Target, Timer, TriangleAlert, Trophy,
} from "lucide-react";
import { api, Meta, RunEvent, Snapshot, wsUrl } from "../api";
import { AgentDot, Badge, Button, Card, Stat } from "../components/ui";
import { AGENT_ORDER, AGENT_SHORT, fmt, pct, TYPE_LABEL } from "../theme";
import Convergence from "../viz/Convergence";
import AgentCard from "../viz/AgentCard";
import Gantt from "../viz/Gantt";
import RouteMap from "../viz/RouteMap";
import KnapsackView from "../viz/KnapsackView";
import { navigate } from "../App";

function useRun(id: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [solution, setSolution] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let poll: number | undefined;
    const full = (s: Snapshot) => {
      setSnap((prev) => ({ ...(prev || {}), ...s }));
      if (s.events) setEvents(s.events);
      if (s.solution) setSolution(s.solution);
    };
    const startPolling = () => {
      poll = window.setInterval(async () => {
        try {
          const s = await api.run(id);
          full(s);
          if (s.state !== "running") window.clearInterval(poll);
        } catch (e: any) {
          setError(e.message);
        }
      }, 1000);
    };
    const ws = new WebSocket(wsUrl(`/ws/runs/${id}`));
    wsRef.current = ws;
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.type === "snapshot" || msg.type === "finished") full(msg.snapshot);
      else if (msg.type === "tick") setSnap((prev) => ({ ...(prev || {}), ...msg.snapshot }));
      else if (msg.type === "incumbent") setSolution(msg.solution);
      else if (msg.type === "event") setEvents((ev) => [...ev.slice(-400), msg.event]);
      else if (msg.type === "error") setError(msg.message);
    };
    ws.onerror = () => {
      if (!closed) startPolling();
    };
    return () => {
      closed = true;
      ws.close();
      if (poll) window.clearInterval(poll);
    };
  }, [id]);

  return { snap, events, solution, error };
}

const EVENT_ICON: Record<string, JSX.Element> = {
  start: <Play size={13} />,
  incumbent: <Sparkles size={13} />,
  migration: <ArrowLeftRight size={13} />,
  agent_done: <Flag size={13} />,
  rejected: <TriangleAlert size={13} />,
  agent_error: <TriangleAlert size={13} />,
  finish: <CheckCircle2 size={13} />,
};

function describe(e: RunEvent, objName: string) {
  switch (e.type) {
    case "start":
      return `Launched ${e.agents.map((a: string) => AGENT_SHORT[a]).join(", ")}${
        Object.keys(e.skipped || {}).length
          ? ` · skipped ${Object.entries(e.skipped).map(([k, why]) => `${AGENT_SHORT[k]} (${why})`).join(", ")}`
          : ""
      }`;
    case "incumbent":
      return `${AGENT_SHORT[e.agent]} set a new validated incumbent: ${objName} ${fmt(e.objective)}${e.previous != null ? ` (was ${fmt(e.previous)})` : ""}`;
    case "migration":
      return `Incumbent ${fmt(e.objective)} from ${AGENT_SHORT[e.source] ?? e.source} offered to ${AGENT_SHORT[e.target]} · ${e.accepted ? "adopted" : "declined"}`;
    case "agent_done":
      return `${AGENT_SHORT[e.agent]} finished: ${e.message || e.status}`;
    case "rejected":
      return `Candidate from ${AGENT_SHORT[e.agent]} rejected by validator: ${e.errors.join("; ")}`;
    case "agent_error":
      return `${AGENT_SHORT[e.agent]} failed: ${e.error}`;
    case "finish":
      return `Run finished (${e.reason}). Best ${objName} ${fmt(e.objective)} by ${AGENT_SHORT[e.agent] ?? "—"}`;
    default:
      return e.type;
  }
}

export default function RunView({ id, meta }: { id: string; meta: Meta }) {
  const { snap, events, solution, error } = useRun(id);
  const [filter, setFilter] = useState<"all" | "key">("key");
  if (error && !snap) return <div className="card p-4 text-bad text-sm">{error}</div>;
  if (!snap) {
    return (
      <div className="flex items-center gap-2 text-sub text-sm">
        <Loader2 className="animate-spin" size={16} /> Connecting to run…
      </div>
    );
  }
  const running = snap.state === "running" || snap.state === "pending";
  const pt = meta.problem_types.find((p) => p.key === snap.type);
  const progress = Math.min(1, snap.elapsed / snap.time_limit);
  const agents = [...snap.agents].sort((a, b) => AGENT_ORDER.indexOf(a.key) - AGENT_ORDER.indexOf(b.key));
  const active = agents.filter((a) => a.selected);
  const skipped = agents.filter((a) => !a.selected);
  const sense = snap.sense === "min" ? 1 : -1;
  const ranked = [...active].sort((a, b) => {
    const va = a.best_objective == null || a.best_feasible === false ? Infinity : sense * a.best_objective;
    const vb = b.best_objective == null || b.best_feasible === false ? Infinity : sense * b.best_objective;
    if (va !== vb) return va - vb;
    // Ties: the agent that contributed to the incumbent first ranks higher.
    return (b.global_improvements ?? 0) - (a.global_improvements ?? 0) || (a.time_to_best ?? 1e9) - (b.time_to_best ?? 1e9);
  });
  const shownEvents = [...events].reverse().filter((e) => filter === "all" || e.type !== "migration");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-mute">
            <span>{TYPE_LABEL[snap.type || ""] ?? snap.type}</span>·<span className="font-mono">{id}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight truncate">{snap.name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <Badge tone="accent">
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> running
            </Badge>
          ) : (
            <Badge tone={snap.state === "finished" ? "good" : "warn"}>{snap.state}</Badge>
          )}
          {running ? (
            <Button variant="danger" onClick={() => api.stopRun(id)}>
              <CircleStop size={14} /> Stop
            </Button>
          ) : (
            <Button onClick={() => navigate("")}>
              <RotateCcw size={14} /> New run
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
          <motion.div className="h-full bg-accent" animate={{ width: `${(running ? progress : 1) * 100}%` }} transition={{ ease: "linear", duration: 0.25 }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-mute num">
          <span>
            {snap.elapsed.toFixed(1)}s / {snap.time_limit}s
          </span>
          <span>{snap.stop_reason || (running ? "searching…" : "")}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat
          icon={<Trophy size={12} />}
          label={`Best ${snap.objective_name}`}
          value={fmt(snap.best_objective)}
          sub={pt ? (pt.sense === "min" ? "lower is better" : "higher is better") : undefined}
        />
        <Stat
          icon={<Award size={12} />}
          label="Found by"
          value={
            snap.best_agent ? (
              <span className="flex items-center gap-2 text-xl">
                <AgentDot agent={snap.best_agent} size={12} />
                {AGENT_SHORT[snap.best_agent]}
              </span>
            ) : (
              "—"
            )
          }
          sub={snap.best_time != null ? `at ${snap.best_time.toFixed(2)}s` : undefined}
        />
        <Stat
          icon={<Target size={12} />}
          label="Optimality gap"
          value={snap.bounds.optimal ? "0% · optimal" : pct(snap.bounds.gap)}
          sub={snap.bounds.bound != null ? `${snap.bounds.source} bound ${fmt(snap.bounds.bound)}` : "no bound available"}
        />
        <Stat
          icon={<ShieldCheck size={12} />}
          label="Validated candidates"
          value={fmt(snap.validated)}
          sub={`${snap.rejected} rejected · ${snap.infeasible} infeasible`}
        />
        <Stat
          icon={<ArrowLeftRight size={12} />}
          label="Migrations"
          value={fmt(snap.migrations)}
          sub={`${snap.migrations_accepted} adopted by recipients`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Convergence" icon={<Gauge size={15} />} right={<span className="text-xs text-mute">best {snap.objective_name} per agent over time</span>}>
          <Convergence snap={snap} />
        </Card>
        <Card title="Agent leaderboard" icon={<Trophy size={15} />}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-mute text-left">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Agent</th>
                <th className="pb-2 font-medium text-right">Best</th>
                <th className="pb-2 font-medium text-right">vs best</th>
                <th className="pb-2 font-medium text-right">To best</th>
                <th className="pb-2 font-medium text-right">Global ↑</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((a, i) => {
                const diff =
                  a.best_objective != null && snap.best_objective != null && a.best_feasible !== false
                    ? Math.abs(a.best_objective - snap.best_objective) / Math.max(1e-9, Math.abs(snap.best_objective))
                    : null;
                return (
                  <tr key={a.key} className="border-t border-line">
                    <td className="py-2 text-mute num">{i + 1}</td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <AgentDot agent={a.key} /> {AGENT_SHORT[a.key]}
                      </span>
                    </td>
                    <td className="py-2 text-right num font-medium">{fmt(a.best_objective ?? null)}</td>
                    <td className="py-2 text-right num text-sub">{diff === null ? "—" : diff < 1e-9 ? "best" : `+${pct(diff, 1)}`}</td>
                    <td className="py-2 text-right num text-sub">{a.time_to_best != null ? `${a.time_to_best.toFixed(2)}s` : "—"}</td>
                    <td className="py-2 text-right num text-sub">{a.global_improvements ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {skipped.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-line pt-3">
              <div className="label">Not running</div>
              {skipped.map((a) => (
                <div key={a.key} className="flex items-center gap-2 text-xs text-sub">
                  <AgentDot agent={a.key} size={8} /> {a.name}: <span className="text-mute">{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Agents */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {active.map((a) => (
          <AgentCard key={a.key} a={a} isBest={snap.best_agent === a.key} objectiveName={snap.objective_name} />
        ))}
      </div>

      {/* Solution */}
      <Card
        title="Best feasible solution"
        icon={<CheckCircle2 size={15} />}
        right={
          solution && (
            <span className="text-xs text-sub flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-good" /> passed independent validation · {snap.objective_name}{" "}
              <span className="num font-medium text-ink">{fmt(solution.objective)}</span>
            </span>
          )
        }
      >
        {!solution ? (
          <p className="text-sm text-mute">No feasible solution yet.</p>
        ) : snap.type === "jobshop" ? (
          <Gantt data={solution} />
        ) : snap.type === "vrp" ? (
          <RouteMap data={solution} />
        ) : (
          <KnapsackView data={solution} />
        )}
      </Card>

      {/* Event log */}
      <Card
        title="Coordinator log"
        icon={<Timer size={15} />}
        right={
          <div className="flex rounded-lg border border-line p-0.5 text-xs">
            {(["key", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2 py-0.5 ${filter === f ? "bg-raised text-ink" : "text-mute"}`}>
                {f === "key" ? "Key events" : "All incl. migrations"}
              </button>
            ))}
          </div>
        }
      >
        <ul className="max-h-80 overflow-auto space-y-0.5 pr-1">
          <AnimatePresence initial={false}>
            {shownEvents.slice(0, 250).map((e, i) => (
              <motion.li
                key={`${e.t}-${e.type}-${shownEvents.length - i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-md px-2 py-1 text-xs hover:bg-raised"
              >
                <span className="w-12 shrink-0 text-right num text-mute">{e.t.toFixed(2)}s</span>
                <span className={e.type === "rejected" || e.type === "agent_error" ? "text-bad" : e.type === "incumbent" ? "text-accent" : "text-mute"}>
                  {EVENT_ICON[e.type] ?? <Flag size={13} />}
                </span>
                <span className="text-sub">{describe(e, snap.objective_name)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>
    </div>
  );
}
