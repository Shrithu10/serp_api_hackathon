import type { Api } from '@shared/api'
import { DEFAULT_RULES } from '@shared/classify'
import { generateDemoData } from '@shared/seed'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { DistractionEvent, FocusSessionRecord, FocusState, MonitorStatus, Rule, Segment, Settings } from '@shared/types'

/** Browser-only stand-in for the Electron backend. Data is demo data held in memory. */
export function createMockApi(): Api {
  const now = Date.now()
  const d = generateDemoData(now)
  const segs: Segment[] = d.segments.map((s, i) => ({ ...s, id: i + 1 }))
  const dist: DistractionEvent[] = []
  const sessions: FocusSessionRecord[] = d.sessions.map((s, i) => {
    const { distractions, ...rest } = s
    distractions.forEach((x, j) => dist.push({ id: i * 100 + j, sessionId: i + 1, ts: x.ts, appName: x.appName, title: x.title, durationSec: x.durationSec }))
    return { ...rest, id: i + 1 }
  })
  let rules: Rule[] = DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1, builtin: true }))
  let settings: Settings = structuredClone(DEFAULT_SETTINGS)
  settings.onboarded = true
  let status: MonitorStatus = { state: 'active', pausedUntil: null, current: { appName: 'VS Code', exe: 'Code.exe', title: 'App.tsx - web - Visual Studio Code', since: now - 12 * 60_000 }, idleSec: 3, platform: 'browser', simulated: true }
  const idleFocus: FocusState = { run: 'idle', sessionId: null, mode: 'custom', phase: 'work', label: '', allowedApps: [], phaseStartedAt: 0, phaseTotalSec: 0, phaseElapsedSec: 0, sessionStartedAt: 0, focusedSec: 0, distractedSec: 0, distractionCount: 0, streakSec: 0, longestStreakSec: 0, cycle: 0, onTask: true, currentApp: '' }
  let focus = idleFocus
  let timer: ReturnType<typeof setInterval> | null = null
  const fl = new Set<(s: FocusState) => void>(), ml = new Set<(s: MonitorStatus) => void>()
  const emitF = (): void => fl.forEach((f) => f(focus))
  const info = () => ({ dbPath: 'In-memory demo (browser preview)', segmentCount: segs.length, sessionCount: sessions.length, hasDemo: true, firstTs: segs[0]?.start ?? null })
  const stub = <T,>(v: T) => async (): Promise<T> => v

  return {
    getSegments: async (from, to) => segs.filter((s) => s.end > from && s.start < to),
    getRules: async () => rules,
    upsertRule: async (r) => { rules = r.id ? rules.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...rules, { ...r, id: Date.now(), builtin: false }]; return rules },
    deleteRule: async (id) => { rules = rules.filter((r) => r.id !== id); return rules },
    resetRules: async () => { rules = DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1, builtin: true })); return rules },
    getSettings: async () => settings,
    saveSettings: async (p) => { settings = { ...settings, ...p }; return settings },
    getMonitorStatus: async () => status,
    pauseMonitoring: async (m) => { status = { ...status, state: 'paused', pausedUntil: m ? Date.now() + m * 60_000 : null, current: null }; ml.forEach((f) => f(status)); return status },
    resumeMonitoring: async () => { status = { ...status, state: 'active', pausedUntil: null }; ml.forEach((f) => f(status)); return status },
    getFocusState: async () => focus,
    focusStart: async (o) => {
      const total = (o.mode === 'pomodoro' ? settings.pomodoro.workMin : o.durationMin) * 60
      focus = { ...idleFocus, run: 'running', sessionId: 1, mode: o.mode, label: o.label, allowedApps: o.allowedApps, phaseTotalSec: total, sessionStartedAt: Date.now(), phaseStartedAt: Date.now(), currentApp: 'VS Code' }
      timer = setInterval(() => { if (focus.run === 'running') { focus = { ...focus, phaseElapsedSec: focus.phaseElapsedSec + 1, focusedSec: focus.focusedSec + 1, streakSec: focus.streakSec + 1, longestStreakSec: Math.max(focus.longestStreakSec, focus.streakSec + 1) }; emitF() } }, 1000)
      emitF(); return focus
    },
    focusPause: async () => { focus = { ...focus, run: 'paused' }; emitF(); return focus },
    focusResume: async () => { focus = { ...focus, run: 'running' }; emitF(); return focus },
    focusEnd: async () => { if (timer) clearInterval(timer); focus = idleFocus; emitF(); return focus },
    focusSkipBreak: async () => focus,
    listSessions: async () => [...sessions].sort((a, b) => b.start - a.start),
    listDistractions: async (id) => dist.filter((x) => x.sessionId === id),
    exportCsv: stub({ ok: false, error: 'Export is available in the desktop app' }),
    deleteAllData: async () => info(), loadDemoData: async () => info(), removeDemoData: async () => info(), getPrivacyInfo: async () => info(),
    setAutoStart: async (e) => e, openDataFolder: async () => undefined,
    onMonitorStatus: (cb) => { ml.add(cb); return () => ml.delete(cb) },
    onFocusState: (cb) => { fl.add(cb); return () => fl.delete(cb) },
    onDataChanged: () => () => undefined, onNavigate: () => () => undefined
  }
}
