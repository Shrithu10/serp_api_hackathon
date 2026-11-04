'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, dialog, ipcMain, shell, globalShortcut, nativeImage, session } = require('electron');
const fs = require('fs');
const path = require('path');

const C = require('../shared/catalog');
const Accel = require('../shared/accelerator');
const { ConfigStore, sanitizeConfig, sanitizeProfile, stripApprovals, newProfile, migrate } = require('./config');
const { HotkeyManager } = require('./hotkeys');
const { runWorkflow } = require('./workflow');
const { createActionRunner, commandHash, ActionError } = require('./actions');

const START_HIDDEN = process.argv.includes('--hidden');
const ASSETS = path.join(__dirname, '..', 'assets');

app.setAppUserModelId('app.keyflow.desktop');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let store, hotkeys, mainWin, paletteWin, tray;
let status = {}; let appStatus = {};
let quitting = false;
const running = new Set();

const cfg = () => store.config;
const settings = () => store.config.settings;
const activeProfile = () => cfg().profiles.find((p) => p.id === cfg().activeProfileId);
const findShortcut = (id) => { for (const p of cfg().profiles) { const s = p.shortcuts.find((x) => x.id === id); if (s) return { s, p }; } return null; };

// ------------------------------------------------------------------ helpers
function send(channel, payload) {
  for (const w of [mainWin, paletteWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

function snapshot() {
  return {
    config: cfg(), status, appStatus, stats: store.stats, loadWarning: store.loadWarning,
    version: app.getVersion(), platform: process.platform, packaged: app.isPackaged,
    system: Object.fromEntries(Object.entries(C.SYSTEM).map(([k, v]) => [k, { label: v.label, group: v.group, confirm: !!v.confirm }])),
    backups: store.listBackups().map((b) => ({ name: b.name, time: b.time })),
  };
}

function notify(title, body, { onClick } = {}) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(ASSETS, 'icon.png') });
  n.on('click', () => { showWindow(); if (onClick) onClick(); });
  n.show();
}

function showWindow() {
  if (!mainWin || mainWin.isDestroyed()) createWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
}

async function confirmBox(message, detail) {
  const parent = mainWin && !mainWin.isDestroyed() && mainWin.isVisible() ? mainWin : undefined;
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning', buttons: ['Cancel', 'Continue'], defaultId: 0, cancelId: 0, noLink: true,
    title: 'KeyFlow', message, detail,
  });
  return response === 1;
}

// ------------------------------------------------------------------ running
const exec = createActionRunner({
  shell,
  confirm: confirmBox,
  approveCommand(step, hash) {
    for (const p of cfg().profiles) for (const s of p.shortcuts) for (const a of s.actions) if (a.id === step.id) a.approvedHash = hash;
    store.save();
  },
});

async function runShortcut(shortcut, { manual = false } = {}) {
  if (!shortcut.actions.length) return;
  if (running.has(shortcut.id)) return;
  running.add(shortcut.id);
  send('run:state', { id: shortcut.id, running: true });
  let result;
  try {
    result = await runWorkflow(shortcut.actions, exec, { isCancelled: () => quitting });
  } catch (e) {
    result = { ok: false, results: [{ index: 0, status: 'failed', error: e.message }], failedCount: 1 };
  } finally { running.delete(shortcut.id); }

  const cancelled = result.results.some((r) => r.cancelled);
  if (!cancelled) store.recordRun(shortcut.id, result.ok);
  const failed = result.results.find((r) => r.status === 'failed' && !r.cancelled);
  let message = '';
  if (failed) {
    message = shortcut.actions.length > 1 ? `Step ${failed.index + 1}: ${failed.error}` : failed.error;
    if (settings().notifyOnFailure) notify(`"${shortcut.name}" didn't finish`, message);
  } else if (result.ok && settings().notifyOnSuccess && !manual) {
    notify(`"${shortcut.name}" done`, C.summarize(shortcut.actions[0]));
  }
  send('run:state', { id: shortcut.id, running: false, ok: result.ok && !cancelled, cancelled, message, manual });
  send('state:changed', { stats: store.stats });
}

// ------------------------------------------------------------------ hotkeys
function applyHotkeys() {
  const p = activeProfile();
  const res = hotkeys.apply(p.shortcuts, {
    palette: { keys: settings().paletteHotkey, run: togglePalette },
    pause: { keys: settings().pauseHotkey, run: () => setPaused(!settings().paused, true) },
  }, { paused: settings().paused, onTrigger: (s) => runShortcut(s) });
  status = res.status; appStatus = res.appStatus;
  rebuildTray();
}

