'use strict';
// End-to-end test: real relay + real agent core + simulated phone using the same crypto as the phone app.
const path = require('path'); const os = require('os'); const fs = require('fs'); const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const WebSocket = require(path.join(__dirname, '../agent/node_modules/ws'));
const C = require('../shared/pmcrypto.js');
const { Agent } = require('../agent/src/core/agent');
const { GenericProvider } = require('../agent/src/core/providers/generic');
const { EventEmitter } = require('events');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0; const ok = (name) => { passed++; console.log('  ✓ ' + name); };

class Phone {
  constructor(base) { this.base = base; this.waiters = []; this.inbox = []; this.frames = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on('open', res); this.ws.on('error', rej);
      this.ws.on('message', async (d, bin) => {
        if (bin) { const b = new Uint8Array(d); this.frames.push(await C.decryptBytes(this.encKey, 'l2p-frame', b.subarray(1))); return; }
        const m = JSON.parse(d.toString());
        if (m.type === 'm') { try { this._push(await C.decryptJSON(this.encKey, 'l2p', m.d)); } catch (e) { this._push({ t: 'DECRYPT_FAIL' }); } } else this._push(m);
      });
      this.ws.on('close', (code) => this._push({ type: 'closed', code }));
    });
  }
  _push(m) { const i = this.waiters.findIndex((w) => w.f(m)); if (i >= 0) this.waiters.splice(i, 1)[0].r(m); else this.inbox.push(m); }
  wait(f, ms = 8000) {
    const i = this.inbox.findIndex(f); if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((r, rej) => { const w = { f, r }; this.waiters.push(w); setTimeout(() => rej(new Error('timeout waiting')), ms); });
  }
  async send(obj) { this.ws.send(JSON.stringify({ type: 'p2l', d: await C.encryptJSON(this.encKey, 'p2l', obj) })); }
  async req(op, params) { const id = Math.random().toString(36).slice(2); await this.send({ t: 'req', sid: this.sid, id, op, params }); return this.wait((m) => m.t === 'res' && m.id === id); }
}

function post(p, headers, body) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 47821, path: p, method: body ? 'POST' : 'GET', headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', () => resolve({ status: 0 })); if (body) req.write(body); req.end();
  });
}

