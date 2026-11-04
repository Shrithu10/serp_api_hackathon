'use strict';
const WebSocket = require('ws');
const { EventEmitter } = require('events');

/** Persistent outbound connection to the relay with jittered backoff, liveness checks and RTT. */
class RelayClient extends EventEmitter {
  constructor({ getHello }) {
    super(); this.getHello = getHello; this.ws = null; this.url = ''; this.backoff = 1000; this.timer = null;
    this.connected = false; this.rtt = null; this.stopped = true; this.lastPong = 0; this.pingT = null; this.pingSentAt = 0;
  }

  connect(url) {
    this.stopped = false;
    if (url !== undefined) this.url = url;
    this._teardown(false);
    if (!this.url) return;
    let wsUrl;
    try { const u = new URL(this.url); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'; u.pathname = '/ws'; u.search = ''; u.hash = ''; wsUrl = u.toString(); }
    catch { this.emit('error-state', 'Invalid relay URL'); return; }
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 10_000, maxPayload: 4 * 1024 * 1024 });
    this.ws = ws;
    ws.on('open', async () => {
      try { ws.send(JSON.stringify(await this.getHello())); } catch { ws.close(); }
      this.lastPong = Date.now();
      this.pingT = setInterval(() => {
        if (Date.now() - this.lastPong > 40_000) { try { ws.terminate(); } catch { /* */ } return; } // half-open after network change
        this.pingSentAt = Date.now(); try { ws.ping(); } catch { /* */ }
      }, 15_000);
    });
    ws.on('pong', () => { this.lastPong = Date.now(); this.rtt = this.lastPong - this.pingSentAt; this.emit('rtt', this.rtt); });
    ws.on('ping', () => { this.lastPong = Date.now(); });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      this.lastPong = Date.now();
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type === 'ready') { this.connected = true; this.backoff = 1000; this.emit('connected', m); }
      this.emit('message', m);
    });
    ws.on('close', (code) => {
      clearInterval(this.pingT);
      const was = this.connected; this.connected = false; this.rtt = null;
      if (this.ws === ws) this.ws = null;
      if (was) this.emit('disconnected', code);
      if (!this.stopped) this._schedule(code);
    });
    ws.on('error', (e) => { this.emit('error-state', e.message); });
  }

  _schedule(code) {
    clearTimeout(this.timer);
    const wait = code === 4401 ? 60_000 : this.backoff * (0.7 + Math.random() * 0.6);
    this.backoff = Math.min(this.backoff * 2, 30_000);
    this.timer = setTimeout(() => this.connect(), wait);
  }
  _teardown() {
    clearTimeout(this.timer); clearInterval(this.pingT);
    if (this.ws) { const w = this.ws; this.ws = null; w.removeAllListeners('close'); try { w.terminate(); } catch { /* */ } this.connected = false; }
  }
  /** Reconnect right now (after resume from sleep / network change). */
  kick() { if (this.stopped) return; this.backoff = 1000; this.connect(); }
  send(obj) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; } return false; }
  sendBinary(buf) {
    if (!this.ws || this.ws.readyState !== 1 || this.ws.bufferedAmount > 1_500_000) return false;
    this.ws.send(buf, { binary: true }); return true;
  }
  /** Say goodbye (used before sleep) then drop. */
  disconnect() { this.stopped = true; this._teardown(); }
}

module.exports = { RelayClient };
