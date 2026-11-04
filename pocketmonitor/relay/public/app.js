'use strict';
/* PocketMonitor phone app: pairing, persistent encrypted connection, and the five views. */
(function () {
const C = window.PMCrypto;
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');

/* ------------------------------------------------------------------ utils */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dur(ms) {
  ms = Math.max(0, Math.round(ms / 1000)); if (ms < 60) return ms + 's';
  const m = Math.floor(ms / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
function ago(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000); if (s < 10) return 'just now'; if (s < 60) return s + 's ago';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const pct = (n) => Math.max(0, Math.min(100, Math.round(n)));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shiftDay = (key, n) => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d + n, 12); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
const dayLabel = (key) => key === todayKey() ? 'Today' : key === shiftDay(todayKey(), -1) ? 'Yesterday' : new Date(key + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const BROWSER_NAMES = { chrome: 'Chrome', edge: 'Edge' };
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

/* ---------------------------------------------------------------- storage */
const DB = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => { const r = indexedDB.open('pocketmonitor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return this._db;
  },
  async get(k) { try { const db = await this.open(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; } },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; }); },
};

/* ------------------------------------------------------------------ state */
const S = {
  pairing: null,            // { id, host, encKey, auth, pairedAt }
  tab: 'overview',
  presence: { state: 'offline', lastSeen: null }, connected: false, welcomed: false, revoked: false,
  live: null, snap: null, ice: [], sid: null, host: '', canStream: false, paused: false,
  icons: {}, iconPending: new Set(),
  analytics: { range: 'day', date: todayKey(), data: null, loading: false },
  appsMode: 'now',
  quality: localStorage.getItem('pm.q') || 'auto', display: '',
};

/* -------------------------------------------------------------- connection */
const Conn = {
  ws: null, backoff: 800, timer: null, reqs: new Map(), stopped: false, helloTimer: null, lastPresenceState: null,

  start() { this.stopped = false; this.open(); },
  stop() { this.stopped = true; clearTimeout(this.timer); if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; } },
  open() {
    clearTimeout(this.timer);
    if (!S.pairing || this.stopped) return;
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.binaryType = 'arraybuffer'; this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'phone', id: S.pairing.id, auth: S.pairing.auth }));
    ws.onmessage = (e) => this.onMessage(e);
    ws.onclose = (e) => {
      if (this.ws !== ws) return; this.ws = null; S.connected = false; S.welcomed = false; Live.onConnLost(); render(true);
      if (e.code === 4003 || e.code === 4007) return; // handled via err message
      if (!this.stopped) this.timer = setTimeout(() => this.open(), Math.min(this.backoff *= 1.7, 12000) * (0.8 + Math.random() * 0.4));
    };
    ws.onerror = () => {};
  },
  async onMessage(e) {
    if (typeof e.data !== 'string') { try { const b = new Uint8Array(e.data); Live.onFrame(await C.decryptBytes(S.pairing.encKey, 'l2p-frame', b.subarray(1))); } catch { /* bad frame */ } return; }
    const m = JSON.parse(e.data);
    switch (m.type) {
      case 'ready':
        this.backoff = 800; S.connected = true; S.ice = m.ice || []; S.presence = { state: m.state, lastSeen: m.lastSeen }; this.lastPresenceState = null;
        if (m.snap) { try { const x = await C.decryptJSON(S.pairing.encKey, 'l2p', m.snap); S.snap = x; if (!S.live) S.live = { status: x.status, active: x.active, stale: true }; } catch { /* */ } }
        this.hi(); render(true); break;
      case 'presence': {
        const prev = S.presence.state; S.presence = { state: m.state, lastSeen: m.lastSeen };
        if ((m.state === 'online' || m.state === 'paused') && prev !== m.state) this.hi();
        if (m.state === 'offline' || m.state === 'sleeping') { S.welcomed = false; Live.onConnLost(); }
        render(true); break;
      }
      case 'm': { let msg; try { msg = await C.decryptJSON(S.pairing.encKey, 'l2p', m.d); } catch { return; } this.onApp(msg); break; }
      case 'err':
        if (m.code === 'revoked' || m.code === 'unpaired' || m.code === 'auth') { S.revoked = m.code; Conn.stop(); Live.stop(true); render(); }
        break;
      default: break;
    }
  },
  hi() {
    S.welcomed = false; clearTimeout(this.helloTimer);
    this.rawSend({ t: 'hi' });
    let tries = 0; const again = () => { if (S.welcomed || !this.ws || tries++ > 5) return; this.rawSend({ t: 'hi' }); this.helloTimer = setTimeout(again, 3000); };
    this.helloTimer = setTimeout(again, 3000);
  },
  async rawSend(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const d = await C.encryptJSON(S.pairing.encKey, 'p2l', obj); if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'p2l', d })); return true;
  },
  send(obj) { return this.rawSend({ ...obj, sid: S.sid }); },
  request(op, params) {
    return new Promise((res, rej) => {
      const id = Math.random().toString(36).slice(2); this.reqs.set(id, { res, rej });
      this.send({ t: 'req', id, op, params }); setTimeout(() => { if (this.reqs.delete(id)) rej(new Error('timeout')); }, 15000);
    });
  },
  onApp(m) {
    switch (m.t) {
      case 'welcome':
        S.welcomed = true; S.sid = m.sid; S.host = m.host; S.canStream = m.canStream; S.paused = !!(m.paused && m.paused.broadcast);
        this.send({ t: 'view', view: S.tab }); Live.onWelcome(); render(true); break;
      case 'resync': this.hi(); break;
      case 'live':
        S.paused = false; S.live = m; S.presence.lastSeen = m.status.ts; S.snap = null; fetchIcons(m); onLive(); break;
      case 'paused': S.paused = true; render(true); break;
      case 'res': { const r = this.reqs.get(m.id); if (r) { this.reqs.delete(m.id); m.error ? r.rej(new Error(m.error)) : r.res(m.data); } break; }
      case 'stream.state': Live.onState(m); break;
      case 'stream.signal': Live.onSignal(m); break;
      default: break;
    }
  },
};