function setPaused(v, announce = false) {
  settings().paused = !!v; store.save(); applyHotkeys();
  send('state:changed', snapshot());
  if (announce) notify('KeyFlow', v ? 'All shortcuts are paused.' : 'Shortcuts are active again.');
}

function refresh() { applyHotkeys(); store.save(); const s = snapshot(); send('state:changed', s); return s; }

// ------------------------------------------------------------------ windows
function secureWebPrefs(preload) {
  return { preload: path.join(__dirname, '..', 'preload', preload), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };
}

function lockdown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1020, height: 700, minWidth: 820, minHeight: 560, show: false, title: 'KeyFlow',
    backgroundColor: '#f6f7f9', icon: path.join(ASSETS, 'icon.png'), autoHideMenuBar: true,
    webPreferences: secureWebPrefs('preload.js'),
  });
  mainWin.removeMenu();
  lockdown(mainWin);
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => { if (!(START_HIDDEN && settings().startMinimized)) mainWin.show(); });
  mainWin.on('close', (e) => {
    if (!quitting && settings().closeToTray) { e.preventDefault(); mainWin.hide(); }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

function createPalette() {
  paletteWin = new BrowserWindow({
    width: 560, height: 440, show: false, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    transparent: false, backgroundColor: '#ffffff', webPreferences: secureWebPrefs('preload.js'),
  });
  lockdown(paletteWin);
  paletteWin.loadFile(path.join(__dirname, '..', 'renderer', 'palette.html'));
  paletteWin.on('blur', () => { if (paletteWin && !paletteWin.isDestroyed()) paletteWin.hide(); });
  paletteWin.on('closed', () => { paletteWin = null; });
}

function togglePalette() {
  if (!paletteWin || paletteWin.isDestroyed()) createPalette();
  if (paletteWin.isVisible()) return paletteWin.hide();
  const { screen } = require('electron');
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  paletteWin.setPosition(Math.round(d.x + (d.width - 560) / 2), Math.round(d.y + d.height * 0.18));
  paletteWin.show(); paletteWin.focus();
  paletteWin.webContents.send('palette:open', snapshot());
}

// ------------------------------------------------------------------ tray
function rebuildTray() {
  if (!tray) return;
  const p = activeProfile();
  const paused = settings().paused;
  tray.setToolTip(`KeyFlow — ${paused ? 'paused' : 'active'} (${p.name})`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open KeyFlow', click: showWindow },
    { label: 'Command palette', accelerator: undefined, click: togglePalette },
    { type: 'separator' },
    { label: 'Shortcuts enabled', type: 'checkbox', checked: !paused, click: (i) => setPaused(!i.checked) },
    { label: 'Profile', submenu: cfg().profiles.map((x) => ({
      label: x.name, type: 'radio', checked: x.id === p.id,
      click: () => { cfg().activeProfileId = x.id; refresh(); },
    })) },
    { type: 'separator' },
    { label: 'Quit KeyFlow', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.on('click', showWindow);
  rebuildTray();
}

// ------------------------------------------------------------------ settings side effects
function applyAutostart() {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings().startWithWindows, args: ['--hidden'] }); } catch { /* unsupported platform */ }
}

// ------------------------------------------------------------------ IPC
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    try { return await fn(...args); }
    catch (err) { return { ok: false, errors: [err.message || String(err)] }; }
  });
}

function keysConflict(keys, ignoreId) {
  const p = activeProfile();
  if (ignoreId !== 'palette' && keys === Accel.parse(settings().paletteHotkey).accelerator) return 'the command palette';
  if (ignoreId !== 'pause' && keys === Accel.parse(settings().pauseHotkey).accelerator) return 'the pause/resume hotkey';
  const other = p.shortcuts.find((s) => s.id !== ignoreId && s.enabled && s.keys === keys);
  return other ? `"${other.name}"` : null;
}

handle('state:get', () => snapshot());

handle('keys:check', (keys, ignoreId) => {
  const v = Accel.validate(keys);
  if (!v.ok) return { ok: false, error: v.error };
  const used = keysConflict(v.accelerator, ignoreId);
  return { ok: !used, accelerator: v.accelerator, warnings: v.warnings, error: used ? `${Accel.pretty(v.accelerator)} is already used by ${used}.` : undefined };
});

