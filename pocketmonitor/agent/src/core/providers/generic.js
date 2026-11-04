'use strict';
/**
 * Fallback provider for non-Windows hosts (development / CI): real process table from `ps`.
 * No foreground-window detection, no battery. The product target is Windows.
 */
const { execFile } = require('child_process');
const fs = require('fs');

class GenericProvider {
  constructor(intervalMs = 4500) { this.t = null; this.interval = intervalMs; }
  start(onEvent) {
    const poll = () => {
      execFile('ps', ['-eo', 'pid=,rss=,time=,comm='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return;
        const list = [];
        for (const line of out.split('\n')) {
          const m = /^\s*(\d+)\s+(\d+)\s+(?:(\d+)-)?(\d+):(\d+):(\d+)\s+(.+)$/.exec(line);
          if (!m) continue;
          const cpuSec = (Number(m[3] || 0) * 86400) + Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6]);
          let exe = ''; try { exe = fs.readlinkSync(`/proc/${m[1]}/exe`); } catch { /* */ }
          list.push({ pid: +m[1], name: m[7].trim(), cpuSec, ws: +m[2] * 1024, hasWindow: false, exe, desc: m[7].trim(), title: '' });
        }
        onEvent({ type: 'procs', list });
      });
    };
    poll(); this.t = setInterval(poll, this.interval);
  }
  stop() { clearInterval(this.t); }
}
module.exports = { GenericProvider };
