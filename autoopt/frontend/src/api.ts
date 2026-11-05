// Typed client for the local AutoOpt backend. Same-origin only.

export type ParamSpec = {
  key: string;
  label: string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  type?: "bool";
  options?: string[];
};

export type ProblemType = {
  key: string;
  title: string;
  description: string;
  sense: "min" | "max";
  objective_name: string;
  generator_params: ParamSpec[];
  capabilities: string[];
};

export type AgentInfo = {
  key: string;
  name: string;
  description: string;
  requires: string[];
  background: boolean;
  params: ParamSpec[];
};

export type Meta = {
  problem_types: ProblemType[];
  agents: AgentInfo[];
  run_defaults: RunSettings;
};

export type RunSettings = {
  time_limit: number;
  migration: boolean;
  migration_interval: number;
  stall_limit: number | null;
  stop_on_optimal: boolean;
  slice_ms: number;
  seed: number;
};

export type AgentConfig = {
  key: string;
  enabled: boolean;
  weight: number;
  max_iterations: number | null;
  params: Record<string, unknown>;
};

export type Eligibility = { key: string; name: string; compatible: boolean; reason: string };

export type InstanceRow = {
  id: string;
  name: string;
  type: string;
  summary: Record<string, unknown>;
  created_at: number;
  data?: unknown;
};

export type AgentState = {
  key: string;
  name: string;
  selected: boolean;
  reason: string;
  weight: number;
  status?: string;
  best_objective?: number | null;
  best_feasible?: boolean | null;
  iterations?: number;
  evaluations?: number;
  improvements?: number;
  migrants_offered?: number;
  migrants_accepted?: number;
  time_to_best?: number | null;
  cpu_time?: number;
  message?: string;
  telemetry?: Record<string, any>;
  global_improvements?: number;
  series?: [number, number][];
};

export type RunEvent = { type: string; t: number; [k: string]: any };

export type Snapshot = {
  id?: string;
  name?: string;
  type?: string;
  state: string;
  elapsed: number;
  time_limit: number;
  stop_reason: string;
  sense: "min" | "max";
  objective_name: string;
  best_objective: number | null;
  best_agent: string | null;
  best_time: number | null;
  bounds: { bound: number | null; gap: number | null; source: string | null; optimal: boolean };
  validated: number;
  rejected: number;
  infeasible: number;
  migrations: number;
  migrations_accepted: number;
  global_series: { t: number; objective: number; agent: string }[];
  agents: AgentState[];
  solution?: any;
  events?: RunEvent[];
  config?: any;
};

export type RunRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  stop_reason: string | null;
  best_objective: number | null;
  best_agent: string | null;
  gap: number | null;
  elapsed: number | null;
  created_at: number;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep status text */
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  meta: () => req<Meta>("/api/meta"),
  instances: () => req<InstanceRow[]>("/api/instances"),
  instance: (id: string) => req<InstanceRow & { data: any }>(`/api/instances/${id}`),
  saveInstance: (type: string, name: string, data: unknown) =>
    req<InstanceRow>("/api/instances", { method: "POST", body: JSON.stringify({ type, name, data }) }),
  deleteInstance: (id: string) => req(`/api/instances/${id}`, { method: "DELETE" }),
  generate: (type: string, params: Record<string, unknown>, seed: number) =>
    req<{ data: any; summary: Record<string, unknown> }>("/api/instances/generate", {
      method: "POST",
      body: JSON.stringify({ type, params, seed }),
    }),
  inspect: (type: string, data: unknown) =>
    req<{ summary: Record<string, unknown>; agents: Eligibility[] }>("/api/instances/inspect", {
      method: "POST",
      body: JSON.stringify({ type, data, name: "x" }),
    }),
  startRun: (body: { type: string; data: unknown; name: string; instance_id?: string | null; config: any }) =>
    req<{ id: string }>("/api/runs", { method: "POST", body: JSON.stringify(body) }),
  runs: () => req<RunRow[]>("/api/runs"),
  run: (id: string) => req<Snapshot & { instance: any }>(`/api/runs/${id}`),
  stopRun: (id: string) => req(`/api/runs/${id}/stop`, { method: "POST" }),
  deleteRun: (id: string) => req(`/api/runs/${id}`, { method: "DELETE" }),
};

export function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
