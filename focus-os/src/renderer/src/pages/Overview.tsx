import { useMemo } from 'react'
import { timelineBlocks } from '@shared/metrics'
import { addDays, fmtClock, fmtDuration, fmtHM, startOfDay } from '@shared/time'
import { api } from '../lib/api'
import { useDays, useInsights } from '../lib/hooks'
import { useStore } from '../lib/store'
import { CAT_COLOR } from '../lib/ui'
import { HourlyChart, InsightCard, ScoreHelp, TimelineStrip } from '../components/blocks'
import { Icon } from '../components/Icon'
import { AppAvatar, CatChip, Card, Empty, PageHeader, Ring, Stat } from '../components/ui'

const greeting = (): string => { const h = new Date().getHours(); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function Overview(): JSX.Element {
  const { segments, classify, status, focus, now, privacy, setPage } = useStore()
  const days = useDays(14)
  const today = days[days.length - 1]
  const yesterday = days[days.length - 2]
  const insights = useInsights()
  const dayStart = startOfDay(now)
  const blocks = useMemo(() => timelineBlocks(segments, classify, dayStart, addDays(dayStart, 1)), [segments, classify, dayStart])
  const from = today.firstTs ? Math.max(dayStart, Math.floor((today.firstTs - 15 * 60_000) / 3_600_000) * 3_600_000) : dayStart + 8 * 3_600_000
  const to = Math.max(from + 6 * 3_600_000, Math.ceil(Math.min(now + 15 * 60_000, dayStart + 86_400_000) / 3_600_000) * 3_600_000)
  const cur = status?.current
  const curCat = cur ? classify({ appName: cur.appName, exe: cur.exe, title: cur.title, idle: false }) : null
  const hasData = today.activeMs > 0
  const delta = (a: number, b: number): string | null => (b > 0 ? `${a >= b ? '+' : '−'}${Math.round((Math.abs(a - b) / b) * 100)}% vs yesterday` : null)

  return (
    <div>
      <PageHeader title={`${greeting()}`} subtitle={new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}>
        {privacy?.hasDemo && <span className="chip bg-amber-400/10 text-amber-300">Includes demo data</span>}
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        <Card className="card-pad col-span-12 flex items-center gap-6 lg:col-span-4" delay={0}>
          <Ring value={(today.focusScore ?? 0) / 100} size={140} color={today.focusScore === null ? '#27272f' : today.focusScore >= 70 ? CAT_COLOR.productive : today.focusScore >= 40 ? '#818cf8' : '#fbbf24'}>
            <div><div className="tabular text-[34px] font-semibold leading-none">{today.focusScore ?? '–'}</div><div className="label mt-1">Focus score</div></div>
          </Ring>
          <div className="min-w-0 flex-1"><ScoreHelp day={today} /></div>
        </Card>
        <div className="col-span-12 grid grid-cols-2 gap-4 lg:col-span-8">
          <Stat label="Computer time" value={fmtDuration(today.activeMs, { short: true })} sub={delta(today.activeMs, yesterday.activeMs) ?? (today.idleMs ? `${fmtDuration(today.idleMs, { short: true })} idle` : undefined)} delay={40} />
          <Stat label="Productive" value={fmtDuration(today.productiveMs, { short: true })} accent={CAT_COLOR.productive} sub={today.activeMs ? `${Math.round((today.productiveMs / today.activeMs) * 100)}% of active time` : undefined} delay={80} />
          <Stat label="Deep work" value={fmtDuration(today.deepWorkMs, { short: true })} accent="#818cf8" sub={today.longestBlock ? `Longest ${fmtDuration(today.longestBlock.productiveMs, { short: true })}` : 'Blocks of 25+ min'} delay={120} />
          <Stat label="Distraction" value={fmtDuration(today.distractingMs, { short: true })} accent={CAT_COLOR.distracting} sub={`${today.appSwitches} app switches · ${today.contextSwitches} context`} delay={160} />
        </div>

        <Card className="card-pad col-span-12 lg:col-span-6" delay={200}>
          <div className="label">Current application</div>
          {cur && curCat ? (
            <div className="mt-3 flex items-center gap-3.5">
              <AppAvatar name={cur.appName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-[16px] font-medium">{curCat.entity !== cur.appName ? `${curCat.entity} · ${cur.appName}` : cur.appName}</span><CatChip cat={curCat.category} /></div>
                <div className="mt-0.5 truncate text-[12px] text-sub">{cur.title || cur.exe}</div>
                <div className="mt-0.5 text-[12px] text-mute">Since {fmtHM(cur.since)} · {fmtDuration(now - cur.since, { short: true })}</div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-[13px] text-sub">{status?.state === 'paused' ? 'Monitoring is paused.' : status?.state === 'outside-schedule' ? 'Outside your monitoring schedule.' : status && status.idleSec > 0 && !cur ? 'You are idle.' : 'Waiting for activity…'}</div>
          )}
        </Card>
        <Card className="card-pad col-span-12 lg:col-span-6" delay={240}>
          <div className="label">Focus session</div>
          {focus && focus.run !== 'idle' ? (
            <div className="mt-3 flex items-center gap-4">
              <div className="tabular text-[32px] font-semibold leading-none">{fmtClock(focus.phaseTotalSec - focus.phaseElapsedSec)}</div>
              <div className="min-w-0 flex-1 text-[12px] text-sub">
                <div className="truncate text-[13px] font-medium text-ink">{focus.label || (focus.phase === 'work' ? 'Focusing' : 'On a break')}{focus.run === 'paused' && ' · paused'}</div>
                {focus.distractionCount} distractions · streak {fmtDuration(focus.streakSec * 1000, { short: true })}
              </div>
              <button className="btn" onClick={() => setPage('focus')}>Open</button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div className="text-[13px] text-sub">No session running. Start one to track distractions and uninterrupted focus.</div>
              <button className="btn btn-primary shrink-0" onClick={() => void api.focusStart({ mode: 'custom', durationMin: 25, allowedApps: [], label: '' })}><Icon name="play" size={12} />25 min</button>
            </div>
          )}
        </Card>

        <Card className="card-pad col-span-12" delay={280}>
          <div className="mb-3 flex items-center justify-between"><div className="label">Today's timeline</div><button className="text-[12px] text-sub hover:text-ink" onClick={() => setPage('timeline')}>Full timeline →</button></div>
          {hasData ? <TimelineStrip blocks={blocks} from={from} to={to} /> : <Empty title="No activity recorded yet today" hint="Activity appears here as you use your computer. Load demo data in Settings to explore the app." />}
        </Card>

        <Card className="card-pad col-span-12 lg:col-span-7" delay={320}>
          <div className="mb-3 label">Activity by hour</div>
          {hasData ? <HourlyChart day={today} from={Math.max(0, Math.min(8, new Date(from).getHours()))} to={Math.max(18, new Date(now).getHours())} /> : <Empty title="Nothing to chart yet" />}
        </Card>
        <Card className="card-pad col-span-12 lg:col-span-5" delay={360}>
          <div className="mb-3 label">Top applications today</div>
          <div className="space-y-3">
            {today.apps.slice(0, 6).map((a) => (
              <div key={a.appName} className="flex items-center gap-3">
                <AppAvatar name={a.appName} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[13px]"><span className="truncate">{a.appName}</span><span className="tabular text-sub">{fmtDuration(a.ms, { short: true })}</span></div>
                  <div className="mt-1 h-1 rounded-full bg-[#1d1d25]"><div className="h-1 rounded-full" style={{ width: `${a.share * 100}%`, background: CAT_COLOR[a.category] }} /></div>
                </div>
              </div>
            ))}
            {!today.apps.length && <div className="text-[13px] text-mute">No applications yet.</div>}
          </div>
        </Card>

        {insights.length > 0 && (
          <div className="col-span-12">
            <div className="mb-3 mt-2 flex items-center justify-between"><div className="label">Insights</div><button className="text-[12px] text-sub hover:text-ink" onClick={() => setPage('insights')}>All insights →</button></div>
            <div className="grid gap-3 lg:grid-cols-2">{insights.slice(0, 4).map((i) => <InsightCard key={i.id} i={i} />)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
