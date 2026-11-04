'use strict';
/**
 * PocketMonitor relay.
 *
 * - Serves the phone web app (public/).
 * - Lets the laptop (outbound WebSocket, works behind any NAT) and the single
 *   paired phone find each other.
 * - Forwards opaque, end-to-end encrypted payloads. The relay never has the
 *   keys: it cannot read activity data or screen frames.
 * - Knows only: laptop id, hash of the laptop's secret, hash of the phone's
 *   auth token (supplied by the laptop, the only authority on pairing).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const REGISTRATION_TOKEN = process.env.REGISTRATION_TOKEN || ''; // optional: restrict who may register laptops
const MAX_LAPTOPS = Number(process.env.MAX_LAPTOPS || 200);
const HEARTBEAT_TIMEOUT_MS = 60_000;
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, 'relay-state.json');

/* ---------------------------------------------------------------- state */
let persisted = { laptops: {} };
try { persisted = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(persisted), { mode: 0o600 });
    fs.renameSync(tmp, STATE_FILE);
  }, 200);
}

/** runtime: id -> { ws, state, lastSeen, snap, phones: Map<cid, ws> } */
const runtime = new Map();
function rt(id) {
  let r = runtime.get(id);
  if (!r) { r = { ws: null, state: 'offline', lastSeen: null, snap: null, phones: new Map() }; runtime.set(id, r); }
  return r;
}

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
function safeEq(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/* ------------------------------------------------------ ICE / TURN */
function iceServers() {
  let list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.ICE_SERVERS) { try { list = JSON.parse(process.env.ICE_SERVERS); } catch { /* ignore */ } }
  if (process.env.TURN_URLS && process.env.TURN_SECRET) {
    // coturn "use-auth-secret" time-limited credentials
    const username = String(Math.floor(Date.now() / 1000) + 6 * 3600);
    const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
    list.push({ urls: process.env.TURN_URLS.split(','), username, credential });
  }
  return list;
}

/* ------------------------------------------------------------ HTTP */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    const noCache = ext === '.html' || rel === '/sw.js' || ext === '.webmanifest';
    res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600' });
    res.end(buf);
  });
});

/* ------------------------------------------------------- WebSocket */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });

// crude per-IP failure limiter
const fails = new Map();
function tooManyFails(ip) { const f = fails.get(ip); return f && f.n >= 12 && Date.now() - f.t < 60_000; }
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.t > 60_000) fails.set(ip, { n: 1, t: Date.now() }); else f.n++;
}
setInterval(() => { for (const [ip, f] of fails) if (Date.now() - f.t > 60_000) fails.delete(ip); }, 60_000).unref();

const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
let cidSeq = 0;

function presence(id) {
  const r = rt(id);
  return { state: r.state, lastSeen: r.lastSeen };
}
function broadcastPresence(id) {
  const r = rt(id);
  for (const p of r.phones.values()) send(p, { type: 'presence', ...presence(id) });
}

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  ws.isAlive = true;
  ws.role = null; ws.laptopId = null; ws.cid = null;
  ws.on('pong', () => {
    ws.isAlive = true;
    if (ws.role === 'laptop') { const r = rt(ws.laptopId); r.lastSeen = Date.now(); }
  });

  const authTimer = setTimeout(() => { if (!ws.role) ws.close(4000, 'hello timeout'); }, 10_000);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return onBinary(ws, data);
    if (data.length > 256 * 1024) return ws.close(1009);
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (!ws.role) { clearTimeout(authTimer); return onHello(ws, m, ip); }
    if (ws.role === 'laptop') onLaptop(ws, m); else onPhone(ws, m, ip);
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (ws.role === 'laptop') {
      const r = rt(ws.laptopId);
      if (r.ws === ws) {
        r.ws = null;
        r.lastSeen = Date.now();
        r.state = r.declared === 'sleeping' ? 'sleeping' : 'offline';
        broadcastPresence(ws.laptopId);
      }
    } else if (ws.role === 'phone' && ws.cid) {
      const r = rt(ws.laptopId);
      r.phones.delete(ws.cid);
      send(r.ws, { type: 'phone.down', cid: ws.cid, remaining: r.phones.size });
    }
  });
  ws.on('error', () => {});
});

