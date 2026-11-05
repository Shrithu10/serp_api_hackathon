import { EventEmitter } from 'node:events'
import type { Classifier } from '../shared/metrics'
import type { FocusPhase, FocusStartOptions, FocusState, Settings } from '../shared/types'
import type { Store } from './db'
import type { Sample } from './monitor'

const GRACE_SEC = 5 // an off-task stretch must last this long to count as a distraction (ignores alt-tab flicker)
const SELF_APPS = ['focus os', 'electron']

const blank = (): FocusState => ({
  run: 'idle', sessionId: null, mode: 'custom', phase: 'work', label: '', allowedApps: [], phaseStartedAt: 0, phaseTotalSec: 0,
  phaseElapsedSec: 0, sessionStartedAt: 0, focusedSec: 0, distractedSec: 0, distractionCount: 0, streakSec: 0, longestStreakSec: 0,
  cycle: 0, onTask: true, currentApp: ''
})

/**
 * Focus session state machine. It only observes and notifies — it never closes, blocks or hides any application.
 * Events: 'state' (FocusState, once per second), 'notify' ({title, body}).
 */
export class FocusManager extends EventEmitter {
  private s: FocusState = blank()
  private timer: NodeJS.Timeout | null = null
  private sample: Sample | null = null
  private offSec = 0
  private distractionId: number | null = null
  private distractionStart = 0
  private ticks = 0
  private lastTickAt = 0

  constructor(private store: Store, private getSettings: () => Settings, private getClassifier: () => Classifier) {
    super()
  }

  getState(): FocusState { return this.s }
  onSample(s: Sample): void { this.sample = s }

  private workSec(): number {
    const st = this.getSettings()
    return this.s.mode === 'pomodoro' ? st.pomodoro.workMin * 60 : this.s.phaseTotalSec
  }

  start(o: FocusStartOptions): FocusState {
    if (this.s.run !== 'idle') this.end()
    const st = this.getSettings()
    const now = Date.now()
    const total = o.mode === 'pomodoro' ? st.pomodoro.workMin * 60 : Math.max(1, Math.round(o.durationMin)) * 60
    const label = o.label.trim().slice(0, 80)
    const id = this.store.startSession(now, o.mode, label, total, o.allowedApps)
    this.s = { ...blank(), run: 'running', sessionId: id, mode: o.mode, phase: 'work', label, allowedApps: o.allowedApps, phaseStartedAt: now, phaseTotalSec: total, sessionStartedAt: now }
    this.offSec = 0
    this.distractionId = null
    this.ticks = 0
    this.lastTickAt = now
    this.timer = setInterval(() => this.tick(), 1000)
    this.emitState()
    return this.s
  }

  pause(): FocusState {
    if (this.s.run === 'running') { this.closeDistraction(); this.s.run = 'paused'; this.s.streakSec = 0; this.emitState() }
    return this.s
  }
  resume(): FocusState {
    if (this.s.run === 'paused') { this.s.run = 'running'; this.lastTickAt = Date.now(); this.emitState() }
    return this.s
  }
  skipBreak(): FocusState {
    if (this.s.run !== 'idle' && this.s.phase !== 'work') this.beginPhase('work')
    return this.s
  }

  end(): FocusState {
    if (this.s.run === 'idle') return this.s
    this.finish(false)
    return this.s
  }

  private beginPhase(phase: FocusPhase): void {
    const st = this.getSettings().pomodoro
    const sec = phase === 'work' ? st.workMin * 60 : phase === 'short-break' ? st.shortBreakMin * 60 : st.longBreakMin * 60
    this.closeDistraction()
    this.s = { ...this.s, phase, phaseStartedAt: Date.now(), phaseTotalSec: sec, phaseElapsedSec: 0, streakSec: 0, onTask: true }
    this.offSec = 0
    this.emitState()
  }

