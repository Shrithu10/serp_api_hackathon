import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Config, Vantage } from "./lib/types";
import { useScan } from "./lib/scan";
import Hero from "./components/Hero";
import DotGlobe from "./components/DotGlobe";
import IndexGauge from "./components/IndexGauge";
import LiveFeed from "./components/LiveFeed";
import Section from "./components/Section";
import Realities from "./components/Realities";
import Brief from "./components/Brief";
import Matrix from "./components/Matrix";
import AiLens from "./components/AiLens";
import Rivers from "./components/Rivers";
import SerpDiff from "./components/SerpDiff";
import Exclusives from "./components/Exclusives";
import Anatomy from "./components/Anatomy";
import IndiaHeat from "./components/IndiaHeat";
import ShareCard from "./components/ShareCard";
import Inspector from "./components/Inspector";

interface Account {
  demo?: boolean;
  plan_searches_left?: number | null;
  total_searches_left?: number | null;
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 64 64">
        <circle cx="26" cy="32" r="15" fill="none" stroke="#ff4d6d" strokeWidth="5" />
        <circle cx="38" cy="32" r="15" fill="none" stroke="#5ef2ff" strokeWidth="5" style={{ mixBlendMode: "screen" }} />
      </svg>
      <span className="font-serif text-2xl tracking-tight">PARALLAX</span>
    </button>
  );
}