(async () => {
  const relay = spawn(process.execPath, [path.join(__dirname, '../relay/server.js')], { env: { ...process.env, PORT, DATA_DIR: path.join(tmp, 'relay') }, stdio: 'inherit' });
  await sleep(700);
  const fakeScreen = Object.assign(new EventEmitter(), {
    async displays() { return [{ id: 'd1', name: 'Display 1', w: 1920, h: 1080, primary: true }]; },
    async start(o) { this.opts = o; setTimeout(() => this.emit('state', { state: 'relay', mode: 'relay' }), 20); },
    stop() { this.stopped = true; }, setQuality(q) { this.q = q; }, signal() {}, fallback() {},
  });
  const agent = new Agent({ dataDir: path.join(tmp, 'agent'), provider: new GenericProvider(1000), screen: fakeScreen, iconProvider: async () => 'data:image/png;base64,AAAA' });
  await agent.init(); agent.settings.set('relayUrl', `http://127.0.0.1:${PORT}`); await agent.start();
  await sleep(1200);
  assert(agent.relay.connected, 'agent connected to relay'); ok('laptop connects to relay');

  // ---- pairing
  const offer = agent.getPairing(); assert(offer.url.startsWith(`http://127.0.0.1:${PORT}/#/pair?`));
  const q = new URLSearchParams(offer.url.split('#/pair?')[1]);
  const ph = new Phone(); const kp = await C.generateKeyPair(false);
  const sess = await C.deriveSession(kp.priv, C.unb64u(q.get('k'))); ph.encKey = sess.encKey;
  // wrong code first
  const bad = new Phone(); await bad.open(); bad.ws.send(JSON.stringify({ type: 'pair', role: 'phone', id: q.get('l'), code: 'nope', pub: C.b64u(kp.pubRaw) }));
  assert.strictEqual((await bad.wait((m) => m.type === 'pair.err')).reason, 'bad_code'); ok('wrong pairing code rejected');
  await ph.open(); ph.ws.send(JSON.stringify({ type: 'pair', role: 'phone', id: q.get('l'), code: q.get('c'), pub: C.b64u(kp.pubRaw) }));
  const pk = await ph.wait((m) => m.type === 'pair.ok');
  const conf = await C.decryptJSON(ph.encKey, 'l2p', pk.d); assert.strictEqual(conf.t, 'paired'); ok('phone pairs; confirmation decrypts with derived key');
  assert(agent.paired);
  // second phone cannot pair
  const kp2 = await C.generateKeyPair(false); const p2 = new Phone(); await p2.open();
  p2.ws.send(JSON.stringify({ type: 'pair', role: 'phone', id: q.get('l'), code: q.get('c'), pub: C.b64u(kp2.pubRaw) }));
  assert.strictEqual((await p2.wait((m) => m.type === 'pair.err')).reason, 'already_paired'); ok('second phone refused while one is paired');
  // wrong auth refused
  const p3 = new Phone(); await p3.open(); p3.ws.send(JSON.stringify({ type: 'hello', role: 'phone', id: q.get('l'), auth: '0'.repeat(64) }));
  assert.strictEqual((await p3.wait((m) => m.type === 'err')).code, 'auth'); ok('phone with wrong credentials refused');

  // ---- reconnect with persisted credentials (what happens after phone/browser restarts)
  const phone = new Phone(); phone.encKey = sess.encKey; await phone.open();
  phone.ws.send(JSON.stringify({ type: 'hello', role: 'phone', id: q.get('l'), auth: sess.authHex }));
  const ready = await phone.wait((m) => m.type === 'ready'); assert.strictEqual(ready.state, 'online'); assert(ready.ice.length); ok('paired phone reconnects with no re-pairing; sees laptop online');
  await phone.send({ t: 'hi' }); const welcome = await phone.wait((m) => m.t === 'welcome'); phone.sid = welcome.sid; assert(welcome.canStream);
  const live = await phone.wait((m) => m.t === 'live');
  assert(live.status.cpu >= 0 && live.status.memTotalGB > 0 && live.status.net.online); ok('live status: cpu/ram/network from real host');
  // replayed/foreign session ids rejected
  await phone.send({ t: 'view', sid: 'bogus', view: 'apps' }); await phone.wait((m) => m.t === 'resync'); ok('stale session id gets resync');
  await phone.send({ t: 'view', sid: phone.sid, view: 'apps' });
  const apps = await phone.wait((m) => m.t === 'live' && m.view === 'apps' && m.apps); await sleep(0);
  assert(apps.apps.totalProcesses > 0); ok(`running processes from the real OS (${apps.apps.totalProcesses})`);

  // ---- activity tracking -> analytics (drive tracker with synthetic clock, real store)
  const tr = agent.monitor.tracker; const t0 = Date.now() - 600_000;
  for (let i = 0; i <= 60; i++) tr.tick(t0 + i * 2000, { x: 'code', n: 'VS Code' }, false, null);
  for (let i = 61; i <= 100; i++) tr.tick(t0 + i * 2000, { x: 'chrome', n: 'Google Chrome' }, false, { b: 'chrome', d: 'github.com', t: 'Repo' });
  for (let i = 101; i <= 110; i++) tr.tick(t0 + i * 2000, { x: 'chrome', n: 'Google Chrome' }, true, null);
  tr.flush(t0 + 222_000);
  const an = (await phone.req('analytics', { range: 'day' })).data;
  const code = an.apps.find((a) => a.x === 'code'), chrome = an.apps.find((a) => a.x === 'chrome');
  assert(Math.abs(code.ms - 120_000) < 3000, 'code ms ' + code.ms); assert(chrome.ms > 70_000 && chrome.idleMs >= 18_000);
  assert.strictEqual(an.domains[0].d, 'github.com'); assert(an.activeMs > 0 && an.idleMs > 0 && an.timeline.length >= 2); ok('daily analytics: per-app active/idle, domains, timeline');
  const wk = (await phone.req('analytics', { range: 'week' })).data; assert.strictEqual(wk.days.length, 7); assert(wk.days[6].activeMs > 0); ok('weekly analytics');
  const icons = (await phone.req('icons', { keys: ['abc'] })).data; assert('abc' in icons); ok('icon request path');

  // ---- browser extension bridge
  const tok = agent.identity.data.browserToken; const origin = 'chrome-extension://abcdefghijklmnop';
  const snap = JSON.stringify({ browser: 'chrome', instance: 'i1', focusedWindowId: 1, windowFocused: true, tabs: [
    { id: 1, windowId: 1, title: 'PocketMonitor repo', domain: 'github.com', active: true }, { id: 2, windowId: 1, title: 'Inbox', domain: 'mail.example.com', active: false },
    { id: 3, windowId: 2, title: 'SECRET', domain: 'x.test', active: true, incognito: true } ] });
  assert.strictEqual((await post('/v1/snapshot', { 'content-type': 'application/json', origin }, snap)).status, 401); ok('bridge rejects missing token');
  assert.strictEqual((await post('/v1/snapshot', { 'content-type': 'application/json', origin: 'https://evil.example', 'x-pm-token': tok }, snap)).status, 403); ok('bridge rejects web-page origins');
  assert.strictEqual((await post('/v1/snapshot', { 'content-type': 'application/json', origin, 'x-pm-token': tok }, snap)).status, 200);
  await phone.send({ t: 'view', sid: phone.sid, view: 'browser' });
  const br = await phone.wait((m) => m.t === 'live' && m.view === 'browser' && m.browser.connected);
  assert.strictEqual(br.browser.tabs.length, 2); assert(br.browser.tabs.find((t) => t.current && t.domain === 'github.com')); assert(!JSON.stringify(br).includes('SECRET')); ok('browser tabs reach phone; private-window tabs dropped');

  // ---- streaming only on request, stops when viewer leaves
  assert.strictEqual(agent.streamCid, null);
  await phone.send({ t: 'stream.start', sid: phone.sid, quality: 'medium' });
  const st = await phone.wait((m) => m.t === 'stream.state' && m.state === 'relay'); assert(agent.streamCid); ok('stream starts on phone request');
  assert(await agent.pushFrame(Buffer.from('fakejpegbytes')));
  await sleep(300); assert.strictEqual(Buffer.from(phone.frames[0]).toString(), 'fakejpegbytes'); ok('encrypted frame relayed and decrypted by phone');
  phone.ws.close(); await sleep(500); assert.strictEqual(agent.streamCid, null); assert(fakeScreen.stopped); ok('stream stops when viewer disconnects');

  // ---- offline / presence
  const viewer = new Phone(); viewer.encKey = sess.encKey; await viewer.open();
  viewer.ws.send(JSON.stringify({ type: 'hello', role: 'phone', id: q.get('l'), auth: sess.authHex })); await viewer.wait((m) => m.type === 'ready');
  agent.relay.disconnect(); const off = await viewer.wait((m) => m.type === 'presence' && m.state === 'offline'); assert(off.lastSeen > 0); ok('phone sees laptop go offline with last-seen');
  agent.relay.connect(`http://127.0.0.1:${PORT}`); const on = await viewer.wait((m) => m.type === 'presence' && m.state === 'online'); ok('laptop reconnect flips status back automatically');
  await sleep(300);

  // ---- pause broadcasting
  await viewer.send({ t: 'hi' }); await viewer.wait((m) => m.t === 'welcome');
  agent.setBroadcastPaused(true); await viewer.wait((m) => m.type === 'presence' && m.state === 'paused'); ok('pause broadcasting shown to phone'); agent.setBroadcastPaused(false);

  // ---- revoke: only the laptop can do it
  agent.removePhone();
  const gone = await viewer.wait((m) => m.type === 'err' && m.code === 'revoked' || m.type === 'closed'); ok('revocation kicks the phone');
  const again = new Phone(); await again.open(); again.ws.send(JSON.stringify({ type: 'hello', role: 'phone', id: q.get('l'), auth: sess.authHex }));
  assert.strictEqual((await again.wait((m) => m.type === 'err')).code, 'unpaired'); ok('revoked credentials no longer work');
  const o2 = agent.getPairing(); assert(o2 && o2.url !== offer.url); ok('fresh pairing offer available after removal');

  console.log(`\n${passed} checks passed`);
  await agent.stop(); relay.kill(); process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
