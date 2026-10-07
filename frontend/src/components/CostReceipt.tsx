import type { ScanState } from "../lib/types";

/** A printed-receipt summary of what the scan cost in SerpApi credits, and what caching saved. */
export default function CostReceipt({ state, creditsLeft, live }: { state: ScanState; creditsLeft: number | null; live: boolean }) {
  const d = state.done;
  if (!d) return null;
  const places = Object.keys(state.results).length;
  const aiFollow = Object.values(state.results).reduce((n, r) => n + Math.max(0, (r.calls?.length ?? 1) - 1), 0);
  const total = d.requests ?? places + aiFollow + 2;
  const trends = Math.max(0, total - places - aiFollow);
  const demo = d.synthetic;
  const replayed = !demo && d.recorded > 0 && d.credits === 0;
  const saved = state.reopened ? total : d.cached;

  const line = (label: string, n: number) => (
    <div className="flex justify-between gap-6">
      <span>{label}</span>
      <span>×{n}</span>
    </div>
  );

  let headline: string;
  if (state.example) headline = `Ready-made example: opened instantly, 0 credits used.`;
  else if (state.reopened) headline = `Reopened from history: 0 credits used. Running this search again would have cost up to ${total}.`;
  else if (demo) headline = `Demo mode: ${total} simulated requests, 0 credits used.`;
  else if (replayed) headline = `Replayed recorded SerpApi responses: 0 credits used.`;
  else headline = `${places} places searched. ${d.cached} served from cache, ${d.credits} fetched live. Saved ${d.cached} SerpApi ${d.cached === 1 ? "credit" : "credits"}.`;

  return (
    <div className="mx-auto max-w-md rounded-sm border border-dashed border-rule-2 bg-card px-6 py-5 font-mono text-[12.5px] leading-relaxed text-ink-2 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="text-center text-[11px] uppercase tracking-[0.2em] text-muted">Cost &amp; cache receipt</div>
      <div className="my-3 border-t border-dashed border-rule-2" />
      {line("Google Search (one per place)", places)}
      {aiFollow > 0 && line("AI Overview follow-ups", aiFollow)}
      {trends > 0 && line("Google Trends", trends)}
      <div className="my-3 border-t border-dashed border-rule-2" />
      <div className="flex justify-between font-medium text-ink"><span>Requests</span><span>{total}</span></div>
      <div className="flex justify-between"><span>Fetched live (billed)</span><span>{state.reopened || demo ? 0 : d.credits}</span></div>
      <div className="flex justify-between"><span>From cache / history</span><span>{state.reopened ? total : d.cached}</span></div>
      {!state.reopened && <div className="flex justify-between"><span>Time</span><span>{d.elapsed}s</span></div>}
      <div className="my-3 border-t border-dashed border-rule-2" />
      <div className="flex justify-between text-[14px] font-semibold text-ink">
        <span>Credits used</span>
        <span>{state.reopened || demo || replayed ? 0 : d.credits}</span>
      </div>
      {!demo && saved > 0 && (
        <div className="flex justify-between text-good"><span>Credits saved</span><span>{saved}</span></div>
      )}
      {live && creditsLeft != null && <div className="flex justify-between"><span>Left this month</span><span>{creditsLeft}</span></div>}
      <div className="my-3 border-t border-dashed border-rule-2" />
      <p className="text-center font-sans text-[13px] text-ink-2">⚡ {headline}</p>
      <p className="mt-2 text-center font-sans text-[12px] text-muted">Identical searches are reused for 6 hours, and saved scans reopen for free.</p>
    </div>
  );
}
