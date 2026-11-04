'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const C = require('./pmcrypto');
const { Settings, Identity } = require('./settings');
const { ActivityStore, dayKey } = require('./store');
const { dayReport, weekReport } = require('./analytics');
const { Monitor } = require('./monitor');
const { BrowserBridge } = require('./browserBridge');
const { RelayClient } = require('./relayClient');

const LIVE_EVERY_MS = 3000;
const OFFER_TTL_MS = 10 * 60_000;
const STREAM_IDLE_MS = 15_000;

/**
 * The PocketMonitor brain. Pure Node (no Electron imports) so it can run headless and be tested.
 * Host integration is injected: provider (OS data), sys (idle time), screen (capture), iconProvider, protector.
 */
class Agent extends EventEmitter {
  constructor({ dataDir, protector, provider, sys, screen, iconProvider, version = '1.0.0', hostname = os.hostname(), extensionDir = null }) {
    super();
    this.dataDir = dataDir; fs.mkdirSync(dataDir, { recursive: true });
    this.version = version; this.host = hostname; this.extensionDir = extensionDir;
    this.settings = new Settings(dataDir);
    this.identity = new Identity(dataDir, protector);
    this.store = new ActivityStore(path.join(dataDir, 'history'));
    this.screen = screen || null; this.iconProvider = iconProvider || null;
    this.icons = new Map();
    this.sessions = new Map(); // relay connection id -> { sid, view }
    this.encKey = null; this.priv = null; this.offer = null; this.pairBusy = false;
    this.ice = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.streamCid = null; this.streamAt = 0; this.relayError = '';
    this._out = Promise.resolve(); this._outPending = 0; this._in = Promise.resolve();
    this.timers = [];

    this.bridge = new BrowserBridge({
      getToken: () => this.identity.data.browserToken, getEnabled: () => this.settings.get('browserEnabled'),
      getExcluded: () => this.settings.get('excludeDomains'),
    });
    this.monitor = new Monitor({ provider, store: this.store, settings: this.settings, sys, browserBridge: this.bridge });
    this.relay = new RelayClient({ getHello: () => this._hello() });
    this._wireRelay();
    if (this.screen) this._wireScreen();
  }

  /* ----------------------------------------------------------- lifecycle */
  async init() {
    let id = this.identity.load();
    if (!id || !id.ecdhJwk) {
      const kp = await C.generateKeyPair(true);
      id = this.identity.data = {
        laptopId: C.b64u(C.randomBytes(16)), secret: C.b64u(C.randomBytes(32)), browserToken: C.b64u(C.randomBytes(18)),
        ecdhJwk: await C.exportPrivate(kp.priv), pub: C.b64u(kp.pubRaw), phone: null,
      };
      this.identity.save();
    }
    this.priv = await C.importPrivate(id.ecdhJwk);
    if (id.phone) this.encKey = (await C.deriveSession(this.priv, C.unb64u(id.phone.pub))).encKey;
    return this;
  }

  async start() {
    this.browserBridgeUp = await this.bridge.start();
    this.monitor.setPaused(this.settings.get('monitoringPaused'));
    this.monitor.start();
    this.relay.connect(this.settings.get('relayUrl'));
    const every = (ms, fn) => { const t = setInterval(fn, ms); t.unref && t.unref(); this.timers.push(t); };
    every(LIVE_EVERY_MS, () => this._pushLive());
    every(15_000, () => this._heartbeat());
    every(60_000, () => this._snap());
    every(3_000, () => this._watchStream());
    every(6 * 3600_000, () => this.store.prune(this.settings.get('retentionDays')));
    this.store.prune(this.settings.get('retentionDays'));
    this.settings.on('change', (k) => { if (k === 'relayUrl') this.relay.connect(this.settings.get(k)); this.emit('state'); });
    this.relay.on('connected', () => this.emit('state'));
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this._stopStream('agent stopping');
    this.monitor.stop(); this.bridge.stop(); this.relay.disconnect();
  }

  /* -------------------------------------------------------------- relay */
  _hello() {
    const id = this.identity.data;
    return { type: 'hello', role: 'laptop', id: id.laptopId, secret: id.secret, phoneAuthHash: id.phone ? id.phone.authHash : null, regToken: this.settings.get('relayToken') || undefined };
  }

