import Database from 'better-sqlite3'
import { DEFAULT_RULES } from '../shared/classify'
import { DEFAULT_SETTINGS } from '../shared/types'
import type { Category, DistractionEvent, FocusSessionRecord, MatchType, PrivacyInfo, Rule, Segment, Settings } from '../shared/types'
import type { NewSegment, NewSession } from '../shared/seed'

/** All persistence lives in one local SQLite file. Nothing here ever touches the network. */
export class Store {
  readonly db: Database.Database

  constructor(readonly path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.migrate()
    this.seedRules()
  }

  private migrate(): void {
    const v = this.db.pragma('user_version', { simple: true }) as number
    if (v < 1) {
      this.db.exec(`
        CREATE TABLE segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          app_name TEXT NOT NULL,
          exe TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          idle INTEGER NOT NULL DEFAULT 0,
          demo INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_segments_start ON segments(start_ts);
        CREATE INDEX idx_segments_end ON segments(end_ts);
        CREATE TABLE rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_type TEXT NOT NULL CHECK (match_type IN ('app','title')),
          pattern TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('productive','neutral','distracting')),
          label TEXT NOT NULL DEFAULT '',
          builtin INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE focus_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          mode TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          planned_sec INTEGER NOT NULL DEFAULT 0,
          focused_sec INTEGER NOT NULL DEFAULT 0,
          distracted_sec INTEGER NOT NULL DEFAULT 0,
          distraction_count INTEGER NOT NULL DEFAULT 0,
          longest_streak_sec INTEGER NOT NULL DEFAULT 0,
          cycles INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          consistency INTEGER NOT NULL DEFAULT 0,
          allowed_apps TEXT NOT NULL DEFAULT '[]',
          open INTEGER NOT NULL DEFAULT 0,
          demo INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_sessions_start ON focus_sessions(start_ts);
        CREATE TABLE distractions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
          ts INTEGER NOT NULL,
          app_name TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          duration_sec INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_distractions_session ON distractions(session_id);
        CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `)
      this.db.pragma('foreign_keys = ON')
      this.db.pragma('user_version = 1')
    }
    this.db.pragma('foreign_keys = ON')
  }

