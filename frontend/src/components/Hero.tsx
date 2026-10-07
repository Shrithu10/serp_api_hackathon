import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Config, Lens, Vantage } from "../lib/types";
import DotGlobe from "./DotGlobe";
import VantagePicker from "./VantagePicker";

const EXAMPLES: Record<string, string[]> = {
  cities: ["best phone under 30000", "is ayurveda effective", "biryani near me", "who is the best cricketer", "monsoon flooding", "safest city for women"],
  languages: ["is ayurveda effective", "best government scheme for farmers", "how to invest in gold", "symptoms of dengue", "who invented zero"],
  world: ["India", "UPI payments", "is india safe for tourists", "best programming language", "Bollywood", "cricket world cup"],
};

const ROTATING = ["Search isn't one truth.", "Your city edits your internet.", "Same question. Different worlds.", "Measure the filter bubble."];

interface Props {
  config: Config | null;
  lensId: string;
  setLensId: (id: string) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  custom: Vantage[];
  setCustom: (v: Vantage[]) => void;
  onScan: (q: string) => void;
}

export default function Hero({ config, lensId, setLensId, selected, setSelected, custom, setCustom, onScan }: Props) {
  const [q, setQ] = useState("");
  const [line, setLine] = useState(0);
  const titleRef = useRef<HTMLDivElement>(null);
  const lens: Lens | undefined = config?.lenses.find((l) => l.id === lensId);

  useEffect(() => {
    const t = setInterval(() => setLine((x) => (x + 1) % ROTATING.length), 3200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Anaglyph offset follows the pointer: literal parallax.
    const el = titleRef.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      el.style.setProperty("--ax", (x * 7).toFixed(2));
      el.style.setProperty("--ay", (y * 4).toFixed(2));
      el.style.transform = `translate3d(${x * -10}px, ${y * -6}px, 0)`;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const shown = useMemo(() => {
    const base = lens?.vantages.filter((v) => selected.includes(v.id)) ?? [];
    return [...base, ...custom];
  }, [lens, selected, custom]);

  const submit = (text = q) => {
    const t = text.trim();
    if (t) onScan(t);
  };

  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      {/* backdrop glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-red/20 blur-[140px]" />
        <div className="absolute -right-40 top-0 h-[560px] w-[560px] rounded-full bg-cyan/15 blur-[150px]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink to-transparent" />
      </div>

      {/* Rising planet */}
      <div className="pointer-events-none absolute left-1/2 top-[58%] aspect-square w-[min(1700px,200vw)] -translate-x-1/2 opacity-90 md:top-[52%] md:w-[min(1700px,118vw)]">
        <DotGlobe vantages={shown} focus="world" interactive={false} intensity={0.6} labels={false} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 pt-28 text-center md:pt-32">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="eyebrow mb-6 flex items-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-cyan/60" />
          SerpApi India Hackathon 2026 · Knowledge &amp; Public Interest
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-red/60" />
        </motion.div>

        <div ref={titleRef} style={{ ["--ax" as string]: 4, ["--ay" as string]: 1 }} className="anaglyph select-none font-serif text-[clamp(64px,15vw,210px)] leading-[0.82] tracking-[-0.03em] text-fg transition-transform duration-300 ease-out">
          PARALLAX
        </div>

        <div className="mt-6 h-10 overflow-hidden font-serif text-[clamp(22px,3.2vw,38px)] italic text-fg/90">
          <AnimatePresence mode="wait">
            <motion.div key={line} initial={{ y: 30, opacity: 0, filter: "blur(6px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0)" }} exit={{ y: -30, opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.5 }}>
              {ROTATING[line]}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted md:text-base">
          Google doesn't show everyone the same web. PARALLAX fires your query from a dozen Indian cities, ten Indian languages or
          ten countries at the same time through <span className="text-fg">SerpApi</span>, then measures how far the results drift apart.
        </p>

        {/* Search */}
        <motion.form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="group relative mt-10 w-full max-w-3xl"
        >
          <div className="absolute -inset-px rounded-[26px] bg-gradient-to-r from-red/60 via-violet/40 to-cyan/60 opacity-40 blur-md transition group-focus-within:opacity-90" />
          <div className="glass relative flex items-center gap-3 rounded-[24px] bg-ink/85 p-2 pl-5">
            <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="12" r="6" stroke="#ff4d6d" />
              <circle cx="14" cy="12" r="6" stroke="#5ef2ff" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type anything people search for…"
              className="min-w-0 flex-1 bg-transparent py-3 text-lg text-fg outline-none md:text-xl"
              autoFocus
            />
            <button type="submit" disabled={!q.trim() || !config} className="relative shrink-0 overflow-hidden rounded-[18px] bg-fg px-5 py-3 text-sm font-semibold text-ink transition hover:scale-[1.03] active:scale-95 disabled:opacity-40 md:px-7">
              <span className="hidden sm:inline">Scan {shown.length || ""} {lensId === "languages" ? "tongues" : "vantages"} </span>→
            </button>
          </div>
        </motion.form>

        <div className="mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
          {(EXAMPLES[lensId] || []).map((ex) => (
            <button key={ex} onClick={() => { setQ(ex); submit(ex); }} className="rounded-full border border-line bg-white/[0.02] px-3 py-1.5 text-[13px] text-muted transition hover:border-cyan/40 hover:text-fg">
              {ex}
            </button>
          ))}
        </div>

        {/* Lens picker */}
        <div className="mt-12 grid w-full max-w-4xl grid-cols-1 gap-3 md:grid-cols-3">
          {config?.lenses.map((l, i) => {
            const active = l.id === lensId;
            return (
              <button
                key={l.id}
                onClick={() => {
                  setLensId(l.id);
                  setSelected(l.vantages.map((v) => v.id));
                }}
                className={`panel group relative overflow-hidden p-5 text-left transition ${active ? "border-cyan/40 bg-cyan/[0.04]" : "hover:border-line-2"}`}
              >
                {active && <motion.div layoutId="lens-glow" className="absolute inset-0 bg-gradient-to-br from-cyan/10 via-transparent to-red/10" />}
                <div className="relative">
                  <div className="eyebrow flex items-center justify-between">
                    <span>Lens 0{i + 1}</span>
                    <span className={active ? "text-cyan" : ""}>{l.vantages.length} vantages</span>
                  </div>
                  <div className="mt-3 font-serif text-3xl">{l.name}</div>
                  <div className="mt-1 text-sm text-muted">{l.tagline}</div>
                </div>
              </button>
            );
          })}
        </div>

        {lens && (
          <VantagePicker lens={lens} selected={selected} setSelected={setSelected} custom={custom} setCustom={setCustom} live={!!config?.live} />
        )}

        <div className="mb-24 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
          <span>Google Search API</span>
          <span>·</span>
          <span>AI Overview API</span>
          <span>·</span>
          <span>Google Trends API</span>
          <span>·</span>
          <span>Locations API</span>
          <span>·</span>
          <span>Account API</span>
        </div>
      </div>
    </section>
  );
}
