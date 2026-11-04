'use strict';
const $ = (s) => document.querySelector(s);
const root = $('#root');
let S = null, busy = false, openDetails = new Set();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dur = (ms) => { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
const act = (n, a) => pmUI.action(n, a).then((s) => { S = s; render(); });
const sw = (id, label, desc, checked) => `<div class="toggle"><div><b>${label}</b><span>${desc}</span></div><label class="sw"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><i></i></label></div>`;

function render() {
  if (!S) return;
  const st = S.settings;
  // header
  $('#sub').textContent = S.relay.connected ? (S.paired ? (S.phoneConnected ? 'Your phone is connected' : 'Online · phone paired') : 'Online · waiting to pair') : S.relay.configured ? 'Connecting to relay…' : 'Setup needed';
  $('#pills').innerHTML = [
    st.monitoringPaused ? '<span class="pill warn">Monitoring paused</span>' : '<span class="pill ok">● Monitoring</span>',
    st.broadcastPaused ? '<span class="pill warn">Broadcast paused</span>' : '',
    S.streaming ? '<span class="pill bad">● Screen is being viewed</span>' : '',
  ].join('');
  if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox') return; // don't clobber typing
  root.querySelectorAll('details').forEach((d, i) => { if (d.open) openDetails.add(i); else openDetails.delete(i); });

  let h = '';
  if (!S.relay.configured) {
    h += `<div class="card"><h2>Connect to your relay</h2><p class="muted">PocketMonitor needs the address of your relay server so your phone can reach this laptop from anywhere. It only forwards encrypted data. See the README to host one in a few minutes.</p>
      <label class="f">Relay address</label><input type="text" id="relayUrl" placeholder="https://pocketmonitor.example.com"><div style="margin-top:12px"><button id="saveRelay">Save and connect</button></div></div>`;
  } else if (!S.paired) {
    h += `<div class="card"><h2>Pair your phone</h2>`;
    if (S.pairing && S.relay.connected) {
      h += `<div class="qr"><img src="${S.qr || ''}" alt="Pairing QR code"></div><p style="text-align:center;margin:8px 0 2px"><b>Scan with your phone's camera</b></p><p class="muted small" style="text-align:center;margin:0">Valid for ${Math.max(0, Math.round((S.pairing.expires - Date.now()) / 60000))} min. One phone only — it stays paired until you remove it here.</p>
      <div class="row" style="justify-content:center;margin-top:12px"><button class="ghost sm" id="newQr">New code</button><button class="ghost sm" id="copyLink">Copy link</button></div>`;
    } else h += `<p class="muted">${esc(S.relay.error) || 'Connecting to the relay…'}</p>`;
    h += `</div>`;
  } else {
    h += `<div class="card"><h2>Paired phone</h2><div class="row sp"><div><div class="big">${S.phoneConnected ? '● Connected' : 'Paired'}</div><div class="muted small">Since ${new Date(S.pairedAt).toLocaleDateString()} · only this phone can view this laptop</div></div>
      <button class="ghost sm" id="remove">Remove phone…</button></div><div id="confirmBox"></div></div>`;
  }
  if (S.relay.error) h += `<div class="err">${esc(S.relay.error)}</div>`;

  h += `<div class="card"><h2>Privacy &amp; control</h2>
    ${sw('tMon', 'Pause monitoring', 'Stop recording app and browser activity', st.monitoringPaused)}
    ${sw('tBc', 'Pause broadcasting', 'Phone can’t see anything or watch the screen', st.broadcastPaused)}
    ${sw('tAuto', 'Start with Windows', 'Runs quietly in the tray', st.autostart)}
  </div>`;

  h += `<div class="card"><h2>Browser activity</h2>
    ${sw('tBrowser', 'Share tab titles &amp; websites', 'Chrome and Edge, via the PocketMonitor extension', st.browserEnabled)}
    ${sw('tTitles', 'Include page titles', 'Off = domains only (e.g. github.com)', st.shareTabTitles)}
    <div class="small" style="margin-top:6px">${S.browser.connected ? `<span class="pill ok">Extension connected: ${S.browser.browsers.join(', ')}</span>` : '<span class="pill">Extension not connected</span>'}</div>
    <details style="margin-top:10px"><summary>Install the browser extension</summary><ol class="steps">
      <li>Open <button class="ghost sm" data-ext="chrome">Chrome extensions</button> or <button class="ghost sm" data-ext="edge">Edge extensions</button>, turn on <b>Developer mode</b>.</li>
      <li>Choose <b>Load unpacked</b> and select the folder: <button class="ghost sm" id="openExt">Open folder</button></li>
      <li>Click the extension’s ⚙ options, paste this key: <button class="sm" id="copyTok">Copy key</button></li></ol>
      <p class="muted small">The extension sends only tab titles and website domains. Never page contents, passwords, form data, keystrokes or private windows.</p></details>
  </div>`;

  h += `<div class="card"><h2>Today</h2><div class="grid"><div><div class="big">${dur(S.today.activeMs)}</div><div class="muted small">Active</div></div><div><div class="big" style="color:var(--muted)">${dur(S.today.idleMs)}</div><div class="muted small">Idle</div></div></div>
    <p class="muted small" style="margin-bottom:0">History is stored only on this laptop (${S.historyDays} day${S.historyDays === 1 ? '' : 's'} so far). Nothing is uploaded; your phone asks this laptop for it, encrypted.</p></div>`;

  h += `<details class="card"><summary>Advanced</summary>
    <label class="f">Relay address</label><input type="text" id="adv_relay" value="${esc(st.relayUrl)}">
    <label class="f">Relay access token (only if your relay requires one)</label><input type="password" id="adv_tok" value="${esc(st.relayToken)}">
    <label class="f">Count as idle after (seconds)</label><input type="number" id="adv_idle" min="30" max="3600" value="${st.idleSeconds}">
    <label class="f">Keep history for (days)</label><input type="number" id="adv_ret" min="7" max="3650" value="${st.retentionDays}">
    <label class="f">Never record these websites (one per line)</label><textarea id="adv_ex">${esc((st.excludeDomains || []).join('\n'))}</textarea>
    ${sw('tWin', 'Show window titles on the phone (live only)', 'Titles of open windows are never stored', st.liveWindowTitles)}
    <div class="row" style="margin-top:12px"><button id="adv_save">Save</button><button class="ghost" id="openData">Open data folder</button><button class="danger" id="clearHist">Delete history…</button></div></details>`;
  h += `<p class="muted small" style="text-align:center">PocketMonitor ${esc(S.version)} · no remote control, no keystroke capture, no hidden monitoring</p>`;
  root.innerHTML = h;
  root.querySelectorAll('details').forEach((d, i) => { if (openDetails.has(i)) d.open = true; });
  wire();
}

function wire() {
  const on = (sel, fn) => { const e = $(sel); if (e) e.onclick = fn; };
  const chk = (sel, fn) => { const e = $(sel); if (e) e.onchange = () => fn(e.checked); };
  on('#saveRelay', () => { const v = $('#relayUrl').value.trim().replace(/\/+$/, ''); if (/^https?:\/\//.test(v)) act('setSetting', { k: 'relayUrl', v }); else alert('Enter a full address starting with https://'); });
  on('#newQr', () => act('newQr')); on('#copyLink', () => act('copyPairLink'));
  on('#remove', () => {
    $('#confirmBox').innerHTML = `<div class="card" style="margin:12px 0 0;border-color:var(--bad)"><b>Remove this phone?</b><p class="muted small">It will immediately lose access. You can then pair a new phone.</p><div class="row"><button class="danger sm" id="yes">Remove phone</button><button class="ghost sm" id="no">Cancel</button></div></div>`;
    $('#yes').onclick = () => act('removePhone'); $('#no').onclick = () => { $('#confirmBox').innerHTML = ''; };
  });
  chk('#tMon', (v) => act('monitoringPaused', v)); chk('#tBc', (v) => act('broadcastPaused', v));
  chk('#tAuto', (v) => act('setSetting', { k: 'autostart', v })); chk('#tBrowser', (v) => act('setSetting', { k: 'browserEnabled', v }));
  chk('#tTitles', (v) => act('setSetting', { k: 'shareTabTitles', v })); chk('#tWin', (v) => act('setSetting', { k: 'liveWindowTitles', v }));
  document.querySelectorAll('[data-ext]').forEach((b) => (b.onclick = () => act('openExtensionsPage', b.dataset.ext)));
  on('#openExt', () => act('openExtensionFolder')); on('#copyTok', (e) => { act('copyToken'); $('#copyTok').textContent = 'Copied ✓'; });
  on('#openData', () => act('openDataFolder'));
  on('#clearHist', () => { if (confirm('Delete all recorded activity history on this laptop?')) act('clearHistory'); });
  on('#adv_save', async () => {
    const num = (id, lo, hi, d) => Math.min(hi, Math.max(lo, parseInt($(id).value, 10) || d));
    await pmUI.action('setSetting', { k: 'relayToken', v: $('#adv_tok').value.trim() });
    await pmUI.action('setSetting', { k: 'idleSeconds', v: num('#adv_idle', 30, 3600, 120) });
    await pmUI.action('setSetting', { k: 'retentionDays', v: num('#adv_ret', 7, 3650, 90) });
    await pmUI.action('setSetting', { k: 'excludeDomains', v: $('#adv_ex').value.split(/\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean) });
    const url = $('#adv_relay').value.trim().replace(/\/+$/, ''); if (url !== S.settings.relayUrl && /^https?:\/\//.test(url)) await pmUI.action('setSetting', { k: 'relayUrl', v: url });
    $('#adv_save').textContent = 'Saved ✓'; setTimeout(() => pmUI.getState().then((s) => { S = s; render(); }), 900);
  });
}

pmUI.onState((s) => { S = s; render(); });
pmUI.getState().then((s) => { S = s; render(); });
setInterval(() => pmUI.getState().then((s) => { S = s; render(); }), 5000);
