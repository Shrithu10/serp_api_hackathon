import type { FocusSessionRecord, Rule, Segment } from './types'
import { DEFAULT_RULES, makeClassifier } from './classify'
import { friendlyAppName } from './apps'
import { addDays, startOfDay } from './time'

export type NewSegment = Omit<Segment, 'id'>
export type NewSession = Omit<FocusSessionRecord, 'id'> & { distractions: { ts: number; appName: string; title: string; durationSec: number }[] }

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Pool {
  exe: string
  titles: string[]
  w: number
  dur: [number, number] // seconds
}
const P = (exe: string, titles: string[], w: number, dur: [number, number]): Pool => ({ exe, titles, w, dur })

const CODE: Pool[] = [
  P('Code.exe', ['index.ts - focus-api - Visual Studio Code', 'router.ts - focus-api - Visual Studio Code', 'schema.sql - focus-api - Visual Studio Code', 'App.tsx - web - Visual Studio Code'], 6, [180, 900]),
  P('WindowsTerminal.exe', ['PowerShell', 'npm run dev', 'git status'], 2, [30, 240]),
  P('chrome.exe', ['Pull requests · acme/focus-api · GitHub - Google Chrome', 'How to debounce in TypeScript - Stack Overflow - Google Chrome', 'Array.prototype.reduce() - MDN - Google Chrome', 'API reference - docs.stripe.com - Google Chrome'], 2.5, [40, 220])
]
const JAVA: Pool[] = [
  P('idea64.exe', ['OrderService.java - billing - IntelliJ IDEA', 'pom.xml - billing - IntelliJ IDEA'], 6, [180, 900]),
  P('WindowsTerminal.exe', ['mvn test', 'git log'], 2, [30, 200]),
  P('msedge.exe', ['Spring Boot reference - docs.spring.io - Microsoft Edge', 'Jira - BILL-482 - Microsoft Edge'], 2, [40, 200])
]
const OFFICE: Pool[] = [
  P('WINWORD.EXE', ['Q4 Planning.docx - Word'], 3, [120, 700]),
  P('EXCEL.EXE', ['Budget 2027.xlsx - Excel'], 3, [120, 600]),
  P('POWERPNT.EXE', ['Roadmap.pptx - PowerPoint'], 2, [120, 500]),
  P('chrome.exe', ['Google Docs - Google Chrome', 'Google Search - Google Chrome'], 1.5, [30, 150])
]
const COMMS: Pool[] = [
  P('slack.exe', ['Slack | #engineering | Acme', 'Slack | DMs | Acme'], 5, [30, 240]),
  P('OUTLOOK.EXE', ['Inbox - Outlook'], 4, [40, 300]),
  P('chrome.exe', ['Gmail - Google Chrome', 'Calendar - Google Chrome'], 2, [30, 120]),
  P('notepad.exe', ['Untitled - Notepad'], 0.5, [20, 90])
]
const DRIFT: Pool[] = [
  P('chrome.exe', ['YouTube - Google Chrome', '(3) Instagram - Google Chrome', 'Reddit - Dive into anything - Google Chrome', 'X / Twitter - Google Chrome', 'Home / X - Google Chrome'], 4, [40, 420]),
  P('Discord.exe', ['#general | Dev Community - Discord'], 3, [30, 300]),
  P('WhatsApp.exe', ['WhatsApp'], 2, [20, 150]),
  P('Spotify.exe', ['Spotify'], 0.5, [15, 60])
]
const WEEKEND: Pool[] = [
  P('chrome.exe', ['YouTube - Google Chrome', 'Netflix - Google Chrome', 'Reddit - Google Chrome', 'Gmail - Google Chrome'], 6, [60, 900]),
  P('Discord.exe', ['#gaming | Friends - Discord'], 3, [60, 600]),
  P('Code.exe', ['side-project - Visual Studio Code'], 2, [300, 1500]),
  P('WhatsApp.exe', ['WhatsApp'], 1.5, [30, 200])
]

function pick<T extends { w: number }>(r: () => number, items: T[]): T {
  const total = items.reduce((n, i) => n + i.w, 0)
  let x = r() * total
  for (const i of items) if ((x -= i.w) <= 0) return i
  return items[items.length - 1]
}

