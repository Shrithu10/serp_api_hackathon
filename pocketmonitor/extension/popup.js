const T = { ok: ['● Connected', 'ok'], 'bad-key': ['Key not accepted', 'bad'], 'no-app': ['App not running', 'bad'], paused: ['Sharing off', ''], 'app-off': ['Off in the app', 'bad'], 'needs-key': ['Needs setup', 'bad'] };
async function r() { const c = await chrome.storage.local.get({ enabled: true, status: null }); const t = c.status && T[c.status.state]; document.getElementById('s').textContent = t ? t[0] : '…'; document.getElementById('s').className = t ? t[1] : ''; document.getElementById('en').checked = c.enabled; }
r(); chrome.storage.onChanged.addListener(r);
document.getElementById('en').onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
document.getElementById('o').onclick = () => chrome.runtime.openOptionsPage();
