import type { Category, Classification, Segment, Settings } from './types'
import { HOUR, startOfDay, addDays } from './time'

export type Classifier = (seg: Pick<Segment, 'appName' | 'exe' | 'title' | 'idle'>) => Classification

export interface AppStat {
  appName: string
  ms: number
  byCategory: Record<Category, number>
  category: Category // dominant category
  share: number // of active time, 0..1
}
export interface EntityStat {
  entity: string
  appName: string
  ms: number
  category: Category
}
export interface WorkBlock {
  start: number
  end: number
  productiveMs: number
}
export interface HourBucket {
  hour: number
  productive: number
  neutral: number
  distracting: number
  idle: number
  switches: number
}
export interface ScoreBreakdown {
  productiveShare: number
  deepWorkShare: number
  lowDistraction: number
  switchStability: number
}
export interface DayStats {
  dayStart: number
  activeMs: number // everything except idle
  productiveMs: number
  neutralMs: number
  distractingMs: number
  idleMs: number
  deepWorkMs: number
  appSwitches: number
  contextSwitches: number
  switchesPerHour: number | null
  blocks: WorkBlock[]
  longestBlock: WorkBlock | null
  avgBlockMs: number | null
  hourly: HourBucket[]
  apps: AppStat[]
  entities: EntityStat[]
  focusScore: number | null
  breakdown: ScoreBreakdown | null
  firstTs: number | null
  lastTs: number | null
}

export const SCORE_MIN_ACTIVE_MS = 5 * 60_000

/** Clip segments to [from, to) and drop empties. */
export function clip(segs: Segment[], from: number, to: number): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    const start = Math.max(s.start, from)
    const end = Math.min(s.end, to)
    if (end > start) out.push(start === s.start && end === s.end ? s : { ...s, start, end })
  }
  return out.sort((a, b) => a.start - b.start)
}

export const emptyByCat = (): Record<Category, number> => ({ productive: 0, neutral: 0, distracting: 0 })

