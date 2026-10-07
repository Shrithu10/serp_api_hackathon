import { useEffect, useRef } from "react";
import type { LogLine } from "../lib/types";

const KIND: Record<LogLine["kind"], string> = {
  info: "text-muted",
  ok: "text-fg/90",
  err: "text-red",
  ai: "text-violet",
};

export default function LiveFeed({ logs, active }: { logs: LogLine[]; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-black/40">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan/70" />
        </div>
        <div className="eyebrow !text-[10px]">serpapi · event stream</div>
        <div className={`flex items-center gap-1.5 font-mono text-[10px] ${active ? "text-cyan" : "text-dim"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-cyan" : "bg-dim"}`} />
          {active ? "LIVE" : "IDLE"}
        </div>
      </div>
      {active && <div className="scan-line pointer-events-none absolute inset-x-0 top-0 h-full" />}
      <div ref={ref} className="scrollbar-none h-[220px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.75]">
        {logs.map((l, i) => (
          <div key={i} className={`flex gap-3 ${KIND[l.kind]}`}>
            <span className="w-14 shrink-0 text-right tabular-nums text-dim">{(l.t / 1000).toFixed(2)}s</span>
            <span className="w-9 shrink-0 text-cyan/80">{l.code ?? "▸"}</span>
            <span className="min-w-0 break-words">{l.text}</span>
          </div>
        ))}
        {active && <div className="caret pl-[6.5rem] text-dim" />}
      </div>
    </div>
  );
}
