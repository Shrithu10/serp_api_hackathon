'use strict';
// Registers global shortcuts and reports a per-shortcut status.

const Accel = require('../shared/accelerator');

/**
 * Pure planning step: decide which shortcuts may be registered.
 * reserved: [{ keys, label }] app-level hotkeys (palette, pause).
 * returns Map id -> {state, message} where state is
 * 'disabled' | 'paused' | 'invalid' | 'conflict' | 'pending'
 */
function plan(shortcuts, { paused = false, reserved = [] } = {}) {
  const status = new Map();
  const owner = new Map();
  for (const r of reserved) if (r.keys) owner.set(r.keys, r.label);
  for (const s of shortcuts) {
    if (!s.enabled) { status.set(s.id, { state: 'disabled' }); continue; }
    const v = Accel.validate(s.keys);
    if (!v.ok) { status.set(s.id, { state: 'invalid', message: v.error }); continue; }
    const taken = owner.get(v.accelerator);
    if (taken) { status.set(s.id, { state: 'conflict', message: `${Accel.pretty(v.accelerator)} is already used by ${taken}.` }); continue; }
    owner.set(v.accelerator, `"${s.name}"`);
    status.set(s.id, paused ? { state: 'paused' } : { state: 'pending', keys: v.accelerator });
  }
  return status;
}

class HotkeyManager {
  constructor(globalShortcut) { this.gs = globalShortcut; this.suspended = false; }

  /**
   * @param shortcuts   active profile's shortcuts
   * @param app         { palette:{keys,run}, pause:{keys,run} }
   * @param onTrigger   (shortcut) => void
   * @returns {{status: Object<string,{state,message?}>, appStatus: Object}}
   */
  apply(shortcuts, app, { paused, onTrigger }) {
    this.gs.unregisterAll();
    const reserved = [];
    const appStatus = {};
    const tryApp = (key, def) => {
      const d = app[key];
      if (!d || !d.keys) { appStatus[key] = { state: 'disabled' }; return; }
      const v = Accel.validate(d.keys);
      if (!v.ok) { appStatus[key] = { state: 'invalid', message: v.error }; return; }
      let ok = false;
      try { ok = this.gs.register(v.accelerator, d.run); } catch { ok = false; }
      if (ok) { reserved.push({ keys: v.accelerator, label: def }); appStatus[key] = { state: 'active' }; }
      else appStatus[key] = { state: 'failed', message: `${Accel.pretty(v.accelerator)} is in use by Windows or another app.` };
    };
    tryApp('pause', 'the pause/resume hotkey');
    if (!this.suspended) tryApp('palette', 'the command palette');

    const status = {};
    const planned = plan(shortcuts, { paused, reserved });
    for (const s of shortcuts) {
      const p = planned.get(s.id);
      if (p.state !== 'pending') { status[s.id] = p; continue; }
      if (this.suspended) { status[s.id] = { state: 'paused' }; continue; }
      let ok = false;
      try { ok = this.gs.register(p.keys, () => onTrigger(s)); } catch (e) { ok = false; }
      status[s.id] = ok ? { state: 'active' }
        : { state: 'failed', message: `${Accel.pretty(p.keys)} couldn't be registered — Windows or another app is already using it.` };
    }
    return { status, appStatus };
  }

  /** Free every hotkey (used while the user is recording a new combination). */
  releaseAll() { this.gs.unregisterAll(); }
}

module.exports = { HotkeyManager, plan };
