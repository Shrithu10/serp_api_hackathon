const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plan, HotkeyManager } = require('../main/hotkeys');
const { ConfigStore, stripApprovals } = require('../main/config');

const sc = (id, keys, enabled = true) => ({ id, name: id, keys, enabled, actions: [] });

test('plan flags duplicates, invalid, disabled and reserved keys', () => {
  const m = plan([sc('a', 'Ctrl+Alt+A'), sc('b', 'Ctrl+Alt+A'), sc('c', 'Ctrl+C'), sc('d', 'Ctrl+Alt+D', false), sc('e', 'Ctrl+Alt+Space')],
    { reserved: [{ keys: 'Ctrl+Alt+Space', label: 'the command palette' }] });
  assert.strictEqual(m.get('a').state, 'pending');
  assert.strictEqual(m.get('b').state, 'conflict');
  assert.strictEqual(m.get('c').state, 'invalid');
  assert.strictEqual(m.get('d').state, 'disabled');
  assert.strictEqual(m.get('e').state, 'conflict');
  assert.strictEqual(plan([sc('a', 'Ctrl+Alt+A')], { paused: true }).get('a').state, 'paused');
});

test('manager registers, reports OS refusals and triggers', () => {
  const reg = new Map();
  const gs = { unregisterAll: () => reg.clear(), register: (k, fn) => { if (k === 'Ctrl+Alt+X') return false; reg.set(k, fn); return true; } };
  const hm = new HotkeyManager(gs);
  let fired = null;
  const { status, appStatus } = hm.apply([sc('a', 'Ctrl+Alt+A'), sc('x', 'Ctrl+Alt+X')],
    { palette: { keys: 'Ctrl+Alt+Space', run() {} }, pause: { keys: '', run() {} } }, { paused: false, onTrigger: (s) => { fired = s.id; } });
  assert.strictEqual(status.a.state, 'active');
  assert.strictEqual(status.x.state, 'failed');
  assert.match(status.x.message, /already using/);
  assert.strictEqual(appStatus.palette.state, 'active');
  reg.get('Ctrl+Alt+A')();
  assert.strictEqual(fired, 'a');
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kf-')); }

test('config persists across instances and creates defaults', () => {
  const dir = tmp();
  const s1 = new ConfigStore(dir);
  assert.ok(s1.config.profiles[0].shortcuts.length > 0);
  assert.ok(s1.config.profiles[0].shortcuts.every((s) => !s.enabled), 'starter shortcuts start disabled');
  s1.config.profiles[0].shortcuts.push({ id: 'z', name: 'Z', keys: 'Ctrl+Alt+Z', enabled: true, actions: [{ type: 'wait', ms: 5 }] });
  s1.save();
  const s2 = new ConfigStore(dir);
  assert.ok(s2.config.profiles[0].shortcuts.some((s) => s.id === 'z' && s.keys === 'Ctrl+Alt+Z'));
});

test('corrupt config is kept aside and recovered from backup', () => {
  const dir = tmp();
  const s1 = new ConfigStore(dir);
  s1.config.profiles[0].name = 'Precious';
  s1.save(); s1.createBackup('manual');
  fs.writeFileSync(path.join(dir, 'config.json'), '{ not json');
  const s2 = new ConfigStore(dir);
  assert.strictEqual(s2.config.profiles[0].name, 'Precious');
  assert.ok(s2.loadWarning);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')));
});

test('legacy flat configs migrate and bad data is sanitised', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ shortcuts: [{ name: 'Old', keys: 'ctrl+alt+o', actions: [{ type: 'file', path: 'x' }, { type: '__proto__' }] }] }));
  const s = new ConfigStore(dir);
  assert.strictEqual(s.config.profiles[0].shortcuts[0].keys, 'Ctrl+Alt+O');
  assert.strictEqual(s.config.profiles[0].shortcuts[0].actions.length, 1);
});

test('backups rotate and restore strips command approvals', () => {
  const dir = tmp();
  const s = new ConfigStore(dir);
  s.config.profiles[0].shortcuts = [{ id: 'c', name: 'C', keys: 'Ctrl+Alt+C', enabled: true, actions: [{ type: 'command', kind: 'cmd', command: 'echo', approvedHash: 'abc' }] }];
  s.save();
  for (let i = 0; i < 20; i++) s.createBackup('auto');
  assert.ok(s.listBackups().length <= 15);
  const name = s.listBackups()[0].name;
  s.restoreBackup(name);
  assert.strictEqual(s.config.profiles[0].shortcuts[0].actions[0].approvedHash, '');
  const x = { profiles: [{ shortcuts: [{ actions: [{ type: 'command', approvedHash: 'q' }] }] }] };
  assert.strictEqual(stripApprovals(x).profiles[0].shortcuts[0].actions[0].approvedHash, '');
});

test('stats are recorded and flushed', () => {
  const dir = tmp();
  const s = new ConfigStore(dir);
  s.recordRun('a', true); s.recordRun('a', false); s.flushStats();
  const again = new ConfigStore(dir);
  assert.deepStrictEqual([again.stats.a.runs, again.stats.a.failures], [2, 1]);
});
