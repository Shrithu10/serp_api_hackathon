const test = require('node:test');
const assert = require('node:assert');
const A = require('../main/actions');

test('tokenizeArgs honours quotes', () => {
  assert.deepStrictEqual(A.tokenizeArgs('--flag "C:\\My Folder\\x" plain ""'), ['--flag', 'C:\\My Folder\\x', 'plain', '']);
  assert.deepStrictEqual(A.tokenizeArgs(''), []);
});

test('expandEnv expands %VARS% case-insensitively and ~', () => {
  const env = { USERPROFILE: 'C:\\Users\\me' };
  assert.strictEqual(A.expandEnv('%userprofile%\\Downloads', env), 'C:\\Users\\me\\Downloads');
  assert.strictEqual(A.expandEnv('~/x', env), 'C:\\Users\\me/x');
  assert.strictEqual(A.expandEnv('%UNKNOWN%\\x', env), '%UNKNOWN%\\x');
  assert.strictEqual(A.expandEnv('"C:\\a b"', env), 'C:\\a b');
});

test('powershell commands are passed encoded, never interpolated', () => {
  const p = A.buildCommandSpawn({ kind: 'powershell', command: 'Write-Host "hi"; calc', hidden: true });
  assert.strictEqual(p.file, 'powershell.exe');
  const enc = p.args[p.args.indexOf('-EncodedCommand') + 1];
  assert.strictEqual(Buffer.from(enc, 'base64').toString('utf16le'), 'Write-Host "hi"; calc');
  assert.ok(!p.args.includes('-NoExit'));
  assert.strictEqual(p.options.windowsHide, true);
});

test('visible, non-waiting commands keep the window open', () => {
  assert.ok(A.buildCommandSpawn({ kind: 'powershell', command: 'x', hidden: false, waitForExit: false }).args.includes('-NoExit'));
  assert.ok(!A.buildCommandSpawn({ kind: 'powershell', command: 'x', hidden: false, waitForExit: true }).args.includes('-NoExit'));
});

test('script kinds default cwd to the script folder', () => {
  const p = A.buildCommandSpawn({ kind: 'python', command: '/opt/s/run.py', args: 'a "b c"' }, {});
  assert.deepStrictEqual(p.args, ['/opt/s/run.py', 'a', 'b c']);
  assert.strictEqual(p.options.cwd, '/opt/s');
  const b = A.buildCommandSpawn({ kind: 'batch', command: 'C:\\x\\go.bat', args: '1' }, {});
  assert.strictEqual(b.file, 'cmd.exe');
  assert.ok(b.options.windowsVerbatimArguments);
});

test('command hash changes with content', () => {
  const a = { kind: 'cmd', command: 'dir', args: '', cwd: '' };
  assert.notStrictEqual(A.commandHash(a), A.commandHash({ ...a, command: 'del *' }));
  assert.strictEqual(A.commandHash(a), A.commandHash({ ...a }));
});

test('unapproved commands need confirmation and honour refusal', async () => {
  let asked = 0;
  const exec = A.createActionRunner({ shell: {}, confirm: async () => { asked++; return false; }, approveCommand() { throw new Error('should not approve'); } });
  const step = { type: 'command', kind: 'cmd', command: 'echo hi', args: '', cwd: '', approvedHash: '' };
  await assert.rejects(() => exec(step), (e) => e.cancelled === true);
  assert.strictEqual(asked, 1);
});

test('missing folder / file produce friendly errors', async () => {
  const exec = A.createActionRunner({ shell: { openPath: async () => '' }, confirm: async () => true });
  await assert.rejects(() => exec({ type: 'folder', path: '/definitely/not/here' }), /Folder not found/);
  await assert.rejects(() => exec({ type: 'file', path: '/definitely/not/here.txt' }), /File not found/);
  await assert.rejects(() => exec({ type: 'url', url: 'javascript:alert(1)' }), /Only http/);
});

test('url actions go to the default browser', async () => {
  let opened;
  const exec = A.createActionRunner({ shell: { openExternal: async (u) => { opened = u; } }, confirm: async () => true });
  await exec({ type: 'url', url: 'https://example.com/?a=1&b=2', browser: '' });
  assert.strictEqual(opened, 'https://example.com/?a=1&b=2');
});

test('destructive system actions ask first', async () => {
  let asked = '';
  const exec = A.createActionRunner({ shell: {}, confirm: async (m) => { asked = m; return false; } });
  await assert.rejects(() => exec({ type: 'system', sys: 'shutdown' }), (e) => e.cancelled);
  assert.match(asked, /Shut down/);
});
