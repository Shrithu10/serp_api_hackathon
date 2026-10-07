import { useState } from "react";

const TAG = "Explored with Parallax + @SerpApi #BuiltWithSerpApi";

/** One-click share of a single finding to X or LinkedIn (or copy / native share). */
export default function ShareInsight({ text, sample }: { text: string; sample: boolean }) {
  const [copied, setCopied] = useState(false);
  // Never let demo numbers travel as if they were real findings.
  const body = `${text}${sample ? " [sample data]" : ""} ${TAG}`;
  const url = location.href;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(body)}`;
  const li = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(body)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="no-print mt-4 flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted">Share this finding:</span>
      <a href={x} target="_blank" rel="noreferrer" className="chip hover:border-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 3.9H5.4L17.7 20Z" /></svg>
        Post on X
      </a>
      <a href={li} target="_blank" rel="noreferrer" className="chip hover:border-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.5-2.1 2.9V21h-4V9Z" /></svg>
        Share on LinkedIn
      </a>
      <button onClick={copy} className="chip hover:border-ink">{copied ? "Copied" : "Copy text"}</button>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button onClick={() => navigator.share({ text: body, url }).catch(() => {})} className="chip hover:border-ink">
          More…
        </button>
      )}
      <span className="w-full text-[12.5px] italic text-muted">“{body}”</span>
    </div>
  );
}
