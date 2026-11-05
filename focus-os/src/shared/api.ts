import type {
  DistractionEvent, ExportResult, FocusSessionRecord, FocusStartOptions, FocusState, MonitorStatus, PrivacyInfo, Rule, Segment, Settings
} from './types'

export type PageId = 'overview' | 'focus' | 'timeline' | 'applications' | 'analytics' | 'insights' | 'settings'
export type RuleInput = Omit<Rule, 'id' | 'builtin'> & { id?: number }

/** The only surface the renderer can use to reach the main process (exposed via contextBridge). */
export interface Api {
  getSegments(from: number, to: number): Promise<Segment[]>
  getRules(): Promise<Rule[]>
  upsertRule(rule: RuleInput): Promise<Rule[]>
  deleteRule(id: number): Promise<Rule[]>
  resetRules(): Promise<Rule[]>
  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  getMonitorStatus(): Promise<MonitorStatus>
  pauseMonitoring(minutes: number | null): Promise<MonitorStatus>
  resumeMonitoring(): Promise<MonitorStatus>
  getFocusState(): Promise<FocusState>
  focusStart(opts: FocusStartOptions): Promise<FocusState>
  focusPause(): Promise<FocusState>
  focusResume(): Promise<FocusState>
  focusEnd(): Promise<FocusState>
  focusSkipBreak(): Promise<FocusState>
  listSessions(): Promise<FocusSessionRecord[]>
  listDistractions(sessionId: number): Promise<DistractionEvent[]>
  exportCsv(kind: 'activity' | 'sessions'): Promise<ExportResult>
  deleteAllData(): Promise<PrivacyInfo>
  loadDemoData(): Promise<PrivacyInfo>
  removeDemoData(): Promise<PrivacyInfo>
  getPrivacyInfo(): Promise<PrivacyInfo>
  setAutoStart(enabled: boolean): Promise<boolean>
  openDataFolder(): Promise<void>
  onMonitorStatus(cb: (s: MonitorStatus) => void): () => void
  onFocusState(cb: (s: FocusState) => void): () => void
  onDataChanged(cb: () => void): () => void
  onNavigate(cb: (p: PageId) => void): () => void
}