handle('hotkeys:suspend', (on) => {
  hotkeys.suspended = !!on;
  if (on) hotkeys.releaseAll(); else applyHotkeys();
  return true;
});

handle('shortcut:save', (raw) => {
  const s = C.sanitizeShortcut(raw);
  const problems = C.shortcutProblems(s);
  if (problems.length) return { ok: false, errors: problems };
  if (s.enabled) {
    const used = keysConflict(s.keys, s.id);
    if (used) return { ok: false, errors: [`${Accel.pretty(s.keys)} is already used by ${used}. Choose another combination or disable the other shortcut.`] };
  }
  // The user wrote/edited these commands in the editor, so they count as approved.
  for (const a of s.actions) if (a.type === 'command') a.approvedHash = commandHash(a);
  const p = activeProfile();
  const i = p.shortcuts.findIndex((x) => x.id === s.id);
  if (i >= 0) { s.createdAt = p.shortcuts[i].createdAt; p.shortcuts[i] = s; } else p.shortcuts.push(s);
  const snap = refresh();
  const st = snap.status[s.id];
  return { ok: true, id: s.id, registration: st, state: snap };
});

handle('shortcut:delete', (id) => {
  const p = activeProfile();
  p.shortcuts = p.shortcuts.filter((s) => s.id !== id);
  delete store.stats[id]; store.flushStats();
  return { ok: true, state: refresh() };
});

handle('shortcut:duplicate', (id) => {
  const p = activeProfile();
  const src = p.shortcuts.find((s) => s.id === id);
  if (!src) return { ok: false, errors: ['Shortcut not found.'] };
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = C.uid('s'); copy.name = `${src.name} (copy)`.slice(0, 80); copy.keys = ''; copy.enabled = false; copy.createdAt = Date.now();
  copy.actions.forEach((a) => { a.id = C.uid('a'); });
  p.shortcuts.splice(p.shortcuts.indexOf(src) + 1, 0, copy);
  return { ok: true, id: copy.id, state: refresh() };
});

handle('shortcut:toggle', (id, enabled) => {
  const f = findShortcut(id);
  if (!f) return { ok: false, errors: ['Shortcut not found.'] };
  f.s.enabled = !!enabled;
  return { ok: true, state: refresh() };
});

handle('shortcut:run', (id) => {
  const f = findShortcut(id);
  if (!f) return { ok: false, errors: ['Shortcut not found.'] };
  runShortcut(f.s, { manual: true });
  return { ok: true };
});

handle('profile:add', (name) => {
  const p = newProfile(String(name || '').trim().slice(0, 40) || 'New profile');
  cfg().profiles.push(p); cfg().activeProfileId = p.id;
  return { ok: true, state: refresh() };
});
handle('profile:switch', (id) => {
  if (!cfg().profiles.some((p) => p.id === id)) return { ok: false, errors: ['Profile not found.'] };
  cfg().activeProfileId = id; return { ok: true, state: refresh() };
});
handle('profile:rename', (id, name) => {
  const p = cfg().profiles.find((x) => x.id === id);
  if (!p || !String(name).trim()) return { ok: false, errors: ['Enter a profile name.'] };
  p.name = String(name).trim().slice(0, 40); return { ok: true, state: refresh() };
});
handle('profile:delete', (id) => {
  if (cfg().profiles.length < 2) return { ok: false, errors: ['You need at least one profile.'] };
  store.createBackup('auto');
  cfg().profiles = cfg().profiles.filter((p) => p.id !== id);
  if (cfg().activeProfileId === id) cfg().activeProfileId = cfg().profiles[0].id;
  return { ok: true, state: refresh() };
});

handle('paused:set', (v) => { setPaused(v); return { ok: true, state: snapshot() }; });

handle('settings:set', (patch) => {
  const merged = sanitizeConfig({ ...cfg(), settings: { ...settings(), ...patch } }).settings;
  for (const k of ['paletteHotkey', 'pauseHotkey']) {
    if (k in patch && patch[k]) {
      const v = Accel.validate(patch[k]);
      if (!v.ok) return { ok: false, errors: [v.error] };
      if (patch.paletteHotkey && patch.pauseHotkey && patch.paletteHotkey === patch.pauseHotkey) return { ok: false, errors: ['Use different keys for the two hotkeys.'] };
    }
  }
  Object.assign(settings(), merged);
  applyAutostart();
  return { ok: true, state: refresh() };
});

