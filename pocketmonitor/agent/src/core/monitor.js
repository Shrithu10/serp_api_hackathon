'use strict';
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { Tracker } = require('./tracker');

const BROWSER_EXES = { 'chrome.exe': 'chrome', 'chrome': 'chrome', 'msedge.exe': 'edge', 'msedge': 'edge', 'microsoft-edge': 'edge' };
const IGNORED_FG = new Set(['lockapp', 'logonui', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost']);

const iconKeyFor = (exe) => (exe ? crypto.createHash('sha1').update(exe.toLowerCase()).digest('hex').slice(0, 10) : null);
const lower = (s) => String(s || '').toLowerCase();

/**
 * Collects live system state from a platform provider and feeds the Tracker.
 *  provider events: fg {pid,name,exe,desc,title} | procs {list} | battery {...}
 *  sys: { idleSeconds(): number }  (injected from Electron's powerMonitor)
 */
class Monitor extends EventEmitter {
  constructor({ provider, store, settings, sys, browserBridge }) {
    super();
    this.provider = provider; this.store = store; this.settings = settings;
    this.sys = sys || { idleSeconds: () => 0 };
    this.bridge = browserBridge;
    this.tracker = new Tracker(store);
    this.fg = null; this.procs = []; this.prevCpu = new Map(); this.cpuPct = new Map();
    this.battery = null; this.paused = false; this.locked = false;
    this.cpuPrev = os.cpus(); this.cpuTotalPct = 0;
    this.timer = null; this.lastProcAt = 0;
  }

  start() {
    this.provider.start((e) => this._onProvider(e));
    this.timer = setInterval(() => this._tick(), 2000);
    this.timer.unref && this.timer.unref();
  }
  stop() { clearInterval(this.timer); this.provider.stop(); this.tracker.flush(); }
  setPaused(p) { if (p && !this.paused) this.tracker.flush(); this.paused = !!p; }
  setLocked(l) { this.locked = !!l; }

  _onProvider(e) {
    if (e.type === 'fg') this.fg = e.fg;
    else if (e.type === 'battery') this.battery = e.present ? { pct: e.pct, charging: e.charging, remainSec: e.remainSec } : { none: true };
    else if (e.type === 'procs') this._procs(e.list);
  }

  _procs(list) {
    const now = Date.now(); const dt = (now - (this.lastProcAt || now - 4500)) / 1000; this.lastProcAt = now;
    const cores = os.cpus().length || 1; const next = new Map();
    for (const p of list) {
      const prev = this.prevCpu.get(p.pid);
      next.set(p.pid, p.cpuSec);
      this.cpuPct.set(p.pid, prev == null || dt <= 0 ? 0 : Math.max(0, Math.min(100, ((p.cpuSec - prev) / dt / cores) * 100)));
    }
    for (const pid of this.cpuPct.keys()) if (!next.has(pid)) this.cpuPct.delete(pid);
    this.prevCpu = next; this.procs = list;
  }

  _systemCpu() {
    const cur = os.cpus(); let idle = 0; let total = 0;
    cur.forEach((c, i) => {
      const p = this.cpuPrev[i]; if (!p) return;
      for (const k of Object.keys(c.times)) { const d = c.times[k] - p.times[k]; total += d; if (k === 'idle') idle += d; }
    });
    this.cpuPrev = cur; if (total > 0) this.cpuTotalPct = Math.round((1 - idle / total) * 100);
  }

  /** Foreground app, normalised. */
  foregroundApp() {
    const f = this.fg; if (!f || !f.name) return null;
    if (IGNORED_FG.has(lower(f.name))) return null;
    let x = lower(f.name); let n = f.desc || f.name;
    if (lower(f.name) === 'applicationframehost' && f.title) { x = 'uwp:' + lower(f.title); n = f.title; } // UWP apps
    return { x, n, exe: f.exe, pid: f.pid, title: f.title };
  }

  idleSeconds() { return this.locked ? Math.max(this.sys.idleSeconds(), 9999) : this.sys.idleSeconds(); }
  isIdle() { return this.locked || this.idleSeconds() >= (this.settings.get('idleSeconds') || 120); }

  /** Which browser tab is the user looking at right now, honouring privacy settings. */
  activeWebTab(app) {
    if (!app || !this.bridge || !this.settings.get('browserEnabled')) return null;
    const fam = BROWSER_EXES[app.x]; if (!fam) return null;
    const tab = this.bridge.activeTab(fam);
    if (!tab || this.bridge.isExcluded(tab.domain)) return null;
    return { b: fam, d: tab.domain, t: this.settings.get('shareTabTitles') ? tab.title : tab.domain };
  }

  _tick() {
    this._systemCpu();
    if (this.paused) return;
    const app = this.foregroundApp();
    const idle = this.isIdle();
    this.tracker.tick(Date.now(), app && !this.locked ? { x: app.x, n: app.n } : this.locked ? { x: 'locked', n: 'Locked screen' } : null, idle, this.activeWebTab(app));
    this.emit('tick');
  }

  /** Running applications grouped by program, with active-vs-background distinction. */
  apps() {
    const fg = this.foregroundApp(); const groups = new Map();
    for (const p of this.procs) {
      const x = lower(p.name); const g = groups.get(x) || { x, name: p.desc || p.name, exe: p.exe, count: 0, cpu: 0, memMB: 0, hasWindow: false, title: '' };
      g.count++; g.cpu += this.cpuPct.get(p.pid) || 0; g.memMB += p.ws / 1048576;
      if (p.hasWindow) { g.hasWindow = true; if (!g.title) g.title = p.title; if (p.desc) g.name = p.desc; if (p.exe) g.exe = p.exe; }
      groups.set(x, g);
    }
    const out = [];
    for (const g of groups.values()) {
      const isFg = !!fg && (fg.x === g.x);
      const t = this.tracker.appToday(g.x);
      out.push({ x: g.x, name: g.name, icon: iconKeyFor(g.exe), exe: g.exe, count: g.count, cpu: +g.cpu.toFixed(1), memMB: Math.round(g.memMB),
        title: this.settings.get('liveWindowTitles') ? g.title : '', status: isFg ? 'active' : g.hasWindow ? 'open' : 'background',
        activeMs: t.activeMs, idleMs: t.idleMs });
    }
    const rank = { active: 0, open: 1, background: 2 };
    out.sort((a, b) => rank[a.status] - rank[b.status] || b.activeMs - a.activeMs || b.cpu - a.cpu || b.memMB - a.memMB);
    const windowed = out.filter((a) => a.status !== 'background');
    const background = out.filter((a) => a.status === 'background').sort((a, b) => b.cpu - a.cpu || b.memMB - a.memMB).slice(0, 25);
    return { windowed, background, totalProcesses: this.procs.length };
  }

  activeApp() {
    const a = this.foregroundApp(); if (!a) return this.locked ? { name: 'Locked screen', x: 'locked', locked: true } : null;
    const p = this.procs.find((q) => q.pid === a.pid);
    const t = this.tracker.appToday(a.x);
    return { x: a.x, name: a.n, icon: iconKeyFor(a.exe), exe: a.exe, title: this.settings.get('liveWindowTitles') ? a.title : '', cpu: p ? +(this.cpuPct.get(p.pid) || 0).toFixed(1) : 0,
      memMB: p ? Math.round(p.ws / 1048576) : 0, activeMs: t.activeMs, idle: this.isIdle() };
  }

  /** Exe path lookup for icon requests. */
  exeForIcon(key) {
    for (const p of this.procs) if (p.exe && iconKeyFor(p.exe) === key) return p.exe;
    if (this.fg && this.fg.exe && iconKeyFor(this.fg.exe) === key) return this.fg.exe;
    return null;
  }

  system() {
    const total = os.totalmem(); const free = os.freemem();
    return { cpu: this.cpuTotalPct, memPct: Math.round((1 - free / total) * 100), memUsedGB: +((total - free) / 2 ** 30).toFixed(1), memTotalGB: +(total / 2 ** 30).toFixed(1),
      battery: this.battery && !this.battery.none ? this.battery : null, hasBattery: !!(this.battery && !this.battery.none), uptimeSec: Math.round(os.uptime()) };
  }

  today() {
    const t = this.tracker; return { activeMs: t.activeMsToday, idleMs: t.idleMsToday };
  }
  tabTimeToday(domain, title) { return this.tracker.tabTotals.get(domain + '\u0000' + title) || 0; }
  browserTimeToday() { return Object.fromEntries(this.tracker.browserTotals); }
}

module.exports = { Monitor, iconKeyFor, BROWSER_EXES };
