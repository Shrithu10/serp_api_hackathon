'use strict';
// Runs the steps of a shortcut in order. The executor is injected so this
// logic is platform independent and unit-testable.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object[]} steps  sanitized actions
 * @param {(step:object, ctx:object)=>Promise<void>} exec  throws on failure
 * @param {object} [opts]   { sleep, isCancelled, onStep }
 * @returns {{ok:boolean, results:object[], failedCount:number}}
 */
async function runWorkflow(steps, exec, opts = {}) {
  const wait = opts.sleep || sleep;
  const results = [];
  let prevOk = true;
  let aborted = false;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (opts.isCancelled && opts.isCancelled()) { aborted = true; break; }
    if (step.enabled === false) { results.push({ index: i, status: 'skipped', reason: 'disabled' }); continue; }
    if (step.runIf === 'previousSucceeded' && !prevOk) {
      results.push({ index: i, status: 'skipped', reason: 'previous step failed' });
      continue;
    }
    try {
      await exec(step, { index: i });
      prevOk = true;
      results.push({ index: i, status: 'ok' });
    } catch (err) {
      prevOk = false;
      const message = (err && err.message) || String(err);
      results.push({ index: i, status: 'failed', error: message, cancelled: !!(err && err.cancelled) });
      if (opts.onStep) opts.onStep(i, 'failed', message);
      if (step.onError !== 'continue' || (err && err.cancelled)) { aborted = true; break; }
    }
    if (step.delayAfterMs > 0 && i < steps.length - 1) await wait(step.delayAfterMs);
  }
  const failedCount = results.filter((r) => r.status === 'failed').length;
  return { ok: failedCount === 0 && !aborted, results, failedCount };
}

module.exports = { runWorkflow };
