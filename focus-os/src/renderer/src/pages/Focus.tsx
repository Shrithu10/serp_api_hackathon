import { useMemo, useState } from 'react'
import { fmtClock, fmtDay, fmtDuration, fmtHM } from '@shared/time'
import type { DistractionEvent, FocusSessionRecord } from '@shared/types'
import { api } from '../lib/api'
import { useDays } from '../lib/hooks'
import { useStore } from '../lib/store'
import { CAT_COLOR, cx } from '../lib/ui'
import { Icon } from '../components/Icon'
import { Card, Empty, PageHeader, Ring, Segmented, Stat } from '../components/ui'

const PRESETS = [15, 25, 45, 60, 90]

function Setup(): JSX.Element {
  const { settings } = useStore()
  const days = useDays(14)
  const [mode, setMode] = useState<'custom' | 'pomodoro'>('custom')
  const [dur, setDur] = useState(25)
  const [label, setLabel] = useState('')
  const [allowed, setAllowed] = useState<string[]>([])
  const candidates = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of days) { for (const a of d.apps) m.set(a.appName, (m.get(a.appName) ?? 0) + a.ms) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n]) => n)
  }, [days])
  const p = settings.pomodoro
  return (
    <Card className="card-pad" delay={0}>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-medium">New focus session</div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'custom', label: 'Custom' }, { value: 'pomodoro', label: 'Pomodoro' }]} />
      </div>
      <input className="input mt-4" placeholder="What are you working on? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      {mode === 'custom' ? (
        <div className="mt-4">
          <div className="label mb-2">Duration</div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((m) => <button key={m} onClick={() => setDur(m)} className={cx('btn', dur === m && 'border-accent text-accent')}>{m} min</button>)}
            <span className="ml-1 flex items-center gap-2 text-[12px] text-sub">Custom <input type="number" min={1} max={480} className="input w-20" value={dur} onChange={(e) => setDur(Math.max(1, Math.min(480, Number(e.target.value) || 1)))} /> min</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-line bg-bg p-3 text-[12px] leading-relaxed text-sub">
          {p.workMin} min focus → {p.shortBreakMin} min short break, with a {p.longBreakMin} min long break after every {p.cyclesBeforeLong} rounds. Change these in Settings.
        </p>
      )}
      <div className="mt-5">
        <div className="label mb-1">Allowed applications</div>
        <p className="mb-2 text-[12px] text-sub">{allowed.length ? 'Anything outside this list counts as a distraction.' : 'None selected: only apps classified Distracting count as distractions.'} Focus OS only notifies you; it never blocks or closes apps.</p>
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((a) => {
            const on = allowed.includes(a)
            return <button key={a} onClick={() => setAllowed(on ? allowed.filter((x) => x !== a) : [...allowed, a])} className={cx('rounded-full border px-2.5 py-1 text-[12px] transition', on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-sub hover:text-ink')}>{on && '✓ '}{a}</button>
          })}
          {!candidates.length && <span className="text-[12px] text-mute">Apps you use will appear here.</span>}
        </div>
      </div>
      <button className="btn btn-primary mt-6 w-full py-2" onClick={() => void api.focusStart({ mode, durationMin: dur, allowedApps: allowed, label })}><Icon name="play" size={12} />Start {mode === 'pomodoro' ? 'Pomodoro' : `${dur}-minute session`}</button>
    </Card>
  )
}

function Running(): JSX.Element {
  const f = useStore((s) => s.focus)!
  const remaining = f.phaseTotalSec - f.phaseElapsedSec
  const onBreak = f.phase !== 'work'
  const color = onBreak ? '#fbbf24' : f.onTask ? CAT_COLOR.productive : CAT_COLOR.distracting
  const total = f.focusedSec + f.distractedSec
  return (
    <Card className="card-pad" delay={0}>
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
        <Ring value={f.phaseTotalSec ? f.phaseElapsedSec / f.phaseTotalSec : 0} size={220} stroke={12} color={color}>
          <div>
            <div className="tabular text-[44px] font-semibold leading-none tracking-tight">{fmtClock(remaining)}</div>
            <div className="label mt-2">{f.phase === 'work' ? 'Focus' : f.phase === 'short-break' ? 'Short break' : 'Long break'}{f.run === 'paused' && ' · paused'}</div>
          </div>
        </Ring>
        <div className="w-full flex-1">
          <div className="text-[16px] font-medium">{f.label || 'Focus session'}</div>
          <div className="mt-1 text-[12px] text-sub">{f.mode === 'pomodoro' ? `Pomodoro · round ${f.cycle + (onBreak ? 0 : 1)}` : 'Custom session'} · started {fmtHM(f.sessionStartedAt)}</div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-[13px]">
            <span className={cx('h-2 w-2 rounded-full', f.run === 'running' && 'animate-pulseDot')} style={{ background: color }} />
            {onBreak ? 'Take a real break — step away from the screen.' : f.run === 'paused' ? 'Paused' : f.onTask ? `On task · ${f.currentApp || '…'}` : `Off task · ${f.currentApp}`}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Focused', fmtDuration(f.focusedSec * 1000, { short: true })], ['Distractions', String(f.distractionCount)], ['Streak', fmtDuration(f.streakSec * 1000, { short: true })], ['Longest streak', fmtDuration(f.longestStreakSec * 1000, { short: true })]].map(([l, v]) => (
              <div key={l}><div className="label">{l}</div><div className="tabular mt-1 text-[18px] font-semibold">{v}</div></div>
            ))}
          </div>
          {total > 0 && <div className="mt-3 text-[12px] text-sub">{Math.round((f.focusedSec / total) * 100)}% of work time on task</div>}
          <div className="mt-5 flex gap-2">
            {f.run === 'running' ? <button className="btn" onClick={() => void api.focusPause()}><Icon name="pause" size={12} />Pause</button> : <button className="btn btn-primary" onClick={() => void api.focusResume()}><Icon name="play" size={12} />Resume</button>}
            {onBreak && <button className="btn" onClick={() => void api.focusSkipBreak()}><Icon name="skip" size={12} />Skip break</button>}
            <button className="btn btn-danger" onClick={() => void api.focusEnd()}><Icon name="stop" size={12} />End session</button>
          </div>
        </div>
      </div>
      {f.allowedApps.length > 0 && <div className="mt-5 border-t border-line pt-4 text-[12px] text-sub">Allowed: {f.allowedApps.join(', ')}</div>}
    </Card>
  )
}

