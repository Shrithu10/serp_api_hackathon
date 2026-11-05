import type { Category, Classification, Rule, Segment } from './types'

/**
 * Transparent rule engine. Evaluation order (first match wins):
 *   1. Title rules (more specific), user rules before built-in ones
 *   2. App rules, user rules before built-in ones
 *   3. Fallback: neutral
 * Within a group, longer patterns win so "github" beats "git".
 */
export function sortRules(rules: Rule[]): Rule[] {
  const rank = (r: Rule): number => (r.matchType === 'title' ? 0 : 2) + (r.builtin ? 1 : 0)
  return [...rules].sort((a, b) => rank(a) - rank(b) || b.pattern.length - a.pattern.length)
}

export function makeClassifier(rules: Rule[]): (seg: Pick<Segment, 'appName' | 'exe' | 'title' | 'idle'>) => Classification {
  const sorted = sortRules(rules)
  const cache = new Map<string, Classification>()
  return (seg) => {
    if (seg.idle) return { category: 'neutral', rule: null, entity: 'Idle' }
    const key = `${seg.appName}\u0000${seg.exe}\u0000${seg.title}`
    const hit = cache.get(key)
    if (hit) return hit
    const title = seg.title.toLowerCase()
    const app = seg.appName.toLowerCase()
    const exe = seg.exe.toLowerCase()
    let found: Rule | null = null
    for (const r of sorted) {
      const p = r.pattern.toLowerCase().trim()
      if (!p) continue
      if (r.matchType === 'title' ? title.includes(p) : app.includes(p) || exe.includes(p)) {
        found = r
        break
      }
    }
    const res: Classification = {
      category: found?.category ?? 'neutral',
      rule: found,
      entity: found?.label?.trim() ? found.label.trim() : seg.appName
    }
    cache.set(key, res)
    return res
  }
}

export const CATEGORY_LABEL: Record<Category, string> = {
  productive: 'Productive',
  neutral: 'Neutral',
  distracting: 'Distracting'
}

type R = Omit<Rule, 'id' | 'builtin'>
const app = (pattern: string, category: Category): R => ({ matchType: 'app', pattern, category, label: '' })
const site = (pattern: string, category: Category, label: string): R => ({ matchType: 'title', pattern, category, label })

/** Starter rules. Seeded into the database on first run; all are editable or removable. */
export const DEFAULT_RULES: R[] = [
  // Development & creation
  app('VS Code', 'productive'),
  app('Cursor', 'productive'),
  app('IntelliJ', 'productive'),
  app('PyCharm', 'productive'),
  app('WebStorm', 'productive'),
  app('Rider', 'productive'),
  app('Visual Studio', 'productive'),
  app('Windows Terminal', 'productive'),
  app('PowerShell', 'productive'),
  app('Command Prompt', 'productive'),
  app('Postman', 'productive'),
  app('Figma', 'productive'),
  app('Obsidian', 'productive'),
  app('Notion', 'productive'),
  app('Notepad++', 'productive'),
  app('Microsoft Word', 'productive'),
  app('Microsoft Excel', 'productive'),
  app('Microsoft PowerPoint', 'productive'),
  app('OneNote', 'productive'),
  // Communication & utilities — neutral by default
  app('Slack', 'neutral'),
  app('Microsoft Teams', 'neutral'),
  app('Zoom', 'neutral'),
  app('Microsoft Outlook', 'neutral'),
  app('Notepad', 'neutral'),
  app('File Explorer', 'neutral'),
  // Social / entertainment apps
  app('Discord', 'distracting'),
  app('WhatsApp', 'distracting'),
  app('Telegram', 'distracting'),
  app('Spotify', 'distracting'),
  app('Steam', 'distracting'),
  app('VLC', 'distracting'),
  // Websites (matched on browser window titles)
  site('github', 'productive', 'GitHub'),
  site('stack overflow', 'productive', 'Stack Overflow'),
  site('developer.mozilla', 'productive', 'MDN'),
  site('docs.', 'productive', 'Documentation'),
  site('google docs', 'productive', 'Google Docs'),
  site('google sheets', 'productive', 'Google Sheets'),
  site('jira', 'productive', 'Jira'),
  site('linear', 'productive', 'Linear'),
  site('chatgpt', 'productive', 'ChatGPT'),
  site('claude', 'productive', 'Claude'),
  site('gmail', 'neutral', 'Gmail'),
  site('google search', 'neutral', 'Google Search'),
  site('youtube', 'distracting', 'YouTube'),
  site('instagram', 'distracting', 'Instagram'),
  site('facebook', 'distracting', 'Facebook'),
  site('twitter', 'distracting', 'X / Twitter'),
  site(' / x', 'distracting', 'X / Twitter'),
  site('reddit', 'distracting', 'Reddit'),
  site('tiktok', 'distracting', 'TikTok'),
  site('netflix', 'distracting', 'Netflix'),
  site('twitch', 'distracting', 'Twitch'),
  site('9gag', 'distracting', '9GAG'),
  site('linkedin', 'neutral', 'LinkedIn'),
  // Browsers on their own are neutral
  app('Chrome', 'neutral'),
  app('Edge', 'neutral'),
  app('Firefox', 'neutral'),
  app('Brave', 'neutral')
]