/* ----------------------------------------------------------------- icons */
async function loadIcons() { S.icons = (await DB.get('icons')) || {}; }
function fetchIcons(m) {
  const keys = new Set();
  if (m.apps) [...m.apps.windowed, ...m.apps.background].forEach((a) => a.icon && keys.add(a.icon));
  if (m.active && m.active.icon) keys.add(m.active.icon);
  const need = [...keys].filter((k) => !(k in S.icons) && !S.iconPending.has(k)).slice(0, 30);
  if (!need.length) return;
  need.forEach((k) => S.iconPending.add(k));
  Conn.request('icons', { keys: need }).then((r) => {
    for (const k of need) { S.iconPending.delete(k); S.icons[k] = r[k] || null; }
    DB.set('icons', S.icons).catch(() => {}); render(true);
  }).catch(() => need.forEach((k) => S.iconPending.delete(k)));
}
const icon = (key, name) => `<div class="appicon">${key && S.icons[key] ? `<img alt="" src="${esc(S.icons[key])}">` : esc((name || '?').trim().charAt(0).toUpperCase())}</div>`;

/* ----------------------------------------------------------- derived state */
function effectiveState() {
  if (!S.connected) return { key: 'offline', label: navigator.onLine ? 'Connecting…' : 'Phone offline', sub: navigator.onLine ? 'Reaching PocketMonitor relay' : 'Your phone has no internet' };
  const st = S.presence.state;
  if (st === 'online') return { key: 'online', label: 'Online', sub: S.live && S.live.status && !S.live.stale ? statusLine(S.live.status) : 'Updating…' };
  if (st === 'paused') return { key: 'paused', label: 'Paused', sub: 'Broadcasting paused on the laptop' };
  if (st === 'sleeping') return { key: 'sleeping', label: 'Sleeping', sub: 'Last seen ' + ago(S.presence.lastSeen) };
  return { key: 'offline', label: 'Offline', sub: 'Unreachable · last seen ' + ago(S.presence.lastSeen) };
}
function statusLine(s) { const bits = []; bits.push(s.locked ? 'Locked' : s.idle ? 'Idle' : 'In use'); if (s.net && s.net.kind) bits.push(s.net.kind); return bits.join(' · '); }

/* ----------------------------------------------------------------- render */
let renderQueued = false;
function render(soft) {
  if (soft) { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; draw(); }); return; }
  draw();
}
function setChrome(on) { $('#top').hidden = !on; $('#nav').hidden = !on; }

function draw() {
  if (!window.isSecureContext || !window.crypto || !crypto.subtle) {
    setChrome(false);
    view.innerHTML = `<div class="center"><img class="logo" src="icon-192.png" alt=""><h2>Secure connection needed</h2><p>PocketMonitor encrypts everything end to end, which requires HTTPS. Open the HTTPS address of your PocketMonitor relay.</p></div>`; return;
  }
  const route = parseRoute();
  if (route.pair) return drawPair(route.pair);
  if (!S.pairing) { setChrome(false); view.innerHTML = `<div class="center"><img class="logo" src="icon-192.png" alt=""><h2>Pair with your laptop</h2><p>Open PocketMonitor on your Windows laptop and scan the QR code with this phone's camera. You only ever do this once.</p></div>`; return; }
  if (S.revoked) { setChrome(false); drawRevoked(); return; }
  setChrome(true); drawTop();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const fn = { overview: drawOverview, live: drawLive, apps: drawApps, browser: drawBrowser, analytics: drawAnalytics }[S.tab];
  if (S.tab === 'live') { drawLive(); return; }
  const y = view.scrollTop; fn(); view.scrollTop = y;
}

function drawTop() {
  const e = effectiveState();
  $('#topDot').className = 'dot ' + e.key; $('#topName').textContent = S.pairing.host || 'Laptop'; $('#topSub').textContent = e.label + ' · ' + e.sub;
}

function drawRevoked() {
  view.innerHTML = `<div class="center"><img class="logo" src="icon-192.png" alt=""><h2>${S.revoked === 'revoked' ? 'This phone was removed' : 'Pairing not recognised'}</h2>
  <p>${S.revoked === 'revoked' ? 'The laptop owner removed this phone.' : 'The laptop no longer trusts this phone.'} To pair again, open PocketMonitor on the laptop, choose “Remove phone”, then scan the new QR code.</p>
  <button class="btn ghost" id="forget">Forget this laptop on the phone</button></div>`;
  $('#forget').onclick = async () => { await forget(); location.hash = ''; render(); };
}

function banner(text) { return `<div class="banner">${text}</div>`; }

