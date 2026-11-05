import type { DayStats } from './metrics'
import type { FocusSessionRecord } from './types'
import { fmtDuration, fmtHM, fmtHour, MIN } from './time'
import { isBrowserName } from './apps'

export interface Insight {
  id: string
  tone: 'positive' | 'warning' | 'info'
  title: string
  detail: string
  /** Where the number came from, so nothing is a black box. */
  basis: string
}

const pct = (n: number): string => `${Math.round(Math.abs(n))}%`

/**
 * Every insight is derived from recorded data and is only emitted when there is enough of it.
 * `days` is ordered oldest -> newest and its last element is "today".
 */
export function generateInsights(days: DayStats[], sessions: FocusSessionRecord[], now: number, deepWorkMin: number): Insight[] {
  const out: Insight[] = []
  if (!days.length) return out
  const today = days[days.length - 1]
  const yesterday = days.length > 1 ? days[days.length - 2] : null
  const prior = days.slice(0, -1).filter((d) => d.activeMs >= 30 * MIN)
  const hasToday = today.activeMs >= 5 * MIN
  const label = hasToday ? 'today' : 'on your latest tracked day'
  const ref = hasToday ? today : [...days].reverse().find((d) => d.activeMs >= 5 * MIN) ?? null
  if (!ref) return out

  // 1. Longest productive stretch
  if (ref.longestBlock && ref.longestBlock.productiveMs >= 10 * MIN) {
    const b = ref.longestBlock
    out.push({
      id: 'longest-productive', tone: b.productiveMs >= deepWorkMin * MIN ? 'positive' : 'info',
      title: `Your longest productive period was between ${fmtHM(b.start)} and ${fmtHM(b.end)}`,
      detail: `${fmtDuration(b.productiveMs)} of productive time ${label}${b.productiveMs >= deepWorkMin * MIN ? ', which qualifies as deep work' : ''}.`,
      basis: 'Longest run of productive activity, tolerating interruptions under your deep-work gap setting.'
    })
  }

  // 2. Peak productive hour
  const bestHour = [...ref.hourly].sort((a, b) => b.productive - a.productive)[0]
  if (bestHour && bestHour.productive >= 15 * MIN) {
    out.push({
      id: 'peak-hour', tone: 'info',
      title: `${fmtHour(bestHour.hour)} was your most productive hour`,
      detail: `${fmtDuration(bestHour.productive)} of productive time between ${fmtHour(bestHour.hour)} and ${fmtHour((bestHour.hour + 1) % 24)} ${label}.`,
      basis: 'Hour of day with the most time in applications classified Productive.'
    })
  }

  // 3. Switches
  if (ref.appSwitches >= 5) {
    const avg = prior.length >= 3 ? prior.reduce((n, d) => n + d.appSwitches, 0) / prior.length : null
    let extra = ''
    let tone: Insight['tone'] = 'info'
    if (avg !== null && avg > 0 && hasToday) {
      const diff = ((ref.appSwitches - avg) / avg) * 100
      if (Math.abs(diff) >= 15) {
        extra = ` That is ${pct(diff)} ${diff > 0 ? 'more' : 'fewer'} than your ${prior.length}-day average of ${Math.round(avg)}.`
        tone = diff > 0 ? 'warning' : 'positive'
      }
    }
    out.push({
      id: 'switches', tone,
      title: `You switched applications ${ref.appSwitches} times ${label}`,
      detail: `${ref.contextSwitches} context switches across ${fmtDuration(ref.activeMs)} of active time.${extra}`,
      basis: 'Counts each change of foreground application; context switches also count site changes inside browsers.'
    })
  }

  // 4. Peak switching hour
  const swHour = [...ref.hourly].sort((a, b) => b.switches - a.switches)[0]
  if (swHour && swHour.switches >= 12) {
    out.push({
      id: 'switch-hour', tone: 'warning',
      title: `Your busiest hour for context switching was ${fmtHour(swHour.hour)}`,
      detail: `${swHour.switches} context switches between ${fmtHour(swHour.hour)} and ${fmtHour((swHour.hour + 1) % 24)} ${label}. Frequent switching makes deep work harder.`,
      basis: 'Hour of day with the most entity changes.'
    })
  }

  // 5. Browser change vs yesterday
  if (hasToday && yesterday && yesterday.activeMs >= 15 * MIN && today.activeMs >= 15 * MIN) {
    const browserMs = (d: DayStats): number => d.apps.filter((a) => isBrowserName(a.appName)).reduce((n, a) => n + a.ms, 0)
    const t = browserMs(today), y = browserMs(yesterday)
    if (y >= 10 * MIN) {
      const diff = ((t - y) / y) * 100
      if (Math.abs(diff) >= 10) {
        out.push({
          id: 'browser-change', tone: diff > 0 ? 'warning' : 'positive',
          title: `Browser usage ${diff > 0 ? 'increased' : 'decreased'} by ${pct(diff)} compared to yesterday`,
          detail: `${fmtDuration(t)} today versus ${fmtDuration(y)} yesterday.`,
          basis: 'Combined time in Chrome, Edge, Firefox, Brave and Opera.'
        })
      }
    }
  }

  // 6. Uninterrupted work
  if (ref.longestBlock && ref.longestBlock.productiveMs >= 30 * MIN) {
    out.push({
      id: 'uninterrupted', tone: 'positive',
      title: `You had ${fmtDuration(ref.longestBlock.productiveMs)} of uninterrupted work`,
      detail: `Started at ${fmtHM(ref.longestBlock.start)}. Your average focused stretch ${label} was ${ref.avgBlockMs ? fmtDuration(ref.avgBlockMs) : 'n/a'}.`,
      basis: 'Productive time with no break longer than your allowed gap and no idle period.'
    })
  }

  // 7. Most distracting entity
  const topD = ref.entities.filter((e) => e.category === 'distracting')[0]
  if (topD && topD.ms >= 5 * MIN) {
    const share = ref.activeMs ? (topD.ms / ref.activeMs) * 100 : 0
    out.push({
      id: 'top-distraction', tone: 'warning',
      title: `Your most distracting application was ${topD.entity}`,
      detail: `${fmtDuration(topD.ms)} ${label} (${pct(share)} of active time).`,
      basis: 'Entity with the most time classified Distracting. Edit rules in Settings if this is wrong.'
    })
  }

  // 8. Focus score vs prior days
  if (hasToday && today.focusScore !== null) {
    const scored = prior.filter((d) => d.focusScore !== null)
    if (scored.length >= 3) {
      const avg = scored.reduce((n, d) => n + (d.focusScore ?? 0), 0) / scored.length
      const diff = today.focusScore - avg
      if (Math.abs(diff) >= 5) {
        out.push({
          id: 'score-vs-avg', tone: diff > 0 ? 'positive' : 'warning',
          title: `Your focus score is ${Math.abs(Math.round(diff))} points ${diff > 0 ? 'above' : 'below'} your recent average`,
          detail: `${today.focusScore} today versus an average of ${Math.round(avg)} over the previous ${scored.length} tracked days.`,
          basis: 'Compared with days that have at least 30 minutes of activity.'
        })
      }
    }
  }

  // 9. Best weekday
  const byDow = new Map<number, number[]>()
  for (const d of days) if (d.focusScore !== null && d.activeMs >= 30 * MIN) {
    const k = new Date(d.dayStart).getDay()
    byDow.set(k, [...(byDow.get(k) ?? []), d.focusScore])
  }
  if (days.length >= 10 && byDow.size >= 4) {
    const ranked = [...byDow.entries()].map(([k, v]) => ({ k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })).sort((a, b) => b.avg - a.avg)
    const best = ranked[0]
    const name = new Date(2024, 0, 7 + best.k).toLocaleDateString([], { weekday: 'long' })
    out.push({
      id: 'best-weekday', tone: 'info',
      title: `${name} is your most focused day of the week`,
      detail: `Average focus score ${Math.round(best.avg)} across ${best.n} recorded ${name}${best.n > 1 ? 's' : ''}.`,
      basis: `Based on ${days.length} days of history.`
    })
  }

  // 10. Idle
  if (ref.idleMs >= 30 * MIN) {
    out.push({
      id: 'idle', tone: 'info',
      title: `${fmtDuration(ref.idleMs)} idle ${label}`,
      detail: 'Time with no keyboard or mouse activity beyond your idle threshold. Idle time is excluded from every focus metric.',
      basis: 'Detected from the OS idle timer; Focus OS never records what you type.'
    })
  }

  // 11. Focus sessions
  const weekAgo = now - 7 * 86_400_000
  const recent = sessions.filter((s) => s.end >= weekAgo)
  if (recent.length >= 2) {
    const done = recent.filter((s) => s.completed).length
    const focused = recent.reduce((n, s) => n + s.focusedSec, 0)
    out.push({
      id: 'sessions', tone: done / recent.length >= 0.6 ? 'positive' : 'info',
      title: `You completed ${done} of ${recent.length} focus sessions this week`,
      detail: `${fmtDuration(focused * 1000)} of on-task time in sessions, with ${recent.reduce((n, s) => n + s.distractionCount, 0)} recorded distractions.`,
      basis: 'Focus sessions that ended within the last 7 days.'
    })
  }

  return out
}
