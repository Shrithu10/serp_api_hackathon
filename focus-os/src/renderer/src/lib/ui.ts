import type { Category } from '@shared/types'

export const CAT_COLOR: Record<Category, string> = { productive: '#34d399', neutral: '#64748b', distracting: '#fb7185' }
export const CAT_TEXT: Record<Category, string> = { productive: 'Productive', neutral: 'Neutral', distracting: 'Distracting' }
export const IDLE_COLOR = '#27272f'
export const AXIS = '#71717a'
export const GRID = '#1f1f27'

export function hashColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 45% 42%)`
}
export const cx = (...a: (string | false | null | undefined)[]): string => a.filter(Boolean).join(' ')
