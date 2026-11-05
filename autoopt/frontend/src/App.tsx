import { useEffect, useState } from "react";
import { FlaskConical, History as HistoryIcon, Moon, Sun, WifiOff } from "lucide-react";
import { api, Meta } from "./api";
import Lab from "./pages/Lab";
import RunView from "./pages/RunView";
import History from "./pages/History";

type Route = { page: "lab" } | { page: "run"; id: string } | { page: "history" };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("run/")) return { page: "run", id: h.slice(4) };
  if (h === "history") return { page: "history" };
  return { page: "lab" };
}

export function navigate(path: string) {
  location.hash = `#/${path}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem("autoopt-theme");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(String(e.message || e)));
  }, []);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      if (theme) localStorage.setItem("autoopt-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const isDark =
    theme === "dark" || (!theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const navItem = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-raised text-ink" : "text-sub hover:text-ink"
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5">
          <a href="#/" className="flex items-center gap-2 mr-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
              <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
                <path d="M5 23 L12 12 L18 18 L27 7" stroke="white" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight">AutoOpt</span>
            <span className="hidden sm:inline text-xs text-mute">Combinatorial Optimization Lab</span>
          </a>
          <nav className="flex items-center gap-1">
            <a href="#/" className={navItem(route.page === "lab")}>
              <FlaskConical size={15} /> Lab
            </a>
            <a href="#/history" className={navItem(route.page === "history")}>
              <HistoryIcon size={15} /> Runs
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-sub"
              title="All optimization runs locally. No external API, cloud service or hosted model is used."
            >
              <WifiOff size={12} /> Fully offline · localhost
            </span>
            <button
              className="rounded-lg p-1.5 text-sub hover:text-ink hover:bg-raised"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        {error && (
          <div className="card p-4 text-bad text-sm">
            Could not reach the local backend: {error}. Start it with <code className="font-mono">./run.sh</code>.
          </div>
        )}
        {meta && route.page === "lab" && <Lab meta={meta} />}
        {meta && route.page === "run" && <RunView key={route.id} id={route.id} meta={meta} />}
        {meta && route.page === "history" && <History />}
      </main>
    </div>
  );
}