  _wireRelay() {
    const r = this.relay;
    r.on('connected', (m) => { this.relayError = ''; if (m.ice && m.ice.length) this.ice = m.ice; this._heartbeat(); this._snap(); this.emit('state'); });
    r.on('disconnected', () => { this.sessions.clear(); this._stopStream('relay disconnected'); this.emit('state'); });
    r.on('error-state', (e) => { this.relayError = e; this.emit('state'); });
    r.on('rtt', () => this.emit('state'));
    r.on('message', (m) => {
      switch (m.type) {
        case 'p2l': this._in = this._in.then(() => this._onPhone(m.cid, m.d)).catch(() => {}); break;
        case 'phone.down': this.sessions.delete(m.cid); if (this.streamCid === m.cid) this._stopStream('viewer left'); this.emit('state'); break;
        case 'pair.req': this._onPairReq(m).catch(() => {}); break;
        case 'err': this.relayError = m.code === 'registration' ? 'The relay rejected the access token' : `Relay error: ${m.code}`; this.emit('state'); break;
        default: break;
      }
    });
  }

  _heartbeat() { this.relay.send({ type: 'hb', state: this.settings.get('broadcastPaused') ? 'paused' : 'awake' }); }

  /** OS is about to sleep: tell the relay so the phone can show "sleeping" rather than "offline". */
  suspend() {
    this.monitor.tracker.flush(); this._stopStream('sleep');
    this.relay.send({ type: 'hb', state: 'sleeping' });
    setTimeout(() => this.relay.disconnect(), 300);
  }
  resume() { this.monitor.tracker.lastTick = null; this.relay.connect(this.settings.get('relayUrl')); }
  networkChanged() { this.relay.kick(); }
  setLocked(l) { this.monitor.setLocked(l); }

  /* ------------------------------------------------------------ sending */
  _send(cid, obj) {
    if (!this.encKey) return Promise.resolve();
    this._outPending++;
    this._out = this._out.then(async () => {
      const d = await C.encryptJSON(this.encKey, 'l2p', obj);
      this.relay.send({ type: 'l2p', cid: cid || undefined, d });
    }).catch(() => {}).finally(() => { this._outPending--; });
    return this._out;
  }
  _broadcast(obj) { for (const cid of this.sessions.keys()) this._send(cid, obj); }

  /** Called by the host with each encoded screen frame; resolves true if it was sent. */
  async pushFrame(buf) {
    if (!this.encKey || this._outPending > 2 || !this.streamCid) return false;
    this._outPending++;
    try {
      const enc = await C.encryptBytes(this.encKey, 'l2p-frame', buf);
      const out = new Uint8Array(1 + enc.length); out[0] = 1; out.set(enc, 1);
      return this.relay.sendBinary(out);
    } catch { return false; } finally { this._outPending--; }
  }

  /* ----------------------------------------------------------- status */
  _status() {
    const sys = this.monitor.system(); const idleSec = Math.round(this.monitor.idleSeconds());
    return {
      ts: Date.now(), host: this.host, awake: true,
      paused: { monitoring: this.settings.get('monitoringPaused'), broadcast: this.settings.get('broadcastPaused') },
      battery: sys.battery, hasBattery: sys.hasBattery, cpu: sys.cpu, memPct: sys.memPct, memUsedGB: sys.memUsedGB, memTotalGB: sys.memTotalGB,
      uptimeSec: sys.uptimeSec, idleSec, idle: this.monitor.isIdle(), locked: this.monitor.locked,
      net: { online: this.relay.connected, rtt: this.relay.rtt, kind: this._netKind() },
      streaming: !!this.streamCid, today: this.monitor.today(),
    };
  }
  _netKind() {
    const n = os.networkInterfaces(); let kind = null;
    for (const [name, list] of Object.entries(n)) {
      if (!(list || []).some((i) => !i.internal && i.family === 'IPv4')) continue;
      if (/wi-?fi|wlan|wireless|wl/i.test(name)) return 'Wi-Fi';
      if (/eth|en\d|ethernet/i.test(name)) kind = kind || 'Ethernet';
      else kind = kind || 'Network';
    }
    return kind || 'None';
  }

  _topToday() {
    const t = this.monitor.tracker;
    return [...t.appTotals.entries()].filter(([x]) => x !== 'locked').map(([x, v]) => ({ x, name: v.n || x, activeMs: v.activeMs, idleMs: v.idleMs }))
      .sort((a, b) => b.activeMs - a.activeMs).slice(0, 6);
  }

  _live(view) {
    const o = { t: 'live', view, status: this._status(), active: this.monitor.activeApp() };
    if (view === 'overview') { o.top = this._topToday(); o.browser = this.bridge.overview(this.monitor); o.browser.tabs = o.browser.tabs.filter((t) => t.current).slice(0, 1); }
    else if (view === 'apps') { o.apps = this.monitor.apps(); }
    else if (view === 'browser') { o.browser = this.bridge.overview(this.monitor); o.browser.enabled = this.settings.get('browserEnabled'); }
    return o;
  }

