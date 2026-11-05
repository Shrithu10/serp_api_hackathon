export type Category = 'productive' | 'neutral' | 'distracting'

/** One contiguous stretch of time spent in a single window (or idle). Times are epoch ms. */
export interface Segment {
  id: number
  start: number
  end: number
  appName: string
  exe: string
  title: string
  idle: boolean
  demo: boolean
}

export type MatchType = 'app' | 'title'

/** A transparent, user-editable classification rule. */
export interface Rule {
  id: number
  matchType: MatchType // 'app' matches app name or exe; 'title' matches window title
  pattern: string // case-insensitive substring
  category: Category
  label: string // optional entity label (e.g. "YouTube") used for grouping sites inside browsers
  builtin: boolean
}

export interface Classification {
  category: Category
  rule: Rule | null
  /** What the time should be attributed to: rule label if present, else the app name. */
  entity: string
}

export interface MonitorSchedule {
  enabled: boolean
  days: number[] // 0 = Sunday
  start: string // HH:MM
  end: string // HH:MM
}

export interface Settings {
  idleThresholdSec: number
  pollIntervalSec: number
  storeTitles: boolean
  deepWorkMinMinutes: number
  deepWorkGapSec: number
  notifyOnDistraction: boolean
  minimizeToTray: boolean
  autoStart: boolean
  onboarded: boolean
  schedule: MonitorSchedule
  pomodoro: { workMin: number; shortBreakMin: number; longBreakMin: number; cyclesBeforeLong: number }
  retentionDays: number // 0 = keep forever
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdSec: 120,
  pollIntervalSec: 2,
  storeTitles: true,
  deepWorkMinMinutes: 25,
  deepWorkGapSec: 60,
  notifyOnDistraction: true,
  minimizeToTray: true,
  autoStart: false,
  onboarded: false,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  pomodoro: { workMin: 25, shortBreakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 },
  retentionDays: 0
}

export type MonitorState = 'active' | 'paused' | 'outside-schedule' | 'idle'

export interface MonitorStatus {
  state: MonitorState
  pausedUntil: number | null
  current: { appName: string; exe: string; title: string; since: number } | null
  idleSec: number
  platform: string
  simulated: boolean
}

export type FocusMode = 'custom' | 'pomodoro'
export type FocusPhase = 'work' | 'short-break' | 'long-break'
export type FocusRun = 'idle' | 'running' | 'paused'

export interface FocusStartOptions {
  mode: FocusMode
  durationMin: number // custom: total length; pomodoro: ignored (uses settings)
  allowedApps: string[] // app names allowed during the session; empty = "only my Distracting list counts"
  label: string
}

export interface FocusState {
  run: FocusRun
  sessionId: number | null
  mode: FocusMode
  phase: FocusPhase
  label: string
  allowedApps: string[]
  phaseStartedAt: number
  phaseTotalSec: number
  phaseElapsedSec: number
  sessionStartedAt: number
  focusedSec: number // seconds of work phases that were on-task
  distractedSec: number
  distractionCount: number
  streakSec: number // current uninterrupted on-task streak
  longestStreakSec: number
  cycle: number // completed work phases (pomodoro)
  onTask: boolean
  currentApp: string
}

export interface FocusSessionRecord {
  id: number
  start: number
  end: number
  mode: FocusMode
  label: string
  plannedSec: number
  focusedSec: number
  distractedSec: number
  distractionCount: number
  longestStreakSec: number
  cycles: number
  completed: boolean
  consistency: number
  allowedApps: string[]
  demo: boolean
}

export interface DistractionEvent {
  id: number
  sessionId: number
  ts: number
  appName: string
  title: string
  durationSec: number
}

export interface ExportResult {
  ok: boolean
  path?: string
  rows?: number
  error?: string
}

export interface PrivacyInfo {
  dbPath: string
  segmentCount: number
  sessionCount: number
  hasDemo: boolean
  firstTs: number | null
}
