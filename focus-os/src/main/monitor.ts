import { EventEmitter } from 'node:events'
import { friendlyAppName } from '../shared/apps'
import type { MonitorStatus, Settings } from '../shared/types'
import type { Store } from './db'
import { createProbe, type WindowProbe } from './windowProbe'

interface Open { id: number; start: number; end: number; appName: string; exe: string; title: string; idle: boolean }
export interface Sample { appName: string; exe: string; title: string; idle: boolean; ts: number }

const PAUSE_KEY = 'pausedUntil' // '0' = not paused, '-1' = paused until resumed, otherwise epoch ms

export class Monitor extends EventEmitter {
  private probe: WindowProbe | null = null
  private timer: NodeJS.Timeout | null = null
  private open: Open | null = null
  private locked = false
  private running = false
  private lastState: MonitorStatus['state'] = 'active'
  private status: MonitorStatus
  private lastPrune = 0

  constructor(private store: Store, private getIdleSec: () => number) {
    super()
    this.status = { state: 'active', pausedUntil: null, current: null, idleSec: 0, platform: process.platform, simulated: process.platform !== 'win32' }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.probe = createProbe()
    this.status.simulated = this.probe.simulated
    this.loop()
  }
  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.finalize(Date.now())
    this.probe?.stop()
  }
  setLocked(v: boolean): void { this.locked = v }
  getStatus(): MonitorStatus { return this.status }

  private pausedUntil(): number {
    return Number(this.store.getMeta(PAUSE_KEY) ?? '0')
  }
  pause(minutes: number | null): MonitorStatus {
    this.store.setMeta(PAUSE_KEY, minutes === null ? '-1' : String(Date.now() + minutes * 60_000))
    this.finalize(Date.now())
    return this.refreshStatus(Date.now(), this.store.getSettings())
  }
  resume(): MonitorStatus {
    this.store.setMeta(PAUSE_KEY, '0')
    return this.refreshStatus(Date.now(), this.store.getSettings())
  }

  private inSchedule(now: number, s: Settings): boolean {
    if (!s.schedule.enabled) return true
    const d = new Date(now)
    if (!s.schedule.days.includes(d.getDay())) return false
    const mins = d.getHours() * 60 + d.getMinutes()
    const [sh, sm] = s.schedule.start.split(':').map(Number)
    const [eh, em] = s.schedule.end.split(':').map(Number)
    const a = sh * 60 + sm, b = eh * 60 + em
    return a <= b ? mins >= a && mins < b : mins >= a || mins < b
  }

  private refreshStatus(now: number, settings: Settings): MonitorStatus {
    const p = this.pausedUntil()
    let state: MonitorStatus['state'] = 'active'
    let pausedUntil: number | null = null
    if (p === -1 || p > now) { state = 'paused'; pausedUntil = p === -1 ? null : p }
    else {
      if (p !== 0) this.store.setMeta(PAUSE_KEY, '0') // timed pause expired
      if (!this.inSchedule(now, settings)) state = 'outside-schedule'
    }
    this.status = { ...this.status, state, pausedUntil }
    if (state !== this.lastState) { this.lastState = state; this.emit('state', this.status) }
    return this.status
  }

  private loop(): void {
    if (!this.running) return
    const settings = this.store.getSettings()
    void this.tick(settings).catch(() => undefined).finally(() => {
      if (this.running) this.timer = setTimeout(() => this.loop(), Math.max(1, settings.pollIntervalSec) * 1000)
    })
  }

  private finalize(at: number): void {
    if (this.open) {
      if (at > this.open.end) { this.open.end = at; this.store.updateSegmentEnd(this.open.id, at) }
      this.open = null
    }
  }

  private async tick(settings: Settings): Promise<void> {
    const now = Date.now()
    const st = this.refreshStatus(now, settings)
    if (st.state !== 'active') {
      this.finalize(now)
      this.status = { ...this.status, current: null, idleSec: 0 }
      this.emit('status', this.status)
      return
    }

    const idleSec = this.locked ? Math.max(this.getIdleSec(), settings.idleThresholdSec) : this.getIdleSec()
    const idle = idleSec >= settings.idleThresholdSec
    let s: Sample
    if (idle) {
      s = { appName: 'Idle', exe: '', title: '', idle: true, ts: now }
    } else {
      const w = await this.probe!.sample()
      if (!w) { this.finalize(now); this.emit('status', { ...this.status, current: null }); return }
      s = { appName: friendlyAppName(w.exe, w.title), exe: w.exe, title: settings.storeTitles ? w.title : '', idle: false, ts: now }
    }
    this.record(s, idleSec, settings)
    this.status = { ...this.status, state: 'active', current: idle ? null : { appName: s.appName, exe: s.exe, title: s.title, since: this.open?.start ?? now }, idleSec }
    this.emit('status', this.status)
    this.emit('sample', s)

    if (now - this.lastPrune > 6 * 3_600_000) {
      this.lastPrune = now
      if (settings.retentionDays > 0) this.store.pruneBefore(now - settings.retentionDays * 86_400_000)
    }
  }

  private record(s: Sample, idleSec: number, settings: Settings): void {
    const now = s.ts
    const gapLimit = settings.pollIntervalSec * 3000 + 2000
    const o = this.open
    if (o && now - o.end > gapLimit) this.finalize(o.end) // sleep / hiccup: don't invent time

    const cur = this.open
    if (cur && cur.idle === s.idle && cur.appName === s.appName && cur.title === s.title) {
      cur.end = now
      this.store.updateSegmentEnd(cur.id, now)
      return
    }
    let start = cur ? cur.end : now
    if (cur && s.idle) {
      // Idle began `idleSec` ago: trim the previous activity so idle time isn't counted as active.
      const idleStart = Math.max(cur.start, now - idleSec * 1000)
      cur.end = Math.min(cur.end, idleStart)
      this.store.updateSegmentEnd(cur.id, cur.end)
      start = Math.max(idleStart, cur.end)
    }
    const seg = { start, end: now, appName: s.appName, exe: s.exe, title: s.title, idle: s.idle, demo: false }
    this.open = { id: this.store.insertSegment(seg), ...seg }
  }
}
