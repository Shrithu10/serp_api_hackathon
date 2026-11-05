import test from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../src/main/db'
import { Monitor } from '../src/main/monitor'
import { FocusManager } from '../src/main/focus'
import { makeClassifier } from '../src/shared/classify'
import { generateDemoData } from '../src/shared/seed'
import { segmentsCsv } from '../src/main/csv'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

test('store: rules seeded, editable, resettable; settings persist', () => {
  const s = new Store(':memory:')
  const n = s.listRules().length
  assert.ok(n > 30)
  const rules = s.upsertRule({ matchType: 'title', pattern: 'netflix', category: 'neutral', label: 'Netflix' })
  assert.equal(rules.length, n + 1)
  assert.equal(s.deleteRule(rules[rules.length - 1].id).length, n)
  assert.equal(s.saveSettings({ idleThresholdSec: 300 }).idleThresholdSec, 300)
  assert.equal(s.getSettings().idleThresholdSec, 300)
  assert.equal(s.getSettings().pomodoro.workMin, 25)
  assert.equal(s.resetRules().length, n)
})

test('store: demo data, export, delete all', () => {
  const s = new Store(':memory:')
  const d = generateDemoData(Date.now(), 5)
  s.insertSegments(d.segments); s.insertDemoSessions(d.sessions)
  assert.ok(s.hasDemo())
  const csv = segmentsCsv(s.allSegments(), makeClassifier(s.listRules()))
  assert.ok(csv.startsWith('start,end,duration_seconds'))
  assert.equal(csv.trim().split('\r\n').length, d.segments.length + 1)
  s.deleteDemo()
  assert.equal(s.privacyInfo().segmentCount, 0)
  s.insertSegments(d.segments); s.deleteAllActivity()
  assert.equal(s.privacyInfo().segmentCount, 0)
  assert.equal(s.privacyInfo().sessionCount, 0)
})

test('csv neutralises formula injection', () => {
  const out = segmentsCsv([{ id: 1, start: 0, end: 1000, appName: 'X', exe: 'x.exe', title: '=HYPERLINK("evil")', idle: false, demo: false }], makeClassifier([]))
  assert.ok(out.includes(`"'=HYPERLINK(""evil"")"`))
})

test('monitor records segments, honours pause, idle', async () => {
  const s = new Store(':memory:')
  s.saveSettings({ pollIntervalSec: 1 })
  let idle = 0
  const m = new Monitor(s, () => idle)
  m.start()
  await sleep(2600)
  assert.ok(s.allSegments().length >= 1, 'recorded activity')
  assert.equal(m.getStatus().state, 'active')
  m.pause(null)
  const n = s.allSegments().length, end = s.allSegments().at(-1)!.end
  await sleep(2200)
  assert.equal(s.allSegments().length, n, 'nothing recorded while paused')
  assert.equal(s.allSegments().at(-1)!.end, end)
  m.resume(); idle = 500
  await sleep(2600)
  assert.ok(s.allSegments().some((x) => x.idle), 'idle segment recorded')
  m.stop()
})

test('focus: records distraction after grace, allowed-apps, completes custom session', async () => {
  const s = new Store(':memory:')
  const cls = makeClassifier(s.listRules())
  const f = new FocusManager(s, () => s.getSettings(), () => cls)
  f.start({ mode: 'custom', durationMin: 1, allowedApps: [], label: 't' })
  f.onSample({ appName: 'VS Code', exe: 'Code.exe', title: '', idle: false, ts: Date.now() })
  await sleep(2100)
  f.onSample({ appName: 'Discord', exe: 'Discord.exe', title: '', idle: false, ts: Date.now() })
  await sleep(7100)
  const st = f.getState()
  assert.equal(st.distractionCount, 1)
  assert.ok(st.focusedSec >= 2 && st.distractedSec >= 5)
  assert.equal(st.onTask, false)
  f.end()
  const [rec] = s.listSessions()
  assert.equal(rec.distractionCount, 1)
  assert.equal(rec.completed, false)
  assert.equal(s.listDistractions(rec.id)[0].appName, 'Discord')
  assert.ok(rec.consistency > 0)
  f.dispose()
})