  _pushLive() {
    if (!this.sessions.size || !this.encKey) return;
    const paused = this.settings.get('broadcastPaused');
    for (const [cid, s] of this.sessions) {
      if (paused) this._send(cid, { t: 'paused', what: 'broadcast' });
      else this._send(cid, this._live(s.view));
    }
  }

  _snap() {
    if (!this.encKey || !this.relay.connected || this.settings.get('broadcastPaused')) return;
    C.encryptJSON(this.encKey, 'l2p', { t: 'snap', status: this._status(), active: this.monitor.activeApp() })
      .then((d) => this.relay.send({ type: 'snap', d })).catch(() => {});
  }

  /* ------------------------------------------------------- phone requests */
  async _onPhone(cid, d) {
    if (!this.encKey) return;
    let msg; try { msg = await C.decryptJSON(this.encKey, 'p2l', d); } catch { return; } // wrong key / tampered: ignore
    if (msg.t === 'hi') {
      const sess = { sid: C.b64u(C.randomBytes(9)), view: 'overview' }; this.sessions.set(cid, sess);
      await this._send(cid, { t: 'welcome', sid: sess.sid, host: this.host, version: this.version, paused: this._status().paused, canStream: !!this.screen });
      this.emit('state');
      if (!this.settings.get('broadcastPaused')) this._send(cid, this._live('overview'));
      return;
    }
    const s = this.sessions.get(cid);
    if (!s || msg.sid !== s.sid) { this._send(cid, { t: 'resync' }); return; }

    if (this.settings.get('broadcastPaused')) {
      if (msg.t === 'req') this._send(cid, { t: 'res', id: msg.id, error: 'paused' });
      else this._send(cid, { t: 'paused', what: 'broadcast' });
      return;
    }
    switch (msg.t) {
      case 'view': s.view = ['overview', 'apps', 'browser', 'analytics', 'live'].includes(msg.view) ? msg.view : 'overview'; this._send(cid, this._live(s.view)); break;
      case 'req': await this._onRequest(cid, msg); break;
      case 'stream.start': await this._startStream(cid, msg); break;
      case 'stream.stop': if (this.streamCid === cid) this._stopStream('stopped by viewer'); break;
      case 'stream.keepalive': if (this.streamCid === cid) this.streamAt = Date.now(); break;
      case 'stream.quality': if (this.streamCid === cid && this.screen) this.screen.setQuality(msg.quality); break;
      case 'stream.signal': if (this.streamCid === cid && this.screen) this.screen.signal(msg); break;
      case 'stream.fallback': if (this.streamCid === cid && this.screen) this.screen.fallback(); break;
      default: break;
    }
  }

  async _onRequest(cid, msg) {
    const reply = (data) => this._send(cid, { t: 'res', id: msg.id, data });
    const fail = (error) => this._send(cid, { t: 'res', id: msg.id, error });
    const p = msg.params || {};
    try {
      switch (msg.op) {
        case 'analytics': {
          this.monitor.tracker.checkpoint();
          const key = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : dayKey(Date.now());
          const data = p.range === 'week' ? weekReport(this.store, key) : dayReport(this.store, key);
          data.range = p.range === 'week' ? 'week' : 'day'; data.availableDays = this.store.days().slice(-60);
          return reply(data);
        }
        case 'icons': {
          const out = {};
          for (const key of (Array.isArray(p.keys) ? p.keys : []).slice(0, 40)) out[key] = await this._icon(String(key));
          return reply(out);
        }
        case 'displays': return reply(this.screen ? await this.screen.displays() : []);
        default: return fail('unknown_op');
      }
    } catch (e) { return fail('error'); }
  }

  async _icon(key) {
    if (this.icons.has(key)) return this.icons.get(key);
    const exe = this.monitor.exeForIcon(key); let url = null;
    if (exe && this.iconProvider) { try { url = await this.iconProvider(exe); } catch { url = null; } }
    this.icons.set(key, url); return url;
  }

  /* --------------------------------------------------------------- stream */
  _wireScreen() {
    this.screen.on('signal', (data) => { if (this.streamCid) this._send(this.streamCid, { t: 'stream.signal', ...data }); });
    this.screen.on('state', (st) => {
      if (this.streamCid) this._send(this.streamCid, { t: 'stream.state', ...st });
      if (st.state === 'stopped' || st.state === 'error') { this.streamCid = null; try { this.screen.stop(); } catch { /* */ } }
      this.emit('state');
    });
  }
  async _startStream(cid, msg) {
    if (!this.screen) return this._send(cid, { t: 'stream.state', state: 'error', message: 'Screen capture is not available on this device' });
    if (this.settings.get('broadcastPaused')) return this._send(cid, { t: 'stream.state', state: 'error', message: 'Broadcasting is paused on the laptop' });
    if (this.streamCid) await this.screen.stop();
    this.streamCid = cid; this.streamAt = Date.now();
    this.emit('state');
    try { await this.screen.start({ display: msg.display, quality: msg.quality || 'auto', ice: this.ice }); }
    catch (e) { this.streamCid = null; this._send(cid, { t: 'stream.state', state: 'error', message: String(e.message || e) }); this.emit('state'); }
  }
  _stopStream() {
    if (!this.streamCid) return;
    const cid = this.streamCid; this.streamCid = null;
    try { this.screen && this.screen.stop(); } catch { /* */ }
    this._send(cid, { t: 'stream.state', state: 'stopped' });
    this.emit('state');
  }
  _watchStream() { if (this.streamCid && Date.now() - this.streamAt > STREAM_IDLE_MS) this._stopStream('viewer idle'); }

