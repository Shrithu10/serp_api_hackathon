import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { Config, SavedScan, ScanPayload } from "./lib/types";
import { useScan } from "./lib/scan";
import { readRoute, writeRoute, type Route } from "./lib/url";
import { changesSince, download, slug, timeAgo, toCSV, toMarkdown } from "./lib/derive";
import { groupColor } from "./lib/palette";
import Header from "./components/Header";
import Landing from "./components/Landing";
import History from "./components/History";
import ScanForm, { type ScanOptions } from "./components/ScanForm";
import Progress from "./components/Progress";
import Section from "./components/Section";
import Summary from "./components/Summary";
import BlindSpots from "./components/BlindSpots";
import SiteReport from "./components/SiteReport";
import ByPlace from "./components/ByPlace";
import SerpDiff from "./components/SerpDiff";
import AiLens from "./components/AiLens";
import DotGlobe from "./components/DotGlobe";
import Inspector from "./components/Inspector";
import Matrix from "./components/Matrix";
import Rivers from "./components/Rivers";
import Anatomy from "./components/Anatomy";
import IndiaHeat from "./components/IndiaHeat";
import ShareCard from "./components/ShareCard";
import SetupGuide from "./components/SetupGuide";
import ExportMenu from "./components/ExportMenu";
import Help from "./components/Help";
import AiDiff from "./components/AiDiff";
import Concentration from "./components/Concentration";
import CostReceipt from "./components/CostReceipt";

const LENS_NAME: Record<string, string> = { cities: "Indian cities", languages: "Indian languages", world: "India vs world" };

const NAV = [
  ["summary", "Short answer"],
  ["missing", "What you'd miss"],
  ["website", "Your website"],
  ["places", "Every place"],
  ["compare", "Compare two"],
  ["ai", "AI answers"],
  ["map", "Map"],
  ["deeper", "Deeper analysis"],
] as const;

