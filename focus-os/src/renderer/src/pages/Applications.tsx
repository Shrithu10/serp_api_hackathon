import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { isBrowserName } from '@shared/apps'
import type { DayStats } from '@shared/metrics'
import { fmtDuration } from '@shared/time'
import type { Category } from '@shared/types'
import { api } from '../lib/api'
import { useDays } from '../lib/hooks'
import { useStore } from '../lib/store'
import { CAT_COLOR, CAT_TEXT } from '../lib/ui'
import { ChartTip, AppAvatar, Card, Empty, PageHeader, Segmented } from '../components/ui'

type Period = 'today' | 'week'
const PIE = ['#818cf8', '#2dd4bf', '#fbbf24', '#f472b6', '#38bdf8', '#a3e635', '#c084fc']

interface Row { name: string; ms: number; cat: Category; prev: number }
function aggregate(cur: DayStats[], prev: DayStats[]): { rows: Row[]; total: number; prevTotal: number; sites: { name: string; app: string; ms: number; cat: Category }[] } {
  const m = new Map<string, { ms: number; by: Record<Category, number> }>()
  for (const d of cur) for (const a of d.apps) {
    const x = m.get(a.appName) ?? { ms: 0, by: { productive: 0, neutral: 0, distracting: 0 } }
    x.ms += a.ms; for (const k of Object.keys(x.by) as Category[]) x.by[k] += a.byCategory[k]
    m.set(a.appName, x)
  }
  const pm = new Map<string, number>()
  for (const d of prev) for (const a of d.apps) pm.set(a.appName, (pm.get(a.appName) ?? 0) + a.ms)
  const rows = [...m.entries()].map(([name, v]) => ({ name, ms: v.ms, cat: (Object.entries(v.by).sort((a, b) => b[1] - a[1])[0][0]) as Category, prev: pm.get(name) ?? 0 })).sort((a, b) => b.ms - a.ms)
  const sm = new Map<string, { name: string; app: string; ms: number; cat: Category }>()
  for (const d of cur) for (const e of d.entities) if (isBrowserName(e.appName) && e.entity !== e.appName) {
    const k = e.entity + e.appName
    const x = sm.get(k)
    if (x) x.ms += e.ms; else sm.set(k, { name: e.entity, app: e.appName, ms: e.ms, cat: e.category })
  }
  return { rows, total: rows.reduce((n, r) => n + r.ms, 0), prevTotal: [...pm.values()].reduce((a, b) => a + b, 0), sites: [...sm.values()].sort((a, b) => b.ms - a.ms) }
}