export function generateDemoData(now: number, days = 21, seed = 20260101): { segments: NewSegment[]; sessions: NewSession[] } {
  const segments: NewSegment[] = []
  const sessions: NewSession[] = []
  const rules: Rule[] = DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1, builtin: true }))
  const classify = makeClassifier(rules)
  const today = startOfDay(now)

  for (let back = days - 1; back >= 0; back--) {
    const dayStart = addDays(today, -back)
    const dow = new Date(dayStart).getDay()
    const r = rng(seed + Math.floor(dayStart / 86_400_000))
    const weekend = dow === 0 || dow === 6
    const dayCap = Infinity
    const discipline = 0.2 + r() * 0.65 // higher = fewer distractions
    const dayPools = r() < 0.45 ? JAVA : r() < 0.8 ? CODE : OFFICE
    const dayStartSegCount = segments.length
    const dayStartSessCount = sessions.length
    const dayMs = (h: number, m = 0): number => dayStart + (h * 60 + m) * 60_000

    let t = dayMs(weekend ? 11 : 8, weekend ? 30 : 40) + Math.floor(r() * 40) * 60_000

    const push = (until: number, pool: Pool[], interruptP = 0): void => {
      while (t < until && t < dayCap) {
        const p = pick(r, pool)
        const dur = Math.min((p.dur[0] + r() * (p.dur[1] - p.dur[0])) * 1000, until - t, dayCap - t)
        if (dur < 1000) break
        const title = p.titles[Math.floor(r() * p.titles.length)]
        const appName = friendlyAppName(p.exe, title)
        const last = segments[segments.length - 1]
        if (last && !last.idle && last.appName === appName && last.title === title && last.end === t) last.end = t + dur
        else segments.push({ start: t, end: t + dur, appName, exe: p.exe, title, idle: false, demo: true })
        t += dur
        if (interruptP && r() < interruptP * 1.7 * (1.3 - discipline)) {
          const d = pick(r, DRIFT)
          const dd = Math.min((d.dur[0] + r() * (d.dur[1] - d.dur[0]) * 0.6) * 1000, until - t, dayCap - t)
          if (dd > 1000) {
            const dt = d.titles[Math.floor(r() * d.titles.length)]
            segments.push({ start: t, end: t + dd, appName: friendlyAppName(d.exe, dt), exe: d.exe, title: dt, idle: false, demo: true })
            t += dd
          }
        }
      }
    }
    const idle = (mins: number): void => {
      const end = Math.min(t + mins * 60_000, dayCap)
      if (end > t) segments.push({ start: t, end, appName: 'Idle', exe: '', title: '', idle: true, demo: true })
      t = end
    }

    if (weekend) {
      if (r() < 0.55) { // many weekends are light or untracked
        push(dayMs(13), WEEKEND, 0.1)
        idle(25)
        push(dayMs(16, 30), WEEKEND, 0.1)
      }
    } else {
      push(dayMs(9, 25), COMMS)
      push(dayMs(11, 20 + Math.floor(r() * 25)), dayPools, 0.07)
      push(dayMs(12, 5), COMMS, 0.1)
      idle(35 + Math.floor(r() * 30))
      push(dayMs(15, 15 + Math.floor(r() * 20)), dayPools, 0.09)
      if (r() < 0.6) idle(4 + Math.floor(r() * 6))
      push(dayMs(16, 10), [...COMMS, ...DRIFT.map((d) => ({ ...d, w: d.w * 0.7 }))], 0.1)
      push(dayMs(17, 20 + Math.floor(r() * 40)), dayPools, 0.08)
    }

    // focus sessions derived from this day's focused stretches
    const daySegs = segments.slice(dayStartSegCount)
    if (!weekend && daySegs.length) {
      const starts = [dayMs(9, 30), dayMs(13, 30), dayMs(16, 15)]
      starts.forEach((s0, i) => {
        if (r() < 0.25 || s0 + 25 * 60_000 > dayCap) return
        const planMin = [25, 25, 50, 45][Math.floor(r() * 4)]
        const sEnd = s0 + planMin * 60_000
        const inWin = daySegs.filter((g) => g.end > s0 && g.start < sEnd && !g.idle)
        let focused = 0, distracted = 0, count = 0, streak = 0, longest = 0
        const distractions: NewSession['distractions'] = []
        for (const g of inWin) {
          const ms = (Math.min(g.end, sEnd) - Math.max(g.start, s0)) / 1000
          if (classify(g).category === 'distracting') {
            distracted += ms; count++; streak = 0
            distractions.push({ ts: Math.max(g.start, s0), appName: classify(g).entity, title: g.title, durationSec: Math.round(ms) })
          } else { focused += ms; streak += ms; longest = Math.max(longest, streak) }
        }
        const completed = r() < 0.78 && count < 4
        const elapsedEnd = completed ? sEnd : s0 + Math.floor(planMin * (0.4 + r() * 0.4)) * 60_000
        const total = focused + distracted || 1
        const consistency = Math.round(100 * (0.6 * (focused / total) + 0.4 * Math.min(1, longest / (planMin * 60))))
        sessions.push({
          start: s0, end: elapsedEnd, mode: i === 1 ? 'pomodoro' : 'custom', label: ['Ship billing fix', 'Write Q4 plan', 'Refactor API', 'Code review'][Math.floor(r() * 4)],
          plannedSec: planMin * 60, focusedSec: Math.round(focused), distractedSec: Math.round(distracted), distractionCount: count,
          longestStreakSec: Math.round(longest), cycles: completed ? 1 : 0, completed, consistency, allowedApps: [], demo: true, distractions
        })
      })
    }

    // "Today" is generated as a full day and shifted so it ends at the present moment, so it is never empty or from the future.
    if (back === 0) {
      const mine = segments.splice(dayStartSegCount)
      const lastEnd = mine.length ? mine[mine.length - 1].end : 0
      const shift = Math.max(0, lastEnd - now)
      for (const g of mine) {
        const st = Math.max(dayStart, g.start - shift), en = g.end - shift
        if (en > st) segments.push({ ...g, start: st, end: en })
      }
      const ms = sessions.splice(dayStartSessCount)
      for (const x of ms) {
        if (x.start - shift < dayStart) continue
        sessions.push({ ...x, start: x.start - shift, end: x.end - shift, distractions: x.distractions.map((d) => ({ ...d, ts: d.ts - shift })) })
      }
    }
  }
  return { segments, sessions }
}
