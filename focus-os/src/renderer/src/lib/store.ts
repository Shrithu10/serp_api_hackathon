import { create } from 'zustand'
import type { PageId } from '@shared/api'
import { makeClassifier } from '@shared/classify'
import type { Classifier } from '@shared/metrics'
import { addDays, startOfDay } from '@shared/time'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { FocusSessionRecord, FocusState, MonitorStatus, PrivacyInfo, Rule, Segment, Settings } from '@shared/types'
import { api } from './api'

export const HISTORY_DAYS = 28

interface State {
  page: PageId
  paletteOpen: boolean
  loaded: boolean
  segments: Segment[]
  rules: Rule[]
  classify: Classifier
  settings: Settings
  status: MonitorStatus | null
  focus: FocusState | null
  sessions: FocusSessionRecord[]
  privacy: PrivacyInfo | null
  now: number
  toast: string | null
  setPage: (p: PageId) => void
  setPalette: (o: boolean) => void
  notify: (msg: string) => void
  init: () => Promise<void>
  refreshData: () => Promise<void>
  refreshSessions: () => Promise<void>
  refreshPrivacy: () => Promise<void>
  setRules: (r: Rule[]) => void
  saveSettings: (p: Partial<Settings>) => Promise<void>
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let started = false

export const useStore = create<State>((set, get) => ({
  page: 'overview', paletteOpen: false, loaded: false, segments: [], rules: [], classify: makeClassifier([]),
  settings: DEFAULT_SETTINGS, status: null, focus: null, sessions: [], privacy: null, now: Date.now(), toast: null,
  setPage: (page) => set({ page }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  notify: (toast) => { set({ toast }); clearTimeout(toastTimer); toastTimer = setTimeout(() => set({ toast: null }), 3200) },
  setRules: (rules) => set({ rules, classify: makeClassifier(rules) }),
  refreshData: async () => {
    const now = Date.now()
    const segments = await api.getSegments(addDays(startOfDay(now), -(HISTORY_DAYS - 1)), now + 86_400_000)
    set({ segments, now })
  },
  refreshSessions: async () => set({ sessions: await api.listSessions() }),
  refreshPrivacy: async () => set({ privacy: await api.getPrivacyInfo() }),
  saveSettings: async (p) => set({ settings: await api.saveSettings(p) }),
  init: async () => {
    if (started) return
    started = true
    const [rules, settings, status, focus, privacy] = await Promise.all([api.getRules(), api.getSettings(), api.getMonitorStatus(), api.getFocusState(), api.getPrivacyInfo()])
    set({ rules, classify: makeClassifier(rules), settings, status, focus, privacy })
    await Promise.all([get().refreshData(), get().refreshSessions()])
    set({ loaded: true })
    api.onMonitorStatus((status) => set({ status }))
    let lastRun = focus.run
    api.onFocusState((f) => {
      set({ focus: f })
      if (lastRun !== 'idle' && f.run === 'idle') void get().refreshSessions()
      lastRun = f.run
    })
    api.onDataChanged(() => { void get().refreshData(); void get().refreshPrivacy(); void get().refreshSessions() })
    api.onNavigate((page) => set({ page }))
  }
}))
