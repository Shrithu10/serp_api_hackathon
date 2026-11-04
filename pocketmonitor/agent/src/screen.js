'use strict';
/**
 * On-demand screen streaming. A hidden window captures the chosen display only while a phone is watching.
 *   1) WebRTC (peer-to-peer, hardware-accelerated encode, adaptive bitrate) whenever the network allows it
 *   2) automatic fallback: encrypted JPEG frames through the relay
 * Nothing is captured while idle: the capture window is destroyed when streaming stops.
 */
const { BrowserWindow, desktopCapturer, screen, ipcMain } = require('electron');
const path = require('path');
const { EventEmitter } = require('events');

class ScreenController extends EventEmitter {
  constructor({ onFrame }) {
    super(); this.win = null; this.onFrame = onFrame; this.ready = null;
    ipcMain.on('cap:signal', (_e, m) => this.emit('signal', m));
    ipcMain.on('cap:state', (_e, m) => this.emit('state', m));
    ipcMain.handle('cap:frame', (_e, buf) => this.onFrame(Buffer.from(buf)));
  }

  async displays() {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => {
      const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[i];
      return src && { id: src.id, name: `Display ${i + 1}`, w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), primary: d.id === primary };
    }).filter(Boolean);
  }

  _window() {
    if (this.win && !this.win.isDestroyed()) return this.ready;
    this.win = new BrowserWindow({ show: false, width: 320, height: 240, skipTaskbar: true, webPreferences: {
      preload: path.join(__dirname, 'ui', 'capture-preload.js'), backgroundThrottling: false, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.ready = new Promise((res) => this.win.webContents.once('did-finish-load', res));
    this.win.loadFile(path.join(__dirname, 'ui', 'capture.html'));
    this.win.on('closed', () => { this.win = null; });
    return this.ready;
  }

  async start({ display, quality, ice }) {
    const list = await this.displays(); if (!list.length) throw new Error('No display found');
    const d = list.find((x) => x.id === display) || list.find((x) => x.primary) || list[0];
    await this._window();
    this.win.webContents.send('cap', { cmd: 'start', sourceId: d.id, width: d.w, height: d.h, quality, ice });
    this.emit('state', { state: 'starting', display: d.id });
  }
  _cmd(m) { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('cap', m); }
  signal(msg) { this._cmd({ cmd: 'signal', ...msg }); }
  setQuality(quality) { this._cmd({ cmd: 'quality', quality }); }
  fallback() { this._cmd({ cmd: 'fallback' }); }
  stop() {
    if (this.win && !this.win.isDestroyed()) { this._cmd({ cmd: 'stop' }); const w = this.win; this.win = null; setTimeout(() => { try { w.destroy(); } catch { /* */ } }, 300); }
  }
}

module.exports = { ScreenController };
