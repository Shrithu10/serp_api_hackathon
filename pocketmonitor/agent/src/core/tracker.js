'use strict';
const { dayKey } = require('./store');

const CHECKPOINT_MS = 60_000;
const MAX_CREDIT_MS = 10_000; // a gap larger than this (sleep, suspend) is not credited

/**
 * Turns periodic observations into stored activity segments.
 * Also keeps today's running totals in memory so live views never have to re-read disk.
 */
class Tracker {
  constructor(store) {
    this.store = store;
    this.cur = { app: null, web: null };
    this.lastTick = null;
    this.today = dayKey(Date.now());
    this.appTotals = new Map(); // exe -> {activeMs, idleMs}
    this.tabTotals = new Map(); // domain\0title -> ms
    this.browserTotals = new Map();
    this.activeMsToday = 0; this.idleMsToday = 0;
    this._hydrate();
  }

  _reset() {
    this.appTotals.clear(); this.tabTotals.clear(); this.browserTotals.clear();
    this.activeMsToday = 0; this.idleMsToday = 0;
  }
  _hydrate() {
    this._reset();
    for (const r of this.store.readDay(this.today)) this._credit(r, r.e - r.s);
  }
  _credit(r, ms) {
    if (r.y === 'a') {
      const o = this.appTotals.get(r.x) || { activeMs: 0, idleMs: 0, n: r.n };
      o.n = r.n;
      if (r.k === 'a') { o.activeMs += ms; this.activeMsToday += ms; } else { o.idleMs += ms; this.idleMsToday += ms; }
      this.appTotals.set(r.x, o);
    } else if (r.y === 'w' && r.k === 'a') {
      const key = r.d + '\u0000' + r.t;
      this.tabTotals.set(key, (this.tabTotals.get(key) || 0) + ms);
      this.browserTotals.set(r.b, (this.browserTotals.get(r.b) || 0) + ms);
    }
  }

  /**
   * @param {number} now
   * @param {{x:string,n:string}|null} app   foreground application (null if unknown)
   * @param {boolean} idle                    user idle or screen locked
   * @param {{b:string,d:string,t:string}|null} web  active browser tab, when a browser is in front
   */
  tick(now, app, idle, web) {
    const dk = dayKey(now);
    if (dk !== this.today) { this.flush(now); this.today = dk; this._reset(); this.lastTick = now; }
    const dt = this.lastTick == null ? 0 : now - this.lastTick;
    if (dt > MAX_CREDIT_MS) { this._close('app', this.lastTick + 2000); this._close('web', this.lastTick + 2000); }
    this.lastTick = now;
    const k = idle ? 'i' : 'a';

    this._advance('app', app ? { y: 'a', k, x: app.x, n: app.n } : null, now);
    this._advance('web', web && !idle ? { y: 'w', k: 'a', b: web.b, d: web.d, t: web.t } : null, now);
  }

  _sameKey(a, b) { return a.y === b.y && a.k === b.k && a.x === b.x && a.b === b.b && a.d === b.d && a.t === b.t; }

  _advance(slot, rec, now) {
    const c = this.cur[slot];
    if (c && rec && this._sameKey(c.rec, rec)) {
      // Credit incrementally so live totals are accurate between checkpoints.
      this._credit(c.rec, now - c.credited); c.credited = now;
      if (now - c.rec.s >= CHECKPOINT_MS) { this._emit(c, now); this.cur[slot] = { rec: { ...rec, s: now }, credited: now }; }
      return;
    }
    if (c) this._close(slot, now);
    if (rec) this.cur[slot] = { rec: { ...rec, s: now }, credited: now };
  }

  _emit(c, end) { this.store.append({ ...c.rec, e: end }); }
  _close(slot, end) {
    const c = this.cur[slot]; if (!c) return;
    if (end > c.credited) { this._credit(c.rec, end - c.credited); }
    this._emit(c, Math.max(end, c.rec.s));
    this.cur[slot] = null;
  }
  /** Persist everything in flight (on quit, pause, sleep). */
  flush(now = Date.now()) { this._close('app', now); this._close('web', now); this.lastTick = null; }

  /** Write what we have so far without ending the segments (so reports include the present moment). */
  checkpoint(now = Date.now()) {
    for (const slot of ['app', 'web']) {
      const c = this.cur[slot]; if (!c) continue;
      if (now > c.credited) { this._credit(c.rec, now - c.credited); c.credited = now; }
      this._emit(c, now); this.cur[slot] = { rec: { ...c.rec, s: now }, credited: now };
    }
  }

  appToday(x) { return this.appTotals.get(x) || { activeMs: 0, idleMs: 0 }; }
}

module.exports = { Tracker };
