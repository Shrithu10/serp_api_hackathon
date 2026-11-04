const test = require('node:test');
const assert = require('node:assert');
const { runWorkflow } = require('../main/workflow');

const step = (n, extra = {}) => ({ id: n, enabled: true, onError: 'stop', runIf: 'always', delayAfterMs: 0, ...extra });
const noSleep = { sleep: async () => {} };

test('runs steps in order', async () => {
  const seen = [];
  const r = await runWorkflow([step('a'), step('b'), step('c')], async (s) => { seen.push(s.id); }, noSleep);
  assert.deepStrictEqual(seen, ['a', 'b', 'c']);
  assert.strictEqual(r.ok, true);
});

test('stops on failure by default', async () => {
  const seen = [];
  const r = await runWorkflow([step('a'), step('b'), step('c')], async (s) => { seen.push(s.id); if (s.id === 'b') throw new Error('boom'); }, noSleep);
  assert.deepStrictEqual(seen, ['a', 'b']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.results[1].error, 'boom');
});

test('continues when onError=continue, and honours runIf', async () => {
  const seen = [];
  const r = await runWorkflow([step('a', { onError: 'continue' }), step('b', { runIf: 'previousSucceeded' }), step('c')],
    async (s) => { seen.push(s.id); if (s.id === 'a') throw new Error('x'); }, noSleep);
  assert.deepStrictEqual(seen, ['a', 'c']);
  assert.strictEqual(r.results[1].status, 'skipped');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failedCount, 1);
});

test('skips disabled steps and waits between steps', async () => {
  const waits = [];
  const seen = [];
  await runWorkflow([step('a', { delayAfterMs: 500 }), step('b', { enabled: false }), step('c', { delayAfterMs: 900 })],
    async (s) => { seen.push(s.id); }, { sleep: async (ms) => { waits.push(ms); } });
  assert.deepStrictEqual(seen, ['a', 'c']);
  assert.deepStrictEqual(waits, [500]); // no trailing delay after the last step
});

test('a cancelled step aborts even with onError=continue', async () => {
  const seen = [];
  const r = await runWorkflow([step('a', { onError: 'continue' }), step('b')],
    async (s) => { seen.push(s.id); const e = new Error('no'); e.cancelled = true; throw e; }, noSleep);
  assert.deepStrictEqual(seen, ['a']);
  assert.strictEqual(r.results[0].cancelled, true);
});
