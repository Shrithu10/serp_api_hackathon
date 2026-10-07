export interface Vantage {
  id: string;
  label: string;
  code: string;
  lat: number;
  lng: number;
  location: string;
  gl: string;
  hl: string;
  google_domain: string;
  lang_name: string;
  region: string;
  translate: boolean;
}

export interface Lens {
  id: string;
  name: string;
  tagline: string;
  vantages: Vantage[];
}

export interface Config {
  live: boolean;
  lenses: Lens[];
  max_vantages: number;
}

export interface Organic {
  rank: number;
  title: string;
  link: string;
  key: string;
  domain: string;
  source: string;
  snippet: string;
  date: string;
  favicon: string;
  script: string;
}

export interface AiOverview {
  present: boolean;
  pending?: boolean;
  text?: string;
  refs?: { title: string; link: string; source: string; domain: string }[];
}

export interface VantageResult {
  organic: Organic[];
  features: string[];
  ai_overview: AiOverview;
  local: { title: string; rating?: number; type?: string }[];
  top_stories: { title: string; source: string; link: string }[];
  questions: string[];
  related: string[];
  knowledge: { title?: string; type?: string; description?: string } | null;
  total_results?: number;
  time_taken?: number;
  q: string;
  origin: "live" | "cache" | "recorded" | "synthetic";
  approx: boolean;
  ms: number;
  calls: string[];
}

export interface River {
  domain: string;
  category: string;
  ranks: Record<string, number | null>;
  spread: number;
  share: number;
}

export interface Analysis {
  ok: boolean;
  reason?: string;
  query: string;
  ids: string[];
  order: string[];
  index: number;
  verdict: string;
  verdict_blurb: string;
  mean_similarity: number;
  matrix: number[][];
  url_matrix: number[][];
  domain_matrix: number[][];
  clusters: string[][];
  most_similar: { a: string; b: string; sim: number };
  most_different: { a: string; b: string; sim: number };
  outlier: string;
  anchor: string;
  loneliness: Record<string, number>;
  consensus: { domain: string; share: number; avg_rank: number; category: string }[];
  exclusives: Record<string, { domain: string; rank: number; title: string; link: string; category: string }[]>;
  rivers: River[];
  taxonomy: Record<string, Record<string, number>>;
  categories: string[];
  scripts: Record<string, [string, number][]>;
  terms: Record<string, { term: string; z: number; n: number }[]>;
  features: Record<string, string[]>;
  all_features: string[];
  ai: Record<string, { present: boolean; refs: string[]; excerpt: string }>;
  ai_rate: number;
  ai_ref_overlap: number | null;
  top1: [string, number][];
  unique_domains: number;
  facts: string[];
  plain: {
    avg_differ: number;
    avg_len: number;
    avg_shared_sources: number;
    top1_domain: string;
    top1_agree: number;
    places: number;
    groups: number;
    ai_count: number;
    local_count: number;
  };
  shared_links: number[][];
  shared_sources: number[][];
  concentration: {
    slots: number;
    distinct: number;
    top: { domain: string; count: number; share: number; category: string }[];
    top2_share: number;
    k_half: number;
    hhi: number;
    level: "concentrated" | "moderate" | "diverse";
  };
  ai_text: {
    n: number;
    avg_similarity: number;
    most_different: { a: string; b: string; sim: number };
    most_similar: { a: string; b: string; sim: number };
  } | null;
}

export interface Trends {
  regions: { code: string; name: string; value: number }[];
  timeline: { date: string; t: number; v: number }[];
  geo_error?: string;
  ts_error?: string;
}

export interface Done {
  id?: string;
  elapsed: number;
  requests?: number;
  credits: number;
  cached: number;
  synthetic: boolean;
  recorded: number;
}

export type VStatus = "pending" | "ok" | "error";

export interface LogLine {
  t: number;
  kind: "info" | "ok" | "err" | "ai";
  text: string;
  code?: string;
}

export interface ScanState {
  status: "idle" | "scanning" | "analyzing" | "done" | "error";
  query: string;
  lens: string;
  vantages: Vantage[];
  live: boolean;
  statuses: Record<string, VStatus>;
  results: Record<string, VantageResult>;
  errors: Record<string, string>;
  queries: Record<string, string>;
  analysis: Analysis | null;
  trends: Trends | null;
  brief: string;
  done: Done | null;
  logs: LogLine[];
  startedAt: number;
  id: string | null;
  savedAt: number | null;
  reopened: boolean;
  example: boolean;
}

export interface ScanPayload {
  query: string;
  lens: string;
  vantages: Vantage[];
  queries: Record<string, string>;
  results: Record<string, VantageResult>;
  errors: Record<string, string>;
  analysis: Analysis;
  trends: Trends | null;
  brief: string;
  done: Done;
}

export interface SavedScan {
  id: string;
  created_at: number;
  query: string;
  lens: string;
  live: boolean;
  summary: { places: number; score: number; verdict: string; groups: number; avg_differ: number; top1: string; synthetic: boolean; example?: boolean; top2_share?: number };
  payload?: ScanPayload;
}
