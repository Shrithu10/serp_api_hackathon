import { useMemo, useState } from 'react'
import { sortRules } from '@shared/classify'
import type { Category, MatchType, Rule, Settings } from '@shared/types'
import { api, isElectron } from '../lib/api'
import { useStore } from '../lib/store'
import { CAT_TEXT, cx } from '../lib/ui'
import { Icon } from '../components/Icon'
import { CatChip, Card, PageHeader, Toggle } from '../components/ui'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card className="card-pad">
      <h2 className="text-[15px] font-medium">{title}</h2>
      {hint && <p className="mt-1 text-[12px] text-sub">{hint}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  )
}
const Num = ({ label, value, onChange, min, max, unit }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; unit: string }): JSX.Element => (
  <label className="flex items-center justify-between gap-4 py-2 text-[13px]">
    <span>{label}</span>
    <span className="flex items-center gap-2"><input type="number" className="input w-20" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} /><span className="w-10 text-[12px] text-mute">{unit}</span></span>
  </label>
)

function RuleRow({ r }: { r: Rule }): JSX.Element {
  const { setRules } = useStore()
  const [d, setD] = useState(r)
  const dirty = d.pattern !== r.pattern || d.label !== r.label || d.category !== r.category || d.matchType !== r.matchType
  const save = async (next: Rule): Promise<void> => { if (next.pattern.trim()) setRules(await api.upsertRule(next)) }
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pl-4"><select className="input w-[88px]" value={d.matchType} onChange={(e) => { const n = { ...d, matchType: e.target.value as MatchType }; setD(n); void save(n) }}><option value="app">App</option><option value="title">Title</option></select></td>
      <td><input className="input" value={d.pattern} onChange={(e) => setD({ ...d, pattern: e.target.value })} onBlur={() => dirty && void save(d)} /></td>
      <td><select className="input w-[130px]" value={d.category} onChange={(e) => { const n = { ...d, category: e.target.value as Category }; setD(n); void save(n) }}>{(['productive', 'neutral', 'distracting'] as Category[]).map((c) => <option key={c} value={c}>{CAT_TEXT[c]}</option>)}</select></td>
      <td><input className="input" placeholder="optional" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} onBlur={() => dirty && void save(d)} /></td>
      <td className="pr-4 text-right"><button className="btn px-2" aria-label="Delete rule" onClick={async () => setRules(await api.deleteRule(r.id))}><Icon name="trash" size={13} /></button></td>
    </tr>
  )
}

function Rules(): JSX.Element {
  const { rules, setRules, classify, notify } = useStore()
  const [q, setQ] = useState('')
  const [nr, setNr] = useState({ matchType: 'app' as MatchType, pattern: '', category: 'distracting' as Category, label: '' })
  const [test, setTest] = useState({ app: 'Google Chrome', title: 'YouTube - Google Chrome' })
  const shown = useMemo(() => sortRules(rules).filter((r) => (r.pattern + r.label).toLowerCase().includes(q.toLowerCase())), [rules, q])
  const t = classify({ appName: test.app, exe: test.app, title: test.title, idle: false })
  return (
    <Section title="Classification rules" hint="Every app and window is classified by these rules — nothing hidden. Title rules are checked before app rules, and your own rules before the built-in ones. Matching is a case-insensitive 'contains'. Anything unmatched is Neutral.">
      <div className="rounded-lg border border-line bg-bg p-3">
        <div className="label mb-2">Test a window</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-44" value={test.app} onChange={(e) => setTest({ ...test, app: e.target.value })} placeholder="Application" />
          <input className="input min-w-[200px] flex-1" value={test.title} onChange={(e) => setTest({ ...test, title: e.target.value })} placeholder="Window title" />
          <CatChip cat={t.category} />
        </div>
        <div className="mt-2 text-[12px] text-sub">{t.rule ? <>Matched <b className="text-ink">{t.rule.matchType} contains “{t.rule.pattern}”</b>{t.rule.builtin ? ' (built-in)' : ' (your rule)'}{t.rule.label && <> · grouped as “{t.entity}”</>}</> : 'No rule matched → Neutral by default.'}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="input w-[88px]" value={nr.matchType} onChange={(e) => setNr({ ...nr, matchType: e.target.value as MatchType })}><option value="app">App</option><option value="title">Title</option></select>
        <input className="input min-w-[160px] flex-1" placeholder="Text to match, e.g. “netflix”" value={nr.pattern} onChange={(e) => setNr({ ...nr, pattern: e.target.value })} />
        <select className="input w-[130px]" value={nr.category} onChange={(e) => setNr({ ...nr, category: e.target.value as Category })}>{(['productive', 'neutral', 'distracting'] as Category[]).map((c) => <option key={c} value={c}>{CAT_TEXT[c]}</option>)}</select>
        <input className="input w-36" placeholder="Label (optional)" value={nr.label} onChange={(e) => setNr({ ...nr, label: e.target.value })} />
        <button className="btn btn-primary" disabled={!nr.pattern.trim()} onClick={async () => { setRules(await api.upsertRule(nr)); setNr({ ...nr, pattern: '', label: '' }); notify('Rule added') }}><Icon name="plus" size={13} />Add rule</button>
      </div>
      <div className="mt-4 flex items-center justify-between"><input className="input w-64" placeholder="Filter rules…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn" onClick={async () => { setRules(await api.resetRules()); notify('Rules reset to defaults') }}>Reset to defaults</button></div>
      <div className="mt-3 max-h-[380px] overflow-auto rounded-lg border border-line">
        <table className="w-full text-left"><thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-2 pl-4 font-medium">Matches</th><th className="font-medium">Contains</th><th className="font-medium">Category</th><th className="font-medium">Label</th><th /></tr></thead>
          <tbody>{shown.map((r) => <RuleRow key={r.id + r.pattern + r.category} r={r} />)}</tbody></table>
        {!shown.length && <div className="p-6 text-center text-[13px] text-mute">No rules match.</div>}
      </div>
    </Section>
  )
}

