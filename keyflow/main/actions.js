'use strict';
// Executes a single action. All user data reaches PowerShell through
// environment variables or -EncodedCommand — never by string interpolation —
// so paths/URLs containing quotes or '&' can't inject commands.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const C = require('../shared/catalog');

const IS_WIN = process.platform === 'win32';

class ActionError extends Error {
  constructor(msg, cancelled = false) { super(msg); this.cancelled = cancelled; }
}

// ---------- pure helpers (unit tested) ----------
function expandEnv(s, env = process.env) {
  let out = String(s || '').trim();
  if (out.startsWith('~')) out = (env.USERPROFILE || env.HOME || os.homedir()) + out.slice(1);
  out = out.replace(/%([^%]+)%/g, (m, k) => {
    const key = Object.keys(env).find((e) => e.toLowerCase() === k.toLowerCase());
    return key ? env[key] : m;
  });
  return out.replace(/^"(.*)"$/, '$1');
}

/** Split a Windows-style argument string, honouring double quotes. */
function tokenizeArgs(s) {
  const out = []; let cur = ''; let inQ = false; let has = false;
  for (const ch of String(s || '')) {
    if (ch === '"') { inQ = !inQ; has = true; }
    else if (/\s/.test(ch) && !inQ) { if (has || cur) out.push(cur); cur = ''; has = false; }
    else cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

const quote = (p) => `"${String(p).replace(/"/g, '')}"`;
const psEncode = (script) => Buffer.from(script, 'utf16le').toString('base64');

function commandHash(step) {
  return crypto.createHash('sha256').update(JSON.stringify([step.kind, step.command, step.args, step.cwd])).digest('hex');
}

/** Build spawn() parameters for a "command" action. */
function buildCommandSpawn(step, env = process.env) {
  const cwd = expandEnv(step.cwd, env) || undefined;
  const hidden = !!step.hidden;
  const keepOpen = !hidden && !step.waitForExit;
  const file = expandEnv(step.command, env);
  const options = { cwd, windowsHide: hidden, detached: !step.waitForExit, stdio: 'ignore' };
  const psBase = ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...(keepOpen ? ['-NoExit'] : [])];
  switch (step.kind) {
    case 'powershell':
      return { file: 'powershell.exe', args: [...psBase, '-EncodedCommand', psEncode(step.command)], options };
    case 'psfile':
      return { file: 'powershell.exe', args: [...psBase, '-File', file, ...tokenizeArgs(step.args)],
        options: { ...options, cwd: cwd || path.dirname(file) } };
    case 'cmd':
      return { file: 'cmd.exe', args: ['/d', '/s', keepOpen ? '/k' : '/c', `"${step.command}"`], options: { ...options, windowsVerbatimArguments: true } };
    case 'batch':
      return { file: 'cmd.exe', args: ['/d', '/s', keepOpen ? '/k' : '/c', `"call ${quote(file)} ${step.args || ''}"`],
        options: { ...options, windowsVerbatimArguments: true, cwd: cwd || path.dirname(file) } };
    case 'python':
      return { file: 'python', fallbackFile: 'py', args: [file, ...tokenizeArgs(step.args)], options: { ...options, cwd: cwd || path.dirname(file) } };
    default:
      throw new ActionError(`Unknown command type "${step.kind}".`);
  }
}

function resolveExe(name, env = process.env) {
  const n = expandEnv(name, env);
  if (!/\.exe$/i.test(n)) return null;
  if (path.isAbsolute(n)) return fs.existsSync(n) ? n : null;
  if (/[\\/]/.test(n)) return null;
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, n);
    try { if (fs.existsSync(full)) return full; } catch { /* ignore */ }
  }
  return null;
}

// ---------- process plumbing ----------
function spawnAsync(file, args, options, { wait = false, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let stderr = '';
    try { child = cp.spawn(file, args, { ...options, stdio: wait ? ['ignore', 'ignore', 'pipe'] : 'ignore' }); }
    catch (e) { return reject(e); }
    if (wait && child.stderr) child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    let timer;
    if (timeoutMs) timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } reject(new ActionError(`Timed out after ${Math.round(timeoutMs / 1000)} s.`)); }, timeoutMs);
    child.once('error', (e) => { clearTimeout(timer); reject(e); });
    if (!wait) child.once('spawn', () => { clearTimeout(timer); child.unref(); resolve(); });
    else child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) resolve();
      else reject(new ActionError(lastLine(stderr) || `Exited with code ${code}.`));
    });
  });
}

const lastLine = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-1)[0] || '';

