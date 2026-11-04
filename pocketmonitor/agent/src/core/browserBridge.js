'use strict';
/**
 * Local-only bridge for the PocketMonitor browser extension (Chrome / Edge).
 *  - listens on 127.0.0.1 only
 *  - accepts requests only from browser-extension origins that present the secret token
 *  - receives tab titles + domains only (never full URLs, page content, form data or private windows)
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 47821;
const FRESH_MS = 75_000;

class BrowserBridge {
  constructor({ getToken, getEnabled, getExcluded }) {
    this.getToken = getToken; this.getEnabled = getEnabled; this.getExcluded = getExcluded;
    this.snaps = new Map(); // instanceId -> snapshot
    this.server = null; this.lastContact = 0;
  }

  start(port = PORT) {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this._handle(req, res));
      this.server.on('error', () => resolve(false)); // port taken: browser monitoring unavailable, app continues
      this.server.listen(port, '127.0.0.1', () => resolve(true));
    });
  }
  stop() { try { this.server && this.server.close(); } catch { /* */ } }

  _handle(req, res) {
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    const extOrigin = /^(chrome|moz)-extension:\/\/[a-z0-9]+$/i.test(origin);
    const cors = extOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, x-pm-token', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Vary': 'Origin' } : {};
    const end = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(body || {})); };
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return end(403, { error: 'host' }); // DNS-rebinding guard
    if (!extOrigin) return end(403, { error: 'origin' });
    if (req.method === 'OPTIONS') return end(204);
    const tok = String(req.headers['x-pm-token'] || ''); const want = this.getToken();
    const a = Buffer.from(tok); const b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return end(401, { error: 'token' });
    this.lastContact = Date.now();
    if (req.method === 'GET' && req.url === '/v1/hello') return end(200, { ok: true, enabled: !!this.getEnabled(), titles: true });
    if (req.method === 'POST' && req.url === '/v1/snapshot') {
      let body = ''; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 512 * 1024) { req.destroy(); } else body += c; });
      req.on('end', () => {
        if (!this.getEnabled()) return end(200, { ok: true, enabled: false });
        try { this._ingest(JSON.parse(body)); end(200, { ok: true, enabled: true }); } catch { end(400, { error: 'bad json' }); }
      });
      return;
    }
    end(404);
  }

  _ingest(s) {
    if (!s || typeof s !== 'object' || !['chrome', 'edge'].includes(s.browser) || typeof s.instance !== 'string') return;
    const tabs = (Array.isArray(s.tabs) ? s.tabs : []).slice(0, 300).filter((t) => t && !t.incognito).map((t) => ({
      id: Number(t.id), windowId: Number(t.windowId), title: String(t.title || '').slice(0, 200), domain: String(t.domain || '').slice(0, 120),
      active: !!t.active, audible: !!t.audible, pinned: !!t.pinned,
    }));
    this.snaps.set(s.instance.slice(0, 40), { browser: s.browser, ts: Date.now(), focusedWindowId: Number(s.focusedWindowId), windowFocused: !!s.windowFocused, tabs });
    for (const [k, v] of this.snaps) if (Date.now() - v.ts > 10 * 60_000) this.snaps.delete(k);
  }

  isExcluded(domain) {
    const list = this.getExcluded() || []; const d = String(domain || '').toLowerCase();
    return list.some((x) => x && (d === x || d.endsWith('.' + x)));
  }

  fresh() { return [...this.snaps.values()].filter((s) => Date.now() - s.ts < FRESH_MS); }

  /** The tab being looked at in the given browser family (most recently focused profile). */
  activeTab(browser) {
    const cands = this.fresh().filter((s) => s.browser === browser && s.windowFocused).sort((a, b) => b.ts - a.ts);
    const s = cands[0]; if (!s) return null;
    return s.tabs.find((t) => t.active && t.windowId === s.focusedWindowId) || null;
  }

  /** Everything the phone's Browser tab needs. */
  overview(monitor) {
    const fresh = this.fresh();
    const tabsOut = [];
    for (const s of fresh) {
      const activeKey = s.tabs.find((t) => t.active && t.windowId === s.focusedWindowId)?.id;
      for (const t of s.tabs) {
        const hidden = this.isExcluded(t.domain);
        tabsOut.push({ browser: s.browser, id: t.id, win: t.windowId, title: hidden ? '(hidden by privacy rule)' : t.title, domain: t.domain, pinned: t.pinned, audible: t.audible,
          visible: t.active, current: t.id === activeKey && s.windowFocused, ms: hidden ? 0 : monitor.tabTimeToday(t.domain, t.title) });
      }
    }
    return { connected: fresh.length > 0, browsers: [...new Set(fresh.map((s) => s.browser))], tabs: tabsOut, byBrowserMs: monitor.browserTimeToday(), lastContact: this.lastContact };
  }
}

module.exports = { BrowserBridge, PORT };
