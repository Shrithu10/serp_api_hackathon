import { useEffect, useState } from "react";
import type { Config, SavedScan } from "../lib/types";
import { timeAgo } from "../lib/derive";
import ScanForm, { type ScanOptions } from "./ScanForm";
import DotGlobe from "./DotGlobe";
import SetupGuide from "./SetupGuide";

const USES = [
  {
    who: "Journalists & fact-checkers",
    title: "See which news each city is shown",
    body: "Find out whether people in Guwahati and Mumbai read the same coverage of a story, or completely different outlets.",
    q: "monsoon flooding",
    lens: "cities",
  },
  {
    who: "Businesses & marketers",
    title: "Check if your website shows up across India",
    body: "Add your site and see its Google rank in every city, where it's missing, and which competitors beat it there.",
    q: "best neet coaching",
    lens: "cities",
    site: "allen.ac.in",
  },
  {
    who: "Students & researchers",
    title: "Compare answers across Indian languages",
    body: "Ask the same health or science question in Hindi, Tamil, Bengali and more. See which sources each language is given.",
    q: "is ayurveda effective",
    lens: "languages",
  },
  {
    who: "Anyone curious",
    title: "How does the rest of the world see India?",
    body: "Search a topic about India from New York, London, Dubai and Dhaka, and compare it with what India itself sees.",
    q: "is india safe for tourists",
    lens: "world",
  },
];

interface Props {
  config: Config | null;
  creditsLeft: number | null;
  onScan: (o: ScanOptions) => void;
  onOpen: (id: string) => void;
}