export function computeDay(
  allSegs: Segment[],
  dayStart: number,
  classify: Classifier,
  settings: Pick<Settings, 'deepWorkMinMinutes' | 'deepWorkGapSec'>
): DayStats {
  const dayEnd = addDays(dayStart, 1)
  const segs = clip(allSegs, dayStart, dayEnd)
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, productive: 0, neutral: 0, distracting: 0, idle: 0, switches: 0 }))
  const appMap = new Map<string, { ms: number; by: Record<Category, number> }>()
  const entMap = new Map<string, EntityStat>()
  let productiveMs = 0, neutralMs = 0, distractingMs = 0, idleMs = 0
  let appSwitches = 0, contextSwitches = 0
  let prevApp: string | null = null
  let prevEntity: string | null = null
  const blocks: WorkBlock[] = []
  let cur: (WorkBlock & { idleSeen: boolean }) | null = null
  const gapMs = settings.deepWorkGapSec * 1000

  const addToHours = (start: number, end: number, key: 'productive' | 'neutral' | 'distracting' | 'idle') => {
    let t = start
    while (t < end) {
      const d = new Date(t)
      const hStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime()
      const hEnd = Math.min(end, hStart + HOUR)
      hourly[d.getHours()][key] += hEnd - t
      t = hEnd
    }
  }

  for (const s of segs) {
    const ms = s.end - s.start
    if (s.idle) {
      idleMs += ms
      addToHours(s.start, s.end, 'idle')
      if (cur) cur.idleSeen = true
      continue
    }
    const c = classify(s)
    if (c.category === 'productive') productiveMs += ms
    else if (c.category === 'neutral') neutralMs += ms
    else distractingMs += ms
    addToHours(s.start, s.end, c.category)

    const a = appMap.get(s.appName) ?? { ms: 0, by: emptyByCat() }
    a.ms += ms
    a.by[c.category] += ms
    appMap.set(s.appName, a)

    const ek = `${c.entity}\u0000${s.appName}`
    const e = entMap.get(ek)
    if (e) e.ms += ms
    else entMap.set(ek, { entity: c.entity, appName: s.appName, ms, category: c.category })

    if (prevApp !== null && prevApp !== s.appName) {
      appSwitches++
    }
    if (prevEntity !== null && prevEntity !== c.entity) {
      contextSwitches++
      hourly[new Date(s.start).getHours()].switches++
    }
    prevApp = s.appName
    prevEntity = c.entity

    // deep work blocks: productive time, tolerating short non-idle interruptions
    if (c.category === 'productive') {
      if (cur && !cur.idleSeen && s.start - cur.end <= gapMs) {
        cur.end = s.end
        cur.productiveMs += ms
      } else {
        if (cur) blocks.push({ start: cur.start, end: cur.end, productiveMs: cur.productiveMs })
        cur = { start: s.start, end: s.end, productiveMs: ms, idleSeen: false }
      }
    } else if (cur && s.start - cur.end > gapMs) {
      // an unproductive stretch longer than the tolerance closes the block
      blocks.push({ start: cur.start, end: cur.end, productiveMs: cur.productiveMs })
      cur = null
    }
  }
  if (cur) blocks.push({ start: cur.start, end: cur.end, productiveMs: cur.productiveMs })

  const activeMs = productiveMs + neutralMs + distractingMs
  const minBlock = settings.deepWorkMinMinutes * 60_000
  const deepWorkMs = blocks.filter((b) => b.productiveMs >= minBlock).reduce((n, b) => n + b.productiveMs, 0)
  const longestBlock = blocks.reduce<WorkBlock | null>((m, b) => (!m || b.productiveMs > m.productiveMs ? b : m), null)
  const meaningful = blocks.filter((b) => b.productiveMs >= 2 * 60_000)
  const avgBlockMs = meaningful.length ? meaningful.reduce((n, b) => n + b.productiveMs, 0) / meaningful.length : null
  const switchesPerHour = activeMs >= 15 * 60_000 ? contextSwitches / (activeMs / HOUR) : null

  const apps: AppStat[] = [...appMap.entries()]
    .map(([appName, v]) => {
      const category = (Object.entries(v.by).sort((x, y) => y[1] - x[1])[0][0]) as Category
      return { appName, ms: v.ms, byCategory: v.by, category, share: activeMs ? v.ms / activeMs : 0 }
    })
    .sort((a, b) => b.ms - a.ms)
  const entities = [...entMap.values()].sort((a, b) => b.ms - a.ms)

  let focusScore: number | null = null
  let breakdown: ScoreBreakdown | null = null
  if (activeMs >= SCORE_MIN_ACTIVE_MS) {
    breakdown = {
      productiveShare: productiveMs / activeMs,
      deepWorkShare: Math.min(1, deepWorkMs / Math.max(activeMs * 0.5, 1)),
      lowDistraction: 1 - distractingMs / activeMs,
      switchStability: 1 - Math.min(1, (switchesPerHour ?? contextSwitches / Math.max(activeMs / HOUR, 0.25)) / 60)
    }
    focusScore = Math.round(
      100 * (0.45 * breakdown.productiveShare + 0.25 * breakdown.deepWorkShare + 0.15 * breakdown.lowDistraction + 0.15 * breakdown.switchStability)
    )
  }

  return {
    dayStart, activeMs, productiveMs, neutralMs, distractingMs, idleMs, deepWorkMs,
    appSwitches, contextSwitches, switchesPerHour, blocks, longestBlock, avgBlockMs,
    hourly, apps, entities, focusScore, breakdown,
    firstTs: segs.length ? segs[0].start : null,
    lastTs: segs.length ? segs[segs.length - 1].end : null
  }
}

/** Stats for each of `days` consecutive days ending at (and including) the day of `endTs`. */
export function computeRange(segs: Segment[], endTs: number, days: number, classify: Classifier, settings: Pick<Settings, 'deepWorkMinMinutes' | 'deepWorkGapSec'>): DayStats[] {
  const out: DayStats[] = []
  const endDay = startOfDay(endTs)
  for (let i = days - 1; i >= 0; i--) out.push(computeDay(segs, addDays(endDay, -i), classify, settings))
  return out
}

export interface TimelineBlock {
  start: number
  end: number
  appName: string
  entity: string
  category: Category
  title: string
  idle: boolean
}

/** Merge adjacent segments of the same entity into display blocks. */
export function timelineBlocks(segs: Segment[], classify: Classifier, from: number, to: number, mergeGapMs = 20_000): TimelineBlock[] {
  const out: TimelineBlock[] = []
  for (const s of clip(segs, from, to)) {
    const c = classify(s)
    const prev = out[out.length - 1]
    if (prev && prev.idle === s.idle && prev.appName === s.appName && prev.entity === c.entity && s.start - prev.end <= mergeGapMs) {
      prev.end = s.end
      prev.title = s.title || prev.title
    } else {
      out.push({ start: s.start, end: s.end, appName: s.appName, entity: c.entity, category: c.category, title: s.title, idle: s.idle })
    }
  }
  return out
}