function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState("summary");
  useEffect(() => {
    if (!enabled) return;
    const els = NAV.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [enabled]);
  return active;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const [route, setRoute] = useState<Route>(readRoute);
  const [opts, setOpts] = useState<ScanOptions | null>(null);
  const [home, setHome] = useState("");
  const [site, setSite] = useState(route.site ?? "");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [share, setShare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prev, setPrev] = useState<{ payload: ScanPayload; created_at: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { state, start, load, reset } = useScan();

  const refreshAccount = useCallback(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((a) => setCreditsLeft(a.total_searches_left ?? null))
      .catch(() => {});
  }, []);

  const openScan = useCallback(
    (id: string, push = true) => {
      setNotFound(false);
      fetch(`/api/scans/${id}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((s: SavedScan) => {
          load(s);
          setPair(null);
          setFocusId(null);
          setOpts(null);
          const next: Route = { page: "scan", scan: id, home: route.home, site: route.site };
          setRoute(next);
          if (push) writeRoute(next);
          window.scrollTo({ top: 0 });
        })
        .catch(() => setNotFound(true));
    },
    [load, route.home, route.site],
  );

  const runScan = useCallback(
    (o: ScanOptions) => {
      setOpts(o);
      setHome(o.home);
      setSite(o.site);
      setPair(null);
      setFocusId(null);
      setPrev(null);
      setEditing(false);
      start({ query: o.query, lens: o.lens, vantageIds: o.vantageIds, custom: o.custom, trends: true });
      const next: Route = { page: "scan", q: o.query, lens: o.lens, home: o.home, site: o.site || undefined };
      setRoute(next);
      writeRoute(next);
      window.scrollTo({ top: 0 });
    },
    [start],
  );

  // Boot: config, account, and whatever the URL asks for.
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
    refreshAccount();
    const r = readRoute();
    if (r.scan) openScan(r.scan, false);
    else if (r.q) {
      setHome(r.home ?? "");
      start({ query: r.q, lens: r.lens ?? "cities", vantageIds: [], custom: [], trends: true });
    }
    const onPop = () => {
      const r2 = readRoute();
      setRoute(r2);
      if (r2.scan) openScan(r2.scan, false);
      else if (r2.page === "home") reset();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a fresh scan finishes: point the URL at the saved copy and look for an earlier run.
  useEffect(() => {
    if (state.status !== "done" || !state.id) return;
    refreshAccount();
    const next: Route = { page: "scan", scan: state.id, home: home || undefined, site: site || undefined };
    writeRoute(next, true);
    setRoute(next);
    fetch(`/api/scans/${state.id}/previous`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: SavedScan | null) => setPrev(p?.payload ? { payload: p.payload, created_at: p.created_at } : null))
      .catch(() => setPrev(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.id]);

  const a = state.analysis?.ok ? state.analysis : null;
  const vmap = useMemo(() => Object.fromEntries(state.vantages.map((v) => [v.id, v])), [state.vantages]);
  const ids = a?.order ?? [];
  const homeId = home && ids.includes(home) ? home : ids[0] ?? "";
  const scanning = state.status === "scanning" || state.status === "analyzing";
  const showResults = route.page === "scan" && state.status !== "idle";
  const active = useActiveSection(!!a);
  const changes = useMemo(() => (prev && a ? changesSince(prev.payload, { results: state.results, analysis: a }) : null), [prev, a, state.results]);

  const mostDifferentFrom = (id: string) => {
    if (!a) return id;
    const i = a.order.indexOf(id);
    let best = a.order.find((x) => x !== id) ?? id;
    a.order.forEach((o, j) => {
      if (j !== i && a.matrix[i][j] < a.matrix[i][a.order.indexOf(best)]) best = o;
    });
    return best;
  };
  const diffPair: [string, string] | null = pair ?? (a && homeId ? [homeId, mostDifferentFrom(homeId)] : null);

  const updateHome = (id: string) => {
    setHome(id);
    setPair(null);
    const next = { ...route, home: id };
    setRoute(next);
    writeRoute(next, true);
  };
  const updateSite = (s: string) => {
    setSite(s);
    const next = { ...route, site: s || undefined };
    setRoute(next);
    writeRoute(next, true);
  };

  const go = (page: "home" | "history") => {
    if (page === "home") reset();
    const next: Route = { page };
    setRoute(next);
    writeRoute(next);
    setNotFound(false);
    window.scrollTo({ top: 0 });
  };

  const when = state.savedAt ? new Date(state.savedAt * 1000) : new Date();
  const base = `parallax-${slug(state.query)}`;
  const exportActions = {
    csv: () => download(`${base}.csv`, toCSV(state.query, state.vantages, state.results), "text/csv"),
    md: () => a && download(`${base}.md`, toMarkdown({ query: state.query, vantages: state.vantages, results: state.results, analysis: a, brief: state.brief, live: state.live, when }), "text/markdown"),
    json: () =>
      download(
        `${base}.json`,
        JSON.stringify({ query: state.query, lens: state.lens, saved_at: when.toISOString(), vantages: state.vantages, results: state.results, analysis: a, trends: state.trends, analysis_text: state.brief }, null, 2),
        "application/json",
      ),
    image: () => setShare(true),
    print: () => window.print(),
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="min-h-screen">
      <Header config={config} creditsLeft={creditsLeft} page={route.page === "history" ? "history" : route.page === "home" || !showResults ? "home" : "scan"} go={go} onSetup={() => setSetup(true)} />

      {route.page === "history" ? (
        <History onOpen={(id) => openScan(id)} />
      ) : notFound ? (
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="text-[32px]">That search isn't saved here</h1>
          <p className="mt-3 text-ink-2">Saved searches live on the computer that ran them. You can run the search again from the start page.</p>
          <button onClick={() => go("home")} className="btn btn-primary mt-6">Start a new search</button>
        </div>
      ) : !showResults ? (
        <Landing config={config} creditsLeft={creditsLeft} onScan={runScan} onOpen={(id) => openScan(id)} />
      ) : (
        <main>
          {/* Title block (above the sticky nav so its menus aren't covered) */}
          <div className="relative z-[45] mx-auto max-w-[1320px] px-5 pt-8 md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13.5px] text-muted">
                  {LENS_NAME[state.lens] ?? state.lens} · {state.vantages.length} places · {state.live ? "live Google results" : "demo data"}
                  {state.savedAt && !scanning ? ` · ${timeAgo(state.savedAt)}` : ""}
                  {state.done && !scanning && (
                    <>
                      {" · "}
                      <a href="#cost" className="underline decoration-rule-2 hover:decoration-ink">
                        {state.reopened ? "0 credits (from history)" : state.done.synthetic ? "0 credits (demo)" : `${state.done.credits} credits used, ${state.done.cached} from cache`}
                      </a>
                    </>
                  )}
                </div>
                <h1 className="mt-1 text-[clamp(32px,4.4vw,52px)] leading-[1.05]">“{state.query}”</h1>
              </div>
              {!scanning && (
                <div className="no-print flex flex-wrap items-center gap-2">
                  <button onClick={() => setEditing(!editing)} className="btn btn-ghost">{editing ? "Close" : "Change search"}</button>
                  <button onClick={copyLink} className="btn btn-ghost" disabled={!state.id}>{copied ? "Link copied" : "Copy link"}</button>
                  {a && <ExportMenu actions={exportActions} />}
                </div>
              )}
            </div>
            {editing && (
              <div className="mt-5 rounded-md border border-rule bg-card p-4">
                <ScanForm
                  config={config}
                  compact
                  creditsLeft={creditsLeft}
                  initial={{ query: state.query, lens: state.lens, home: homeId, site, vantageIds: opts?.vantageIds, custom: opts?.custom }}
                  onSubmit={runScan}
                />
              </div>
            )}
            {state.example && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-rule bg-card px-4 py-3 text-[14px]">
                <span>
                  <b>Ready-made example.</b> It opened instantly and used no searches.
                  {state.done?.synthetic ? " It uses demo sample data." : " It uses recorded Google results."}
                </span>
                {config?.live && (
                  <button onClick={() => runScan({ query: state.query, lens: state.lens, vantageIds: [], custom: [], home: homeId, site })} className="btn btn-primary py-1.5">
                    Run it live now
                  </button>
                )}
              </div>
            )}
            {!state.live && !state.example && config && !config.live && (
              <p className="mt-4 text-[13.5px] text-gold">
                These are demo results, not real Google data.{" "}
                <button onClick={() => setSetup(true)} className="underline">How to switch to live data</button>
              </p>
            )}
          </div>

          {/* Section nav */}
          {a && (
            <nav className="no-print sticky top-14 z-40 mt-6 border-y border-rule bg-paper/95 backdrop-blur">
              <div className="scrollbar-thin mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-5 md:px-8">
                {NAV.map(([id, label]) => (
                  <a key={id} href={`#${id}`} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] transition ${active === id ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          )}

          <div className="mx-auto max-w-[1320px] px-5 md:px-8">
            {(scanning || !a) && (
              <div className="grid gap-10 py-10 lg:grid-cols-[1fr_440px]">
                <Progress state={state} />
                <div className="aspect-square w-full max-w-[440px]">
                  <DotGlobe vantages={state.vantages} statuses={state.statuses} analysis={null} focus={state.vantages.some((v) => v.gl !== "in") ? "world" : "india"} interactive={false} />
                </div>
                {state.analysis && !state.analysis.ok && <p className="text-accent">Not enough places returned results to compare ({state.analysis.reason}).</p>}
                {state.status === "error" && <p className="text-accent">Lost the connection to the Parallax server. Is it still running?</p>}
              </div>
            )}

            {a && (
              <>
                <Section id="summary" kicker="The short answer" title={`Does where you search change what you see?`}>
                  <Summary a={a} lens={state.lens} vmap={vmap} brief={state.brief} streaming={state.status === "analyzing"} ai={!!config?.ai} changes={changes} prevWhen={prev ? timeAgo(prev.created_at) : null} />
                  <div className="mt-10">
                    <Concentration a={a} places={ids.length} />
                  </div>
                </Section>

                <Section id="missing" kicker="Your blind spots" title="What you'd miss by searching from one place" intro="These are sources other places see on their first page of Google, but you don't. Change your place to see someone else's blind spots.">
                  <BlindSpots home={homeId} setHome={updateHome} ids={ids} vmap={vmap} results={state.results} />
                </Section>

                <Section id="website" kicker="For businesses and publishers" title="Where does a website rank in each place?" intro="See your site's position in every place, where it doesn't make page one, and who outranks it. Works for any site, including competitors.">
                  <SiteReport site={site} setSite={updateSite} ids={ids} vmap={vmap} results={state.results} suggestions={[a.plain.top1_domain, ...a.consensus.map((c) => c.domain)].filter((d, i, arr) => arr.indexOf(d) === i)} />
                </Section>

                <Section id="places" kicker="The raw results" title="Every place's first page, side by side" intro="Columns are grouped by which places see similar results. Click a column title for the full list with headlines.">
                  <ByPlace a={a} vmap={vmap} results={state.results} site={site} onOpen={(id) => { setFocusId(id); document.getElementById("map")?.scrollIntoView({ behavior: "smooth" }); }} />
                </Section>

                <Section id="compare" kicker="Side by side" title="Compare two places" intro="Lines connect the same page (solid) or the same website with a different page (dashed). Results with no partner are only seen on one side.">
                  {diffPair && <SerpDiff ids={a.order} vmap={vmap} results={state.results} pair={diffPair} setPair={setPair} />}
                </Section>

                <Section id="ai" kicker="Google's AI Overview" title="Does Google's AI answer the same way everywhere?" intro="Google now writes an AI answer above the results for many searches. Here are two places' answers side by side, with the words that differ highlighted, and below them the sources each place's AI relied on.">
                  <AiDiff a={a} vmap={vmap} results={state.results} />
                  <h3 className="mb-4 mt-14 text-[21px]">Which sources does the AI cite in each place?</h3>
                  <AiLens analysis={a} vmap={vmap} results={state.results} />
                </Section>

                <Section id="map" kicker="Geography" title="Which places see the same thing?" intro="Places with similar results are joined by teal lines and share a colour. The red line connects the two most different places. Click a place to see its full results.">
                  <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
                    <div className="relative h-[460px] overflow-hidden rounded-md border border-rule bg-card md:h-[560px]">
                      <DotGlobe vantages={state.vantages} statuses={state.statuses} analysis={a} focus={state.vantages.some((v) => v.gl !== "in") ? "world" : "india"} selected={focusId} onSelect={setFocusId} />
                      <AnimatePresence>
                        {focusId && state.results[focusId] && vmap[focusId] && (
                          <Inspector key={focusId} v={vmap[focusId]} r={state.results[focusId]} a={a} onClose={() => setFocusId(null)} onDiff={(id) => { setPair([id, mostDifferentFrom(id)]); document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" }); }} />
                        )}
                      </AnimatePresence>
                    </div>
                    <div>
                      <div className="font-semibold">{a.clusters.length} {a.clusters.length === 1 ? "group" : "groups"} of places</div>
                      <ol className="mt-3 space-y-4">
                        {a.clusters.map((c, i) => {
                          const sets = c.map((id) => new Set(state.results[id]?.organic.map((o) => o.domain)));
                          const shared = [...(sets[0] || [])].filter((d) => sets.every((s) => s.has(d)));
                          return (
                            <li key={i} className="border-l-[3px] pl-3" style={{ borderColor: groupColor(i) }}>
                              <div className="flex flex-wrap gap-x-2 text-[15px] font-medium">
                                {c.map((id) => (
                                  <button key={id} onClick={() => setFocusId(id)} className="hover:underline">{vmap[id]?.label}</button>
                                ))}
                              </div>
                              <div className="mt-0.5 text-[13px] text-ink-2">
                                {c.length > 1 ? (shared.length ? `All see: ${shared.slice(0, 5).join(", ")}` : "Similar order, but no website is shared by all of them") : `On its own. Only here: ${(a.exclusives[c[0]] || []).slice(0, 3).map((e) => e.domain).join(", ") || "no unique sources"}`}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                </Section>

                <Section id="deeper" kicker="For researchers" title="Deeper analysis" intro="The measurements behind the summary. Download the spreadsheet for your own analysis.">
                  <div className="space-y-14">
                    <div>
                      <h3 className="flex items-center text-[21px]">
                        How alike is every pair of places?
                        <Help wide>Each square compares two places' first pages. “Same pages” counts identical links; “Same websites” counts the same site even if the page differs; “Overall” blends both and weighs the top results more.</Help>
                      </h3>
                      <div className="mt-4">
                        <Matrix analysis={a} vmap={vmap} selected={focusId} onSelect={setFocusId} onPair={(x, y) => { setPair([x, y]); document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" }); }} />
                      </div>
                    </div>
                    <div>
                      <h3 className="flex items-center text-[21px]">
                        How each website's rank moves from place to place
                        <Help wide>Each line is a website. Follow it left to right to see it rise and fall. A line dropping to “not on page 1” means that place doesn't show it at all.</Help>
                      </h3>
                      <div className="mt-4">
                        <Rivers analysis={a} vmap={vmap} />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[21px]">Who gets heard, and what the page looks like</h3>
                      <div className="mt-4">
                        <Anatomy analysis={a} vmap={vmap} />
                      </div>
                    </div>
                    {state.trends && (
                      <div>
                        <h3 className="flex items-center text-[21px]">
                          Where in India people search for this
                          <Help>From Google Trends: relative search interest by state over the past year. 100 = the state where it's most searched.</Help>
                        </h3>
                        <div className="mt-4">
                          <IndiaHeat trends={state.trends} vantages={state.vantages} />
                        </div>
                      </div>
                    )}
                  </div>
                </Section>

                <section id="cost" className="border-t border-rule py-12">
                  <CostReceipt state={state} creditsLeft={creditsLeft} live={!!config?.live} />
                </section>

                <section className="border-t border-rule py-12 text-[14px] leading-relaxed text-ink-2">
                  <div className="grid gap-8 md:grid-cols-3">
                    <div>
                      <h3 className="text-[18px] text-ink">How we measured this</h3>
                      <p className="mt-2">Each place's search ran through SerpApi with that place's Google location and language settings, at the same time. We compare first pages link by link and website by website, giving more weight to the top results.</p>
                    </div>
                    <div>
                      <h3 className="text-[18px] text-ink">What this can't show</h3>
                      <p className="mt-2">Results here are what an anonymous person in each place sees. Your own Google account, history and device can change things further. Rankings also move during the day, so treat this as a snapshot.</p>
                    </div>
                    <div>
                      <h3 className="text-[18px] text-ink">Data sources</h3>
                      <p className="mt-2">Google Search, Google AI Overview and Google Trends, fetched through SerpApi. The analysis text is written by Claude when an Anthropic key is set.</p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      )}

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-2 px-5 py-6 text-[13px] text-muted md:px-8">
          <span>Parallax · built for the SerpApi India Hackathon 2026</span>
          <span>Search data via SerpApi · #BuiltWithSerpApi</span>
        </div>
      </footer>

      <AnimatePresence>{share && a && <ShareCard analysis={a} lens={state.lens} vmap={vmap} onClose={() => setShare(false)} />}</AnimatePresence>
      {setup && config && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={() => setSetup(false)}>
          <div className="max-w-3xl rounded-md bg-paper p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {config.live ? (
              <div className="p-5">
                <div className="font-serif text-[22px] font-semibold">You're on live data</div>
                <p className="mt-2 text-ink-2">Searches run against Google through your SerpApi account{creditsLeft != null ? `, which has ${creditsLeft} searches left this month` : ""}. Results fetched in the last 6 hours are reused for free.</p>
                <p className="mt-2 text-ink-2">{config.ai ? `Written analysis and translations by ${config.model}.` : "Add ANTHROPIC_API_KEY to .env for written analysis and translation in language mode."}</p>
              </div>
            ) : (
              <SetupGuide config={config} compact />
            )}
            <div className="flex justify-end p-2">
              <button onClick={() => setSetup(false)} className="btn btn-primary">Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
