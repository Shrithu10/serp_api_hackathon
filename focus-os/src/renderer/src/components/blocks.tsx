import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DayStats, TimelineBlock } from '@shared/metrics'
import type { Insight } from '@shared/insights'
import { fmtDuration, fmtHM, fmtHour, MIN } from '@shared/time'
import { AXIS, CAT_COLOR, CAT_TEXT, GRID, IDLE_COLOR, cx } from '../lib/ui'
import { ChartTip, Legend } from './ui'
import { Icon } from './Icon'

export const CAT_LEGEND = [
  { label: 'Productive', color: CAT_COLOR.productive },
  { label: 'Neutral', color: CAT_COLOR.neutral },
  { label: 'Distracting', color: CAT_COLOR.distracting }
]

/** Horizontal strip showing the day's activity coloured by category. */
export function TimelineStrip({ blocks, from, to, height = 44, ticks = true }: { blocks: TimelineBlock[]; from: number; to: number; height?: number; ticks?: boolean }): JSX.Element {
  const [hover, setHover] = useState<TimelineBlock | null>(null)
  const span = to - from
  const hours: number[] = []
  for (let t = Math.ceil(from / 3_600_000) * 3_600_000; t < to; t += 3_600_000) hours.push(t)
  const step = Math.max(1, Math.ceil(hours.length / 10))
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-bg" style={{ height }} onMouseLeave={() => setHover(null)}>
        {hours.map((t) => <div key={t} className="absolute top-0 h-full w-px bg-line/60" style={{ left: `${((t - from) / span) * 100}%` }} />)}
        {blocks.map((b, i) => (
          <div key={i} onMouseEnter={() => setHover(b)} className="absolute top-1 bottom-1 rounded-[3px] transition hover:brightness-125"
            style={{ left: `${((b.start - from) / span) * 100}%`, width: `max(2px, calc(${((b.end - b.start) / span) * 100}% - 1px))`, background: b.idle ? IDLE_COLOR : CAT_COLOR[b.category], opacity: b.idle ? 0.8 : 1 }} />
        ))}
        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] shadow-xl">
            <span className="font-medium">{hover.idle ? 'Idle' : hover.entity}</span> <span className="text-sub">{fmtHM(hover.start)}–{fmtHM(hover.end)} · {fmtDuration(hover.end - hover.start, { short: true })}</span>
          </div>
        )}
      </div>
      {ticks && (
        <div className="relative mt-1.5 h-4 text-[10px] text-mute">
          {hours.filter((_, i) => i % step === 0).map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${((t - from) / span) * 100}%` }}>{fmtHour(new Date(t).getHours())}</span>)}
        </div>
      )}
    </div>
  )
}

/** Stacked minutes per hour by category. One axis, thin rounded bars. */
export function HourlyChart({ day, from = 0, to = 23, height = 220 }: { day: DayStats; from?: number; to?: number; height?: number }): JSX.Element {
  const data = day.hourly.filter((h) => h.hour >= from && h.hour <= to).map((h) => ({
    hour: h.hour, Productive: Math.round(h.productive / MIN), Neutral: Math.round(h.neutral / MIN), Distracting: Math.round(h.distracting / MIN)
  }))
  return (
    <div>
      <div className="mb-3"><Legend items={CAT_LEGEND} /></div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="hour" tickFormatter={(h: number) => fmtHour(h).replace(' ', '').toLowerCase()} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} unit="m" />
          <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTip fmt={(v) => `${v} min`} title={(l) => `${fmtHour(Number(l))}`} />} />
          <Bar dataKey="Productive" stackId="a" fill={CAT_COLOR.productive} stroke="#0f0f13" strokeWidth={1} />
          <Bar dataKey="Neutral" stackId="a" fill={CAT_COLOR.neutral} stroke="#0f0f13" strokeWidth={1} />
          <Bar dataKey="Distracting" stackId="a" fill={CAT_COLOR.distracting} stroke="#0f0f13" strokeWidth={1} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function InsightCard({ i }: { i: Insight }): JSX.Element {
  const c = i.tone === 'positive' ? CAT_COLOR.productive : i.tone === 'warning' ? '#fbbf24' : '#818cf8'
  const icon = i.tone === 'positive' ? 'check' : i.tone === 'warning' ? 'bolt' : 'insights'
  return (
    <div className="flex gap-3.5 rounded-xl border border-line bg-panel p-4">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: c + '1f', color: c }}><Icon name={icon} size={14} /></span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-snug">{i.title}</div>
        <div className="mt-1 text-[13px] leading-relaxed text-sub">{i.detail}</div>
        <div className="mt-2 text-[11px] text-mute">Based on: {i.basis}</div>
      </div>
    </div>
  )
}

export function ScoreHelp({ day }: { day: DayStats }): JSX.Element {
  const b = day.breakdown
  const rows = b ? [
    ['Productive share', b.productiveShare, 45], ['Deep work share', b.deepWorkShare, 25], ['Low distraction', b.lowDistraction, 15], ['Switch stability', b.switchStability, 15]
  ] as const : []
  return (
    <div className="space-y-2.5">
      {rows.map(([l, v, w]) => (
        <div key={l}>
          <div className="mb-1 flex justify-between text-[12px]"><span className="text-sub">{l} <span className="text-mute">· weight {w}%</span></span><span className="tabular">{Math.round(v * 100)}%</span></div>
          <div className="h-1 rounded-full bg-[#1d1d25]"><div className="h-1 rounded-full bg-accent" style={{ width: `${v * 100}%` }} /></div>
        </div>
      ))}
      {!b && <p className="text-[12px] text-mute">A score appears after 5 minutes of tracked activity.</p>}
    </div>
  )
}

export const catBadge = (c: keyof typeof CAT_TEXT): string => CAT_TEXT[c]
export { cx }
