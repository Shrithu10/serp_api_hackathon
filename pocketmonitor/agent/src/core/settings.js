'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DEFAULTS = {
  relayUrl: '',
  relayToken: '',
  monitoringPaused: false,
  broadcastPaused: false,
  browserEnabled: true,
  shareTabTitles: true,
  liveWindowTitles: true,
  excludeDomains: [],
  idleSeconds: 120,
  retentionDays: 90,
  autostart: true,
};

/** Plain settings (no secrets). Secrets live in identity.json via an OS-backed protector. */
class Settings extends EventEmitter {
  constructor(dir) {
    super(); this.file = path.join(dir, 'settings.json'); fs.mkdirSync(dir, { recursive: true });
    this.data = { ...DEFAULTS };
    try { Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* defaults */ }
  }
  get(k) { return this.data[k]; }
  all() { return { ...this.data }; }
  set(k, v) {
    if (!(k in DEFAULTS)) return;
    if (this.data[k] === v) return;
    this.data[k] = v; this._save(); this.emit('change', k, v);
  }
  _save() { const t = this.file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this.data, null, 2)); fs.renameSync(t, this.file); }
}

/** Identity + pairing, stored encrypted-at-rest when the host provides a protector (Windows DPAPI via Electron safeStorage). */
class Identity {
  constructor(dir, protector) {
    this.file = path.join(dir, 'identity.dat'); this.prot = protector || { protect: (s) => s, unprotect: (s) => s, name: 'none' };
    this.data = null;
  }
  load() {
    try { this.data = JSON.parse(this.prot.unprotect(fs.readFileSync(this.file, 'utf8'))); } catch { this.data = null; }
    return this.data;
  }
  save() {
    const t = this.file + '.tmp'; fs.writeFileSync(t, this.prot.protect(JSON.stringify(this.data)), { mode: 0o600 }); fs.renameSync(t, this.file);
  }
}

module.exports = { Settings, Identity, DEFAULTS };
