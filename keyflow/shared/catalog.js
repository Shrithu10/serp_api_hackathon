'use strict';
// Catalog of action types + built-in Windows system actions, and the
// validation / sanitising rules for shortcuts. Shared by main and renderer.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./accelerator'));
  else root.KFCatalog = factory(root.KFAccel);
})(typeof self !== 'undefined' ? self : this, function (Accel) {
  const TYPES = {
    app:      { label: 'Open application',   icon: '🚀', group: 'Applications', hint: 'Launch a program, optionally with arguments.' },
    window:   { label: 'Control a running app', icon: '🪟', group: 'Applications', hint: 'Switch to, minimize, maximize or close an app that is already running.' },
    folder:   { label: 'Open folder',        icon: '📁', group: 'Files & folders', hint: 'Open a folder in Explorer or in an editor such as VS Code.' },
    file:     { label: 'Open file',          icon: '📄', group: 'Files & folders', hint: 'Open a file with its default program.' },
    url:      { label: 'Open website',       icon: '🌐', group: 'Websites', hint: 'Open a web address in your default or a chosen browser.' },
    system:   { label: 'Windows action',     icon: '⚙️', group: 'Windows', hint: 'Settings pages, lock, volume, media keys, power…' },
    terminal: { label: 'Open terminal',      icon: '⌨️', group: 'Developer', hint: 'Open a terminal in a folder, optionally running a command.' },
    command:  { label: 'Run command / script', icon: '📜', group: 'Developer', hint: 'PowerShell, batch, Python or any command.' },
    wait:     { label: 'Wait',               icon: '⏱️', group: 'Workflow', hint: 'Pause for a moment before the next step.' },
  };

  const SETTINGS = [
    ['settings', 'Windows Settings (home)', 'ms-settings:'],
    ['wifi', 'Wi-Fi', 'ms-settings:network-wifi'],
    ['network', 'Network & internet', 'ms-settings:network'],
    ['bluetooth', 'Bluetooth & devices', 'ms-settings:bluetooth'],
    ['display', 'Display', 'ms-settings:display'],
    ['sound', 'Sound', 'ms-settings:sound'],
    ['notifications', 'Notifications', 'ms-settings:notifications'],
    ['battery', 'Battery', 'ms-settings:batterysaver'],
    ['storage', 'Storage', 'ms-settings:storagesense'],
    ['apps', 'Installed apps', 'ms-settings:appsfeatures'],
    ['startup_apps', 'Startup apps', 'ms-settings:startupapps'],
    ['personalization', 'Personalization', 'ms-settings:personalization'],
    ['mouse', 'Mouse', 'ms-settings:mousetouchpad'],
    ['keyboard', 'Typing / keyboard', 'ms-settings:typing'],
    ['privacy', 'Privacy & security', 'ms-settings:privacy'],
    ['update', 'Windows Update', 'ms-settings:windowsupdate'],
  ];

  // kind: uri | exe | keys | ps ; confirm: needs a "are you sure?" dialog every time
  const SYSTEM = {};
  for (const [id, label, uri] of SETTINGS) SYSTEM[id] = { label, group: 'Settings pages', kind: 'uri', uri };
  Object.assign(SYSTEM, {
    lock:        { label: 'Lock computer', group: 'System', kind: 'exe', exe: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] },
    show_desktop:{ label: 'Show desktop', group: 'System', kind: 'keys', vks: [0x5B, 0x44] },
    task_manager:{ label: 'Open Task Manager', group: 'System', kind: 'exe', exe: 'taskmgr.exe', args: [] },
    screenshot:  { label: 'Screenshot / Snipping tool', group: 'System', kind: 'uri', uri: 'ms-screenclip:' },
    calculator:  { label: 'Calculator', group: 'System', kind: 'uri', uri: 'calculator:' },
    volume_up:   { label: 'Volume up', group: 'Volume & media', kind: 'keys', vks: [0xAF] },
    volume_down: { label: 'Volume down', group: 'Volume & media', kind: 'keys', vks: [0xAE] },
    mute:        { label: 'Mute / unmute', group: 'Volume & media', kind: 'keys', vks: [0xAD] },
    play_pause:  { label: 'Play / pause media', group: 'Volume & media', kind: 'keys', vks: [0xB3] },
    next_track:  { label: 'Next track', group: 'Volume & media', kind: 'keys', vks: [0xB0] },
    prev_track:  { label: 'Previous track', group: 'Volume & media', kind: 'keys', vks: [0xB1] },
    sleep:       { label: 'Sleep', group: 'Power', kind: 'exe', exe: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'], confirm: 'Put the computer to sleep?' },
    signout:     { label: 'Sign out', group: 'Power', kind: 'exe', exe: 'shutdown.exe', args: ['/l'], confirm: 'Sign out of Windows? Unsaved work may be lost.' },
    restart:     { label: 'Restart', group: 'Power', kind: 'exe', exe: 'shutdown.exe', args: ['/r', '/t', '5'], confirm: 'Restart the computer? Unsaved work may be lost.' },
    shutdown:    { label: 'Shut down', group: 'Power', kind: 'exe', exe: 'shutdown.exe', args: ['/s', '/t', '5'], confirm: 'Shut down the computer? Unsaved work may be lost.' },
    empty_bin:   { label: 'Empty Recycle Bin', group: 'System', kind: 'ps', script: 'Clear-RecycleBin -Force -ErrorAction Stop', confirm: 'Permanently delete everything in the Recycle Bin?' },
  });

  const BROWSERS = [['', 'Default browser'], ['chrome', 'Google Chrome'], ['msedge', 'Microsoft Edge'], ['firefox', 'Firefox'], ['brave', 'Brave'], ['opera', 'Opera']];
  const WINDOW_MODES = [['focus', 'Switch to it'], ['minimize', 'Minimize'], ['maximize', 'Maximize'], ['restore', 'Restore'], ['close', 'Close']];
  const COMMAND_KINDS = [['powershell', 'PowerShell command'], ['cmd', 'Command prompt command'], ['psfile', 'PowerShell script (.ps1)'], ['batch', 'Batch file (.bat / .cmd)'], ['python', 'Python script (.py)']];

  const MAX_STEPS = 50;
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function defaultAction(type) {
    const base = { id: uid('a'), type, enabled: true, onError: 'stop', runIf: 'always', delayAfterMs: 0 };
    switch (type) {
      case 'app': return { ...base, path: '', args: '', cwd: '' };
      case 'window': return { ...base, process: '', mode: 'focus', launchPath: '' };
      case 'folder': return { ...base, path: '', openWith: '' };
      case 'file': return { ...base, path: '' };
      case 'url': return { ...base, url: 'https://', browser: '' };
      case 'system': return { ...base, sys: 'settings' };
      case 'terminal': return { ...base, dir: '', command: '', shell: 'auto' };
      case 'command': return { ...base, kind: 'powershell', command: '', args: '', cwd: '', waitForExit: false, hidden: false, approvedHash: '' };
      case 'wait': return { ...base, ms: 1000 };
      default: return base;
    }
  }

  /** Coerce arbitrary (possibly imported / hand-edited) data into a clean action. */
  function sanitizeAction(a) {
    if (!a || typeof a !== 'object' || !has(TYPES, a.type)) return null;
    const out = defaultAction(a.type);
    out.id = str(a.id, 40) || out.id;
    out.enabled = a.enabled !== false;
    out.onError = a.onError === 'continue' ? 'continue' : 'stop';
    out.runIf = a.runIf === 'previousSucceeded' ? 'previousSucceeded' : 'always';
    out.delayAfterMs = Math.min(Math.max(parseInt(a.delayAfterMs, 10) || 0, 0), 600000);
    switch (a.type) {
      case 'app': Object.assign(out, { path: str(a.path), args: str(a.args), cwd: str(a.cwd) }); break;
      case 'window':
        Object.assign(out, { process: str(a.process, 200).replace(/\.exe$/i, ''), launchPath: str(a.launchPath),
          mode: WINDOW_MODES.some(([m]) => m === a.mode) ? a.mode : 'focus' }); break;
      case 'folder': Object.assign(out, { path: str(a.path), openWith: str(a.openWith) }); break;
      case 'file': out.path = str(a.path); break;
      case 'url': Object.assign(out, { url: str(a.url), browser: str(a.browser, 260) }); break;
      case 'system': out.sys = has(SYSTEM, a.sys) ? a.sys : 'settings'; break;
      case 'terminal':
        Object.assign(out, { dir: str(a.dir), command: str(a.command, 8000), shell: ['auto', 'powershell', 'cmd'].includes(a.shell) ? a.shell : 'auto' }); break;
      case 'command':
        Object.assign(out, {
          kind: COMMAND_KINDS.some(([k]) => k === a.kind) ? a.kind : 'powershell',
          command: str(a.command, 8000), args: str(a.args), cwd: str(a.cwd),
          waitForExit: !!a.waitForExit, hidden: !!a.hidden, approvedHash: str(a.approvedHash, 128),
        }); break;
      case 'wait': out.ms = Math.min(Math.max(parseInt(a.ms, 10) || 0, 0), 600000); break;
    }
    return out;
  }

  function sanitizeShortcut(s) {
    if (!s || typeof s !== 'object') return null;
    const parsed = s.keys ? Accel.parse(s.keys) : { ok: false };
    const actions = (Array.isArray(s.actions) ? s.actions : []).slice(0, MAX_STEPS).map(sanitizeAction).filter(Boolean);
    return {
      id: str(s.id, 40) || uid('s'),
      name: str(s.name, 80).trim() || 'Untitled shortcut',
      keys: parsed.ok ? parsed.accelerator : '',
      category: str(s.category, 40).trim(),
      enabled: s.enabled !== false,
      actions,
      createdAt: Number(s.createdAt) || Date.now(),
    };
  }

  /** Human-readable problems that make an action unusable. [] if fine. */
  function actionProblems(a) {
    const p = [];
    const need = (v, msg) => { if (!String(v || '').trim()) p.push(msg); };
    switch (a.type) {
      case 'app': need(a.path, 'Choose a program to open.'); break;
      case 'window': need(a.process, 'Enter the process name (e.g. chrome).'); break;
      case 'folder': case 'file': need(a.path, a.type === 'file' ? 'Choose a file.' : 'Choose a folder.'); break;
      case 'url': {
        const u = String(a.url || '').trim();
        if (!/^(https?:\/\/|mailto:)[^\s]+$/i.test(u) || /^https?:\/\/$/i.test(u)) p.push('Enter a full web address starting with http:// or https://.');
        break;
      }
      case 'terminal': break;
      case 'command': need(a.command, a.kind === 'powershell' || a.kind === 'cmd' ? 'Enter a command to run.' : 'Choose a script file.'); break;
      case 'wait': if (!(a.ms > 0)) p.push('Wait time must be greater than zero.'); break;
    }
    return p;
  }

  function shortcutProblems(s) {
    const p = [];
    if (!String(s.name || '').trim()) p.push('Give the shortcut a name.');
    if (!s.keys) p.push('Press a key combination.');
    else { const v = Accel.validate(s.keys); if (!v.ok) p.push(v.error); }
    if (!s.actions || !s.actions.length) p.push('Add at least one action.');
    (s.actions || []).forEach((a, i) => actionProblems(a).forEach((m) => p.push(`Step ${i + 1}: ${m}`)));
    return p;
  }

  /** One-line description of an action for lists. */
  function summarize(a) {
    const base = (v) => String(v || '').split(/[\\/]/).filter(Boolean).pop() || String(v || '');
    switch (a.type) {
      case 'app': return `Open ${base(a.path) || 'application'}${a.args ? ' ' + a.args : ''}`;
      case 'window': return `${(WINDOW_MODES.find(([m]) => m === a.mode) || [, 'Control'])[1]}: ${a.process || 'app'}`;
      case 'folder': return `Open folder ${base(a.path)}${a.openWith ? ' in ' + base(a.openWith) : ''}`;
      case 'file': return `Open ${base(a.path)}`;
      case 'url': return `Open ${String(a.url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '')}`;
      case 'system': return (SYSTEM[a.sys] || {}).label || 'Windows action';
      case 'terminal': return `Terminal${a.dir ? ' in ' + base(a.dir) : ''}${a.command ? ': ' + a.command.split('\n')[0] : ''}`;
      case 'command': return `Run ${a.kind === 'powershell' || a.kind === 'cmd' ? a.command.split('\n')[0] : base(a.command)}`;
      case 'wait': return `Wait ${(a.ms / 1000).toFixed(a.ms % 1000 ? 1 : 0)} s`;
      default: return a.type;
    }
  }

  return { TYPES, SYSTEM, BROWSERS, WINDOW_MODES, COMMAND_KINDS, MAX_STEPS, uid, defaultAction, sanitizeAction,
    sanitizeShortcut, actionProblems, shortcutProblems, summarize };
});
