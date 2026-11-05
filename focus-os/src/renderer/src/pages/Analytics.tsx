import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DayStats } from '@shared/metrics'
import { fmtDay, fmtDuration, fmtHour, HOUR, MIN } from '@shared/time'
import { useDays } from '../lib/hooks'
import { useStore } from '../lib/store'
import { AXIS, CAT_COLOR, GRID } from '../lib/ui'
import { CAT_LEGEND } from '../components/blocks'
import { Card, ChartTip, Empty, Legend, PageHeader, Segmented, Stat } from '../components/ui'

const short = (ts: number): string => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
const axis = { stroke: AXIS, tick: { fontSize: 11 }, tickLine: false, axisLine: false } as const
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const avg = (xs: number[]): number | null => (xs.length ? sum(xs) / xs.length : null)

function Change({ cur, prev, goodUp = true, fmt }: { cur: number; prev: number; goodUp?: boolean; fmt: (n: number) => string }): JSX.Element {
  if (!prev) return <span className="text-mute">No prior week</span>
  const d = ((cur - prev) / prev) * 100
  const good = goodUp ? d >= 0 : d <= 0
  return <span><span style={{ color: Math.abs(d) < 3 ? '#a1a1aa' : good ? CAT_COLOR.productive : CAT_COLOR.distracting }}>{d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(d))}%</span> <span className="text-mute">vs {fmt(prev)} last week</span></span>
}