function Badge({ on, label, title }: { on: boolean; label: string; title?: string }) {
  return (
    <span title={title} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${on ? "border-cyan/30 text-cyan" : "border-amber/30 text-amber"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-cyan" : "bg-amber"} animate-pulse`} />
      {label}
    </span>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [lensId, setLensId] = useState("cities");
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<Vantage[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [share, setShare] = useState(false);
  const [q, setQ] = useState("");
  const { state, start, reset } = useScan();

  const refreshAccount = useCallback(() => {
    fetch("/api/account").then((r) => r.json()).then(setAccount).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c);
        setSelected(c.lenses[0].vantages.map((v) => v.id));
      });
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (state.status === "done") refreshAccount();
  }, [state.status, refreshAccount]);

  const scan = (query: string) => {
    setQ(query);
    setFocusId(null);
    setPair(null);
    start({ query, lens: lensId, vantageIds: selected, custom, trends: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const vmap = useMemo(() => Object.fromEntries(state.vantages.map((v) => [v.id, v])), [state.vantages]);
  const a = state.analysis?.ok ? state.analysis : null;
  const diffPair: [string, string] | null = pair ?? (a ? [a.most_different.a, a.most_different.b] : null);
  const reported = Object.values(state.statuses).filter((s) => s !== "pending").length;
  const progress = state.vantages.length ? reported / state.vantages.length : 0;
  const scanning = state.status === "scanning" || state.status === "analyzing";
  const focus = state.vantages.some((v) => v.gl !== "in") ? "world" : "india";
  const results = state.results;
  const diffOpposite = (id: string) => {
    if (!a) return;
    const i = a.order.indexOf(id);
    let other = a.order[i === 0 ? 1 : 0];
    a.order.forEach((o, j) => {
      if (j !== i && a.matrix[i][j] < a.matrix[i][a.order.indexOf(other)]) other = o;
    });
    setPair([id, other]);
    setTimeout(() => document.getElementById("diff")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const goHome = () => {
    reset();
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="grain min-h-screen">
      {/* Top bar */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className={`mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 md:px-6 ${state.status !== "idle" ? "glass rounded-b-2xl border-t-0" : ""}`}>
          <Logo onClick={goHome} />
          {state.status !== "idle" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) scan(q.trim());
              }}
              className="mx-auto hidden w-full max-w-xl items-center gap-2 rounded-full border border-line bg-black/40 py-1 pl-4 pr-1 md:flex"
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <select
                value={lensId}
                onChange={(e) => {
                  const l = config?.lenses.find((x) => x.id === e.target.value);
                  setLensId(e.target.value);
                  if (l) setSelected(l.vantages.map((v) => v.id));
                  setCustom([]);
                }}
                className="rounded-full border border-line bg-ink-2 px-2 py-1 text-xs text-muted outline-none"
              >
                {config?.lenses.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button className="rounded-full bg-fg px-4 py-1.5 text-xs font-semibold text-ink">Scan</button>
            </form>
          )}
          <div className="ml-auto flex items-center gap-2">
            {config && <Badge on={config.live} label={config.live ? "Live SerpApi" : "Demo data"} title={config.live ? "Results come from SerpApi in real time" : "No SERPAPI_API_KEY set — synthetic sample data"} />}
            {config && <Badge on={config.ai} label={config.ai ? "AI analyst" : "No LLM"} />}
            {account && !account.demo && account.total_searches_left != null && (
              <span className="hidden rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-muted sm:block">{account.total_searches_left} credits left</span>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {state.status === "idle" ? (
          <motion.div key="hero" exit={{ opacity: 0, y: -40, filter: "blur(8px)" }} transition={{ duration: 0.5 }}>
            <Hero
              config={config}
              lensId={lensId}
              setLensId={(id) => {
                setLensId(id);
                setCustom([]);
              }}
              selected={selected}
              setSelected={setSelected}
              custom={custom}
              setCustom={setCustom}
              onScan={scan}
            />
          </motion.div>
        ) : (
          <motion.main key="obs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="mx-auto max-w-[1500px] px-4 pb-24 pt-24 md:px-6">
            {!state.live && state.vantages.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber/25 bg-amber/[0.05] px-4 py-2.5 text-[13px] text-amber/90">
                <span className="font-mono text-[10px] uppercase tracking-widest">Demo mode</span>
                <span className="text-amber/70">Results are {state.done?.recorded ? "replayed recordings" : "synthetic sample data"}. Add <code className="rounded bg-black/30 px-1">SERPAPI_API_KEY</code> to <code className="rounded bg-black/30 px-1">.env</code> for live Google results.</span>
              </div>
            )}

            {/* Headline */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="eyebrow">{scanning ? "Scanning" : "Scanned"} · {state.vantages.length} vantages · {config?.lenses.find((l) => l.id === state.lens)?.name}</div>
                <h1 className="mt-2 font-serif text-[clamp(36px,5.5vw,76px)] italic leading-[0.95]">“{state.query}”</h1>
              </div>
              {a && (
                <button onClick={() => setShare(true)} className="group flex items-center gap-2 rounded-full border border-line-2 px-4 py-2 text-sm transition hover:border-cyan/50 hover:bg-cyan/5">
                  <span className="text-cyan">↗</span> Share card
                </button>
              )}
            </div>

            {/* Observatory */}
            <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
              <div className="panel relative h-[460px] overflow-hidden md:h-[620px]">
                <div className="absolute inset-0">
                  <DotGlobe vantages={state.vantages} statuses={state.statuses} analysis={a} focus={focus} selected={focusId} onSelect={setFocusId} />
                </div>
                <div className="pointer-events-none absolute left-5 top-5">
                  <div className="eyebrow">Observatory</div>
                  <div className="mt-1 text-[12.5px] text-muted">{a ? "Cyan arcs: similar results · red: furthest apart" : "Results stream in as each SerpApi search lands"}</div>
                </div>
                <div className="absolute bottom-4 right-4 flex gap-1.5">
                  {state.vantages.map((v) => (
                    <button key={v.id} onClick={() => setFocusId(focusId === v.id ? null : v.id)} title={v.label} className={`h-2.5 w-2.5 rounded-full transition ${state.statuses[v.id] === "ok" ? (focusId === v.id ? "scale-150 bg-fg" : "bg-cyan/70") : state.statuses[v.id] === "error" ? "bg-red" : "animate-pulse bg-white/15"}`} />
                  ))}
                </div>
                <AnimatePresence>
                  {focusId && results[focusId] && vmap[focusId] && (
                    <Inspector key={focusId} v={vmap[focusId]} r={results[focusId]} a={a} onClose={() => setFocusId(null)} onDiff={diffOpposite} />
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-col gap-4">
                <div className="panel p-6">
                  <IndexGauge analysis={a} progress={progress} />
                  {a && (
                    <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5 text-center">
                      <div>
                        <div className="font-mono text-2xl">{a.unique_domains}</div>
                        <div className="eyebrow !text-[9.5px]">unique sources</div>
                      </div>
                      <div>
                        <div className="font-mono text-2xl text-cyan">{Math.round(a.most_similar.sim * 100)}%</div>
                        <div className="eyebrow !text-[9.5px]">{vmap[a.most_similar.a]?.code}≈{vmap[a.most_similar.b]?.code}</div>
                      </div>
                      <div>
                        <div className="font-mono text-2xl text-red">{Math.round(a.most_different.sim * 100)}%</div>
                        <div className="eyebrow !text-[9.5px]">{vmap[a.most_different.a]?.code}≠{vmap[a.most_different.b]?.code}</div>
                      </div>
                    </div>
                  )}
                </div>
                <LiveFeed logs={state.logs} active={scanning} />
                {state.done && (
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-muted">
                    <div className="rounded-xl border border-line px-3 py-2"><span className="text-fg">{state.done.elapsed}s</span> total</div>
                    <div className="rounded-xl border border-line px-3 py-2"><span className="text-fg">{state.done.credits}</span> credits used</div>
                    <div className="rounded-xl border border-line px-3 py-2"><span className="text-fg">{state.done.cached}</span> from cache</div>
                  </div>
                )}
              </div>
            </div>

            {state.analysis && !state.analysis.ok && (
              <div className="mt-6 rounded-2xl border border-red/30 bg-red/5 p-5 text-sm text-red">Not enough results to compare: {state.analysis.reason}</div>
            )}

            {a && (
              <div className="mt-4 space-y-4">
                <Section n="01" title="Realities" kicker="Vantages clustered by how similar their result pages are (average-linkage, 50% similarity cut).">
                  <Realities analysis={a} vmap={vmap} results={results} onSelect={setFocusId} />
                </Section>

                <Section n="02" title="Field report" kicker="What a person in each place would walk away believing.">
                  <Brief text={state.brief} streaming={state.status === "analyzing"} ai={!!config?.ai} model={config?.model ?? null} />
                </Section>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <Section n="03" title="Divergence matrix" kicker="Every vantage against every other. Click a cell to diff the two pages.">
                    <Matrix analysis={a} vmap={vmap} selected={focusId} onSelect={setFocusId} onPair={(x, y) => { setPair([x, y]); document.getElementById("diff")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
                  </Section>
                  <Section n="04" title="The AI layer" kicker="Does Google's AI Overview show up, and which sources does it trust, in each place?">
                    <AiLens analysis={a} vmap={vmap} results={results} />
                  </Section>
                </div>

                <Section n="05" title="Rank rivers" kicker="Each line is a website moving through the rankings from one vantage to the next. Dashed drops mean it fell off page one.">
                  <Rivers analysis={a} vmap={vmap} />
                </Section>

                <div id="diff" className="scroll-mt-24">
                  {diffPair && (
                    <Section n="06" title="Page diff" kicker="Two vantages side by side. Cyan links: the same page. Violet: same site, different page. Red: only one side sees it.">
                      <SerpDiff ids={a.order} vmap={vmap} results={results} pair={diffPair} setPair={setPair} />
                    </Section>
                  )}
                </div>

                <Section n="07" title="Only here" kicker="Sources that appear in exactly one vantage: the local voices everyone else never hears.">
                  <Exclusives analysis={a} vmap={vmap} />
                </Section>

                <Section n="08" title="Anatomy of the page" kicker="Whose voices fill the top ten, which page features show up, and which words are unusually common in each place.">
                  <Anatomy analysis={a} vmap={vmap} />
                </Section>

                {state.trends && (
                  <Section n="09" title="India's appetite" kicker="Google Trends: where in India people search for this, and when.">
                    <IndiaHeat trends={state.trends} vantages={state.vantages} />
                  </Section>
                )}

                <footer className="pt-10 text-center">
                  <div className="font-serif text-2xl italic text-muted">Same question. Different worlds.</div>
                  <div className="mt-3 font-mono text-[11px] text-dim">
                    Google Search · AI Overview · Google Trends · Locations · Account — all via SerpApi · RBO p=0.9 · #BuiltWithSerpApi
                  </div>
                </footer>
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      <AnimatePresence>{share && a && <ShareCard analysis={a} vmap={vmap} onClose={() => setShare(false)} />}</AnimatePresence>
    </div>
  );
}