  // ---- key/value + settings ----
  private kvGet(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
    return r ? r.value : null
  }
  private kvSet(key: string, value: string): void {
    this.db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }
  getSettings(): Settings {
    const raw = this.kvGet('settings')
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    try {
      const p = JSON.parse(raw) as Partial<Settings>
      return { ...DEFAULT_SETTINGS, ...p, schedule: { ...DEFAULT_SETTINGS.schedule, ...p.schedule }, pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...p.pomodoro } }
    } catch {
      return structuredClone(DEFAULT_SETTINGS)
    }
  }
  saveSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...patch }
    this.kvSet('settings', JSON.stringify(next))
    return next
  }
  getMeta(key: string): string | null { return this.kvGet('meta:' + key) }
  setMeta(key: string, value: string): void { this.kvSet('meta:' + key, value) }

  // ---- rules ----
  private seedRules(): void {
    if (this.kvGet('rules_seeded')) return
    const ins = this.db.prepare('INSERT INTO rules(match_type,pattern,category,label,builtin) VALUES(?,?,?,?,1)')
    this.db.transaction(() => { for (const r of DEFAULT_RULES) ins.run(r.matchType, r.pattern, r.category, r.label) })()
    this.kvSet('rules_seeded', '1')
  }
  listRules(): Rule[] {
    return (this.db.prepare('SELECT * FROM rules ORDER BY id').all() as Record<string, unknown>[]).map((r) => ({
      id: r.id as number, matchType: r.match_type as MatchType, pattern: r.pattern as string,
      category: r.category as Category, label: r.label as string, builtin: !!r.builtin
    }))
  }
  upsertRule(r: Omit<Rule, 'id' | 'builtin'> & { id?: number }): Rule[] {
    const pattern = r.pattern.trim()
    if (!pattern) throw new Error('Pattern cannot be empty')
    if (r.id) this.db.prepare('UPDATE rules SET match_type=?, pattern=?, category=?, label=? WHERE id=?').run(r.matchType, pattern, r.category, r.label.trim(), r.id)
    else this.db.prepare('INSERT INTO rules(match_type,pattern,category,label,builtin) VALUES(?,?,?,?,0)').run(r.matchType, pattern, r.category, r.label.trim())
    return this.listRules()
  }
  deleteRule(id: number): Rule[] {
    this.db.prepare('DELETE FROM rules WHERE id = ?').run(id)
    return this.listRules()
  }
  resetRules(): Rule[] {
    this.db.prepare('DELETE FROM rules').run()
    this.kvSet('rules_seeded', '')
    this.seedRules()
    return this.listRules()
  }

  // ---- segments ----
  insertSegment(s: NewSegment): number {
    return Number(this.db.prepare('INSERT INTO segments(start_ts,end_ts,app_name,exe,title,idle,demo) VALUES(?,?,?,?,?,?,?)')
      .run(s.start, s.end, s.appName, s.exe, s.title, s.idle ? 1 : 0, s.demo ? 1 : 0).lastInsertRowid)
  }
  updateSegmentEnd(id: number, end: number): void {
    this.db.prepare('UPDATE segments SET end_ts = ? WHERE id = ?').run(end, id)
  }
  insertSegments(list: NewSegment[]): void {
    const ins = this.db.prepare('INSERT INTO segments(start_ts,end_ts,app_name,exe,title,idle,demo) VALUES(?,?,?,?,?,?,?)')
    this.db.transaction(() => { for (const s of list) ins.run(s.start, s.end, s.appName, s.exe, s.title, s.idle ? 1 : 0, s.demo ? 1 : 0) })()
  }
  private mapSeg = (r: Record<string, unknown>): Segment => ({
    id: r.id as number, start: r.start_ts as number, end: r.end_ts as number, appName: r.app_name as string,
    exe: r.exe as string, title: r.title as string, idle: !!r.idle, demo: !!r.demo
  })
  getSegments(from: number, to: number): Segment[] {
    return (this.db.prepare('SELECT * FROM segments WHERE end_ts > ? AND start_ts < ? ORDER BY start_ts').all(from, to) as Record<string, unknown>[]).map(this.mapSeg)
  }
  allSegments(): Segment[] {
    return (this.db.prepare('SELECT * FROM segments ORDER BY start_ts').all() as Record<string, unknown>[]).map(this.mapSeg)
  }
  pruneBefore(ts: number): void {
    this.db.prepare('DELETE FROM segments WHERE end_ts < ? AND demo = 0').run(ts)
    this.db.prepare('DELETE FROM focus_sessions WHERE end_ts < ? AND demo = 0 AND open = 0').run(ts)
  }

  // ---- focus sessions ----
  private mapSession = (r: Record<string, unknown>): FocusSessionRecord => ({
    id: r.id as number, start: r.start_ts as number, end: r.end_ts as number, mode: r.mode as FocusSessionRecord['mode'],
    label: r.label as string, plannedSec: r.planned_sec as number, focusedSec: r.focused_sec as number,
    distractedSec: r.distracted_sec as number, distractionCount: r.distraction_count as number,
    longestStreakSec: r.longest_streak_sec as number, cycles: r.cycles as number, completed: !!r.completed,
    consistency: r.consistency as number, allowedApps: JSON.parse(r.allowed_apps as string) as string[], demo: !!r.demo
  })
  startSession(start: number, mode: string, label: string, plannedSec: number, allowed: string[]): number {
    return Number(this.db.prepare('INSERT INTO focus_sessions(start_ts,end_ts,mode,label,planned_sec,allowed_apps,open) VALUES(?,?,?,?,?,?,1)')
      .run(start, start, mode, label, plannedSec, JSON.stringify(allowed)).lastInsertRowid)
  }
  updateSession(id: number, p: Partial<Omit<FocusSessionRecord, 'id' | 'start' | 'mode' | 'label' | 'allowedApps' | 'demo'>> & { open?: boolean }): void {
    const map: Record<string, string> = {
      end: 'end_ts', plannedSec: 'planned_sec', focusedSec: 'focused_sec', distractedSec: 'distracted_sec', distractionCount: 'distraction_count',
      longestStreakSec: 'longest_streak_sec', cycles: 'cycles', completed: 'completed', consistency: 'consistency', open: 'open'
    }
    const cols: string[] = [], vals: (number)[] = []
    for (const [k, v] of Object.entries(p)) if (map[k] && v !== undefined) { cols.push(`${map[k]} = ?`); vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as number)) }
    if (cols.length) this.db.prepare(`UPDATE focus_sessions SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id)
  }
  addDistraction(sessionId: number, ts: number, appName: string, title: string): number {
    return Number(this.db.prepare('INSERT INTO distractions(session_id,ts,app_name,title,duration_sec) VALUES(?,?,?,?,0)').run(sessionId, ts, appName, title).lastInsertRowid)
  }
  updateDistraction(id: number, durationSec: number): void {
    this.db.prepare('UPDATE distractions SET duration_sec = ? WHERE id = ?').run(Math.round(durationSec), id)
  }
  listSessions(limit = 200): FocusSessionRecord[] {
    return (this.db.prepare('SELECT * FROM focus_sessions WHERE open = 0 ORDER BY start_ts DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map(this.mapSession)
  }
  listDistractions(sessionId: number): DistractionEvent[] {
    return (this.db.prepare('SELECT * FROM distractions WHERE session_id = ? ORDER BY ts').all(sessionId) as Record<string, unknown>[]).map((r) => ({
      id: r.id as number, sessionId: r.session_id as number, ts: r.ts as number, appName: r.app_name as string, title: r.title as string, durationSec: r.duration_sec as number
    }))
  }
  /** Sessions left open by a crash or quit are closed as incomplete. */
  closeDanglingSessions(): void {
    this.db.prepare('UPDATE focus_sessions SET open = 0, completed = 0 WHERE open = 1').run()
  }
  insertDemoSessions(list: NewSession[]): void {
    const ins = this.db.prepare('INSERT INTO focus_sessions(start_ts,end_ts,mode,label,planned_sec,focused_sec,distracted_sec,distraction_count,longest_streak_sec,cycles,completed,consistency,allowed_apps,open,demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)')
    const dins = this.db.prepare('INSERT INTO distractions(session_id,ts,app_name,title,duration_sec) VALUES(?,?,?,?,?)')
    this.db.transaction(() => {
      for (const s of list) {
        const id = Number(ins.run(s.start, s.end, s.mode, s.label, s.plannedSec, s.focusedSec, s.distractedSec, s.distractionCount, s.longestStreakSec, s.cycles, s.completed ? 1 : 0, s.consistency, JSON.stringify(s.allowedApps)).lastInsertRowid)
        for (const d of s.distractions) dins.run(id, d.ts, d.appName, d.title, d.durationSec)
      }
    })()
  }

  // ---- data lifecycle ----
  hasDemo(): boolean {
    return !!this.db.prepare('SELECT 1 FROM segments WHERE demo = 1 LIMIT 1').get() || !!this.db.prepare('SELECT 1 FROM focus_sessions WHERE demo = 1 LIMIT 1').get()
  }
  deleteDemo(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM segments WHERE demo = 1').run()
      this.db.prepare('DELETE FROM focus_sessions WHERE demo = 1').run()
    })()
  }
  /** Permanently erases all activity, sessions and distractions. Rules and settings are kept. */
  deleteAllActivity(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM distractions').run()
      this.db.prepare('DELETE FROM focus_sessions').run()
      this.db.prepare('DELETE FROM segments').run()
    })()
    this.db.exec('VACUUM')
  }
  privacyInfo(): PrivacyInfo {
    const n = (sql: string): number => (this.db.prepare(sql).get() as { n: number }).n
    const first = (this.db.prepare('SELECT MIN(start_ts) AS t FROM segments').get() as { t: number | null }).t
    return { dbPath: this.path, segmentCount: n('SELECT COUNT(*) n FROM segments'), sessionCount: n('SELECT COUNT(*) n FROM focus_sessions WHERE open = 0'), hasDemo: this.hasDemo(), firstTs: first }
  }
  close(): void { this.db.close() }
}