/* ---------- overview */
function metricBar(label, value, extra) {
  const cls = value > 90 ? 'bad' : value > 75 ? 'warn' : '';
  return `<div class="metric"><div class="l">${label}</div><div class="v">${pct(value)}%</div><div class="bar ${cls}"><i style="width:${pct(value)}%"></i></div>${extra ? `<div class="small muted" style="margin-top:4px">${extra}</div>` : ''}</div>`;
}
function drawOverview() {
  const e = effectiveState(); const L = S.live; const st = L && L.status; const stale = !S.connected || S.presence.state !== 'online';
  let html = '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && !localStorage.getItem('pm.hint')) html += `<div class="banner row sp" style="gap:10px"><span>📲 Add PocketMonitor to your home screen for one-tap access.</span><span class="row" style="gap:6px"><button class="chip" id="hintHow">How</button><button class="chip" id="hintX">✕</button></span></div>`;
  if (S.paused || S.presence.state === 'paused') html += banner('<b>Paused.</b> The laptop owner has paused broadcasting. Activity is not being shared right now.');
  html += `<div class="card"><div class="hero"><span class="dot ${e.key}" style="width:16px;height:16px"></span><div><div class="big">${e.label}</div><div class="muted small">${esc(e.sub)}</div></div></div>`;
  if (stale && st) html += `<div class="small muted" style="margin-top:10px">Showing last known values from ${ago(st.ts)}.</div>`;
  html += `</div>`;
  if (st) {
    const b = st.battery;
    html += `<div class="card"><div class="grid2">
      ${b ? `<div class="metric"><div class="l">Battery</div><div class="v">${pct(b.pct)}%</div><div class="bar ${b.charging ? 'ok' : b.pct < 20 ? 'bad' : b.pct < 40 ? 'warn' : 'ok'}"><i style="width:${pct(b.pct)}%"></i></div><div class="small muted" style="margin-top:4px">${b.charging ? '⚡ Charging' : 'On battery'}</div></div>` : `<div class="metric"><div class="l">Battery</div><div class="v">—</div><div class="small muted">${st.hasBattery === false ? 'No battery · plugged in' : 'Reading…'}</div></div>`}
      <div class="metric"><div class="l">Network</div><div class="v" style="font-size:18px">${st.net && st.net.online ? '● Connected' : '○ Offline'}</div><div class="small muted">${esc((st.net && st.net.kind) || '')}${st.net && st.net.rtt != null ? ' · ' + st.net.rtt + ' ms' : ''}</div></div>
      ${metricBar('CPU', st.cpu)}
      ${metricBar('Memory', st.memPct, `${st.memUsedGB} / ${st.memTotalGB} GB`)}
    </div>
    <div class="small muted" style="margin-top:12px">${st.locked ? '🔒 Screen locked' : st.idle ? '💤 Idle for ' + dur(st.idleSec * 1000) : '● In use'} · Up ${dur(st.uptimeSec * 1000)}</div></div>`;
  }
  if (L && L.active) {
    const a = L.active;
    html += `<div class="card"><h3>Right now</h3><div class="row">${icon(a.icon, a.name)}<div class="grow" style="min-width:0"><div style="font-weight:650">${esc(a.name)}</div><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title || '')}</div></div>
      <div class="small muted" style="text-align:right">${a.idle ? 'Idle' : 'Active'}<br>${a.activeMs != null ? dur(a.activeMs) + ' today' : ''}</div></div>`;
    const t = L.browser && L.browser.tabs && L.browser.tabs[0];
    if (t) html += `<div class="item" style="display:flex;gap:10px;border-top:1px solid var(--line);margin-top:12px;padding-top:12px"><div class="appicon">🌐</div><div class="grow" style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div><div class="small muted">${esc(t.domain)} · ${BROWSER_NAMES[t.browser] || t.browser}</div></div></div>`;
    html += `</div>`;
  }
  if (st) {
    const tot = st.today.activeMs + st.today.idleMs;
    html += `<div class="card"><h3>Today</h3><div class="row sp"><div><div class="metric"><div class="v">${dur(st.today.activeMs)}</div><div class="l">Active</div></div></div><div><div class="metric"><div class="v" style="color:var(--muted)">${dur(st.today.idleMs)}</div><div class="l">Idle</div></div></div></div>
      <div class="bar" style="margin-top:12px"><i style="width:${tot ? pct(st.today.activeMs / tot * 100) : 0}%"></i></div>`;
    if (L.top && L.top.length) { const max = L.top[0].activeMs || 1; html += `<div style="margin-top:12px">` + L.top.slice(0, 4).map((a, i) => `<div class="hb"><span class="n">${esc(a.name)}</span><span class="b"><i style="width:${pct(a.activeMs / max * 100)}%;background:${COLORS[i % 6]}"></i></span><span class="m">${dur(a.activeMs)}</span></div>`).join('') + `</div>`; }
    html += `</div>`;
  }
  html += `<button class="btn" id="goLive" ${S.connected && S.presence.state === 'online' && S.canStream ? '' : 'disabled'}>🖥  Watch live screen</button>`;
  if (!st) html += `<div class="center muted">${S.connected ? 'Waiting for the laptop…' : 'Connecting…'}</div>`;
  view.innerHTML = html;
  const g = $('#goLive'); if (g) g.onclick = () => setTab('live');
  const hh = $('#hintHow'); if (hh) hh.onclick = showInstallHint; const hx = $('#hintX'); if (hx) hx.onclick = () => { try { localStorage.setItem('pm.hint', '1'); } catch { /* */ } render(); };
}

/* ---------- apps */
function appRow(a) {
  const chip = a.status === 'active' ? '<span class="chip active">● In front</span>' : a.status === 'open' ? '<span class="chip open">Open</span>' : '<span class="chip">Background</span>';
  return `<div class="item">${icon(a.icon, a.name)}<div class="grow"><div class="t">${esc(a.name)} ${chip}</div><div class="s">${a.title ? esc(a.title) + ' · ' : ''}${a.cpu}% CPU · ${a.memMB} MB${a.count > 1 ? ' · ' + a.count + ' processes' : ''}</div></div><div class="r">${dur(a.activeMs)}<div class="small muted">today</div></div></div>`;
}
function drawApps() {
  let html = `<div class="seg"><button data-m="now" class="${S.appsMode === 'now' ? 'on' : ''}">Running now</button><button data-m="history" class="${S.appsMode === 'history' ? 'on' : ''}">History</button></div>`;
  if (S.appsMode === 'now') {
    const A = S.live && S.live.apps;
    if (!A) html += `<div class="center muted">${S.connected ? 'Loading applications…' : 'Waiting for connection…'}</div>`;
    else {
      const act = S.live.active;
      if (act) html += `<div class="card"><h3>In the foreground</h3><div class="row">${icon(act.icon, act.name)}<div class="grow"><div style="font-weight:650">${esc(act.name)}</div><div class="small muted">${act.idle ? 'Idle' : 'Actively used'} · ${dur(act.activeMs || 0)} today</div></div></div></div>`;
      html += `<div class="card"><h3>Open apps · ${A.windowed.length}</h3><div class="list">${A.windowed.map(appRow).join('') || '<div class="muted">None</div>'}</div></div>`;
      html += `<div class="card"><h3>Running in background · top ${A.background.length} of ${A.totalProcesses}</h3><div class="list">${A.background.map(appRow).join('')}</div></div>`;
    }
  } else html += analyticsDay('apps');
  view.innerHTML = html;
  view.querySelectorAll('.seg button').forEach((b) => b.onclick = () => { S.appsMode = b.dataset.m; if (S.appsMode === 'history') { if (S.analytics.range !== 'day') { S.analytics.range = 'day'; S.analytics.data = null; } loadAnalytics(); } render(); });
  wireDateNav();
}

