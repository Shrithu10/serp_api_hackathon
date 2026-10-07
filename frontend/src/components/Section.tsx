import type { ReactNode } from "react";

export default function Section({ id, kicker, title, intro, aside, children }: { id: string; kicker?: string; title: ReactNode; intro?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-rule py-12 md:py-14">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {kicker && <div className="kicker mb-1.5">{kicker}</div>}
          <h2 className="text-[28px] leading-tight md:text-[32px]">{title}</h2>
          {intro && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{intro}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
