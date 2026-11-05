import type { Classifier } from '../shared/metrics'
import type { FocusSessionRecord, Segment } from '../shared/types'

const esc = (v: string | number | boolean): string => {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s // neutralise spreadsheet formula injection from window titles
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const iso = (t: number): string => new Date(t).toISOString()

export function segmentsCsv(segs: Segment[], classify: Classifier): string {
  const rows = ['start,end,duration_seconds,application,executable,window_title,category,label,idle']
  for (const s of segs) {
    const c = classify(s)
    rows.push([iso(s.start), iso(s.end), Math.round((s.end - s.start) / 1000), s.appName, s.exe, s.title, s.idle ? 'idle' : c.category, c.rule?.label ?? '', s.idle].map(esc).join(','))
  }
  return rows.join('\r\n') + '\r\n'
}

export function sessionsCsv(list: FocusSessionRecord[]): string {
  const rows = ['start,end,mode,label,planned_seconds,focused_seconds,distracted_seconds,distractions,longest_streak_seconds,cycles,completed,consistency_score']
  for (const s of list) rows.push([iso(s.start), iso(s.end), s.mode, s.label, s.plannedSec, s.focusedSec, s.distractedSec, s.distractionCount, s.longestStreakSec, s.cycles, s.completed, s.consistency].map(esc).join(','))
  return rows.join('\r\n') + '\r\n'
}