export default function Landing({ config, creditsLeft, onScan, onOpen }: Props) {
  const [prefill, setPrefill] = useState<Partial<ScanOptions>>({});
  const [recent, setRecent] = useState<SavedScan[]>([]);
  const [examples, setExamples] = useState<SavedScan[]>([]);
  const [lensId, setLensId] = useState("cities");
  const lens = config?.lenses.find((l) => l.id === lensId);

  useEffect(() => {
    // Examples are built on first start; if they're still being built, look again shortly.
    const loadExamples = (retry: number) =>
      fetch("/api/examples")
        .then((r) => r.json())
        .then((rows: SavedScan[]) => {
          if (rows.length) setExamples(rows);
          else if (retry > 0) setTimeout(() => loadExamples(retry - 1), 1500);
        })
        .catch(() => {});
    loadExamples(4);
    fetch("/api/scans?limit=6")
      .then((r) => r.json())
      .then(setRecent)
      .catch(() => {});
  }, []);

  const featured = examples.length ? [...examples].sort((x, y) => (y.summary.score ?? 0) - (x.summary.score ?? 0))[0] : null;
  const surprise = () => {
    // Favour the most divided examples: pick randomly from the top half.
    const ranked = [...examples].sort((x, y) => (y.summary.score ?? 0) - (x.summary.score ?? 0));
    const pool = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
    onOpen(pool[Math.floor(Math.random() * pool.length)].id);
  };

  return (
    <div>
      {/* Lead */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-5 pb-14 pt-10 md:px-8 lg:grid-cols-[1.25fr_1fr] lg:pt-16">
        <div>
          <h1 className="text-[clamp(34px,4.6vw,56px)] leading-[1.05]">
            The same Google search gives <span className="mark">different answers</span> in different parts of India.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2">
            Type a search. Parallax runs it from 12 Indian cities, 10 Indian languages or 10 countries at the same moment, then shows you what changes,
            who gets heard where, and what you'd miss from where you are.
          </p>
          <div className="mt-8">
            <ScanForm config={config} initial={prefill} creditsLeft={creditsLeft} onSubmit={onScan} onLensChange={setLensId} />
          </div>
          {examples.length > 0 && (
            <div className="mt-6 border-t border-rule pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={surprise} className="btn btn-ghost">
                  <span aria-hidden>🎲</span> Surprise me
                </button>
                <span className="text-[14px] text-ink-2">or open a ready-made example (instant, no searches):</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {examples.map((e) => (
                  <button key={e.id} onClick={() => onOpen(e.id)} className="chip hover:border-ink">
                    {e.query}
                    <span className="text-[12px] text-muted">{e.lens === "languages" ? "languages" : e.lens === "world" ? "world" : "cities"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <figure className="relative">
          <div className="aspect-square w-full">
            {lens && <DotGlobe vantages={lens.vantages} focus={lensId === "world" ? "world" : "india"} interactive={false} />}
          </div>
          {featured && (
            <button onClick={() => onOpen(featured.id)} className="group mt-3 block w-full rounded-md border border-rule bg-card p-4 text-left transition hover:border-ink">
              <div className="text-[12.5px] font-semibold text-accent">Most divided example{featured.summary.synthetic ? " · sample data" : ""}</div>
              <div className="mt-1 font-serif text-[22px] font-semibold leading-tight">“{featured.query}”</div>
              <div className="mt-1.5 text-[14px] text-ink-2">
                <b className="num">{featured.summary.avg_differ}</b> of {Math.round(featured.summary.avg_len ?? 10)} top links differ between two places · {featured.summary.groups} groups
                {featured.summary.top2_share != null && <> · 2 sites hold <b className="num">{Math.round(featured.summary.top2_share * 100)}%</b> of the top spots</>}
              </div>
              <div className="mt-2 text-[13.5px] underline decoration-rule-2 underline-offset-4 group-hover:decoration-ink">Open it →</div>
            </button>
          )}
          <figcaption className="mt-2 text-center text-[13px] text-muted">
            {lensId === "world" ? "The 10 places searched in “India vs world”" : lensId === "languages" ? "Each language is searched from a city where it's widely spoken" : "The 12 cities searched by default"}
          </figcaption>
        </figure>
      </section>

      {!config?.live && config && (
        <section className="mx-auto max-w-[1200px] px-5 md:px-8">
          <SetupGuide config={config} />
        </section>
      )}

      {/* Use cases */}
      <section className="mx-auto max-w-[1200px] px-5 py-14 md:px-8">
        <h2 className="text-[28px]">What people use it for</h2>
        <p className="mt-1 text-ink-2">Pick one to fill in the search for you.</p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {USES.map((u) => (
            <button
              key={u.title}
              onClick={() => {
                setPrefill({ query: u.q, lens: u.lens, site: u.site ?? "" });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="group flex flex-col bg-card p-5 text-left transition hover:bg-paper"
            >
              <span className="text-[12.5px] font-semibold text-accent">{u.who}</span>
              <span className="mt-2 font-serif text-[20px] font-semibold leading-snug">{u.title}</span>
              <span className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-2">{u.body}</span>
              <span className="mt-4 text-[13.5px] text-ink underline decoration-rule-2 underline-offset-4 group-hover:decoration-ink">
                Try “{u.q}” →
              </span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-5 pb-14 md:px-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[24px]">Your recent searches</h2>
            <a href="?page=history" className="text-[14px] underline decoration-rule-2">See all</a>
          </div>
          <p className="mt-1 text-[14px] text-muted">Saved on this computer. Reopening one is instant and uses no searches.</p>
          <div className="mt-4 divide-y divide-rule border-y border-rule">
            {recent.map((s) => (
              <button key={s.id} onClick={() => onOpen(s.id)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-card">
                <span className="min-w-0 flex-1 truncate font-serif text-[18px]">“{s.query}”</span>
                <span className="hidden text-[13px] text-muted sm:block">{s.summary.places} places · {s.lens}</span>
                <span className="w-28 text-right text-[13px] text-muted">{timeAgo(s.created_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how" className="border-t border-rule bg-card">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 md:px-8 lg:grid-cols-3">
          <div>
            <h2 className="text-[28px]">How it works</h2>
            <p className="mt-2 text-ink-2">No browser tricks or VPNs. Parallax asks Google directly, the way someone in each place would.</p>
          </div>
          <ol className="space-y-6 lg:col-span-2">
            {[
              ["You type one search.", "Pick whether to compare cities, languages or countries. In language mode each language is searched in its own script: common searches have wording built in, and you can type your own for anything else."],
              ["We search from every place at once.", "Using SerpApi, the search runs in each place with that place's location and language settings. This is what a person there would see on Google, including the AI Overview, local results and top stories."],
              ["We line the results up and compare them.", "You get a plain-language summary, a list of what you would miss from your own city, a side-by-side view of every place, and exports for further work. Every search is saved so you can reopen it or check later what changed."],
            ].map(([t, b], i) => (
              <li key={t} className="grid grid-cols-[36px_1fr] gap-3">
                <span className="num flex h-8 w-8 items-center justify-center rounded-full border border-ink text-[14px]">{i + 1}</span>
                <div>
                  <div className="font-serif text-[19px] font-semibold">{t}</div>
                  <p className="mt-1 leading-relaxed text-ink-2">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
