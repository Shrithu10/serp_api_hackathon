export const AGENT_ORDER = ["greedy", "genetic", "annealing", "local_search", "cpsat"];

export const agentColor = (key: string) => `var(--agent-${key}, rgb(var(--mute)))`;

export const AGENT_SHORT: Record<string, string> = {
  greedy: "Greedy",
  genetic: "Genetic",
  annealing: "Annealing",
  local_search: "Local search",
  cpsat: "CP-SAT",
};

export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export const TYPE_LABEL: Record<string, string> = {
  jobshop: "Job Shop",
  vrp: "Vehicle Routing",
  knapsack: "Knapsack",
};