function onHello(ws, m, ip) {
  if (tooManyFails(ip)) { send(ws, { type: 'err', code: 'rate' }); return ws.close(4029); }
  if (!m || !ID_RE.test(m.id || '')) { noteFail(ip); return ws.close(4400, 'bad id'); }
  const id = m.id;

  if (m.type === 'hello' && m.role === 'laptop') {
    let rec = persisted.laptops[id];
    if (!rec) {
      if (Object.keys(persisted.laptops).length >= MAX_LAPTOPS) { send(ws, { type: 'err', code: 'full' }); return ws.close(4503); }
      if (REGISTRATION_TOKEN && !safeEq(m.regToken || '', REGISTRATION_TOKEN)) { noteFail(ip); send(ws, { type: 'err', code: 'registration' }); return ws.close(4401); }
      if (typeof m.secret !== 'string' || m.secret.length < 32) { noteFail(ip); return ws.close(4400); }
      rec = persisted.laptops[id] = { secretHash: sha256hex(m.secret), phoneAuthHash: null, created: Date.now() };
    } else if (!safeEq(sha256hex(String(m.secret || '')), rec.secretHash)) {
      noteFail(ip); send(ws, { type: 'err', code: 'auth' }); return ws.close(4401);
    }
    // The laptop is the source of truth for which phone (if any) is paired.
    rec.phoneAuthHash = /^[0-9a-f]{64}$/.test(m.phoneAuthHash || '') ? m.phoneAuthHash : null;
    save();

    const r = rt(id);
    if (r.ws && r.ws !== ws) { try { r.ws.close(4002, 'replaced'); } catch { /* */ } }
    ws.role = 'laptop'; ws.laptopId = id;
    r.ws = ws; r.state = 'online'; r.declared = 'awake'; r.lastSeen = Date.now();
    send(ws, { type: 'ready', ice: iceServers(), phones: r.phones.size });
    for (const cid of r.phones.keys()) send(ws, { type: 'phone.up', cid });
    broadcastPresence(id);
    return;
  }

  if (m.type === 'hello' && m.role === 'phone') {
    const rec = persisted.laptops[id];
    const ok = rec && rec.phoneAuthHash && /^[0-9a-f]{64}$/.test(m.auth || '') && safeEq(sha256hex(m.auth), rec.phoneAuthHash);
    if (!ok) { noteFail(ip); send(ws, { type: 'err', code: rec && !rec.phoneAuthHash ? 'unpaired' : 'auth' }); return ws.close(4003); }
    const r = rt(id);
    ws.role = 'phone'; ws.laptopId = id; ws.cid = 'c' + (++cidSeq).toString(36) + crypto.randomBytes(3).toString('hex');
    r.phones.set(ws.cid, ws);
    send(ws, { type: 'ready', cid: ws.cid, ice: iceServers(), ...presence(id), snap: r.snap });
    send(r.ws, { type: 'phone.up', cid: ws.cid });
    return;
  }

  if (m.type === 'pair' && m.role === 'phone') {
    const rec = persisted.laptops[id];
    if (!rec) { noteFail(ip); send(ws, { type: 'pair.err', reason: 'unknown_laptop' }); return ws.close(4004); }
    if (rec.phoneAuthHash) { send(ws, { type: 'pair.err', reason: 'already_paired' }); return ws.close(4005); }
    const r = rt(id);
    if (!r.ws) { send(ws, { type: 'pair.err', reason: 'laptop_offline' }); return ws.close(4006); }
    if (typeof m.code !== 'string' || typeof m.pub !== 'string' || m.code.length > 100 || m.pub.length > 200) return ws.close(4400);
    ws.role = 'pairing'; ws.laptopId = id; ws.cid = 'p' + (++cidSeq).toString(36) + crypto.randomBytes(3).toString('hex');
    r.phones.set(ws.cid, ws); // so the laptop's reply can be routed; auth-less pairing sockets get nothing else
    send(r.ws, { type: 'pair.req', cid: ws.cid, code: m.code, pub: m.pub });
    return;
  }
  noteFail(ip); ws.close(4400);
}

function onLaptop(ws, m) {
  const id = ws.laptopId; const r = rt(id);
  r.lastSeen = Date.now();
  switch (m.type) {
    case 'hb':
      if (m.state === 'sleeping' || m.state === 'awake' || m.state === 'paused') {
        r.declared = m.state;
        r.state = m.state === 'sleeping' ? 'sleeping' : m.state === 'paused' ? 'paused' : 'online';
        broadcastPresence(id);
      }
      break;
    case 'snap': // opaque encrypted last-known status, cached for the phone
      if (typeof m.d === 'string' && m.d.length < 64 * 1024) r.snap = m.d;
      break;
    case 'l2p': {
      if (typeof m.d !== 'string') break;
      const msg = { type: 'm', d: m.d };
      if (m.cid) { const p = r.phones.get(m.cid); if (p && p.role === 'phone') send(p, msg); }
      else for (const p of r.phones.values()) if (p.role === 'phone') send(p, msg);
      break;
    }
    case 'pair.res': {
      const p = r.phones.get(m.cid);
      if (!p || p.role !== 'pairing') break;
      if (m.ok && /^[0-9a-f]{64}$/.test(m.authHash || '')) {
        persisted.laptops[id].phoneAuthHash = m.authHash; save();
        send(p, { type: 'pair.ok', d: m.d });
      } else send(p, { type: 'pair.err', reason: String(m.reason || 'rejected').slice(0, 40) });
      r.phones.delete(m.cid); try { p.close(1000); } catch { /* */ }
      break;
    }
    case 'unpair': {
      persisted.laptops[id].phoneAuthHash = null; save();
      for (const [cid, p] of r.phones) { send(p, { type: 'err', code: 'revoked' }); try { p.close(4007, 'revoked'); } catch { /* */ } r.phones.delete(cid); }
      r.snap = null;
      send(ws, { type: 'unpaired' });
      break;
    }
    default: break;
  }
}

function onPhone(ws, m) {
  if (ws.role !== 'phone') return; // pairing sockets may not talk
  const r = rt(ws.laptopId);
  if (m.type === 'p2l' && typeof m.d === 'string' && m.d.length < 64 * 1024) send(r.ws, { type: 'p2l', cid: ws.cid, d: m.d });
}

// binary frames: laptop -> phones (screen frames). Dropped for slow phones.
function onBinary(ws, data) {
  if (ws.role !== 'laptop') return;
  const r = rt(ws.laptopId);
  for (const p of r.phones.values()) {
    if (p.role === 'phone' && p.bufferedAmount < 1_500_000) p.send(data, { binary: true });
  }
}

/* ------------------------------------------------------- liveness */
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch { /* */ }
  }
  for (const [id, r] of runtime) {
    if (r.ws && now - (r.lastSeen || 0) > HEARTBEAT_TIMEOUT_MS) { try { r.ws.terminate(); } catch { /* */ } }
    void id;
  }
}, 20_000).unref();

server.listen(PORT, () => console.log(`PocketMonitor relay listening on :${PORT}  (data: ${DATA_DIR})`));
module.exports = { server, wss };
