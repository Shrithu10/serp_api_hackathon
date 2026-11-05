import { app, BrowserWindow, session, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell, Tray } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Api, PageId } from '../shared/api'
import { makeClassifier } from '../shared/classify'
import { generateDemoData } from '../shared/seed'
import type { FocusState, MonitorStatus } from '../shared/types'
import { segmentsCsv, sessionsCsv } from './csv'
import { Store } from './db'
import { FocusManager } from './focus'
import { Monitor } from './monitor'

const isDev = !app.isPackaged
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let store: Store
let monitor: Monitor
let focus: FocusManager
let classify = (null as unknown) as ReturnType<typeof makeClassifier>

const resource = (f: string): string => (isDev ? join(__dirname, '../../resources', f) : join(process.resourcesPath, 'resources', f))
const icon = (f: string): Electron.NativeImage => nativeImage.createFromPath(resource(f))
const send = (ch: string, ...args: unknown[]): void => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args) }
const show = (page?: PageId): void => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  if (page) send('nav', page)
}

if (!app.requestSingleInstanceLock()) { app.quit() }
else app.on('second-instance', () => show())

function createWindow(hidden: boolean): void {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640, show: false, backgroundColor: '#09090b', title: 'Focus OS',
    icon: icon('icon.png'), autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#09090b', symbolColor: '#a1a1aa', height: 40 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.once('ready-to-show', () => { if (!hidden) win?.show() })
  win.on('close', (e) => {
    if (!quitting && store.getSettings().minimizeToTray) { e.preventDefault(); win?.hide() }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (isDev && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildTray(): void {
  if (!tray) {
    tray = new Tray(icon('tray-active.png'))
    tray.on('click', () => show())
  }
  const st: MonitorStatus = monitor.getStatus()
  const fs: FocusState = focus.getState()
  const label = st.state === 'paused' ? 'Monitoring paused' : st.state === 'outside-schedule' ? 'Outside monitoring schedule' : 'Monitoring active'
  tray.setImage(icon(st.state === 'active' ? 'tray-active.png' : 'tray-paused.png'))
  tray.setToolTip(`Focus OS — ${label}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Focus OS', click: () => show() },
    { type: 'separator' },
    { label, enabled: false },
    st.state === 'paused' ? { label: 'Resume monitoring', click: () => monitor.resume() } : { label: 'Pause monitoring', submenu: [
      { label: 'For 15 minutes', click: () => monitor.pause(15) },
      { label: 'For 1 hour', click: () => monitor.pause(60) },
      { label: 'Until I resume', click: () => monitor.pause(null) }
    ] },
    { type: 'separator' },
    fs.run === 'idle'
      ? { label: 'Start 25-minute focus session', click: () => focus.start({ mode: 'custom', durationMin: 25, allowedApps: [], label: '' }) }
      : { label: 'End focus session', click: () => focus.end() },
    { label: 'Focus sessions…', click: () => show('focus') },
    { type: 'separator' },
    { label: 'Quit Focus OS', click: () => { quitting = true; app.quit() } }
  ]))
}

function registerIpc(): void {
  const h = <K extends keyof Api>(name: K, fn: (...a: Parameters<Api[K]>) => unknown): void => {
    ipcMain.handle('api:' + name, (_e, ...a) => (fn as (...x: unknown[]) => unknown)(...a))
  }
  const info = (): ReturnType<Store['privacyInfo']> => store.privacyInfo()
  const refreshRules = (r: ReturnType<Store['listRules']>): ReturnType<Store['listRules']> => { classify = makeClassifier(r); return r }

  h('getSegments', (from, to) => store.getSegments(from, to))
  h('getRules', () => store.listRules())
  h('upsertRule', (r) => refreshRules(store.upsertRule(r)))
  h('deleteRule', (id) => refreshRules(store.deleteRule(id)))
  h('resetRules', () => refreshRules(store.resetRules()))
  h('getSettings', () => store.getSettings())
  h('saveSettings', (p) => { const s = store.saveSettings(p); buildTray(); return s })
  h('getMonitorStatus', () => monitor.getStatus())
  h('pauseMonitoring', (m) => monitor.pause(m))
  h('resumeMonitoring', () => monitor.resume())
  h('getFocusState', () => focus.getState())
  h('focusStart', (o) => focus.start(o))
  h('focusPause', () => focus.pause())
  h('focusResume', () => focus.resume())
  h('focusEnd', () => focus.end())
  h('focusSkipBreak', () => focus.skipBreak())
  h('listSessions', () => store.listSessions())
  h('listDistractions', (id) => store.listDistractions(id))
  h('getPrivacyInfo', info)
  h('openDataFolder', () => { shell.showItemInFolder(store.path) })
  h('setAutoStart', (enabled) => {
    if (process.platform === 'win32' || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    store.saveSettings({ autoStart: enabled })
    return enabled
  })
  h('exportCsv', async (kind) => {
    if (!win) return { ok: false, error: 'No window' }
    const stamp = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(win, { title: 'Export to CSV', defaultPath: `focus-os-${kind}-${stamp}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (r.canceled || !r.filePath) return { ok: false }
    try {
      const body = kind === 'activity' ? segmentsCsv(store.allSegments(), classify) : sessionsCsv(store.listSessions(100000))
      writeFileSync(r.filePath, '﻿' + body, 'utf8')
      return { ok: true, path: r.filePath, rows: body.split('\r\n').length - 2 }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  })
  h('deleteAllData', async () => {
    if (win) {
      const r = await dialog.showMessageBox(win, {
        type: 'warning', buttons: ['Cancel', 'Delete everything'], defaultId: 0, cancelId: 0, title: 'Delete all activity data',
        message: 'Permanently delete all recorded activity and focus sessions?', detail: 'This cannot be undone. Your rules and settings are kept.'
      })
      if (r.response !== 1) return info()
    }
    focus.end()
    store.deleteAllActivity()
    send('data-changed')
    return info()
  })
  h('loadDemoData', () => {
    store.deleteDemo()
    const d = generateDemoData(Date.now())
    store.insertSegments(d.segments)
    store.insertDemoSessions(d.sessions)
    send('data-changed')
    return info()
  })
  h('removeDemoData', () => { store.deleteDemo(); send('data-changed'); return info() })
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show()
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.focusos.app')
  Menu.setApplicationMenu(null)
  store = new Store(join(app.getPath('userData'), 'focus-os.db'))
  store.closeDanglingSessions()
  classify = makeClassifier(store.listRules())

  monitor = new Monitor(store, () => powerMonitor.getSystemIdleTime())
  focus = new FocusManager(store, () => store.getSettings(), () => classify)
  focus.on('state', (s: FocusState) => send('focus-state', s))
  focus.on('notify', (n: { title: string; body: string }) => notify(n.title, n.body))
  focus.on('ended', () => { send('data-changed'); buildTray() })
  monitor.on('sample', (s) => focus.onSample(s))
  monitor.on('status', (s: MonitorStatus) => send('monitor-status', s))
  monitor.on('state', () => { buildTray(); send('monitor-status', monitor.getStatus()) })
  powerMonitor.on('lock-screen', () => monitor.setLocked(true))
  powerMonitor.on('unlock-screen', () => monitor.setLocked(false))

  if (!isDev) {
    // Strict CSP in production: no remote origins at all (the app never touches the network).
    session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'"] } }))
  }
  registerIpc()
  const hidden = process.argv.includes('--hidden')
  createWindow(hidden)
  buildTray()
  monitor.start()
  setInterval(() => send('data-changed'), 10_000) // live refresh of today's open segment
  focus.on('state', (() => { let last = ''; return (s: FocusState) => { if (s.run !== last) { last = s.run; buildTray() } } })())
  app.on('activate', () => show())
})

app.on('before-quit', () => { quitting = true; focus?.dispose(); monitor?.stop(); store?.close() })
app.on('window-all-closed', () => { /* keep running in tray */ })
