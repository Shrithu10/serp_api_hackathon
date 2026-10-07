import { useEffect, useRef, useState } from "react";

export interface ExportActions {
  csv: () => void;
  md: () => void;
  json: () => void;
  image: () => void;
  print: () => void;
}

export default function ExportMenu({ actions }: { actions: ExportActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = (label: string, hint: string, fn: () => void) => (
    <button
      onClick={() => {
        fn();
        setOpen(false);
      }}
      className="block w-full border-b border-rule px-4 py-2.5 text-left last:border-0 hover:bg-paper-2"
    >
      <div className="text-[14px] font-medium">{label}</div>
      <div className="text-[12.5px] text-muted">{hint}</div>
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn btn-ghost" aria-expanded={open}>
        Download ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-md border border-rule-2 bg-card shadow-xl">
          {item("Spreadsheet (CSV)", "Every result from every place, one row each", actions.csv)}
          {item("Written report (Markdown)", "Summary, analysis and top 5 per place", actions.md)}
          {item("Raw data (JSON)", "Everything, for your own analysis", actions.json)}
          {item("Image for sharing", "A 1200×630 card for social posts", actions.image)}
          {item("Print or save as PDF", "Uses your browser's print dialog", actions.print)}
        </div>
      )}
    </div>
  );
}
