import type { Config } from "../lib/types";

export default function SetupGuide({ compact }: { config?: Config; compact?: boolean }) {
  return (
    <div className={`rounded-md border border-gold/40 bg-[#fbf3dc] ${compact ? "p-4" : "p-5 md:p-6"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-serif text-[20px] font-semibold">You're looking at demo data</div>
        <span className="text-[13px] text-ink-2">Everything works, but results are made-up samples.</span>
      </div>
      <ol className="mt-3 grid gap-3 text-[14px] leading-relaxed text-ink-2 md:grid-cols-3">
        <li>
          <b className="text-ink">1. Get a free SerpApi key.</b>{" "}
          <a href="https://serpapi.com/users/sign_up?plan=free" target="_blank" rel="noreferrer" className="underline">Sign up at serpapi.com</a>. The free plan includes 250 searches a month, enough for about 18 full comparisons.
        </li>
        <li>
          <b className="text-ink">2. Add it to the <code className="rounded bg-paper-2 px-1">.env</code> file</b> in the project folder:
          <code className="mt-1 block rounded bg-paper-2 px-2 py-1 text-[12.5px]">SERPAPI_API_KEY=your_key</code>
        </li>
        <li>
          <b className="text-ink">3. Restart Parallax</b> with <code className="rounded bg-paper-2 px-1">./run.sh</code>. The badge at the top will switch to “Live data”.
        </li>
      </ol>
    </div>
  );
}