function runPowerShell(script, env, { wait = true, timeoutMs = 30000 } = {}) {
  if (!IS_WIN) return Promise.reject(new ActionError('This action is only available on Windows.'));
  const wrapped = `$ErrorActionPreference='Stop'\ntry {\n${script}\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return spawnAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', psEncode(wrapped)],
    { env: { ...process.env, ...env }, windowsHide: true }, { wait, timeoutMs });
}

const WIN32 = `Add-Type -Namespace KF -Name W -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
'@`;

const WINDOW_SCRIPT = `${WIN32}
$procs = @(Get-Process -Name $env:KF_PROC -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($procs.Count -eq 0) {
  if ($env:KF_MODE -eq 'focus' -and $env:KF_LAUNCH) { Start-Process -FilePath $env:KF_LAUNCH; exit 0 }
  throw "'$($env:KF_PROC)' is not running."
}
$h = $procs[0].MainWindowHandle
switch ($env:KF_MODE) {
  'focus'    { if ([KF.W]::IsIconic($h)) { [KF.W]::ShowWindow($h, 9) | Out-Null }
               [KF.W]::keybd_event(0x12,0,0,0); [KF.W]::keybd_event(0x12,0,2,0)
               [KF.W]::SetForegroundWindow($h) | Out-Null }
  'minimize' { [KF.W]::ShowWindow($h, 6) | Out-Null }
  'maximize' { [KF.W]::ShowWindow($h, 3) | Out-Null }
  'restore'  { [KF.W]::ShowWindow($h, 9) | Out-Null }
  'close'    { foreach ($p in $procs) { $p.CloseMainWindow() | Out-Null } }
}`;

const KEYS_SCRIPT = `${WIN32}
$vks = $env:KF_VKS -split ',' | ForEach-Object { [byte][int]$_ }
foreach ($k in $vks) { [KF.W]::keybd_event($k,0,0,0) }
[array]::Reverse($vks)
foreach ($k in $vks) { [KF.W]::keybd_event($k,0,2,0) }`;

const START_SCRIPT = `$a = @{ FilePath = $env:KF_FILE }
if ($env:KF_ARGS) { $a.ArgumentList = $env:KF_ARGS }
if ($env:KF_CWD)  { $a.WorkingDirectory = $env:KF_CWD }
if ($env:KF_WAIT -eq '1') { $a.Wait = $true }
Start-Process @a`;

// ---------- runner ----------
/**
 * deps: { shell, confirm(message, detail)->Promise<boolean>, approveCommand(step, hash) }
 */
function createActionRunner(deps) {
  const { shell } = deps;

  async function launch(file, argString, { cwd, wait = false } = {}) {
    const f = expandEnv(file);
    if (!f) throw new ActionError('No program specified.');
    const workdir = cwd ? expandEnv(cwd) : undefined;
    if (workdir && !fs.existsSync(workdir)) throw new ActionError(`Working folder not found: ${workdir}`);
    const exe = resolveExe(f);
    try {
      if (exe) return await spawnAsync(exe, tokenizeArgs(argString), { cwd: workdir, detached: !wait, windowsHide: false }, { wait });
      if (!IS_WIN) throw new ActionError('Programs can only be launched on Windows.');
      if (path.isAbsolute(f) && !fs.existsSync(f)) throw new ActionError(`Not found: ${f}`);
      await runPowerShell(START_SCRIPT, { KF_FILE: f, KF_ARGS: argString || '', KF_CWD: workdir || '', KF_WAIT: wait ? '1' : '0' },
        { wait: true, timeoutMs: wait ? 0 : 20000 });
    } catch (e) {
      if (e instanceof ActionError) throw e;
      if (e.code === 'ENOENT') throw new ActionError(`Couldn't find "${f}". Check the path.`);
      throw new ActionError(`Couldn't open "${f}": ${e.message}`);
    }
  }

  async function openPath(p, kind) {
    const full = expandEnv(p);
    if (!full) throw new ActionError(`No ${kind} specified.`);
    if (!fs.existsSync(full)) throw new ActionError(`${kind[0].toUpperCase() + kind.slice(1)} not found: ${full}`);
    const err = await shell.openPath(full);
    if (err) throw new ActionError(err);
  }

  async function ensureApproved(step) {
    const hash = commandHash(step);
    if (step.approvedHash === hash) return;
    const shown = step.kind === 'powershell' || step.kind === 'cmd' ? step.command : `${step.command} ${step.args || ''}`;
    const ok = await deps.confirm('Run this command?',
      `This command has not been approved on this computer yet (for example it came from an imported file).\n\n${shown.slice(0, 600)}\n\nOnly continue if you trust it.`);
    if (!ok) throw new ActionError('Command was not approved.', true);
    deps.approveCommand(step, hash);
  }

  const handlers = {
    async app(s) { await launch(s.path, s.args, { cwd: s.cwd }); },

    async window(s) {
      await runPowerShell(WINDOW_SCRIPT, { KF_PROC: s.process, KF_MODE: s.mode, KF_LAUNCH: expandEnv(s.launchPath) });
    },

    async folder(s) {
      const dir = expandEnv(s.path);
      if (!dir) throw new ActionError('No folder specified.');
      if (!fs.existsSync(dir)) throw new ActionError(`Folder not found: ${dir}`);
      if (s.openWith) await launch(s.openWith, quote(dir));
      else await openPath(dir, 'folder');
    },

    async file(s) { await openPath(s.path, 'file'); },

    async url(s) {
      const u = String(s.url || '').trim();
      if (!/^(https?:\/\/|mailto:)/i.test(u)) throw new ActionError('Only http, https and mailto addresses can be opened.');
      if (s.browser) await launch(s.browser, quote(u));
      else await shell.openExternal(u);
    },

    async system(s) {
      const def = Object.prototype.hasOwnProperty.call(C.SYSTEM, s.sys) ? C.SYSTEM[s.sys] : null;
      if (!def) throw new ActionError('Unknown Windows action.');
      if (def.confirm && !(await deps.confirm(def.label + '?', def.confirm))) throw new ActionError('Cancelled.', true);
      if (def.kind === 'uri') return shell.openExternal(def.uri);
      if (!IS_WIN) throw new ActionError('This action is only available on Windows.');
      if (def.kind === 'exe') return spawnAsync(def.exe, def.args, { windowsHide: true }, { wait: false });
      if (def.kind === 'keys') return runPowerShell(KEYS_SCRIPT, { KF_VKS: def.vks.join(',') });
      if (def.kind === 'ps') return runPowerShell(def.script, {});
    },

    async terminal(s) {
      const dir = expandEnv(s.dir) || os.homedir();
      if (!fs.existsSync(dir)) throw new ActionError(`Folder not found: ${dir}`);
      const useCmd = s.shell === 'cmd';
      const inner = useCmd
        ? ['cmd.exe', '/k', ...(s.command ? [s.command] : [])]
        : ['powershell.exe', '-NoExit', ...(s.command ? ['-EncodedCommand', psEncode(s.command)] : [])];
      if (s.shell === 'auto' || !s.shell) {
        try { return await spawnAsync('wt.exe', ['-d', dir, ...inner], { detached: true }); }
        catch (e) { if (e.code !== 'ENOENT') throw e; /* Windows Terminal not installed: fall through */ }
      }
      await spawnAsync(inner[0], inner.slice(1), { cwd: dir, detached: true, windowsHide: false });
    },

    async command(s) {
      await ensureApproved(s);
      const wait = !!s.waitForExit;
      let plan = buildCommandSpawn(s);
      const needsFile = ['psfile', 'batch', 'python'].includes(s.kind);
      if (needsFile && !fs.existsSync(expandEnv(s.command))) throw new ActionError(`Script not found: ${expandEnv(s.command)}`);
      if (plan.options.cwd && !fs.existsSync(plan.options.cwd)) throw new ActionError(`Working folder not found: ${plan.options.cwd}`);
      const opts = { wait, timeoutMs: wait ? 10 * 60 * 1000 : 0 };
      try { await spawnAsync(plan.file, plan.args, plan.options, opts); }
      catch (e) {
        if (e.code === 'ENOENT' && plan.fallbackFile) await spawnAsync(plan.fallbackFile, ['-3', ...plan.args], plan.options, opts);
        else if (e.code === 'ENOENT') throw new ActionError(`Couldn't start ${plan.file}. Is it installed?`);
        else throw e;
      }
    },

    async wait(s) { await new Promise((r) => setTimeout(r, s.ms)); },
  };

  return async function exec(step) {
    const h = handlers[step.type];
    if (!h) throw new ActionError(`Unknown action type "${step.type}".`);
    try { await h(step); }
    catch (e) {
      if (e instanceof ActionError) throw e;
      throw new ActionError(e && e.message ? e.message : String(e));
    }
  };
}

module.exports = { createActionRunner, expandEnv, tokenizeArgs, buildCommandSpawn, commandHash, psEncode, resolveExe, ActionError };
