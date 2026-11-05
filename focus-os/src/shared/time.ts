export const MIN = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

export const startOfDay = (ts: number): number => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
/** Local-calendar aware (handles DST). */
export const addDays = (ts: number, n: number): number => {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function fmtDuration(ms: number, opts: { short?: boolean } = {}): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return opts.short ? `${h}h ${m}m` : `${h} hr ${m} min`
  if (m > 0) return opts.short ? `${m}m` : `${m} min`
  return `${s}s`
}
export const fmtClock = (secs: number): string => {
  const s = Math.max(0, Math.round(secs))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const fmtHM = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtHour = (h: number): string => {
  const d = new Date(2000, 0, 1, h)
  return d.toLocaleTimeString([], { hour: 'numeric' })
}
export const fmtDay = (ts: number, long = false): string =>
  new Date(ts).toLocaleDateString([], long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' })