function Row({ s }: { s: FocusSessionRecord }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [ev, setEv] = useState<DistractionEvent[] | null>(null)
  const toggle = (): void => { setOpen(!open); if (!ev) void api.listDistractions(s.id).then(setEv) }
  const c = s.consistency >= 75 ? CAT_COLOR.productive : s.consistency >= 50 ? '#fbbf24' : CAT_COLOR.distracting
  return (
    <>
      <tr onClick={toggle} className="cursor-pointer border-t border-line transition hover:bg-hover">
        <td className="py-2.5 pl-5 text-[13px]"><div>{s.label || (s.mode === 'pomodoro' ? 'Pomodoro' : 'Focus session')}</div><div className="text-[11px] text-mute">{fmtDay(s.start)} · {fmtHM(s.start)}</div></td>
        <td className="tabular text-[13px] text-sub">{fmtDuration((s.end - s.start), { short: true })}</td>
        <td className="tabular text-[13px]">{fmtDuration(s.focusedSec * 1000, { short: true })}</td>
        <td className="tabular text-[13px]">{s.distractionCount}</td>
        <td className="tabular text-[13px] text-sub">{fmtDuration(s.longestStreakSec * 1000, { short: true })}</td>
        <td><span className="chip" style={{ background: c + '22', color: c }}>{s.consistency}</span></td>
        <td className="pr-5 text-[12px]">{s.completed ? <span className="text-prod">Completed</span> : <span className="text-mute">Ended early</span>}</td>
      </tr>
      {open && (
        <tr className="bg-bg/60"><td colSpan={7} className="px-5 py-3 text-[12px] text-sub">
          {ev === null ? 'Loading…' : ev.length === 0 ? 'No distractions recorded in this session.' : ev.map((e) => <div key={e.id} className="py-0.5">{fmtHM(e.ts)} — switched to <span className="text-ink">{e.appName}</span> for {fmtDuration(e.durationSec * 1000, { short: true })}</div>)}
        </td></tr>
      )}
    </>
  )
}

export default function FocusPage(): JSX.Element {
  const { focus, sessions } = useStore()
  const running = focus && focus.run !== 'idle'
  const week = sessions.filter((s) => s.end > Date.now() - 7 * 86_400_000)
  const done = week.filter((s) => s.completed).length
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return (
    <div>
      <PageHeader title="Focus Sessions" subtitle="Time-boxed focus with distraction tracking. You stay in control — nothing is ever blocked." />
      <div className="space-y-4">
        {running ? <Running /> : <Setup />}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Sessions (7d)" value={String(week.length)} sub={week.length ? `${done} completed (${Math.round((done / week.length) * 100)}%)` : 'None yet'} />
          <Stat label="Avg consistency" value={week.length ? String(Math.round(avg(week.map((s) => s.consistency)))) : '–'} sub="0–100, higher is steadier" />
          <Stat label="Avg uninterrupted" value={week.length ? fmtDuration(avg(week.map((s) => s.longestStreakSec)) * 1000, { short: true }) : '–'} sub="Longest on-task streak per session" />
          <Stat label="Distractions (7d)" value={String(week.reduce((n, s) => n + s.distractionCount, 0))} sub="Recorded switches to off-task apps" />
        </div>
        <Card>
          <div className="flex items-center justify-between px-5 pt-4"><div className="label">Session history</div><div className="text-[11px] text-mute">Click a row for distraction details</div></div>
          {sessions.length ? (
            <div className="mt-2 overflow-x-auto"><table className="w-full text-left">
              <thead><tr className="text-[11px] uppercase tracking-wider text-mute"><th className="py-2 pl-5 font-medium">Session</th><th className="font-medium">Length</th><th className="font-medium">On task</th><th className="font-medium">Distractions</th><th className="font-medium">Best streak</th><th className="font-medium">Consistency</th><th className="pr-5 font-medium">Result</th></tr></thead>
              <tbody>{sessions.slice(0, 30).map((s) => <Row key={s.id} s={s} />)}</tbody>
            </table></div>
          ) : <Empty title="No focus sessions yet" hint="Completed sessions will appear here with consistency scores." />}
        </Card>
        <p className="text-[11px] leading-relaxed text-mute">Consistency score = 60% share of work time spent on task + 40% longest uninterrupted streak relative to the focus block length. A distraction is counted after 5 seconds in an off-task app.</p>
      </div>
    </div>
  )
}