/* ---------- browser */
function drawBrowser() {
  const B = S.live && S.live.browser; let html = '';
  if (!B) html += `<div class="center muted">${S.connected ? 'Loading browser activity…' : 'Waiting for connection…'}</div>`;
  else if (B.enabled === false) html += `<div class="card"><h3>Browser monitoring is off</h3><div class="muted">Turn it on in PocketMonitor on the laptop to see tabs here.</div></div>`;
  else if (!B.connected) html += `<div class="card"><h3>Browser extension not connected</h3><div class="muted">Install the PocketMonitor extension in Chrome or Edge (steps in the laptop app, under Browser). It shares only tab titles and website domains — never page contents, passwords, form data or private windows.</div></div>`;
  else {
    const cur = B.tabs.find((t) => t.current);
    html += cur ? `<div class="card"><h3>Active tab · ${BROWSER_NAMES[cur.browser] || cur.browser}</h3><div style="font-weight:650;font-size:17px">${esc(cur.title)}</div><div class="muted">${esc(cur.domain)} · ${dur(cur.ms)} today</div></div>`
      : `<div class="card"><h3>Active tab</h3><div class="muted">No browser is in front right now.</div></div>`;
    for (const br of B.browsers) {
      const tabs = B.tabs.filter((t) => t.browser === br);
      html += `<div class="card"><h3>${BROWSER_NAMES[br] || br} · ${tabs.length} open tabs</h3><div class="list">${tabs.map((t) => `<div class="item"><div class="appicon">${t.audible ? '🔊' : '🌐'}</div><div class="grow"><div class="t">${esc(t.title || t.domain)} ${t.current ? '<span class="chip active">Viewing</span>' : t.visible ? '<span class="chip open">Visible</span>' : ''}</div><div class="s">${esc(t.domain)}${t.pinned ? ' · pinned' : ''}</div></div><div class="r">${dur(t.ms)}</div></div>`).join('')}</div></div>`;
    }
  }
  html += analyticsDay('browser');
  view.innerHTML = html; wireDateNav();
  if (!S.analytics.data) loadAnalytics();
}

/* ---------- analytics (shared builders) */
function loadAnalytics() {
  const a = S.analytics; if (a.loading) return; a.loading = true;
  Conn.request('analytics', { range: a.range, date: a.date }).then((d) => { a.data = d; a.loading = false; render(true); }).catch(() => { a.loading = false; });
}
function dateNav() {
  const a = S.analytics; const isToday = a.date >= todayKey();
  return `<div class="datenav"><button data-d="-1">‹</button><b>${a.range === 'week' ? 'Week to ' : ''}${dayLabel(a.date)}</b><button data-d="1" ${isToday ? 'disabled' : ''}>›</button></div>`;
}
function wireDateNav() {
  view.querySelectorAll('.datenav button').forEach((b) => b.onclick = () => { const a = S.analytics; a.date = shiftDay(a.date, +b.dataset.d * (a.range === 'week' ? 7 : 1)); a.data = null; loadAnalytics(); render(); });
}
function hbars(items, key, label, valFn, colorFromIndex) {
  const max = Math.max(1, ...items.map(valFn));
  return items.map((it, i) => `<div class="hb"><span class="n">${esc(label(it))}</span><span class="b"><i style="width:${pct(valFn(it) / max * 100)}%;background:${colorFromIndex ? COLORS[i % 6] : 'var(--brand)'}"></i></span><span class="m">${dur(valFn(it))}</span></div>`).join('') || '<div class="muted">No data yet</div>';
}
function donut(active, idle) {
  const tot = active + idle || 1; const r = 42, c = 2 * Math.PI * r; const a = active / tot * c;
  return `<svg class="chart" viewBox="0 0 110 110" width="116" height="116"><circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--idle)" stroke-width="13"/><circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--brand)" stroke-width="13" stroke-dasharray="${a} ${c - a}" transform="rotate(-90 55 55)" stroke-linecap="butt"/><text x="55" y="53" text-anchor="middle" style="font-size:17px;font-weight:700;fill:var(--ink)">${Math.round(active / tot * 100)}%</text><text x="55" y="68" text-anchor="middle">active</text></svg>`;
}
function hourly(hours) {
  const max = Math.max(1, ...hours); const w = 300, h = 80;
  return `<svg class="chart" viewBox="0 0 ${w} ${h + 16}" width="100%">${hours.map((v, i) => { const bh = v / max * h; return `<rect x="${i * 12.5 + 1}" y="${h - bh}" width="10" height="${Math.max(bh, v ? 2 : 0)}" rx="2" fill="var(--brand)" opacity="${v ? 1 : .15}"/>`; }).join('')}${[0, 6, 12, 18].map((i) => `<text x="${i * 12.5}" y="${h + 13}">${i === 0 ? '12a' : i === 12 ? '12p' : i % 12 + (i < 12 ? 'a' : 'p')}</text>`).join('')}</svg>`;
}
function timeline(segs, dayKey) {
  if (!segs.length) return '<div class="muted">No activity recorded</div>';
  const [y, m, d] = dayKey.split('-').map(Number); const t0 = new Date(y, m - 1, d).getTime(); const span = 86400000;
  const names = [...new Set(segs.filter((s) => s.k === 'a').map((s) => s.x))]; const col = (x) => COLORS[names.indexOf(x) % 6];
  const rects = segs.map((s) => { const x = Math.max(0, (s.s - t0) / span * 300); const w = Math.max(.8, (Math.min(s.e, t0 + span) - s.s) / span * 300); return `<rect x="${x.toFixed(1)}" y="${s.k === 'a' ? 0 : 18}" width="${w.toFixed(1)}" height="${s.k === 'a' ? 32 : 14}" fill="${s.k === 'a' ? col(s.x) : 'var(--idle)'}"><title>${esc(s.n)}</title></rect>`; }).join('');
  return `<svg class="chart" viewBox="0 0 300 54" width="100%" preserveAspectRatio="none" style="height:54px;border-radius:8px;background:var(--track)">${rects}</svg><div class="row sp small muted"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>`;
}
function weekBars(days) {
  const max = Math.max(1, ...days.map((d) => d.activeMs + d.idleMs)); const h = 100;
  return `<svg class="chart" viewBox="0 0 300 ${h + 18}" width="100%">${days.map((d, i) => { const ah = d.activeMs / max * h, ih = d.idleMs / max * h; const x = i * 43 + 6; const wd = new Date(d.date + 'T12:00').toLocaleDateString([], { weekday: 'short' });
    return `<rect x="${x}" y="${h - ah - ih}" width="30" height="${ih}" fill="var(--idle)" rx="3"/><rect x="${x}" y="${h - ah}" width="30" height="${ah}" fill="var(--brand)" rx="3"/><text x="${x + 15}" y="${h + 13}" text-anchor="middle">${wd}</text><text x="${x + 15}" y="${h - ah - ih - 3}" text-anchor="middle" style="font-size:9px">${d.activeMs ? Math.round(d.activeMs / 360000) / 10 + 'h' : ''}</text>`; }).join('')}</svg>`;
}

