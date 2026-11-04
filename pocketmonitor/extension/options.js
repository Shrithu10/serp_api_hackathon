const $ = (id) => document.getElementById(id);
const MSG = { ok: ['Connected ✓', 'ok'], 'bad-key': ['That key was not accepted. Copy it again from the app.', 'bad'], 'no-app': ['Cannot reach the PocketMonitor app. Is it running?', 'bad'], paused: ['Sharing is off', ''], 'app-off': ['Browser monitoring is turned off in the app', 'bad'], 'needs-key': ['Paste the key first', 'bad'] };
async function show() { const { status } = await chrome.storage.local.get('status'); const m = status && MSG[status.state]; $('result').textContent = m ? m[0] : ''; $('result').className = m ? m[1] : ''; }
(async () => { const c = await chrome.storage.local.get({ token: '', enabled: true, titles: true }); $('token').value = c.token; $('enabled').checked = c.enabled; $('titles').checked = c.titles; show(); })();
$('save').onclick = async () => { await chrome.storage.local.set({ token: $('token').value.trim() }); $('result').textContent = 'Testing…'; setTimeout(show, 1500); };
$('enabled').onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
$('titles').onchange = (e) => chrome.storage.local.set({ titles: e.target.checked });
chrome.storage.onChanged.addListener(show);
