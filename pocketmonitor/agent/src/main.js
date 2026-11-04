'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor, safeStorage, shell, clipboard, net, screen, session } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const { Agent } = require('./core/agent');
const { WindowsProvider } = require('./core/providers/windows');
const { GenericProvider } = require('./core/providers/generic');
const { ScreenController } = require('./screen');

if (process.env.PM_USER_DATA) app.setPath('userData', process.env.PM_USER_DATA); // used by tests / portable installs
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('app.pocketmonitor.agent');
const startHidden = process.argv.includes('--hidden');

let agent, tray, win, indicator, screenCtl, lastQrUrl = '', lastQr = '', quitting = false;
const img = (n) => nativeImage.createFromPath(path.join(__dirname, 'ui', n));

/* Identity is encrypted with the OS (Windows DPAPI via Electron safeStorage). */
const protector = {
  protect: (s) => (safeStorage.isEncryptionAvailable() ? 'v1:' + safeStorage.encryptString(s).toString('base64') : 'p:' + s),
  unprotect: (s) => (s.startsWith('v1:') ? safeStorage.decryptString(Buffer.from(s.slice(3), 'base64')) : s.slice(2)),
};

function extensionDir() { return app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, '..', '..', 'extension'); }

async function createAgent() {
  screenCtl = new ScreenController({ onFrame: (buf) => agent.pushFrame(buf) });
  agent = new Agent({
    dataDir: app.getPath('userData'), protector, version: app.getVersion(), hostname: require('os').hostname(), extensionDir: extensionDir(),
    provider: process.platform === 'win32' ? new WindowsProvider() : new GenericProvider(),
    sys: { idleSeconds: () => powerMonitor.getSystemIdleTime() },
    screen: screenCtl,
    iconProvider: async (exe) => { const i = await app.getFileIcon(exe, { size: 'normal' }); return i.resize({ width: 32, height: 32 }).toDataURL(); },
  });
  await agent.init();
  if (process.env.PM_RELAY && !agent.settings.get('relayUrl')) agent.settings.set('relayUrl', process.env.PM_RELAY);
  if (process.env.PM_TEST_PAIRING_FILE) agent.on('state', () => { const p = agent.getPairing(); if (p) require('fs').writeFileSync(process.env.PM_TEST_PAIRING_FILE, p.url); });
  applyAutostart();
  agent.settings.on('change', (k) => { if (k === 'autostart') applyAutostart(); });
  agent.on('state', () => { refreshTray(); refreshIndicator(); pushState(); });
  await agent.start();
}

function applyAutostart() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: !!agent.settings.get('autostart'), args: ['--hidden'] });
}

/* ------------------------------------------------------------------ windows */
function createWindow() {
  win = new BrowserWindow({ width: 480, height: 760, minWidth: 420, minHeight: 560, show: false, title: 'PocketMonitor', icon: img('icon.png'), autoHideMenuBar: true, backgroundColor: '#f4f5fb',
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.once('ready-to-show', () => { if (!startHidden || !agent.settings.get('relayUrl')) win.show(); });
}
function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }

/* Always-on-top pill whenever a phone is connected or the screen is being streamed. */
function createIndicator() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  indicator = new BrowserWindow({ width: 360, height: 44, x: Math.round((width - 360) / 2), y: 8, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true } });
  indicator.setAlwaysOnTop(true, 'screen-saver'); indicator.setIgnoreMouseEvents(false);
  indicator.loadFile(path.join(__dirname, 'ui', 'indicator.html'));
}
function refreshIndicator() {
  if (!indicator) return; const s = agent.getUIState();
  const mode = s.streaming ? 'stream' : s.phoneConnected ? 'view' : null;
  if (mode) { indicator.webContents.send('indicator', { mode }); if (!indicator.isVisible()) indicator.showInactive(); } else if (indicator.isVisible()) indicator.hide();
}

