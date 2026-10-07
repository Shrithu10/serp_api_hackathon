import type { Config } from "../lib/types";

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="26" cy="32" r="15" fill="none" stroke="#1a1814" strokeWidth="5" />
      <circle cx="38" cy="32" r="15" fill="none" stroke="#c8442a" strokeWidth="5" />
    </svg>
  );
}

interface Props {
  config: Config | null;
  creditsLeft: number | null;
  page: string;
  go: (page: "home" | "history") => void;
  onSetup: () => void;
}

export default function Header({ config, creditsLeft, page, go, onSetup }: Props) {
  const link = (p: "home" | "history", label: string) => (
    <button onClick={() => go(p)} className={`whitespace-nowrap px-1 py-1 text-[14px] ${page === p ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}>
      {label}
    </button>
  );
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-5 px-5 md:px-8">
        <button onClick={() => go("home")} className="flex items-center gap-2">
          <Mark />
          <span className="hidden font-serif text-[21px] font-semibold tracking-tight min-[400px]:inline">Parallax</span>
        </button>
        <nav className="flex items-center gap-2 sm:ml-2 sm:gap-3">
          {link("home", "New search")}
          {link("history", "History")}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-[13px]">
          {config && (
            <button onClick={onSetup} className="flex items-center gap-1.5 rounded-full border border-rule-2 px-2.5 py-1 hover:border-ink" title={config.live ? "Results come from Google via SerpApi" : "No SerpApi key yet. Click for setup steps"}>
              <span className={`h-2 w-2 rounded-full ${config.live ? "bg-good" : "bg-gold"}`} />
              <span className="hidden whitespace-nowrap sm:inline">{config.live ? "Live data" : "Demo data"}</span>
              <span className="sm:hidden">{config.live ? "Live" : "Demo"}</span>
            </button>
          )}
          {config?.live && creditsLeft != null && <span className="hidden text-ink-2 sm:inline">{creditsLeft} searches left</span>}
        </div>
      </div>
    </header>
  );
}
