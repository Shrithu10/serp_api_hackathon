import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '@shared/api'
import { api, isElectron } from '../lib/api'
import { useStore } from '../lib/store'
import { cx } from '../lib/ui'
import { fmtClock } from '@shared/time'
import { Icon } from './Icon'

export const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'focus', label: 'Focus Sessions', icon: 'focus' },
  { id: 'timeline', label: 'Activity Timeline', icon: 'timeline' },
  { id: 'applications', label: 'Applications', icon: 'applications' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
]

export function MonitorPill(): JSX.Element {
  const status = useStore((s) => s.status)
  const state = status?.state ?? 'active'
  const label = state === 'active' ? 'Monitoring' : state === 'paused' ? 'Paused' : 'Off schedule'
  const color = state === 'active' ? '#34d399' : '#71717a'
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12px]" title="Focus OS records the active app and window title locally. Nothing leaves this computer.">
      <span className={cx('h-2 w-2 rounded-full', state === 'active' && 'animate-pulseDot')} style={{ background: color }} />
      <span className="font-medium">{label}</span>
      {status?.simulated && <span className="text-mute">· simulated</span>}
    </div>
  )
}

function Sidebar(): JSX.Element {
  const { page, setPage, status, focus } = useStore()
  const paused = status?.state === 'paused'
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-panel/60 px-3 pb-4">
      <div className="drag flex h-[52px] items-center gap-2.5 px-2">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-400 to-purple-500"><Icon name="focus" size={14} className="text-[#0b0b14]" /></div>
        <span className="text-[14px] font-semibold tracking-tight">Focus OS</span>
      </div>
      <nav className="mt-2 flex flex-col gap-0.5">
        {NAV.map((n, i) => (
          <button key={n.id} onClick={() => setPage(n.id)} className={cx('group flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition', page === n.id ? 'bg-raised text-ink' : 'text-sub hover:bg-hover hover:text-ink')}>
            <Icon name={n.icon} size={16} className={page === n.id ? 'text-accent' : ''} />
            <span className="flex-1">{n.label}</span>
            <kbd className="text-[10px] text-mute opacity-0 transition group-hover:opacity-100">Ctrl {i + 1}</kbd>
          </button>
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        {focus && focus.run !== 'idle' && (
          <button onClick={() => setPage('focus')} className="w-full rounded-xl border border-line bg-raised p-3 text-left transition hover:border-accent/50">
            <div className="label">{focus.phase === 'work' ? 'Focusing' : 'Break'}{focus.run === 'paused' ? ' · paused' : ''}</div>
            <div className="tabular mt-1 text-[22px] font-semibold">{fmtClock(focus.phaseTotalSec - focus.phaseElapsedSec)}</div>
            <div className="truncate text-[12px] text-sub">{focus.label || 'Focus session'}</div>
          </button>
        )}
        <div className="rounded-xl border border-line bg-bg p-3">
          <div className="flex items-center justify-between"><MonitorPill /></div>
          <button className="btn mt-3 w-full" onClick={() => void (paused ? api.resumeMonitoring() : api.pauseMonitoring(null))}>
            <Icon name={paused ? 'play' : 'pause'} size={12} />{paused ? 'Resume monitoring' : 'Pause monitoring'}
          </button>
          <p className="mt-2 text-[11px] leading-snug text-mute">Local only. No screenshots, keystrokes or uploads.</p>
        </div>
      </div>
    </aside>
  )
}

function CommandPalette(): JSX.Element | null {
  const { paletteOpen, setPalette, setPage, focus, status, notify } = useStore()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const items = useMemo(() => {
    const nav = NAV.map((n, i) => ({ label: `Go to ${n.label}`, hint: `Ctrl ${i + 1}`, run: () => setPage(n.id) }))
    const acts = [
      status?.state === 'paused' ? { label: 'Resume monitoring', hint: '', run: () => void api.resumeMonitoring() } : { label: 'Pause monitoring', hint: 'Ctrl Shift P', run: () => void api.pauseMonitoring(null) },
      { label: 'Pause monitoring for 1 hour', hint: '', run: () => void api.pauseMonitoring(60) },
      focus?.run === 'idle' || !focus ? { label: 'Start 25-minute focus session', hint: 'Ctrl Shift F', run: () => void api.focusStart({ mode: 'custom', durationMin: 25, allowedApps: [], label: '' }) } : { label: 'End focus session', hint: 'Ctrl Shift F', run: () => void api.focusEnd() },
      { label: 'Start Pomodoro session', hint: '', run: () => void api.focusStart({ mode: 'pomodoro', durationMin: 25, allowedApps: [], label: '' }) },
      { label: 'Export activity to CSV', hint: '', run: () => void api.exportCsv('activity').then((r) => r.ok && notify(`Exported ${r.rows} rows`)) }
    ]
    return [...acts, ...nav].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
  }, [q, focus, status, setPage, notify])
  useEffect(() => { setIdx(0) }, [q])
  useEffect(() => { if (paletteOpen) setQ('') }, [paletteOpen])
  if (!paletteOpen) return null
  const run = (i: number): void => { items[i]?.run(); setPalette(false) }
  return (
    <div className="fixed inset-0 z-50 grid items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-sm" onMouseDown={() => setPalette(false)}>
      <div className="card w-[520px] animate-fadeUp overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4"><Icon name="search" className="text-mute" />
          <input autoFocus className="w-full bg-transparent py-3.5 text-[14px] outline-none placeholder:text-mute" placeholder="Type a command or page…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              if (e.key === 'Enter') run(idx)
              if (e.key === 'Escape') setPalette(false)
            }} />
        </div>
        <div className="max-h-[340px] overflow-auto p-1.5">
          {items.map((it, i) => (
            <button key={it.label} onMouseEnter={() => setIdx(i)} onClick={() => run(i)} className={cx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px]', i === idx ? 'bg-raised' : '')}>
              <span>{it.label}</span><kbd className="text-[11px] text-mute">{it.hint}</kbd>
            </button>
          ))}
          {!items.length && <div className="p-6 text-center text-[13px] text-mute">No matches</div>}
        </div>
      </div>
    </div>
  )
}

function Onboarding(): JSX.Element | null {
  const { settings, saveSettings, loaded } = useStore()
  const [auto, setAuto] = useState(false)
  if (!loaded || settings.onboarded) return null
  const done = async (): Promise<void> => {
    if (auto) await api.setAutoStart(true)
    await saveSettings({ onboarded: true })
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="card w-[520px] animate-fadeUp p-7 shadow-2xl">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500"><Icon name="shield" className="text-[#0b0b14]" /></div>
        <h2 className="text-[20px] font-semibold tracking-tight">Welcome to Focus OS</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">Focus OS tracks which app and window is in front, so you can see where your time goes. It is built to be private by default:</p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {['Everything stays in a local SQLite file on this PC. No accounts, no uploads.', 'It never takes screenshots, logs keystrokes, or uses the camera or microphone.', 'A monitoring indicator is always visible. Pause or delete everything at any time.', 'It will never close or block an app on its own.'].map((t) => (
            <li key={t} className="flex gap-2.5"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-prod" />{t}</li>
          ))}
        </ul>
        {isElectron && <label className="mt-5 flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-bg p-3 text-[13px]"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-indigo-400" />Start Focus OS automatically when I sign in to Windows</label>}
        <button className="btn btn-primary mt-5 w-full py-2" onClick={() => void done()}>Start tracking</button>
      </div>
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  const { setPalette, toast, status, setPage, focus } = useStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const n = Number(e.key)
      if (!e.shiftKey && n >= 1 && n <= NAV.length) { e.preventDefault(); setPage(NAV[n - 1].id) }
      else if (e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      else if (e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); void (status?.state === 'paused' ? api.resumeMonitoring() : api.pauseMonitoring(null)) }
      else if (e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); void (focus && focus.run !== 'idle' ? api.focusEnd() : api.focusStart({ mode: 'custom', durationMin: 25, allowedApps: [], label: '' })) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPage, setPalette, status, focus])
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag flex h-[52px] shrink-0 items-center justify-between px-8" style={isElectron ? { paddingRight: 150 } : undefined}>
          <button onClick={() => setPalette(true)} className="no-drag flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12px] text-mute transition hover:text-sub">
            <Icon name="search" size={13} />Search or run a command<kbd className="ml-6 rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
          </button>
          <div className="no-drag"><MonitorPill /></div>
        </div>
        <div className="flex-1 overflow-auto px-8 pb-10">{children}</div>
        {toast && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-fadeUp rounded-lg border border-line bg-raised px-4 py-2 text-[13px] shadow-xl">{toast}</div>}
      </main>
      <CommandPalette />
      <Onboarding />
    </div>
  )
}
