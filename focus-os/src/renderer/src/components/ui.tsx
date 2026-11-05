import type { ReactNode } from 'react'
import type { Category } from '@shared/types'
import { CAT_COLOR, CAT_TEXT, cx, hashColor } from '../lib/ui'

export const Card = ({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }): JSX.Element => (
  <div className={cx('card animate-fadeUp', className)} style={{ animationDelay: `${delay}ms` }}>{children}</div>
)

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-sub">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function CatChip({ cat, label }: { cat: Category; label?: string }): JSX.Element {
  return (
    <span className="chip" style={{ background: CAT_COLOR[cat] + '22', color: cat === 'neutral' ? '#94a3b8' : CAT_COLOR[cat] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[cat] }} />{label ?? CAT_TEXT[cat]}
    </span>
  )
}

export function AppAvatar({ name, size = 28 }: { name: string; size?: number }): JSX.Element {
  return (
    <span className="grid shrink-0 place-items-center rounded-lg font-semibold text-white/90" style={{ width: size, height: size, background: hashColor(name), fontSize: size * 0.42 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function Stat({ label, value, sub, accent, delay = 0 }: { label: string; value: string; sub?: ReactNode; accent?: string; delay?: number }): JSX.Element {
  return (
    <Card className="card-pad" delay={delay}>
      <div className="flex items-center gap-2"><span className="label">{label}</span>{accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}</div>
      <div className="tabular mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-2 text-[12px] text-sub">{sub}</div>}
    </Card>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} onClick={() => onChange(o.value)} className={cx('rounded-md px-3 py-1 text-[12px] font-medium transition', o.value === value ? 'bg-raised text-ink shadow' : 'text-sub hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-3">
      <span><span className="block text-[13px] font-medium">{label}</span>{hint && <span className="mt-0.5 block text-[12px] text-sub">{hint}</span>}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-[#2c2c36]')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-dashed border-line" />
      <div className="text-[14px] font-medium">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[12px] text-sub">{hint}</div>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export function Ring({ value, size = 150, stroke = 10, color = '#818cf8', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }): JSX.Element {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d1d25" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Dark tooltip shared by all Recharts charts. */
export function ChartTip({ active, payload, label, fmt, title }: { active?: boolean; payload?: { name: string; value: number; color?: string; fill?: string }[]; label?: string | number; fmt?: (v: number, name: string) => string; title?: (l: string | number) => string }): JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 text-[12px] shadow-xl">
      {label !== undefined && <div className="mb-1 font-medium text-ink">{title ? title(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-sub">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />{p.name}</span>
          <span className="tabular text-ink">{fmt ? fmt(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-sub">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  )
}
