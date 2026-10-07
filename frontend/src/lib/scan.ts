import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Analysis, Done, LogLine, ScanState, Trends, Vantage, VantageResult } from "./types";

type Action =
  | { type: "start"; query: string; lens: string }
  | { type: "plan"; vantages: Vantage[]; live: boolean }
  | { type: "translations"; queries: Record<string, string> }
  | { type: "vantage"; id: string; data?: VantageResult; error?: string }
  | { type: "analysis"; analysis: Analysis }
  | { type: "trends"; trends: Trends }
  | { type: "brief"; delta: string }
  | { type: "done"; done: Done }
  | { type: "error"; message: string }
  | { type: "reset" };

export const initialScan: ScanState = {
  status: "idle",
  query: "",
  lens: "cities",
  vantages: [],
  live: false,
  statuses: {},
  results: {},
  errors: {},
  queries: {},
  analysis: null,
  trends: null,
  brief: "",
  done: null,
  logs: [],
  startedAt: 0,
};

function log(state: ScanState, line: Omit<LogLine, "t">): LogLine[] {
  return [...state.logs, { ...line, t: performance.now() - state.startedAt }].slice(-80);
}

function reducer(state: ScanState, a: Action): ScanState {
  switch (a.type) {
    case "reset":
      return initialScan;
    case "start":
      return { ...initialScan, status: "scanning", query: a.query, lens: a.lens, startedAt: performance.now(), logs: [{ t: 0, kind: "info", text: `scan "${a.query}"` }] };
    case "plan":
      return {
        ...state,
        vantages: a.vantages,
        live: a.live,
        statuses: Object.fromEntries(a.vantages.map((v) => [v.id, "pending" as const])),
        logs: log(state, { kind: "info", text: `dispatching ${a.vantages.length} SerpApi searches · ${a.live ? "LIVE" : "DEMO"}` }),
      };
    case "translations":
      return { ...state, queries: a.queries, logs: log(state, { kind: "ai", text: `query translated into ${new Set(Object.values(a.queries)).size} scripts` }) };
    case "vantage": {
      const v = state.vantages.find((x) => x.id === a.id);
      if (a.error || !a.data) {
        return {
          ...state,
          statuses: { ...state.statuses, [a.id]: "error" },
          errors: { ...state.errors, [a.id]: a.error || "unknown" },
          logs: log(state, { kind: "err", code: v?.code, text: `${v?.label} failed — ${a.error?.slice(0, 80)}` }),
        };
      }
      const d = a.data;
      const bits = [`${d.organic.length} results`, d.ai_overview.present ? "AI ✓" : null, d.local.length ? "local ✓" : null, `${d.ms}ms`, d.origin].filter(Boolean);
      return {
        ...state,
        statuses: { ...state.statuses, [a.id]: "ok" },
        results: { ...state.results, [a.id]: d },
        logs: log(state, { kind: "ok", code: v?.code, text: `${v?.label} · ${bits.join(" · ")}` }),
      };
    }
    case "analysis":
      return {
        ...state,
        status: "analyzing",
        analysis: a.analysis,
        logs: log(state, { kind: "info", text: a.analysis.ok ? `divergence computed · index ${a.analysis.index}` : `analysis skipped: ${a.analysis.reason}` }),
      };
    case "trends":
      return { ...state, trends: a.trends, logs: log(state, { kind: "ok", code: "TRD", text: `Google Trends · ${a.trends.regions.length} states · ${a.trends.timeline.length} weeks` }) };
    case "brief":
      return { ...state, brief: state.brief + a.delta };
    case "done":
      return {
        ...state,
        status: "done",
        done: a.done,
        logs: log(state, { kind: "info", text: `done in ${a.done.elapsed}s · ${a.done.credits} credits · ${a.done.cached} cached` }),
      };
    case "error":
      return { ...state, status: "error", logs: log(state, { kind: "err", text: a.message }) };
  }
}

export interface ScanRequest {
  query: string;
  lens: string;
  vantageIds: string[];
  custom: Partial<Vantage>[];
  trends: boolean;
}

export function useScan() {
  const [state, dispatch] = useReducer(reducer, initialScan);
  const es = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    es.current?.close();
    es.current = null;
  }, []);

  const start = useCallback(
    (req: ScanRequest) => {
      stop();
      dispatch({ type: "start", query: req.query, lens: req.lens });
      const p = new URLSearchParams({ q: req.query, lens: req.lens, trends: String(req.trends) });
      if (req.vantageIds.length) p.set("vantages", req.vantageIds.join(","));
      if (req.custom.length) p.set("custom", JSON.stringify(req.custom));
      const src = new EventSource(`/api/scan?${p}`);
      es.current = src;
      const on = <T,>(name: string, fn: (d: T) => void) =>
        src.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));
      on<{ vantages: Vantage[]; live: boolean }>("plan", (d) => dispatch({ type: "plan", vantages: d.vantages, live: d.live }));
      on<{ queries: Record<string, string> }>("translations", (d) => dispatch({ type: "translations", queries: d.queries }));
      on<{ id: string; status: string; data?: VantageResult; error?: string }>("vantage", (d) => dispatch({ type: "vantage", id: d.id, data: d.data, error: d.error }));
      on<Analysis>("analysis", (d) => dispatch({ type: "analysis", analysis: d }));
      on<Trends>("trends", (d) => dispatch({ type: "trends", trends: d }));
      on<{ delta: string }>("brief", (d) => dispatch({ type: "brief", delta: d.delta }));
      on<Done>("done", (d) => {
        dispatch({ type: "done", done: d });
        src.close();
      });
      src.onerror = () => {
        if (es.current === src && src.readyState !== EventSource.CLOSED) {
          dispatch({ type: "error", message: "connection to PARALLAX server lost" });
        }
        src.close();
      };
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { state, start, stop, reset: () => dispatch({ type: "reset" }) };
}