handle('onboarded', () => { cfg().onboarded = true; store.save(); return true; });

handle('dialog:pick', async (opts = {}) => {
  const props = opts.folder ? ['openDirectory'] : ['openFile'];
  const r = await dialog.showOpenDialog(mainWin, { properties: props, filters: opts.filters, defaultPath: opts.defaultPath || undefined });
  return r.canceled ? null : r.filePaths[0];
});

// ---- import / export / backup
handle('config:export', async (scope) => {
  const profiles = scope === 'all' ? cfg().profiles : [activeProfile()];
  const data = { format: 'keyflow-export', version: 1, exportedAt: new Date().toISOString(), profiles: JSON.parse(JSON.stringify(profiles)) };
  stripApprovals(data);
  const r = await dialog.showSaveDialog(mainWin, {
    title: 'Export shortcuts', defaultPath: `keyflow-${scope === 'all' ? 'all-profiles' : activeProfile().name}.json`,
    filters: [{ name: 'KeyFlow shortcuts', extensions: ['json'] }],
  });
  if (r.canceled) return { ok: false, cancelled: true };
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return { ok: true, path: r.filePath };
});

handle('config:import', async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'Import shortcuts', properties: ['openFile'], filters: [{ name: 'KeyFlow shortcuts', extensions: ['json'] }] });
  if (r.canceled) return { ok: false, cancelled: true };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, '')); }
  catch { return { ok: false, errors: ['That file is not valid JSON.'] }; }
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : (Array.isArray(raw.shortcuts) ? [{ name: 'Imported', shortcuts: raw.shortcuts }] : []))
    .map(sanitizeProfile).filter(Boolean);
  if (!profiles.length) return { ok: false, errors: ['No shortcuts found in that file.'] };
  store.createBackup('pre-import');
  const names = new Set(cfg().profiles.map((p) => p.name));
  let count = 0;
  for (const p of profiles) {
    p.id = C.uid('p');
    while (names.has(p.name)) p.name = `${p.name} (imported)`.slice(0, 40);
    names.add(p.name);
    p.shortcuts.forEach((s) => { s.id = C.uid('s'); s.actions.forEach((a) => { a.id = C.uid('a'); if (a.type === 'command') a.approvedHash = ''; }); count++; });
    cfg().profiles.push(p);
  }
  cfg().activeProfileId = profiles[0].id;
  return { ok: true, imported: count, profiles: profiles.length, state: refresh() };
});

handle('backup:create', () => { store.save(); store.createBackup('manual'); return { ok: true, state: snapshot() }; });
handle('backup:restore', async (name) => {
  if (!(await confirmBox('Restore this backup?', 'Your current shortcuts will be replaced (a backup of them is made first). Commands in the backup must be approved again before they run.'))) return { ok: false, cancelled: true };
  store.createBackup('pre-restore');
  store.restoreBackup(name);
  return { ok: true, state: refresh() };
});
handle('backup:open-folder', () => shell.openPath(store.backupDir));
handle('stats:reset', () => { store.resetStats(); return { ok: true, state: snapshot() }; });

// palette
handle('palette:run', (id) => {
  const f = findShortcut(id);
  if (paletteWin && !paletteWin.isDestroyed()) paletteWin.hide();
  if (f) runShortcut(f.s, { manual: true });
  return true;
});
handle('palette:close', () => { if (paletteWin && !paletteWin.isDestroyed()) paletteWin.hide(); return true; });
handle('window:show', () => { showWindow(); return true; });

// ------------------------------------------------------------------ lifecycle
app.on('second-instance', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (store) store.flushStats(); });
app.on('window-all-closed', () => { /* stay alive in the tray */ });

app.whenReady().then(() => {
  // Block any network/permission use the UI never needs.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  store = new ConfigStore(app.getPath('userData'));
  if (!fs.existsSync(store.file)) store.save();
  else store.createBackup('startup');
  hotkeys = new HotkeyManager(globalShortcut);
  applyAutostart();
  createWindow();
  createTray();
  applyHotkeys();
  if (store.loadWarning) mainWin.webContents.once('did-finish-load', () => dialog.showMessageBox(mainWin, { type: 'warning', title: 'KeyFlow', message: 'Configuration recovered', detail: store.loadWarning }));
});
