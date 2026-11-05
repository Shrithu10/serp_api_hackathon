import { useEffect, useState } from "react";
import { History as HistoryIcon, Trash2 } from "lucide-react";
import { api, RunRow } from "../api";
import { AgentDot, Badge, Card } from "../components/ui";
import { AGENT_SHORT, fmt, pct, TYPE_LABEL } from "../theme";

export default function History() {
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [type, setType] = useState<string>("all");
  const load = () => api.runs().then(setRows);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, []);
  const shown = (rows || []).filter((r) => type === "all" || r.type === type);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
          <p className="text-sm text-sub mt-0.5">Every run is stored locally in SQLite with its full convergence history and best solution.</p>
        </div>
        <div className="ml-auto flex rounded-lg border border-line p-0.5 text-xs">
          {["all", "jobshop", "vrp", "knapsack"].map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-md px-2.5 py-1 ${type === t ? "bg-raised text-ink" : "text-mute"}`}>
              {t === "all" ? "All" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <Card title={`${shown.length} runs`} icon={<HistoryIcon size={15} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-mute">
                <th className="pb-2 font-medium">Run</th>
                <th className="pb-2 font-medium">Problem</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Best</th>
                <th className="pb-2 font-medium">Found by</th>
                <th className="pb-2 font-medium text-right">Gap</th>
                <th className="pb-2 font-medium text-right">Time</th>
                <th className="pb-2 font-medium text-right">Started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-raised/60 cursor-pointer" onClick={() => (location.hash = `#/run/${r.id}`)}>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                    <div className="text-[11px] text-mute font-mono">{r.id}</div>
                  </td>
                  <td className="py-2.5 text-sub">{TYPE_LABEL[r.type]}</td>
                  <td className="py-2.5">
                    <Badge tone={r.status === "running" ? "accent" : r.status === "finished" ? "good" : "warn"}>{r.status}</Badge>
                    {r.stop_reason && <div className="text-[11px] text-mute mt-0.5">{r.stop_reason}</div>}
                  </td>
                  <td className="py-2.5 text-right num font-medium">{fmt(r.best_objective)}</td>
                  <td className="py-2.5">
                    {r.best_agent && (
                      <span className="flex items-center gap-1.5 text-sub">
                        <AgentDot agent={r.best_agent} size={8} /> {AGENT_SHORT[r.best_agent]}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right num text-sub">{r.gap === null ? "—" : r.gap === 0 ? "optimal" : pct(r.gap, 1)}</td>
                  <td className="py-2.5 text-right num text-sub">{r.elapsed != null ? `${r.elapsed.toFixed(1)}s` : "—"}</td>
                  <td className="py-2.5 text-right text-xs text-mute">{new Date(r.created_at * 1000).toLocaleString()}</td>
                  <td className="py-2.5 pl-2 text-right">
                    {r.status !== "running" && (
                      <button
                        className="text-mute hover:text-bad"
                        aria-label="Delete run"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.deleteRun(r.id);
                          load();
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows && shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-mute">
                    No runs yet. Launch one from the Lab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
