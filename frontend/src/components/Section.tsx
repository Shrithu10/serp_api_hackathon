import type { ReactNode } from "react";
import { motion } from "motion/react";

export default function Section({ n, title, kicker, children, right, className = "" }: { n: string; title: ReactNode; kicker?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`panel p-5 md:p-7 ${className}`}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className="text-cyan">{n}</span>
            <span className="h-px w-6 bg-line-2" />
          </div>
          <h2 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">{title}</h2>
          {kicker && <p className="mt-1.5 max-w-2xl text-sm text-muted">{kicker}</p>}
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
}