  private tick(): void {
    const s = this.s
    if (s.run !== 'running') return
    const now = Date.now()
    // If the machine slept, don't credit the gap.
    if (now - this.lastTickAt > 5000) { this.lastTickAt = now; return }
    this.lastTickAt = now
    s.phaseElapsedSec++
    const smp = this.sample
    s.currentApp = smp && !smp.idle ? smp.appName : smp?.idle ? 'Idle' : ''

    if (s.phase === 'work') {
      const off = this.isOffTask(smp)
      if (smp?.idle) {
        s.streakSec = 0 // idle doesn't build focus, but isn't a distraction either
        this.offSec = 0
        this.closeDistraction()
      } else if (off.off) {
        this.offSec++
        s.onTask = false
        if (this.offSec === GRACE_SEC) {
          s.distractionCount++
          s.distractedSec += GRACE_SEC
          s.streakSec = 0
          this.distractionStart = now - (GRACE_SEC - 1) * 1000
          this.distractionId = this.store.addDistraction(s.sessionId!, this.distractionStart, off.name, smp?.title ?? '')
          if (this.getSettings().notifyOnDistraction) {
            this.emit('notify', { title: 'Focus session', body: `You switched to ${off.name}. Ready to get back to it?` })
          }
        } else if (this.offSec > GRACE_SEC) {
          s.distractedSec++
        }
      } else {
        this.offSec = 0
        s.onTask = true
        this.closeDistraction()
        s.focusedSec++
        s.streakSec++
        s.longestStreakSec = Math.max(s.longestStreakSec, s.streakSec)
      }
    }

    if (s.phaseElapsedSec >= s.phaseTotalSec) this.phaseDone()
    if (++this.ticks % 5 === 0) this.persist(false)
    this.emitState()
  }

  private isOffTask(smp: Sample | null): { off: boolean; name: string } {
    if (!smp || smp.idle) return { off: false, name: '' }
    const allowed = this.s.allowedApps
    if (SELF_APPS.includes(smp.appName.toLowerCase())) return { off: false, name: smp.appName }
    const c = this.getClassifier()(smp)
    if (allowed.length) {
      const ok = allowed.includes(smp.appName) || allowed.includes(c.entity)
      return { off: !ok, name: c.entity }
    }
    return { off: c.category === 'distracting', name: c.entity }
  }

  private closeDistraction(): void {
    if (this.distractionId !== null) {
      this.store.updateDistraction(this.distractionId, (Date.now() - this.distractionStart) / 1000)
      this.distractionId = null
    }
  }

  private phaseDone(): void {
    const pom = this.getSettings().pomodoro
    if (this.s.mode === 'custom') {
      this.emit('notify', { title: 'Focus session complete', body: `Nice work — ${Math.round(this.s.focusedSec / 60)} minutes on task.` })
      this.finish(true)
    } else if (this.s.phase === 'work') {
      this.s.cycle++
      const long = this.s.cycle % pom.cyclesBeforeLong === 0
      this.emit('notify', { title: 'Time for a break', body: `${long ? 'Long' : 'Short'} break — step away from the screen.` })
      this.beginPhase(long ? 'long-break' : 'short-break')
    } else {
      this.emit('notify', { title: 'Break over', body: 'Ready for the next focus block?' })
      this.beginPhase('work')
    }
  }

  private consistency(): number {
    const { focusedSec, distractedSec, longestStreakSec } = this.s
    const total = focusedSec + distractedSec
    if (!total) return 0
    const ref = Math.max(1, this.workSec())
    return Math.round(100 * (0.6 * (focusedSec / total) + 0.4 * Math.min(1, longestStreakSec / ref)))
  }

  private persist(final: boolean, completed = false): void {
    const s = this.s
    if (s.sessionId === null) return
    const cycles = s.mode === 'pomodoro' ? s.cycle : completed ? 1 : 0
    this.store.updateSession(s.sessionId, {
      end: Date.now(), focusedSec: s.focusedSec, distractedSec: s.distractedSec, distractionCount: s.distractionCount,
      longestStreakSec: s.longestStreakSec, cycles, consistency: this.consistency(),
      plannedSec: s.mode === 'pomodoro' ? this.getSettings().pomodoro.workMin * 60 * Math.max(1, s.cycle) : s.phaseTotalSec,
      ...(final ? { open: false, completed: s.mode === 'pomodoro' ? s.cycle >= 1 : completed } : {})
    })
  }

  private finish(completed: boolean): void {
    this.closeDistraction()
    this.persist(true, completed)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.s = blank()
    this.emitState()
    this.emit('ended')
  }

  private emitState(): void { this.emit('state', this.s) }
  dispose(): void {
    if (this.s.run !== 'idle') this.finish(false)
    if (this.timer) clearInterval(this.timer)
  }
}
