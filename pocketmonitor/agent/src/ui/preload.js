const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pmUI', {
  getState: () => ipcRenderer.invoke('pm:state'),
  action: (name, arg) => ipcRenderer.invoke('pm:action', name, arg),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onIndicator: (cb) => ipcRenderer.on('indicator', (_e, m) => cb(m)),
});
