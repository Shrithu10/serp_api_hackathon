const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pmCap', {
  on: (cb) => ipcRenderer.on('cap', (_e, m) => cb(m)),
  signal: (m) => ipcRenderer.send('cap:signal', m),
  state: (m) => ipcRenderer.send('cap:state', m),
  frame: (buf) => ipcRenderer.invoke('cap:frame', buf),
});