/* --------------------------------------------------------------------- tray */
function refreshTray() {
  if (!tray || !agent) return; const s = agent.getUIState(); const st = s.settings;
  const paused = st.monitoringPaused || st.broadcastPaused;
  tray.setImage(img(s.streaming ? 'tray-live.png' : paused ? 'tray-paused.png' : 'tray-on.png'));
  const line = s.streaming ? 'Your screen is being viewed on your phone' : s.phoneConnected ? 'Phone is connected' : !s.paired ? 'Not paired yet' : s.relay.connected ? 'Online · phone can see this laptop' : 'Offline';
  tray.setToolTip('PocketMonitor — ' + (st.monitoringPaused ? 'monitoring paused' : st.broadcastPaused ? 'broadcasting paused' : line));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open PocketMonitor', click: showWindow }, { label: line, enabled: false }, { type: 'separator' },
    { label: 'Pause monitoring', type: 'checkbox', checked: st.monitoringPaused, click: (m) => agent.setMonitoringPaused(m.checked) },
    { label: 'Pause broadcasting to phone', type: 'checkbox', checked: st.broadcastPaused, click: (m) => agent.setBroadcastPaused(m.checked) },
    { label: 'Stop screen sharing', enabled: s.streaming, click: () => agent._stopStream() }, { type: 'separator' },
    { label: 'Quit PocketMonitor', click: () => { quitting = true; app.quit(); } },
  ]));
}

/* ----------------------------------------------------------------- UI state */
async function uiState() {
  const s = agent.getUIState();
  if (s.pairing) { if (s.pairing.url !== lastQrUrl) { lastQrUrl = s.pairing.url; lastQr = await QRCode.toDataURL(s.pairing.url, { width: 280, margin: 1, errorCorrectionLevel: 'M' }); } s.qr = lastQr; }
  return s;
}
let pushTimer = null;
function pushState() { clearTimeout(pushTimer); pushTimer = setTimeout(async () => { if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('state', await uiState()); }, 150); }

ipcMain.handle('pm:state', () => uiState());
ipcMain.handle('pm:action', async (_e, name, arg) => {
  switch (name) {
    case 'setSetting': if (arg && typeof arg.k === 'string') agent.settings.set(arg.k, arg.v); break;
    case 'monitoringPaused': agent.setMonitoringPaused(!!arg); break;
    case 'broadcastPaused': agent.setBroadcastPaused(!!arg); break;
    case 'removePhone': agent.removePhone(); break;
    case 'newQr': agent.newOffer(); break;
    case 'clearHistory': agent.clearHistory(); break;
    case 'stopStream': agent._stopStream(); break;
    case 'copyToken': clipboard.writeText(agent.identity.data.browserToken); break;
    case 'copyPairLink': { const p = agent.getPairing(); if (p) clipboard.writeText(p.url); break; }
    case 'openExtensionFolder': shell.openPath(extensionDir()); break;
    case 'openDataFolder': shell.openPath(app.getPath('userData')); break;
    case 'openExtensionsPage': if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', arg === 'edge' ? 'msedge' : 'chrome', arg === 'edge' ? 'edge://extensions' : 'chrome://extensions'], { windowsHide: true }, () => {}); break;
    case 'quit': quitting = true; app.quit(); break;
    default: break;
  }
  return uiState();
});

/* ---------------------------------------------------------------- lifecycle */
app.on('second-instance', showWindow);
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
let stopping = false;
app.on('before-quit', (e) => { quitting = true; if (agent && !stopping) { stopping = true; e.preventDefault(); agent.stop().catch(() => {}).finally(() => app.quit()); } });

app.whenReady().then(async () => {
  // Deny every web permission except screen capture, and only for our own hidden capture page.
  const isCapture = (wc) => { try { return wc && wc.getURL().endsWith('/ui/capture.html'); } catch { return false; } };
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && isCapture(wc)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && isCapture(wc));
  await createAgent();
  tray = new Tray(img('tray-on.png')); tray.on('click', showWindow); tray.on('double-click', showWindow);
  createWindow(); createIndicator(); refreshTray();
  powerMonitor.on('suspend', () => agent.suspend());
  powerMonitor.on('resume', () => setTimeout(() => agent.resume(), 1500));
  powerMonitor.on('lock-screen', () => agent.setLocked(true));
  powerMonitor.on('unlock-screen', () => agent.setLocked(false));
  let wasOnline = net.isOnline();
  setInterval(() => { const on = net.isOnline(); if (on && !wasOnline) agent.networkChanged(); wasOnline = on; }, 4000);
  setInterval(() => { if (win && win.isVisible()) pushState(); }, 2000);
});
