import { useMemo } from 'react'
import { computeDay, computeRange, type DayStats } from '@shared/metrics'
import { startOfDay } from '@shared/time'
import { useStore } from './store'

/** Stats for the last `n` days ending today (oldest first). */
export function useDays(n: number): DayStats[] {
  const { segments, classify, settings, now } = useStore()
  return useMemo(() => computeRange(segments, now, n, classify, settings), [segments, classify, settings.deepWorkMinMinutes, settings.deepWorkGapSec, n, startOfDay(now), Math.floor(now / 10_000)])
}
export function useDay(dayStart: number): DayStats {
  const { segments, classify, settings, now } = useStore()
  return useMemo(() => computeDay(segments, dayStart, classify, settings), [segments, classify, settings.deepWorkMinMinutes, settings.deepWorkGapSec, dayStart, Math.floor(now / 10_000)])
}

import { generateInsights, type Insight } from '@shared/insights'
export function useInsights(): Insight[] {
  const days = useDays(28)
  const { sessions, settings, now } = useStore()
  return useMemo(() => generateInsights(days, sessions, now, settings.deepWorkMinMinutes), [days, sessions, settings.deepWorkMinMinutes])
}
