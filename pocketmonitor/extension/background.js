// PocketMonitor Browser Link (Chrome / Edge, Manifest V3).
// Sends ONLY: tab id, window id, tab title, website domain, active/pinned/audible flags.
// Never: page content, full URLs/paths/queries, passwords, form data, keystrokes, history, or private (incognito) windows.
// Talks ONLY to the PocketMonitor app on this computer (127.0.0.1), authenticated with a key you paste once.
const BASE = 'http://127.0.0.1:47821';

async function config() {
  const c = await chrome.storage.local.get({ token: '', enabled: true, titles: true, instance: null });
  if (!c.instance) { c.instance = crypto.randomUUID().replace(/-/g, '').slice(0, 16); await chrome.storage.local.set({ instance: c.instance }); }
  return c;
}
const browserName = () => ((navigator.userAgentData && navigator.userAgentData.brands || []).some((b) => /edge/i.test(b.brand)) || /Edg\//.test(navigator.userAgent)) ? 'edge' : 'chrome';
function domainOf(url) {
  try { const u = new URL(url); if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname.replace(/^www\./, ''); return (u.protocol.replace(':', '') || 'browser') + ' page'; } catch { return 'browser page'; }
}
const setStatus = (s) => chrome.storage.local.set({ status: { ...s, ts: Date.now() } });

async function snapshot() {
  const c = await config();
  if (!c.enabled) return setStatus({ state: 'paused' });
  if (!c.token) return setStatus({ state: 'needs-key' });
  const [tabs, win] = await Promise.all([chrome.tabs.query({}), chrome.windows.getLastFocused().catch(() => null)]);
  const body = {
    browser: browserName(), instance: c.instance, focusedWindowId: win ? win.id : -1, windowFocused: !!(win && win.focused),
    tabs: tabs.filter((t) => !t.incognito).map((t) => {
      const domain = domainOf(t.url || t.pendingUrl || '');
      return { id: t.id, windowId: t.windowId, title: c.titles ? String(t.title || '').slice(0, 200) : domain, domain, active: t.active, audible: !!t.audible, pinned: !!t.pinned };
    }),
  };
  try {
    const r = await fetch(BASE + '/v1/snapshot', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pm-token': c.token }, body: JSON.stringify(body) });
    if (r.status === 401) return setStatus({ state: 'bad-key' });
    const j = await r.json().catch(() => ({}));
    setStatus({ state: j.enabled === false ? 'app-off' : 'ok', tabs: body.tabs.length });
  } catch { setStatus({ state: 'no-app' }); }
}

let timer = null;
const soon = () => { clearTimeout(timer); timer = setTimeout(snapshot, 350); };
chrome.tabs.onActivated.addListener(soon);
chrome.tabs.onCreated.addListener(soon);
chrome.tabs.onRemoved.addListener(soon);
chrome.tabs.onUpdated.addListener((_id, info) => { if ('title' in info || 'url' in info || 'audible' in info || 'pinned' in info || info.status === 'complete') soon(); });
chrome.windows.onFocusChanged.addListener(soon);
chrome.windows.onRemoved.addListener(soon);
chrome.storage.onChanged.addListener((ch) => { if (ch.token || ch.enabled || ch.titles) soon(); });
chrome.alarms.create('pm-tick', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'pm-tick') snapshot(); });
chrome.runtime.onStartup.addListener(snapshot);
chrome.runtime.onInstalled.addListener((d) => { snapshot(); if (d.reason === 'install') chrome.runtime.openOptionsPage(); });
