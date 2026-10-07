import { useState, type ReactNode } from "react";

/** A small "?" that explains a number or chart in plain words. Works on hover, focus and tap. */
export default function Help({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="What does this mean?"
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-[17px] w-[17px] items-center justify-center rounded-full border border-rule-2 text-[10.5px] font-semibold text-muted transition hover:border-ink hover:text-ink"
      >
        ?
      </button>
      {open && (
        <span role="tooltip" className={`absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md bg-ink px-3 py-2.5 text-left text-[13px] font-normal leading-snug text-paper shadow-lg ${wide ? "w-80" : "w-64"}`}>
          {children}
        </span>
      )}
    </span>
  );
}