export default function SettingsPage(): JSX.Element {
  const { settings, saveSettings, status, privacy, refreshData, refreshPrivacy, refreshSessions, notify } = useStore()
  const set = (p: Partial<Settings>): void => void saveSettings(p)
  const sc = settings.schedule
  const paused = status?.state === 'paused'
  const refreshAll = async (): Promise<void> => { await Promise.all([refreshData(), refreshPrivacy(), refreshSessions()]) }
  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything is stored locally on this computer." />
      <div className="space-y-4">
        <Section title="Monitoring" hint="Focus OS records the foreground application, its executable and window title. It does not capture screens, keystrokes, audio or video.">
          <div className="flex items-center justify-between rounded-lg border border-line bg-bg p-3">
            <div className="text-[13px]"><span className="font-medium">{paused ? 'Paused' : status?.state === 'outside-schedule' ? 'Outside schedule' : 'Monitoring is on'}</span>{status?.pausedUntil && <span className="text-sub"> · resumes {new Date(status.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}{status?.simulated && <span className="text-mute"> · simulated window data (not Windows)</span>}</div>
            <div className="flex gap-2">
              {paused ? <button className="btn btn-primary" onClick={() => void api.resumeMonitoring()}>Resume</button> : <><button className="btn" onClick={() => void api.pauseMonitoring(15)}>15 min</button><button className="btn" onClick={() => void api.pauseMonitoring(60)}>1 hour</button><button className="btn" onClick={() => void api.pauseMonitoring(null)}>Until resumed</button></>}
            </div>
          </div>
          <div className="mt-2 divide-y divide-line">
            <Toggle label="Only monitor on a schedule" hint="Outside these hours nothing is recorded." checked={sc.enabled} onChange={(v) => set({ schedule: { ...sc, enabled: v } })} />
            {sc.enabled && (
              <div className="flex flex-wrap items-center gap-4 py-3 text-[13px]">
                <div className="flex gap-1">{DAYS.map((d, i) => <button key={d} onClick={() => set({ schedule: { ...sc, days: sc.days.includes(i) ? sc.days.filter((x) => x !== i) : [...sc.days, i] } })} className={cx('rounded-md border px-2 py-1 text-[12px]', sc.days.includes(i) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-sub')}>{d}</button>)}</div>
                <input type="time" className="input w-28" value={sc.start} onChange={(e) => set({ schedule: { ...sc, start: e.target.value || '09:00' } })} />to
                <input type="time" className="input w-28" value={sc.end} onChange={(e) => set({ schedule: { ...sc, end: e.target.value || '18:00' } })} />
              </div>
            )}
            <Num label="Treat as idle after" value={settings.idleThresholdSec / 60} min={1} max={30} unit="min" onChange={(n) => set({ idleThresholdSec: n * 60 })} />
            <Num label="Check the active window every" value={settings.pollIntervalSec} min={1} max={10} unit="sec" onChange={(n) => set({ pollIntervalSec: n })} />
            <Toggle label="Store window titles" hint="Titles power site detection (e.g. YouTube in Chrome) but can contain sensitive text. Turn off to store only the app name." checked={settings.storeTitles} onChange={(v) => set({ storeTitles: v })} />
          </div>
        </Section>

        <Rules />

        <Section title="Focus">
          <div className="divide-y divide-line">
            <Num label="Pomodoro focus length" value={settings.pomodoro.workMin} min={1} max={120} unit="min" onChange={(n) => set({ pomodoro: { ...settings.pomodoro, workMin: n } })} />
            <Num label="Short break" value={settings.pomodoro.shortBreakMin} min={1} max={60} unit="min" onChange={(n) => set({ pomodoro: { ...settings.pomodoro, shortBreakMin: n } })} />
            <Num label="Long break" value={settings.pomodoro.longBreakMin} min={1} max={90} unit="min" onChange={(n) => set({ pomodoro: { ...settings.pomodoro, longBreakMin: n } })} />
            <Num label="Long break after" value={settings.pomodoro.cyclesBeforeLong} min={2} max={10} unit="rounds" onChange={(n) => set({ pomodoro: { ...settings.pomodoro, cyclesBeforeLong: n } })} />
            <Num label="Deep work minimum" value={settings.deepWorkMinMinutes} min={5} max={120} unit="min" onChange={(n) => set({ deepWorkMinMinutes: n })} />
            <Num label="Interruption tolerated inside deep work" value={settings.deepWorkGapSec} min={0} max={300} unit="sec" onChange={(n) => set({ deepWorkGapSec: n })} />
            <Toggle label="Notify me when I drift to a distracting app" hint="A gentle desktop notification during a session. Apps are never blocked." checked={settings.notifyOnDistraction} onChange={(v) => set({ notifyOnDistraction: v })} />
          </div>
        </Section>

        <Section title="Application">
          <div className="divide-y divide-line">
            <Toggle label="Start Focus OS when I sign in to Windows" hint={isElectron ? 'Starts minimized to the system tray. You can turn this off at any time.' : 'Available in the desktop app.'} checked={settings.autoStart} onChange={(v) => void api.setAutoStart(v).then(() => saveSettings({ autoStart: v }))} />
            <Toggle label="Keep running in the system tray when closed" hint="Closing the window minimizes to the tray so monitoring continues. Quit from the tray menu." checked={settings.minimizeToTray} onChange={(v) => set({ minimizeToTray: v })} />
          </div>
        </Section>

        <Section title="Data & privacy" hint="All data lives in one SQLite file on this computer. Nothing is uploaded; the app makes no network requests.">
          <div className="rounded-lg border border-line bg-bg p-3 text-[12px] text-sub">
            <div>Location: <span className="font-mono text-ink">{privacy?.dbPath}</span></div>
            <div className="mt-1">{privacy?.segmentCount.toLocaleString()} activity records · {privacy?.sessionCount} focus sessions{privacy?.firstTs && <> · since {new Date(privacy.firstTs).toLocaleDateString()}</>}{privacy?.hasDemo && <span className="text-amber-300"> · includes demo data</span>}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" onClick={async () => { const r = await api.exportCsv('activity'); if (r.ok) notify(`Exported ${r.rows} activity rows`); else if (r.error) notify(r.error) }}><Icon name="download" size={13} />Export activity CSV</button>
            <button className="btn" onClick={async () => { const r = await api.exportCsv('sessions'); if (r.ok) notify(`Exported ${r.rows} sessions`); else if (r.error) notify(r.error) }}><Icon name="download" size={13} />Export sessions CSV</button>
            {isElectron && <button className="btn" onClick={() => void api.openDataFolder()}><Icon name="folder" size={13} />Show data file</button>}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="label mb-2">Demo data</div>
            <p className="mb-3 text-[12px] text-sub">Loads 3 weeks of realistic sample activity so you can explore every screen. It is clearly flagged and can be removed without touching your real data.</p>
            <div className="flex gap-2">
              <button className="btn" onClick={async () => { await api.loadDemoData(); await refreshAll(); notify('Demo data loaded') }}>Load demo data</button>
              <button className="btn" disabled={!privacy?.hasDemo} onClick={async () => { await api.removeDemoData(); await refreshAll(); notify('Demo data removed') }}>Remove demo data</button>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <Num label="Auto-delete activity older than" value={settings.retentionDays} min={0} max={3650} unit="days" onChange={(n) => set({ retentionDays: n })} />
          </div>
          <p className="-mt-1 text-[11px] text-mute">0 keeps everything.</p>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-[#4a1d25] bg-[#1a0f12] p-3">
            <div className="text-[13px]"><div className="font-medium">Delete all activity data</div><div className="text-[12px] text-sub">Permanently erases every activity record and focus session. Rules and settings are kept.</div></div>
            <button className="btn btn-danger" onClick={async () => { await api.deleteAllData(); await refreshAll() }}><Icon name="trash" size={13} />Delete everything</button>
          </div>
        </Section>

        <Section title="Keyboard shortcuts">
          <div className="grid gap-x-8 gap-y-1.5 text-[13px] md:grid-cols-2">
            {[['Ctrl K', 'Command palette'], ['Ctrl 1 – 7', 'Switch page'], ['Ctrl Shift P', 'Pause / resume monitoring'], ['Ctrl Shift F', 'Start / end a 25-minute focus session']].map(([k, d]) => <div key={k} className="flex justify-between"><span className="text-sub">{d}</span><kbd className="rounded border border-line px-1.5 text-[11px] text-ink">{k}</kbd></div>)}
          </div>
        </Section>
      </div>
    </div>
  )
}