function analyticsDay(section) {
  const a = S.analytics; const d = a.data;
  if (section === 'apps' || section === 'browser') {
    // history blocks used under Apps/Browser tabs are day-based
    if (a.range === 'week' && !(d && d.range === 'day')) { /* reuse loaded data */ }
    if (!d) return `<div class="center muted">Loading history…</div>`;
    if (section === 'apps') return dateNav() + `<div class="card"><h3>App usage</h3>${hbars(d.apps.slice(0, 12), 'x', (x) => x.n, (x) => x.ms, true)}</div>` +
      (d.sessions ? `<div class="card"><h3>Recent sessions</h3><div class="list">${d.sessions.slice(0, 25).map((s) => `<div class="item"><div class="grow"><div class="t">${esc(s.n)}</div><div class="s">${new Date(s.s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(s.e).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div><div class="r">${dur(s.ms)}</div></div>`).join('') || '<div class="muted">None</div>'}</div></div>` : '');
    return (S.tab === 'browser' ? dateNav() : '') + `<div class="card"><h3>Browser time</h3>${hbars(d.browsers || [], 'b', (x) => BROWSER_NAMES[x.b] || x.b, (x) => x.ms, true)}</div>` +
      `<div class="card"><h3>Top websites</h3>${hbars((d.domains || []).slice(0, 10), 'd', (x) => x.d, (x) => x.ms, false)}</div>` +
      `<div class="card"><h3>Recently visited tabs</h3><div class="list">${(d.recentTabs || []).slice(0, 15).map((t) => `<div class="item"><div class="appicon">🌐</div><div class="grow"><div class="t">${esc(t.t || t.d)}</div><div class="s">${esc(t.d)} · ${esc(BROWSER_NAMES[t.b] || t.b)} · ${new Date(t.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div><div class="r">${dur(t.ms)}</div></div>`).join('') || '<div class="muted">None yet</div>'}</div></div>`;
  }
  return '';
}
function drawAnalytics() {
  const a = S.analytics; const d = a.data;
  let html = `<div class="seg"><button data-r="day" class="${a.range === 'day' ? 'on' : ''}">Day</button><button data-r="week" class="${a.range === 'week' ? 'on' : ''}">Week</button></div>` + dateNav();
  if (!d || d.range !== a.range) html += `<div class="center muted">Loading…</div>`;
  else if (a.range === 'day') {
    html += `<div class="card"><div class="row sp"><div>${donut(d.activeMs, d.idleMs)}</div><div style="flex:1;padding-left:16px"><div class="metric"><div class="v">${dur(d.activeMs)}</div><div class="l">Active</div></div><div class="spacer"></div><div class="metric"><div class="v" style="color:var(--muted)">${dur(d.idleMs)}</div><div class="l">Idle</div></div>${d.first ? `<div class="small muted" style="margin-top:8px">${new Date(d.first).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(d.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>` : ''}</div></div></div>
      <div class="card"><h3>Timeline</h3>${timeline(d.timeline, d.date)}</div>
      <div class="card"><h3>Active by hour</h3>${hourly(d.hourly.map((v) => v / 60000))}</div>
      <div class="card"><h3>Applications</h3>${hbars(d.apps.slice(0, 10), 'x', (x) => x.n, (x) => x.ms, true)}</div>
      <div class="card"><h3>Browsers</h3>${hbars(d.browsers, 'b', (x) => BROWSER_NAMES[x.b] || x.b, (x) => x.ms, true)}</div>
      <div class="card"><h3>Top websites</h3>${hbars(d.domains.slice(0, 8), 'd', (x) => x.d, (x) => x.ms, false)}</div>`;
  } else {
    const avg = d.days.filter((x) => x.activeMs).length || 1;
    html += `<div class="card"><h3>Active vs idle, per day</h3>${weekBars(d.days)}<div class="row small muted" style="gap:14px;margin-top:6px"><span>■ <span style="color:var(--brand)">Active</span></span><span>■ Idle</span></div></div>
      <div class="card"><div class="grid2"><div class="metric"><div class="v">${dur(d.activeMs)}</div><div class="l">Active this week</div></div><div class="metric"><div class="v">${dur(d.activeMs / avg)}</div><div class="l">Average per active day</div></div></div></div>
      <div class="card"><h3>Applications</h3>${hbars(d.apps.slice(0, 10), 'x', (x) => x.n, (x) => x.ms, true)}</div>
      <div class="card"><h3>Browsers</h3>${hbars(d.browsers, 'b', (x) => BROWSER_NAMES[x.b] || x.b, (x) => x.ms, true)}</div>
      <div class="card"><h3>Top websites</h3>${hbars(d.domains.slice(0, 8), 'd', (x) => x.d, (x) => x.ms, false)}</div>`;
  }
  view.innerHTML = html;
  view.querySelectorAll('.seg button').forEach((b) => b.onclick = () => { a.range = b.dataset.r; a.data = null; loadAnalytics(); render(); });
  wireDateNav();
  if (!d) loadAnalytics();
}

/* ------------------------------------------------------------- live screen */
const QUALITIES = [['auto', 'Auto'], ['low', 'Low · saves data'], ['medium', 'Medium'], ['high', 'High · sharpest']];
const Live = {
  active: false, wanted: false, mode: '', msg: '', pc: null, pendingIce: [], connTimer: null, ctx: null, busy: false, wake: null,
  z: { s: 1, x: 0, y: 0 }, stats: { frames: 0, t: Date.now(), fps: 0 },

  start() { this.wanted = true; if (S.welcomed && S.presence.state === 'online') this.begin(); else this.setMsg(S.presence.state === 'online' ? 'Connecting…' : 'Laptop is not reachable'); },
  begin() {
    if (this.active) return; this.active = true; this.mode = ''; this.setMsg('Starting screen…'); this.closePc();
    Conn.send({ t: 'stream.start', display: S.display || undefined, quality: S.quality });
    clearInterval(this.ka); this.ka = setInterval(() => Conn.send({ t: 'stream.keepalive' }), 4000);
    this.requestWake();
  },
  stop(silent) {
    this.wanted = false; this.active = false; clearInterval(this.ka); this.closePc(); this.mode = '';
    if (!silent && S.welcomed) Conn.send({ t: 'stream.stop' });
    this.releaseWake(); this.exitFs();
    const v = $('#liveVideo'); if (v) v.srcObject = null;
  },
  onWelcome() { if (this.wanted) { this.active = false; this.begin(); } },
  onConnLost() { this.active = false; clearInterval(this.ka); this.closePc(); if (this.wanted) this.setMsg('Reconnecting…'); },
  setMsg(m) { this.msg = m; const o = $('#liveOverlay'); if (o) { o.textContent = m; o.hidden = !m; } },
  tag() { const t = $('#liveTag'); if (t) t.hidden = !this.mode; if (t) t.textContent = this.mode === 'webrtc' ? '● LIVE · direct' : this.mode === 'relay' ? '● LIVE · relay' : '● …'; },
  closePc() { clearTimeout(this.connTimer); if (this.pc) { try { this.pc.close(); } catch { /* */ } this.pc = null; } this.pendingIce = []; },

  onState(m) {
    if (m.state === 'error') { this.active = false; this.mode = ''; this.setMsg(m.message || 'Could not start the stream'); this.tag(); }
    else if (m.state === 'stopped') { this.active = false; if (this.wanted) { this.setMsg('Stream ended'); } }
    else if (m.state === 'starting') this.setMsg('Starting screen…');
    else if (m.state === 'relay') { this.mode = 'relay'; this.showSurface('canvas'); this.setMsg('Waiting for first frame…'); this.tag(); }
    else if (m.state === 'webrtc') { this.setMsg('Negotiating direct connection…'); }
    if (m.display) S.display = m.display;
  },

  async onSignal(m) {
    if (!this.active) return;
    if (m.kind === 'offer') {
      this.closePc();
      const pc = this.pc = new RTCPeerConnection({ iceServers: S.ice });
      pc.onicecandidate = (e) => { if (e.candidate) Conn.send({ t: 'stream.signal', kind: 'ice', cand: e.candidate.toJSON() }); };
      pc.ontrack = (e) => { const v = $('#liveVideo'); if (v) { v.srcObject = e.streams[0]; v.play().catch(() => {}); } this.showSurface('video'); };
      pc.onconnectionstatechange = () => {
        if (pc !== this.pc) return;
        if (pc.connectionState === 'connected') { clearTimeout(this.connTimer); this.mode = 'webrtc'; this.setMsg(''); this.tag(); }
        if (pc.connectionState === 'failed') this.fallback('failed');
        if (pc.connectionState === 'disconnected') { clearTimeout(this.connTimer); this.connTimer = setTimeout(() => pc === this.pc && pc.connectionState !== 'connected' && this.fallback('disconnected'), 5000); }
      };
      clearTimeout(this.connTimer); this.connTimer = setTimeout(() => pc === this.pc && pc.connectionState !== 'connected' && this.fallback('timeout'), 9000);
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      for (const c of this.pendingIce.splice(0)) pc.addIceCandidate(c).catch(() => {});
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      Conn.send({ t: 'stream.signal', kind: 'answer', sdp: ans.sdp });
    } else if (m.kind === 'ice') {
      if (this.pc && this.pc.remoteDescription) this.pc.addIceCandidate(m.cand).catch(() => {}); else this.pendingIce.push(m.cand);
    }
  },
  fallback() { if (this.mode === 'relay') return; this.closePc(); this.mode = 'relay'; this.setMsg('Switching to relay…'); this.showSurface('canvas'); Conn.send({ t: 'stream.fallback' }); this.tag(); },

  showSurface(which) { const v = $('#liveVideo'), c = $('#liveCanvas'); if (v) v.style.display = which === 'video' ? '' : 'none'; if (c) c.style.display = which === 'canvas' ? '' : 'none'; },
  async onFrame(bytes) {
    if (this.busy || this.mode !== 'relay') return; const c = $('#liveCanvas'); if (!c) return; this.busy = true;
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
      c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close(); this.setMsg('');
    } catch { /* skip */ } finally { this.busy = false; }
  },

  async requestWake() { try { if (navigator.wakeLock) this.wake = await navigator.wakeLock.request('screen'); } catch { /* */ } },
  releaseWake() { try { this.wake && this.wake.release(); } catch { /* */ } this.wake = null; },
  enterFs() {
    const st = $('#stage'); if (!st) return;
    const req = st.requestFullscreen || st.webkitRequestFullscreen;
    if (req) { req.call(st).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* */ } }).catch(() => this.pseudoFs(true)); } else this.pseudoFs(true);
  },
  pseudoFs(on) { const st = $('#stage'); if (!st) return; st.classList.toggle('pseudo-fs', on); document.body.classList.toggle('pseudo-fs-on', on); },
  exitFs() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); this.pseudoFs(false); try { screen.orientation.unlock(); } catch { /* */ } },
  isFs() { return !!document.fullscreenElement || (($('#stage') || {}).classList || { contains: () => false }).contains('pseudo-fs'); },

  /* pinch / pan / double-tap zoom */
  applyZoom() { const z = $('#zoomer'); if (!z) return; const st = $('#stage').getBoundingClientRect(); const { s } = this.z;
    this.z.x = Math.min(0, Math.max(st.width * (1 - s), this.z.x)); this.z.y = Math.min(0, Math.max(st.height * (1 - s), this.z.y));
    z.style.transform = `translate(${this.z.x}px,${this.z.y}px) scale(${s})`; },
  zoomAt(px, py, ns) { const s0 = this.z.s; ns = Math.min(6, Math.max(1, ns)); this.z.x = px - (px - this.z.x) * (ns / s0); this.z.y = py - (py - this.z.y) * (ns / s0); this.z.s = ns; if (ns === 1) { this.z.x = 0; this.z.y = 0; } this.applyZoom(); },
  wireStage() {
    const st = $('#stage'); if (!st) return; const ptrs = new Map(); let pinch = null, lastTap = 0, pan = null;
    const rect = () => st.getBoundingClientRect();
    st.addEventListener('pointerdown', (e) => { if (e.target.closest('.ctrl')) return; st.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.z.s }; pan = null; }
      else { pan = { x: e.clientX, y: e.clientY, zx: this.z.x, zy: this.z.y, moved: false };
        const now = Date.now(); if (now - lastTap < 300) { const r = rect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.z.s > 1.05 ? 1 : 2.5); lastTap = 0; } else lastTap = now; } });
    st.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const r = rect(); this.zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); }
      else if (pan && this.z.s > 1) { this.z.x = pan.zx + e.clientX - pan.x; this.z.y = pan.zy + e.clientY - pan.y; this.applyZoom(); } });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) pan = null; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', (e) => { e.preventDefault(); const r = rect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.z.s * (e.deltaY < 0 ? 1.15 : 0.87)); }, { passive: false });
  },
};
document.addEventListener('fullscreenchange', () => { const b = $('#fsBtn'); if (b) b.textContent = document.fullscreenElement ? '⤡' : '⤢'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (Live.active) { Live.stop(false); Live.wanted = S.tab === 'live'; } } else if (S.tab === 'live' && Live.wanted) Live.start(); });

