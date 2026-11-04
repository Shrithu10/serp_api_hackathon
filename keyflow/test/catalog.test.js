const test = require('node:test');
const assert = require('node:assert');
const C = require('../shared/catalog');

test('sanitizeAction drops unknown types and clamps values', () => {
  assert.strictEqual(C.sanitizeAction({ type: 'evil' }), null);
  const a = C.sanitizeAction({ type: 'wait', ms: 99999999, onError: 'weird' });
  assert.strictEqual(a.ms, 600000);
  assert.strictEqual(a.onError, 'stop');
  assert.strictEqual(C.sanitizeAction({ type: 'system', sys: 'nope' }).sys, 'settings');
  assert.strictEqual(C.sanitizeAction({ type: 'window', process: 'chrome.exe' }).process, 'chrome');
});

test('sanitizeShortcut normalises keys and defaults', () => {
  const s = C.sanitizeShortcut({ name: '  ', keys: 'alt+ctrl+c', actions: [{ type: 'app', path: 'x' }, { type: 'bogus' }] });
  assert.strictEqual(s.keys, 'Ctrl+Alt+C');
  assert.strictEqual(s.name, 'Untitled shortcut');
  assert.strictEqual(s.actions.length, 1);
  assert.ok(s.id);
});

test('shortcutProblems reports what is missing', () => {
  const s = C.sanitizeShortcut({ name: 'x', keys: '', actions: [] });
  const p = C.shortcutProblems(s);
  assert.ok(p.some((m) => /key combination/i.test(m)));
  assert.ok(p.some((m) => /at least one action/i.test(m)));
  const ok = C.sanitizeShortcut({ name: 'x', keys: 'Ctrl+Alt+K', actions: [{ type: 'url', url: 'https://example.com' }] });
  assert.deepStrictEqual(C.shortcutProblems(ok), []);
});

test('url validation rejects non-web schemes', () => {
  for (const u of ['javascript:alert(1)', 'file:///c:/x', 'https://', 'example.com'])
    assert.ok(C.actionProblems(C.sanitizeAction({ type: 'url', url: u })).length, u);
  assert.deepStrictEqual(C.actionProblems(C.sanitizeAction({ type: 'url', url: 'https://a.b/c?d=1&e=2' })), []);
});

test('summaries are readable', () => {
  assert.strictEqual(C.summarize(C.sanitizeAction({ type: 'folder', path: 'C:\\Projects\\app', openWith: 'code' })), 'Open folder app in code');
  assert.strictEqual(C.summarize(C.sanitizeAction({ type: 'wait', ms: 1500 })), 'Wait 1.5 s');
});
