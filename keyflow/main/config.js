'use strict';
// Persistent configuration: profiles -> shortcuts, settings, stats, backups.
// Writes are atomic (tmp + rename) and a corrupt file is never silently lost.

const fs = require('fs');
const path = require('path');
const C = require('../shared/catalog');
const Accel = require('../shared/accelerator');
const presets = require('./presets');

const VERSION = 1;
const MAX_BACKUPS = 15;

const DEFAULT_SETTINGS = {
  startWithWindows: false,
  startMinimized: true,
  closeToTray: true,
  notifyOnFailure: true,
  notifyOnSuccess: false,
  paletteHotkey: 'Ctrl+Alt+Space',
  pauseHotkey: 'Ctrl+Alt+Shift+P',
  paused: false,
};

function newProfile(name) { return { id: C.uid('p'), name, shortcuts: [] }; }

function defaultConfig() {
  const work = newProfile('Everyday');
  work.shortcuts = presets.starterShortcuts();
  return { version: VERSION, settings: { ...DEFAULT_SETTINGS }, activeProfileId: work.id, profiles: [work], onboarded: false };
}

function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s && typeof s === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof DEFAULT_SETTINGS[k] === 'boolean') { if (typeof s[k] === 'boolean') out[k] = s[k]; }
      else if (typeof s[k] === 'string') {
        if (k.endsWith('Hotkey')) { const p = Accel.parse(s[k]); out[k] = p.ok ? p.accelerator : (s[k] === '' ? '' : DEFAULT_SETTINGS[k]); }
        else out[k] = s[k];
      }
    }
  }
  return out;
}

function sanitizeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const seen = new Set();
  const shortcuts = (Array.isArray(p.shortcuts) ? p.shortcuts : []).map(C.sanitizeShortcut).filter(Boolean)
    .map((s) => { while (seen.has(s.id)) s.id = C.uid('s'); seen.add(s.id); return s; });
  return { id: String(p.id || C.uid('p')).slice(0, 40), name: String(p.name || 'Profile').slice(0, 40), shortcuts };
}

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(sanitizeProfile).filter(Boolean);
  if (!profiles.length) return null;
  const active = profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : profiles[0].id;
  return { version: VERSION, settings: sanitizeSettings(raw.settings), activeProfileId: active, profiles, onboarded: !!raw.onboarded };
}

/** Upgrade older config versions. Add steps here when VERSION grows. */
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  // v0 (no version): flat { shortcuts: [] }
  if (!raw.version && Array.isArray(raw.shortcuts) && !raw.profiles) {
    raw = { version: 1, settings: raw.settings, profiles: [{ id: C.uid('p'), name: 'Everyday', shortcuts: raw.shortcuts }] };
  }
  return raw;
}

class ConfigStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'config.json');
    this.statsFile = path.join(dir, 'stats.json');
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.loadWarning = null;
    this.config = this._load();
    this.stats = this._loadStats();
    this._statsTimer = null;
  }

  _readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }

  _load() {
    if (!fs.existsSync(this.file)) return defaultConfig();
    try {
      const cfg = sanitizeConfig(migrate(this._readJson(this.file)));
      if (cfg) return cfg;
      throw new Error('Config has no profiles');
    } catch (err) {
      // Keep the unreadable file for the user, then recover from the newest backup.
      const keep = `${this.file}.corrupt-${Date.now()}`;
      try { fs.renameSync(this.file, keep); } catch { /* ignore */ }
      for (const b of this.listBackups()) {
        try { const cfg = sanitizeConfig(migrate(this._readJson(b.path))); if (cfg) {
          this.loadWarning = `Your configuration file was damaged and was restored from the backup of ${new Date(b.time).toLocaleString()}. The damaged file was kept as ${path.basename(keep)}.`;
          return cfg; } } catch { /* try next */ }
      }
      this.loadWarning = `Your configuration file could not be read (${err.message}). A fresh configuration was created; the old file was kept as ${path.basename(keep)}.`;
      return defaultConfig();
    }
  }

  _loadStats() {
    try { const s = this._readJson(this.statsFile); return s && typeof s === 'object' ? s : {}; } catch { return {}; }
  }

  _atomicWrite(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  save() { this._atomicWrite(this.file, JSON.stringify(this.config, null, 2)); }

  replace(cfg, { backup = true } = {}) {
    const clean = sanitizeConfig(cfg);
    if (!clean) throw new Error('Invalid configuration');
    if (backup) this.createBackup('auto');
    this.config = clean;
    this.save();
    return this.config;
  }

  // ---- backups ----
  createBackup(tag = 'manual') {
    if (!fs.existsSync(this.file)) this.save();
    const name = `config-${new Date().toISOString().replace(/[:.]/g, '-')}-${tag}.json`;
    const dest = path.join(this.backupDir, name);
    fs.copyFileSync(this.file, dest);
    const all = this.listBackups();
    for (const old of all.slice(MAX_BACKUPS)) { try { fs.unlinkSync(old.path); } catch { /* ignore */ } }
    return dest;
  }

  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json'))
        .map((f) => { const p = path.join(this.backupDir, f); return { name: f, path: p, time: fs.statSync(p).mtimeMs }; })
        .sort((a, b) => b.time - a.time || (a.name < b.name ? 1 : -1));
    } catch { return []; }
  }

  restoreBackup(name) {
    const file = path.join(this.backupDir, path.basename(name));
    const cfg = sanitizeConfig(migrate(this._readJson(file)));
    if (!cfg) throw new Error('That backup is not a valid configuration.');
    cfg.settings.paused = this.config.settings.paused;
    return this.replace(stripApprovals(cfg));
  }

  // ---- stats ----
  recordRun(shortcutId, ok) {
    const s = this.stats[shortcutId] || { runs: 0, failures: 0, lastRun: 0 };
    s.runs++; if (!ok) s.failures++; s.lastRun = Date.now();
    this.stats[shortcutId] = s;
    clearTimeout(this._statsTimer);
    this._statsTimer = setTimeout(() => this.flushStats(), 1500);
  }
  flushStats() {
    clearTimeout(this._statsTimer);
    try { this._atomicWrite(this.statsFile, JSON.stringify(this.stats)); } catch { /* non fatal */ }
  }
  resetStats() { this.stats = {}; this.flushStats(); }
}

/** Imported / restored commands must be re-approved by the user before they run. */
function stripApprovals(cfg) {
  for (const p of cfg.profiles) for (const s of p.shortcuts) for (const a of s.actions) if (a.type === 'command') a.approvedHash = '';
  return cfg;
}

module.exports = { ConfigStore, sanitizeConfig, sanitizeProfile, migrate, stripApprovals, defaultConfig, newProfile, DEFAULT_SETTINGS, VERSION };