export default function Applications(): JSX.Element {
  const days = useDays(14)
  const { rules, setRules, notify } = useStore()
  const [period, setPeriod] = useState<Period>('today')
  const cur = period === 'today' ? days.slice(-1) : days.slice(-7)
  const prev = period === 'today' ? days.slice(-2, -1) : days.slice(0, 7)
  const { rows, total, prevTotal, sites } = useMemo(() => aggregate(cur, prev), [days, period])
  const pie = [...rows.slice(0, 7).map((r, i) => ({ name: r.name, value: r.ms, color: PIE[i] })), ...(rows.length > 7 ? [{ name: 'Other', value: rows.slice(7).reduce((n, r) => n + r.ms, 0), color: '#3f3f46' }] : [])]
  const vs = period === 'today' ? 'yesterday' : 'previous 7 days'

  const reclass = async (name: string, cat: Category): Promise<void> => {
    const existing = rules.find((r) => !r.builtin && r.matchType === 'app' && r.pattern.toLowerCase() === name.toLowerCase())
    setRules(await api.upsertRule({ id: existing?.id, matchType: 'app', pattern: name, category: cat, label: '' }))
    notify(`${name} is now ${CAT_TEXT[cat].toLowerCase()}`)
  }

  return (
    <div>
      <PageHeader title="Applications" subtitle="Where your time went, and how each app is classified.">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }]} />
      </PageHeader>
      {!rows.length ? <Card><Empty title="No application usage in this period" hint="Use your computer for a few minutes, or load demo data in Settings." /></Card> : (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-12 lg:col-span-8">
            <div className="flex items-center justify-between px-5 pt-4"><div className="label">Time per application</div>
              <div className="text-[12px] text-sub">{fmtDuration(total, { short: true })} total{prevTotal > 0 && <> · {total >= prevTotal ? '+' : '−'}{Math.round((Math.abs(total - prevTotal) / prevTotal) * 100)}% vs {vs}</>}</div></div>
            <table className="mt-2 w-full text-left">
              <thead><tr className="text-[11px] uppercase tracking-wider text-mute"><th className="py-2 pl-5 font-medium">Application</th><th className="font-medium">Classified</th><th className="font-medium">Time</th><th className="w-[28%] font-medium">Share</th><th className="pr-5 text-right font-medium">vs {vs}</th></tr></thead>
              <tbody>
                {rows.slice(0, 20).map((r) => {
                  const d = r.prev ? ((r.ms - r.prev) / r.prev) * 100 : null
                  return (
                    <tr key={r.name} className="border-t border-line transition hover:bg-hover">
                      <td className="py-2.5 pl-5"><div className="flex items-center gap-3 text-[13px]"><AppAvatar name={r.name} size={26} />{r.name}</div></td>
                      <td><select value={r.cat} onChange={(e) => void reclass(r.name, e.target.value as Category)} className="cursor-pointer rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] outline-none hover:border-line focus:border-accent" style={{ color: r.cat === 'neutral' ? '#94a3b8' : CAT_COLOR[r.cat] }}>
                        {(['productive', 'neutral', 'distracting'] as Category[]).map((c) => <option key={c} value={c} className="bg-raised text-ink">{CAT_TEXT[c]}</option>)}</select></td>
                      <td className="tabular text-[13px]">{fmtDuration(r.ms, { short: true })}</td>
                      <td><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-[#1d1d25]"><div className="h-1.5 rounded-full" style={{ width: `${(r.ms / total) * 100}%`, background: CAT_COLOR[r.cat] }} /></div><span className="tabular w-9 text-right text-[12px] text-sub">{Math.round((r.ms / total) * 100)}%</span></div></td>
                      <td className="tabular pr-5 text-right text-[12px]" style={{ color: d === null ? '#71717a' : d > 0 ? '#a1a1aa' : '#a1a1aa' }}>{d === null ? 'new' : `${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d))}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-5 pb-4 pt-2 text-[11px] text-mute">Changing a classification adds an editable rule (see Settings → Classification rules) and updates all history.</p>
          </Card>
          <div className="col-span-12 space-y-4 lg:col-span-4">
            <Card className="card-pad">
              <div className="label mb-2">Share of usage</div>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={2} stroke="#0f0f13" strokeWidth={2}>{pie.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie>
                  <Tooltip content={<ChartTip fmt={(v) => `${fmtDuration(v, { short: true })} (${Math.round((v / total) * 100)}%)`} />} /></PieChart>
              </ResponsiveContainer>
              <div className="mt-1 space-y-1.5">{pie.map((p) => <div key={p.name} className="flex items-center justify-between text-[12px]"><span className="flex items-center gap-2 text-sub"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span><span className="tabular">{Math.round((p.value / total) * 100)}%</span></div>)}</div>
            </Card>
            <Card className="card-pad">
              <div className="label mb-3">Sites inside browsers</div>
              {sites.length ? <div className="space-y-2.5">{sites.slice(0, 8).map((s) => (
                <div key={s.name + s.app} className="flex items-center justify-between text-[13px]"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: CAT_COLOR[s.cat] }} />{s.name}</span><span className="tabular text-sub">{fmtDuration(s.ms, { short: true })}</span></div>))}</div>
                : <p className="text-[12px] text-mute">Sites are detected from window titles using your title rules. None matched in this period.</p>}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