let liveBuilt = false;
function drawLive() {
  if (!liveBuilt || !$('#stage')) {
    const canStream = S.canStream !== false;
    view.innerHTML = `<div class="stage" id="stage"><div class="tag" id="liveTag">● …</div><div class="ctrl"><button id="zoomBtn" title="Reset zoom">1×</button><button id="fsBtn" title="Full screen">⤢</button></div>
      <div class="zoomer" id="zoomer"><video id="liveVideo" playsinline muted autoplay style="display:none"></video><canvas id="liveCanvas" style="display:none"></canvas></div><div class="overlay" id="liveOverlay">Connecting…</div></div>
      <div class="opts"><div><div class="small muted" style="margin-bottom:4px">Quality</div><select id="qSel">${QUALITIES.map(([v, l]) => `<option value="${v}" ${S.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><div class="small muted" style="margin-bottom:4px">Display</div><select id="dSel"><option value="">Main display</option></select></div></div>
      <div class="small muted" style="margin-top:12px">Pinch or double-tap to zoom, drag to pan. The stream only runs while this page is open, and the laptop shows an indicator while you watch.</div>
      <button class="btn danger" id="stopBtn" style="margin-top:14px">Stop streaming</button>${canStream ? '' : '<div class="banner">Screen capture is unavailable on this laptop app.</div>'}`;
    liveBuilt = true; Live.wireStage(); Live.tag(); Live.showSurface(Live.mode === 'webrtc' ? 'video' : 'canvas');
    $('#fsBtn').onclick = () => Live.isFs() ? Live.exitFs() : Live.enterFs();
    $('#zoomBtn').onclick = () => { Live.z = { s: 1, x: 0, y: 0 }; Live.applyZoom(); };
    $('#qSel').onchange = (e) => { S.quality = e.target.value; localStorage.setItem('pm.q', S.quality); Conn.send({ t: 'stream.quality', quality: S.quality }); };
    $('#dSel').onchange = (e) => { S.display = e.target.value; Live.stop(false); Live.start(); };
    $('#stopBtn').onclick = () => { Live.stop(false); setTab('overview'); };
    Conn.request('displays').then((list) => { const sel = $('#dSel'); if (!sel || !list.length) return; sel.innerHTML = list.map((d) => `<option value="${esc(d.id)}" ${S.display === d.id ? 'selected' : ''}>${esc(d.name)} (${d.w}×${d.h})${d.primary ? ' · main' : ''}</option>`).join(''); }).catch(() => {});
    const z = Live.z; const zb = $('#zoomBtn'); setInterval(() => { const b = $('#zoomBtn'); if (b) b.textContent = Live.z.s.toFixed(1).replace('.0', '') + '×'; }, 400); void z; void zb;
  }
  if (S.paused || S.presence.state === 'paused') Live.setMsg('Broadcasting is paused on the laptop');
  else if (S.presence.state !== 'online' || !S.connected) Live.setMsg(S.connected ? 'Laptop is ' + (S.presence.state === 'sleeping' ? 'asleep' : 'offline') : 'Connecting…');
  else if (!Live.active && Live.wanted && S.welcomed) Live.begin();
}

/* ----------------------------------------------------------------- routing */
function parseRoute() {
  const h = location.hash || ''; const m = /^#\/pair\?(.*)$/.exec(h);
  if (!m) return {}; const p = new URLSearchParams(m[1]);
  return p.get('l') && p.get('k') && p.get('c') ? { pair: { id: p.get('l'), k: p.get('k'), c: p.get('c') } } : {};
}
function onLive() {
  if (S.tab === 'live') { drawTop(); return; }
  render(true);
}
function setTab(t) {
  if (S.tab === 'live' && t !== 'live') { Live.stop(false); liveBuilt = false; }
  if (t !== 'analytics' && S.analytics.range !== 'day') { S.analytics.range = 'day'; S.analytics.data = null; }
  S.tab = t; try { sessionStorage.setItem('pm.tab', t); } catch { /* */ }
  if (t === 'live') { liveBuilt = false; Live.wanted = true; }
  if (S.welcomed) Conn.send({ t: 'view', view: t });
  if (t === 'analytics' || t === 'browser' || (t === 'apps' && S.appsMode === 'history')) { if (!S.analytics.data) loadAnalytics(); }
  draw(); view.scrollTop = 0;
  if (t === 'live') Live.start();
}
document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => setTab(b.dataset.tab));

/* ----------------------------------------------------------------- pairing */
function drawPair(p) {
  setChrome(false);
  if (S.pairing) { view.innerHTML = `<div class="center"><img class="logo" src="icon-192.png" alt=""><h2>Already paired</h2><p>This phone is already paired with <b>${esc(S.pairing.host)}</b>. To pair with a different laptop, forget the current one first.</p><button class="btn" id="keep">Keep current laptop</button><div class="spacer"></div><button class="btn ghost" id="swap">Forget it and pair this new laptop</button></div>`;
    $('#keep').onclick = () => { history.replaceState(null, '', location.pathname); render(); }; $('#swap').onclick = async () => { await forget(); render(); }; return; }
  view.innerHTML = `<div class="center"><img class="logo" src="icon-192.png" alt=""><h2>Pair this phone?</h2><p>This will make this phone the one and only trusted device for the laptop that showed the QR code. Pairing is permanent until the laptop owner removes it.</p><button class="btn" id="doPair">Pair this phone</button><p class="small" id="pairMsg" style="margin-top:16px"></p></div>`;
  $('#doPair').onclick = () => doPair(p);
}
const PAIR_ERR = { bad_code: 'That QR code is not valid. Show a fresh one on the laptop.', expired: 'This QR code has expired. Open PocketMonitor on the laptop to show a new one.', already_paired: 'This laptop already has a phone paired. Remove it from the laptop first.', laptop_offline: 'The laptop is offline right now. Check it is awake and connected, then try again.', unknown_laptop: 'The relay does not know this laptop.', error: 'Pairing failed. Try again.' };
async function doPair(p) {
  const btn = $('#doPair'), msg = $('#pairMsg'); btn.disabled = true; msg.textContent = 'Pairing…';
  try {
    const kp = await C.generateKeyPair(false); const sess = await C.deriveSession(kp.priv, C.unb64u(p.k));
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    const result = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Timed out waiting for the laptop')), 15000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'pair', role: 'phone', id: p.id, code: p.c, pub: C.b64u(kp.pubRaw) }));
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'pair.ok') { clearTimeout(t); res(m); } else if (m.type === 'pair.err') { clearTimeout(t); rej(new Error(PAIR_ERR[m.reason] || PAIR_ERR.error)); } };
      ws.onerror = () => { clearTimeout(t); rej(new Error('Could not reach the relay')); };
    });
    const conf = await C.decryptJSON(sess.encKey, 'l2p', result.d); // proves the laptop holds the key from the QR
    if (conf.t !== 'paired') throw new Error('Unexpected response');
    S.pairing = { id: p.id, host: conf.host, encKey: sess.encKey, auth: sess.authHex, pairedAt: Date.now() };
    await DB.set('pairing', S.pairing); try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* */ }
    history.replaceState(null, '', location.pathname); S.revoked = false; Conn.start(); setTab('overview');
  } catch (e) { msg.textContent = e.message; btn.disabled = false; }
}
async function forget() { Conn.stop(); Live.stop(true); S.pairing = null; S.revoked = false; S.live = null; S.snap = null; await DB.del('pairing'); history.replaceState(null, '', location.pathname); setChrome(false); }

/* ------------------------------------------------------------------- menu */
function sheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="panel">${html}</div>`; s.hidden = false; s.onclick = (e) => { if (e.target === s) s.hidden = true; }; return s; }
function showInstallHint() {
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  sheet(`<h3>Add to your home screen</h3><p class="muted">${ios ? 'Tap the Share button, then “Add to Home Screen”.' : 'Open the browser menu and choose “Install app” or “Add to Home screen”.'} PocketMonitor then opens like an app, and your pairing is kept safe.</p><button class="btn" id="ok">Got it</button>`);
  $('#ok').onclick = () => ($('#sheet').hidden = true);
}
$('#menuBtn').onclick = () => {
  const e = effectiveState();
  sheet(`<h3>${esc(S.pairing.host)}</h3><p class="muted small">${e.label} · paired ${new Date(S.pairing.pairedAt).toLocaleDateString()}<br>Only the laptop can remove this pairing.</p>
    <button class="btn ghost" id="mInstall">Add to home screen</button><div class="spacer"></div><button class="btn ghost" id="mReload">Reconnect now</button><div class="spacer"></div><button class="btn ghost" id="mClose">Close</button>`);
  $('#mInstall').onclick = showInstallHint; $('#mReload').onclick = () => { $('#sheet').hidden = true; Conn.stop(); Conn.backoff = 800; Conn.start(); }; $('#mClose').onclick = () => ($('#sheet').hidden = true);
};

/* -------------------------------------------------------------------- boot */
window.addEventListener('hashchange', () => render());
window.addEventListener('online', () => { Conn.backoff = 800; Conn.open(); });
setInterval(() => { if (S.pairing && S.tab !== 'live' && !parseRoute().pair) drawTop(); }, 15000);
setInterval(() => { // keep today's history fresh while it is on screen
  const a = S.analytics; const histVisible = S.tab === 'analytics' || S.tab === 'browser' || (S.tab === 'apps' && S.appsMode === 'history');
  if (histVisible && S.welcomed && a.date >= todayKey()) loadAnalytics();
}, 30000);

(async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.crypto && crypto.subtle) {
    await loadIcons(); S.pairing = (await DB.get('pairing')) || null;
    try { S.tab = sessionStorage.getItem('pm.tab') || 'overview'; if (S.tab === 'live') S.tab = 'overview'; } catch { /* */ }
    if (S.pairing) Conn.start();
  }
  render();
})();
})();