export default function Analytics(): JSX.Element {
  const { sessions } = useStore()
  const [range, setRange] = useState<7 | 14 | 28>(14)
  const all = useDays(28)
  const days = all.slice(-range)
  const tracked = days.filter((d) => d.activeMs > 0)
  const thisW = all.slice(-7), lastW = all.slice(-14, -7)
  const wk = (ds: DayStats[], f: (d: DayStats) => number): number => sum(ds.map(f))
  const scores = tracked.map((d) => d.focusScore).filter((x): x is number => x !== null)
  const trend = days.map((d) => ({ ts: d.dayStart, score: d.focusScore, Productive: +(d.productiveMs / HOUR).toFixed(2), Neutral: +(d.neutralMs / HOUR).toFixed(2), Distracting: +(d.distractingMs / HOUR).toFixed(2), Deep: +(d.deepWorkMs / HOUR).toFixed(2), switches: d.activeMs > 0 ? d.contextSwitches : null }))
  const blocks = tracked.flatMap((d) => d.blocks).filter((b) => b.productiveMs >= 2 * MIN)
  const longest = tracked.reduce<{ ms: number; ts: number } | null>((m, d) => (d.longestBlock && (!m || d.longestBlock.productiveMs > m.ms) ? { ms: d.longestBlock.productiveMs, ts: d.dayStart } : m), null)
  // productive minutes by hour averaged over tracked weekdays (heatmap strip)
  const heat = Array.from({ length: 24 }, (_, h) => (tracked.length ? sum(tracked.map((d) => d.hourly[h].productive)) / tracked.length / MIN : 0))
  const maxHeat = Math.max(...heat, 1)
  const sess = sessions.filter((s) => s.end > days[0].dayStart)

  if (!tracked.length) return <div><PageHeader title="Analytics" /><Card><Empty title="No data in this range" hint="Analytics build up as Focus OS records your activity." /></Card></div>
  const tickX = { dataKey: 'ts', tickFormatter: short, interval: range === 28 ? 3 : range === 14 ? 1 : 0, ...axis }

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Trends across your recorded days.">
        <Segmented value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }, { value: 28, label: '28 days' }]} />
      </PageHeader>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Avg focus score" value={scores.length ? String(Math.round(avg(scores)!)) : '–'} sub={`${scores.length} scored days`} />
          <Stat label="Avg uninterrupted" value={blocks.length ? fmtDuration(avg(blocks.map((b) => b.productiveMs))!, { short: true }) : '–'} sub="Mean productive stretch" />
          <Stat label="Longest deep work" value={longest ? fmtDuration(longest.ms, { short: true }) : '–'} sub={longest ? fmtDay(longest.ts) : undefined} accent="#818cf8" />
          <Stat label="Context switches / day" value={String(Math.round(avg(tracked.map((d) => d.contextSwitches))!))} sub="Average over tracked days" />
        </div>

        <Card className="card-pad col-span-12 lg:col-span-6">
          <div className="label mb-3">Daily focus score</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} /><stop offset="100%" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis {...tickX} /><YAxis {...axis} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
              <Tooltip content={<ChartTip fmt={(v) => String(v)} title={(l) => fmtDay(Number(l))} />} />
              <Area type="monotone" dataKey="score" name="Focus score" stroke="#818cf8" strokeWidth={2} fill="url(#sg)" connectNulls dot={{ r: 3, fill: '#818cf8', stroke: '#0f0f13', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="card-pad col-span-12 lg:col-span-6">
          <div className="mb-3 flex items-center justify-between"><div className="label">Time by category (hours)</div><Legend items={CAT_LEGEND} /></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis {...tickX} /><YAxis {...axis} />
              <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTip fmt={(v) => `${v.toFixed(1)} h`} title={(l) => fmtDay(Number(l))} />} />
              <Bar dataKey="Productive" stackId="a" fill={CAT_COLOR.productive} stroke="#0f0f13" strokeWidth={1} />
              <Bar dataKey="Neutral" stackId="a" fill={CAT_COLOR.neutral} stroke="#0f0f13" strokeWidth={1} />
              <Bar dataKey="Distracting" stackId="a" fill={CAT_COLOR.distracting} stroke="#0f0f13" strokeWidth={1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="card-pad col-span-12 lg:col-span-6">
          <div className="label mb-3">Deep work (hours per day)</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={trend} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis {...tickX} /><YAxis {...axis} />
              <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTip fmt={(v) => `${v.toFixed(1)} h`} title={(l) => fmtDay(Number(l))} />} />
              <Bar dataKey="Deep" name="Deep work" fill="#818cf8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="card-pad col-span-12 lg:col-span-6">
          <div className="label mb-3">Context switches per day</div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis {...tickX} /><YAxis {...axis} />
              <Tooltip content={<ChartTip fmt={(v) => String(v)} title={(l) => fmtDay(Number(l))} />} />
              <Line type="monotone" connectNulls dataKey="switches" name="Switches" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24', stroke: '#0f0f13', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="card-pad col-span-12">
          <div className="label mb-1">When you do productive work</div>
          <p className="mb-3 text-[12px] text-sub">Average productive minutes in each hour of the day over {tracked.length} tracked days.</p>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
            {heat.map((v, h) => <div key={h} title={`${fmtHour(h)}: ${v.toFixed(0)} min on average`} className="h-9 rounded-[4px]" style={{ background: v < 0.5 ? '#16161c' : `rgba(52,211,153,${0.15 + 0.85 * (v / maxHeat)})` }} />)}
          </div>
          <div className="mt-1.5 grid text-[10px] text-mute" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>{heat.map((_, h) => <span key={h} className="text-center">{h % 3 === 0 ? h : ''}</span>)}</div>
        </Card>

        <Card className="card-pad col-span-12">
          <div className="label mb-4">This week vs last week</div>
          <div className="grid gap-6 md:grid-cols-4">
            {([
              ['Productive time', wk(thisW, (d) => d.productiveMs), wk(lastW, (d) => d.productiveMs), true, (n: number) => fmtDuration(n, { short: true })],
              ['Distraction time', wk(thisW, (d) => d.distractingMs), wk(lastW, (d) => d.distractingMs), false, (n: number) => fmtDuration(n, { short: true })],
              ['Deep work', wk(thisW, (d) => d.deepWorkMs), wk(lastW, (d) => d.deepWorkMs), true, (n: number) => fmtDuration(n, { short: true })],
              ['Context switches', wk(thisW, (d) => d.contextSwitches), wk(lastW, (d) => d.contextSwitches), false, (n: number) => String(Math.round(n))]
            ] as const).map(([l, c, p, up, f]) => (
              <div key={l}><div className="label">{l}</div><div className="tabular mt-1.5 text-[22px] font-semibold">{f(c)}</div><div className="mt-1 text-[12px]"><Change cur={c} prev={p} goodUp={up} fmt={f} /></div></div>
            ))}
          </div>
        </Card>

        <Card className="card-pad col-span-12">
          <div className="label mb-3">Focus session history</div>
          {sess.length ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={[...sess].reverse().map((s) => ({ ts: s.start, Consistency: s.consistency }))} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="ts" tickFormatter={short} {...axis} minTickGap={24} /><YAxis {...axis} domain={[0, 100]} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTip title={(l) => `${fmtDay(Number(l))} ${new Date(Number(l)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} />} />
                <Bar dataKey="Consistency" fill="#818cf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-[13px] text-mute">No focus sessions in this range.</p>}
        </Card>
      </div>
    </div>
  )
}
