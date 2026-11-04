'use strict';
const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar day key, e.g. 2026-11-04 */
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dayStart(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }

/**
 * Local-only activity history. One JSONL file per local day:
 *   {"y":"a","s":..,"e":..,"k":"a|i","x":"chrome.exe","n":"Google Chrome"}   application focus
 *   {"y":"w","s":..,"e":..,"k":"a|i","b":"chrome","d":"github.com","t":"Title"} browser tab focus
 */
class ActivityStore {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  file(key) { return path.join(this.dir, `activity-${key}.jsonl`); }
  append(rec) {
    if (!(rec.e > rec.s)) return;
    fs.appendFileSync(this.file(dayKey(rec.s)), JSON.stringify(rec) + '\n');
  }
  readDay(key) {
    let txt; try { txt = fs.readFileSync(this.file(key), 'utf8'); } catch { return []; }
    const out = [];
    for (const line of txt.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch { /* skip torn line */ } }
    return out;
  }
  days() {
    try { return fs.readdirSync(this.dir).map((f) => /^activity-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)?.[1]).filter(Boolean).sort(); } catch { return []; }
  }
  prune(retentionDays) {
    if (!retentionDays || retentionDays < 1) return;
    const cutoff = dayKey(Date.now() - retentionDays * 86400_000);
    for (const d of this.days()) if (d < cutoff) { try { fs.unlinkSync(this.file(d)); } catch { /* */ } }
  }
  clear() { for (const d of this.days()) { try { fs.unlinkSync(this.file(d)); } catch { /* */ } } }
}

module.exports = { ActivityStore, dayKey, dayStart };
