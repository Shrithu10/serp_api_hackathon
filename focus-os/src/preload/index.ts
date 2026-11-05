import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

const invoke = (name: string) => (...args: unknown[]) => ipcRenderer.invoke('api:' + name, ...args)
const on = <T>(channel: string) => (cb: (v: T) => void) => {
  const fn = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, fn)
  return () => { ipcRenderer.removeListener(channel, fn) }
}

const names = [
  'getSegments', 'getRules', 'upsertRule', 'deleteRule', 'resetRules', 'getSettings', 'saveSettings', 'getMonitorStatus', 'pauseMonitoring',
  'resumeMonitoring', 'getFocusState', 'focusStart', 'focusPause', 'focusResume', 'focusEnd', 'focusSkipBreak', 'listSessions',
  'listDistractions', 'exportCsv', 'deleteAllData', 'loadDemoData', 'removeDemoData', 'getPrivacyInfo', 'setAutoStart', 'openDataFolder'
] as const

const api = Object.fromEntries(names.map((n) => [n, invoke(n)])) as unknown as Api
api.onMonitorStatus = on('monitor-status')
api.onFocusState = on('focus-state')
api.onDataChanged = (cb) => on<undefined>('data-changed')(() => cb())
api.onNavigate = on('nav')

contextBridge.exposeInMainWorld('api', api)
