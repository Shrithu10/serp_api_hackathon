import { useState } from "react";

/** Site icon with a lettered fallback, so offline / blocked icons never leave a hole. */
export default function Favicon({ domain, className = "h-4 w-4" }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-sm bg-paper-2 text-[9px] font-semibold uppercase text-ink-2 ${className}`}>
        {domain.replace(/^www\./, "")[0]}
      </span>
    );
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-sm ${className}`}
    />
  );
}
