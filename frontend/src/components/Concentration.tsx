import type { Analysis } from "../lib/types";
import Favicon from "./Favicon";
import Help from "./Help";
import ShareInsight from "./ShareInsight";

const LEVEL = {
  concentrated: { title: "Concentrated", tone: "border-accent bg-accent-soft/50", word: "text-accent" },
  moderate: { title: "Somewhat concentrated", tone: "border-gold bg-[#fbf3dc]", word: "text-gold" },
  diverse: { title: "Spread out", tone: "border-teal bg-teal-soft/50", word: "text-teal" },
};

/** Who owns the top three spots, across every place searched? */
export default function Concentration({ a, places, sample }: { a: Analysis; places: number; sample: boolean }) {
  const c = a.concentration;
  if (!c) return null;
  const L = LEVEL[c.level];
  const top2 = c.top.slice(0, 2).map((t) => t.domain);
  return (
    <div className={`rounded-md border-l-4 p-5 ${L.tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-[13px] font-semibold uppercase tracking-wide ${L.word}`}>{c.level === "concentrated" ? "⚠ " : ""}{L.title}</span>
        <span className="flex items-center text-[13px] text-ink-2">
          Who holds the top 3 spots
          <Help wide>
            We count every #1, #2 and #3 result across all {places} places ({c.slots} spots) and see which websites hold them. If a couple of sites own most of them everywhere, a handful of publishers effectively decide what the whole country reads first.
          </Help>
        </span>
      </div>
      <p className="mt-2 font-serif text-[22px] leading-snug">
        {c.level === "diverse" ? (
          <>The top 3 spots are shared among <b>{c.distinct} different websites</b>; no one dominates.</>
        ) : (
          <>
            Just <b>{top2.length} websites</b> ({top2.join(" and ")}) hold <b>{Math.round(c.top2_share * 100)}%</b> of all top-3 spots across {places} places.
          </>
        )}{" "}
        <span className="text-ink-2">Half of those spots belong to {c.k_half} {c.k_half === 1 ? "site" : "sites"}.</span>
      </p>
      <div className="mt-4 flex h-6 overflow-hidden rounded">
        {c.top.map((t, i) => (
          <div
            key={t.domain}
            title={`${t.domain}: ${t.count} of ${c.slots} top-3 spots`}
            className="h-full border-r border-paper"
            style={{ width: `${t.share * 100}%`, background: i < 2 ? "#1a1814" : ["#45413a", "#777166", "#a59e91", "#c9c0ae"][i - 2] ?? "#c9c0ae" }}
          />
        ))}
        <div className="h-full flex-1 bg-paper-2" title="Everyone else" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        {c.top.slice(0, 4).map((t) => (
          <span key={t.domain} className="flex items-center gap-1.5">
            <Favicon domain={t.domain} className="h-3.5 w-3.5" />
            {t.domain} <span className="num text-muted">{Math.round(t.share * 100)}%</span>
          </span>
        ))}
        <span className="text-muted">everyone else {Math.round((1 - c.top.reduce((s, t) => s + t.share, 0)) * 100)}%</span>
      </div>
      <ShareInsight
        sample={sample}
        text={
          c.level === "diverse"
            ? `For “${a.query}”, Google's top 3 spots across ${places} places in India are shared among ${c.distinct} different websites.`
            : `Just ${top2.length} websites (${top2.join(" and ")}) hold ${Math.round(c.top2_share * 100)}% of Google's top-3 spots for “${a.query}” across ${places} places.`
        }
      />
    </div>
  );
}
