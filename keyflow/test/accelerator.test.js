const test = require('node:test');
const assert = require('node:assert');
const A = require('../shared/accelerator');

test('codeToKey maps common codes', () => {
  assert.strictEqual(A.codeToKey('KeyC'), 'C');
  assert.strictEqual(A.codeToKey('Digit1'), '1');
  assert.strictEqual(A.codeToKey('F5'), 'F5');
  assert.strictEqual(A.codeToKey('Enter'), 'Return');
  assert.strictEqual(A.codeToKey('ArrowUp'), 'Up');
  assert.strictEqual(A.codeToKey('Numpad3'), 'num3');
  assert.strictEqual(A.codeToKey('Nonsense'), null);
});

test('eventToParts + build give canonical order', () => {
  const p = A.eventToParts({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: true, code: 'KeyV' });
  assert.strictEqual(A.build(p.mods, p.key), 'Ctrl+Alt+Super+V');
  assert.strictEqual(A.eventToParts({ ctrlKey: true, code: 'ControlLeft' }).key, null);
});

test('parse normalises aliases and case', () => {
  assert.strictEqual(A.parse('alt+control+c').accelerator, 'Ctrl+Alt+C');
  assert.strictEqual(A.parse('win+space').accelerator, 'Super+Space');
  assert.strictEqual(A.parse('Ctrl+Alt').ok, false);
  assert.strictEqual(A.parse('Ctrl+A+B').ok, false);
  assert.strictEqual(A.parse('').ok, false);
});

test('validate blocks critical combos and bare keys', () => {
  assert.strictEqual(A.validate('Ctrl+Alt+C').ok, true);
  assert.strictEqual(A.validate('Ctrl+C').ok, false);
  assert.strictEqual(A.validate('Alt+F4').ok, false);
  assert.strictEqual(A.validate('Ctrl+Alt+Delete').ok, false);
  assert.strictEqual(A.validate('A').ok, false);
  assert.strictEqual(A.validate('F5').ok, false);
  assert.strictEqual(A.validate('F13').ok, true);
  assert.ok(A.validate('Shift+A').warnings.length);
});

test('pretty prints for humans', () => {
  assert.strictEqual(A.pretty('Ctrl+Alt+Super+Return'), 'Ctrl + Alt + Win + Enter');
});
