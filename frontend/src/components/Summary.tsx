import type { ReactNode } from "react";
import type { Analysis, Vantage } from "../lib/types";
import type { changesSince } from "../lib/derive";
import Help from "./Help";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

function BriefText({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return <div className="h-24 animate-pulse rounded bg-paper-2" />;
  return (
    <div className={`space-y-2.5 text-[15.5px] leading-relaxed ${streaming ? "caret" : ""}`}>
      {lines.map((l, i) => {
        const clean = l.replace(/^\s*[-*•]\s+/, "").replace(/^#+\s*/, "");
        if (/^\s*[-*•]\s+/.test(l))
          return (
            <div key={i} className="flex gap-2.5">
              <span className="mt-[10px] h-1 w-3 shrink-0 bg-accent" />
              <span>{inline(clean)}</span>
            </div>
          );
        if (/^what to do/i.test(clean) || /^blind spot/i.test(clean))
          return (
            <p key={i} className="border-l-2 border-accent pl-3 text-ink">
              {inline(clean)}
            </p>
          );
        return <p key={i} className={i === 0 ? "font-serif text-[19px] leading-snug" : ""}>{inline(clean)}</p>;
      })}
    </div>
  );
}

export function headline(a: Analysis, lens: string) {
  const r = a.plain.avg_differ / Math.max(1, a.plain.avg_len);
  const what = lens === "languages" ? "the language you search in" : lens === "world" ? "the country you search from" : "the city you search from";
  if (r < 0.2) return { short: "Barely", text: `No. For this search, ${what} barely changes what you see.` };
  if (r < 0.45) return { short: "Somewhat", text: `Somewhat. ${what[0].toUpperCase() + what.slice(1)} changes part of what you see.` };
  if (r < 0.7) return { short: "Yes", text: `Yes. ${what[0].toUpperCase() + what.slice(1)} changes much of what you see.` };
  return { short: "A lot", text: `Yes, a lot. Different places get almost completely different results.` };
}

interface Props {
  a: Analysis;
  lens: string;
  vmap: Record<string, Vantage>;
  brief: string;
  streaming: boolean;
  changes: ReturnType<typeof changesSince> | null;
  prevWhen: string | null;
}

export default function Summary({ a, lens, vmap, brief, streaming, changes, prevWhen }: Props) {
  const p = a.plain;
  const h = headline(a, lens);
  const stats: { big: ReactNode; label: ReactNode; help: string }[] = [
    {
      big: (
        <>
          {p.avg_differ}
          <span className="text-[22px] font-normal text-muted"> of {p.avg_len}</span>
        </>
      ),
      label: "top links differ between any two places",
      help: "Take any two places and compare their first page of Google. On average this many of the links are different. 0 means identical pages.",
    },
    {
      big: (
        <>
          {p.top1_agree}
          <span className="text-[22px] font-normal text-muted"> of {p.places}</span>
        </>
      ),
      label: (
        <>
          places show the same #1 result (<span className="font-medium text-ink">{p.top1_domain}</span>)
        </>
      ),
      help: "The first result gets most of the clicks. This counts how many places agree on it.",
    },
    {
      big: p.groups,
      label: p.groups === 1 ? "group: everyone sees roughly the same page" : "groups of places that see similar pages",
      help: "Places whose result pages are more than half alike are grouped together. One group means a shared reality; many groups means a fragmented one.",
    },
    {
      big: (
        <>
          {p.ai_count}
          <span className="text-[22px] font-normal text-muted"> of {p.places}</span>
        </>
      ),
      label: "places got Google's AI answer (AI Overview)",
      help: "Google sometimes shows an AI-written answer above the results. Whether it appears, and which sources it quotes, can vary by place.",
    },
  ];

  return (
    <div>
      <p className="text-[clamp(26px,3.2vw,38px)] font-serif font-semibold leading-tight">{h.text}</p>

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-card p-5">
            <div className="font-serif text-[44px] font-semibold leading-none tabular-nums">{s.big}</div>
            <div className="mt-2 text-[14px] leading-snug text-ink-2">
              {s.label}
              <Help>{s.help}</Help>
            </div>
          </div>
        ))}
      </div>

      {/* Difference meter */}
      <div className="mt-8 max-w-3xl">
        <div className="flex items-center text-[14px] font-medium">
          Difference score: <span className="num ml-1.5">{Math.round(a.index)}/100</span>
          <Help wide>
            A single number for how different the result pages are, where agreement near the top counts more than agreement lower down (a method called rank-biased overlap). 0 = every place sees the same page; 100 = no overlap at all.
          </Help>
        </div>
        <div className="relative mt-3 h-2.5 rounded-full" style={{ background: "linear-gradient(90deg, #d6e7e5, #e9dfc9 50%, #f4dcd3)" }}>
          <div className="absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded bg-ink" style={{ left: `calc(${a.index}% - 1.5px)` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[12.5px] text-muted">
          <span>Same everywhere</span>
          <span>Somewhat different</span>
          <span>Completely different</span>
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          Most alike: <b>{vmap[a.most_similar.a]?.label}</b> and <b>{vmap[a.most_similar.b]?.label}</b>. Most different: <b>{vmap[a.most_different.a]?.label}</b> and{" "}
          <b>{vmap[a.most_different.b]?.label}</b>. Least typical: <b>{vmap[a.outlier]?.label}</b>.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex items-center text-[13px] font-semibold text-accent">
            What the numbers say
            <Help>Written automatically from the measurements on this page, so it only says what the data shows.</Help>
          </div>
          <BriefText text={brief} streaming={streaming} />
        </div>
        <aside className="rounded-md border border-rule bg-card p-4 text-[14px]">
          <div className="font-semibold">Since your last search</div>
          {changes && prevWhen ? (
            <div className="mt-2 space-y-1.5 text-ink-2">
              <p className="text-[13px] text-muted">Compared with the same search {prevWhen}.</p>
              <p><b className="num text-ink">{changes.totalAdded}</b> new sources appeared across all places.</p>
              <p><b className="num text-ink">{changes.topChanged}</b> {changes.topChanged === 1 ? "place has" : "places have"} a new #1 result.</p>
              {changes.scoreDelta != null && (
                <p>
                  Difference score {changes.scoreDelta === 0 ? "unchanged" : changes.scoreDelta > 0 ? `up ${changes.scoreDelta}` : `down ${Math.abs(changes.scoreDelta)}`}.
                </p>
              )}
              {changes.places.filter((c) => c.newTop !== c.oldTop).slice(0, 3).map((c) => (
                <p key={c.id} className="text-[13px]">
                  {vmap[c.id]?.label}: #1 is now <b>{c.newTop}</b> (was {c.oldTop})
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-ink-2">This is your first saved search for this. Run it again later to see what changed. Results shift as news breaks and rankings move.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
