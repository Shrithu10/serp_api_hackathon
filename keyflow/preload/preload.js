'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => {
  const fn = (_e, p) => cb(p);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('kf', {
  getState: inv('state:get'),
  checkKeys: inv('keys:check'),
  suspendHotkeys: inv('hotkeys:suspend'),
  saveShortcut: inv('shortcut:save'),
  deleteShortcut: inv('shortcut:delete'),
  duplicateShortcut: inv('shortcut:duplicate'),
  toggleShortcut: inv('shortcut:toggle'),
  runShortcut: inv('shortcut:run'),
  addProfile: inv('profile:add'),
  switchProfile: inv('profile:switch'),
  renameProfile: inv('profile:rename'),
  deleteProfile: inv('profile:delete'),
  setPaused: inv('paused:set'),
  setSettings: inv('settings:set'),
  markOnboarded: inv('onboarded'),
  pick: inv('dialog:pick'),
  exportConfig: inv('config:export'),
  importConfig: inv('config:import'),
  createBackup: inv('backup:create'),
  restoreBackup: inv('backup:restore'),
  openBackupFolder: inv('backup:open-folder'),
  resetStats: inv('stats:reset'),
  paletteRun: inv('palette:run'),
  paletteClose: inv('palette:close'),
  showWindow: inv('window:show'),
  onState: on('state:changed'),
  onRun: on('run:state'),
  onPaletteOpen: on('palette:open'),
});
