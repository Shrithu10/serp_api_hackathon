import test from 'node:test'
import assert from 'node:assert/strict'
import { makeClassifier, DEFAULT_RULES } from '../src/shared/classify'
import { computeDay } from '../src/shared/metrics'
import { generateInsights } from '../src/shared/insights'
import { generateDemoData } from '../src/shared/seed'
import { startOfDay, MIN } from '../src/shared/time'
import type { Rule, Segment } from '../src/shared/types'

const rules: Rule[] = DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1, builtin: true }))
const classify = makeClassifier(rules)
const settings = { deepWorkMinMinutes: 25, deepWorkGapSec: 60 }
let id = 0
const seg = (start: number, mins: number, appName: string, title = '', exe = 'x.exe', idle = false): Segment => ({ id: ++id, start, end: start + mins * MIN, appName, exe, title, idle, demo: false })

test('title rules beat app rules; user rules override builtin', () => {
  assert.equal(classify({ appName: 'Google Chrome', exe: 'chrome.exe', title: 'YouTube - Google Chrome', idle: false }).category, 'distracting')
  assert.equal(classify({ appName: 'Google Chrome', exe: 'chrome.exe', title: 'Pull requests · GitHub - Google Chrome', idle: false }).entity, 'GitHub')
  assert.equal(classify({ appName: 'VS Code', exe: 'Code.exe', title: 'x', idle: false }).category, 'productive')
  const custom = makeClassifier([...rules, { id: 999, matchType: 'app', pattern: 'VS Code', category: 'distracting', label: '', builtin: false }])
  assert.equal(custom({ appName: 'VS Code', exe: 'Code.exe', title: '', idle: false }).category, 'distracting')
})

test('computeDay: totals, switches, deep work', () => {
  const d0 = startOfDay(Date.now()) + 9 * 60 * MIN
  const segs = [
    seg(d0, 40, 'VS Code', 'a'),
    seg(d0 + 40 * MIN, 0.5, 'Discord'),         // 30s interruption, within gap tolerance
    seg(d0 + 40.5 * MIN, 30, 'VS Code', 'b'),
    seg(d0 + 70.5 * MIN, 10, 'Discord'),
    seg(d0 + 80.5 * MIN, 5, '', '', '', true),
    seg(d0 + 85.5 * MIN, 10, 'VS Code', 'c')
  ]
  const s = computeDay(segs, startOfDay(d0), classify, settings)
  assert.equal(s.productiveMs, 80 * MIN)
  assert.equal(s.distractingMs, 10.5 * MIN)
  assert.equal(s.idleMs, 5 * MIN)
  assert.equal(s.appSwitches, 4)
  assert.equal(s.deepWorkMs, 70 * MIN)               // 40 + 30, tolerated gap merged; last 10 min is not deep
  assert.equal(s.longestBlock?.productiveMs, 70 * MIN)
  assert.ok(s.focusScore !== null && s.focusScore > 0 && s.focusScore <= 100)
})

test('focus score is null with too little data', () => {
  const d0 = startOfDay(Date.now())
  assert.equal(computeDay([seg(d0, 2, 'VS Code')], d0, classify, settings).focusScore, null)
})

test('insights only come from data', () => {
  const now = startOfDay(Date.now()) + 20 * 60 * MIN
  const { segments, sessions } = generateDemoData(now, 14)
  const segs = segments.map((s) => ({ ...s, id: ++id }))
  const days = Array.from({ length: 14 }, (_, i) => computeDay(segs, startOfDay(now) - (13 - i) * 86_400_000, classify, settings))
  const ins = generateInsights(days, sessions.map((s, i) => ({ ...s, id: i })), now, 25)
  assert.ok(ins.length >= 3)
  assert.deepEqual(generateInsights([computeDay([], startOfDay(now), classify, settings)], [], now, 25), [])
})