  /* -------------------------------------------------------------- pairing */
  get paired() { return !!(this.identity.data && this.identity.data.phone); }

  /** Current pairing offer (renewed when it expires). Null when a phone is already paired. */
  getPairing() {
    if (this.paired) return null;
    if (!this.offer || Date.now() > this.offer.exp) this.newOffer();
    return { url: this.offer.url, expires: this.offer.exp, laptopId: this.identity.data.laptopId };
  }
  newOffer() {
    const code = C.b64u(C.randomBytes(16)); const base = String(this.settings.get('relayUrl') || '').replace(/\/+$/, '');
    const id = this.identity.data;
    this.offer = { code, exp: Date.now() + OFFER_TTL_MS, attempts: 0, url: `${base}/#/pair?l=${id.laptopId}&k=${id.pub}&c=${code}` };
    this.emit('state'); return this.offer;
  }

  async _onPairReq({ cid, code, pub }) {
    const fail = (reason) => this.relay.send({ type: 'pair.res', cid, ok: false, reason });
    if (this.paired || this.pairBusy) return fail('already_paired');
    const o = this.offer;
    if (!o || Date.now() > o.exp || o.attempts >= 5) return fail('expired');
    o.attempts++;
    const a = Buffer.from(String(code)); const b = Buffer.from(o.code);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail('bad_code');
    this.pairBusy = true;
    try {
      const phonePub = C.unb64u(String(pub));
      if (phonePub.length !== 65) return fail('bad_key');
      const { encKey, authHex } = await C.deriveSession(this.priv, phonePub);
      const authHash = await C.sha256hex(authHex);
      this.identity.data.phone = { pub, authHash, pairedAt: Date.now() }; this.identity.save();
      this.encKey = encKey; this.offer = null;
      const d = await C.encryptJSON(encKey, 'l2p', { t: 'paired', host: this.host, id: this.identity.data.laptopId, at: Date.now() });
      this.relay.send({ type: 'pair.res', cid, ok: true, authHash, d });
      this.emit('paired'); this.emit('state');
    } catch { fail('error'); } finally { this.pairBusy = false; }
  }

  /** Only the laptop can revoke. Forgets the phone, kicks its sessions, and opens a fresh pairing offer. */
  removePhone() {
    this._stopStream('unpaired');
    this.identity.data.phone = null; this.identity.save();
    this.encKey = null; this.sessions.clear();
    this.relay.send({ type: 'unpair' });
    this.newOffer(); this.emit('state');
  }

  /* ------------------------------------------------------- controls & UI */
  setMonitoringPaused(p) { this.settings.set('monitoringPaused', !!p); this.monitor.setPaused(!!p); this.emit('state'); }
  setBroadcastPaused(p) {
    this.settings.set('broadcastPaused', !!p);
    if (p) { this._stopStream('paused'); this._broadcast({ t: 'paused', what: 'broadcast' }); }
    this._heartbeat(); this.emit('state');
  }
  clearHistory() { this.monitor.tracker.flush(); this.store.clear(); this.monitor.tracker._hydrate(); this.emit('state'); }

  getUIState() {
    const id = this.identity.data; const bridgeFresh = this.bridge.fresh();
    return {
      version: this.version, host: this.host, dataDir: this.dataDir, extensionDir: this.extensionDir,
      settings: this.settings.all(),
      relay: { connected: this.relay.connected, rtt: this.relay.rtt, error: this.relayError, configured: !!this.settings.get('relayUrl') },
      paired: this.paired, pairedAt: id.phone ? id.phone.pairedAt : null, pairing: this.getPairing(),
      phoneConnected: this.sessions.size > 0, streaming: !!this.streamCid,
      browser: { token: id.browserToken, bridgeUp: this.browserBridgeUp !== false, connected: bridgeFresh.length > 0, browsers: [...new Set(bridgeFresh.map((s) => s.browser))] },
      today: this.monitor.today(), historyDays: this.store.days().length,
    };
  }
}

module.exports = { Agent };
