'use strict';
(() => {
  const C = KFCatalog, A = KFAccel;
  let S = null;                    // latest state snapshot from main
  let view = 'home';               // home | editor | settings
  let draft = null;                // shortcut being edited
  let draftIsNew = false;
  let openStep = null;             // expanded step id
  let filter = { q: '', cat: '' };
  let errors = [];
  let runningIds = new Set();

  const $app = document.getElementById('app');

  // ---------- tiny DOM helper ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  function toast(msg, kind = '') {
    const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3200);
  }

  const profile = () => S.config.profiles.find((p) => p.id === S.config.activeProfileId);
  const pretty = (k) => (k ? A.pretty(k) : '');

  function apply(res) {
    if (res && res.state) { S = res.state; }
    return res;
  }
  async function call(promise, okMsg) {
    const res = await promise;
    if (res && res.ok === false) { if (!res.cancelled && res.errors) toast(res.errors.join(' '), 'bad'); return res; }
    apply(res);
    if (okMsg) toast(okMsg, 'ok');
    return res;
  }

  // ---------- header ----------
  function header() {
    const paused = S.config.settings.paused;
    const sel = h('select', { class: 'profile-sel', 'aria-label': 'Profile', onChange: async (e) => {
      if (e.target.value === '__new') {
        e.target.value = S.config.activeProfileId;
        const name = await promptText('New profile name', 'e.g. Work, Development, Personal');
        if (name) { await call(kf.addProfile(name)); render(); }
      } else { await call(kf.switchProfile(e.target.value)); render(); }
    } },
      S.config.profiles.map((p) => h('option', { value: p.id, selected: p.id === S.config.activeProfileId }, p.name)),
      h('option', { value: '__new' }, '＋ New profile…'));
    return h('header', { class: 'top' },
      h('div', { class: 'brand', onClick: () => { view = 'home'; render(); }, style: 'cursor:pointer' }, h('div', { class: 'logo' }, '⚡'), 'KeyFlow'),
      sel,
      h('div', { class: 'spacer' }),
      h('label', { class: 'master ' + (paused ? 'off' : 'on'), title: 'Turn all shortcuts on or off' },
        paused ? 'Shortcuts paused' : 'Shortcuts on',
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: !paused, 'aria-label': 'All shortcuts enabled', onChange: async (e) => { await call(kf.setPaused(!e.target.checked)); render(); } }), h('span'))),
      h('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings', onClick: () => { view = view === 'settings' ? 'home' : 'settings'; render(); } }, '⚙'),
      h('button', { class: 'btn primary', onClick: () => newShortcut() }, '＋ New shortcut'));
  }

  // ---------- small dialogs ----------
  function promptText(title, placeholder, initial = '') {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'text', class: 'inp', placeholder, value: initial, maxlength: 40 });
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = h('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;z-index:40' },
        h('div', { class: 'card', style: 'width:360px;margin:0', role: 'dialog', 'aria-label': title },
          h('h3', {}, title), inp,
          h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px' },
            h('button', { class: 'btn', onClick: () => done(null) }, 'Cancel'),
            h('button', { class: 'btn primary', onClick: () => done(inp.value.trim() || null) }, 'OK'))));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); });
      document.body.append(overlay); inp.focus(); inp.select();
    });
  }
  function confirmDialog(title, text, okLabel = 'Delete') {
    return new Promise((resolve) => {
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = h('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;z-index:40' },
        h('div', { class: 'card', style: 'width:380px;margin:0', role: 'alertdialog', 'aria-label': title },
          h('h3', {}, title), h('p', { class: 'hint' }, text),
          h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px' },
            h('button', { class: 'btn', onClick: () => done(false) }, 'Cancel'),
            h('button', { class: 'btn primary', onClick: () => done(true) }, okLabel))));
      document.body.append(overlay);
    });
  }

  // ---------- home ----------
  function statusOf(s) {
    const st = S.status[s.id] || { state: 'disabled' };
    const label = { active: 'Active', disabled: 'Off', paused: 'Paused', conflict: 'Conflict', failed: "Can't register", invalid: 'Invalid keys' }[st.state] || st.state;
    return { ...st, label };
  }

  function rowMenu(s, anchor) {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'menu', style: `top:${r.bottom + 4}px;left:${Math.max(8, r.right - 160)}px` },
      h('button', { onClick: () => editShortcut(s) }, 'Edit'),
      h('button', { onClick: async () => { const res = await call(kf.duplicateShortcut(s.id), 'Duplicated — set new keys to enable the copy.'); if (res.ok) render(); } }, 'Duplicate'),
      h('button', { class: 'danger', onClick: async () => { if (await confirmDialog('Delete shortcut?', `"${s.name}" will be removed.`)) { await call(kf.deleteShortcut(s.id), 'Deleted.'); render(); } } }, 'Delete'));
    document.body.append(m);
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  }

  function shortcutRow(s) {
    const st = statusOf(s);
    const stats = S.stats[s.id];
    return h('div', { class: 'row' + (s.enabled ? '' : ' off'), tabindex: 0, onClick: () => editShortcut(s), onKeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) editShortcut(s); } },
      h('label', { class: 'switch', onClick: (e) => e.stopPropagation(), title: s.enabled ? 'Turn off' : 'Turn on' },
        h('input', { type: 'checkbox', checked: s.enabled, 'aria-label': `Enable ${s.name}`, onChange: async (e) => {
          const res = await call(kf.toggleShortcut(s.id, e.target.checked));
          const st2 = S.status[s.id]; if (res.ok && st2 && st2.message) toast(st2.message, 'bad'); render(); } }), h('span')),
      h('div', { class: 'rmain' },
        h('div', { class: 'rname' }, s.name),
        h('div', { class: 'rsub' }, s.actions.map(C.summarize).join('  →  ') || 'No actions yet'),
        st.message && s.enabled ? h('div', { class: 'status-msg' }, st.message) : null),
      h('div', { class: 'rmeta' },
        s.category ? h('span', { class: 'tag' }, s.category) : null,
        stats && stats.runs ? h('span', { class: 'tag', title: stats.failures ? `${stats.failures} failed` : '' }, `${stats.runs}×`) : null,
        s.keys ? h('kbd', {}, pretty(s.keys)) : h('span', { class: 'tag' }, 'no keys'),
        h('span', { class: 'dot ' + st.state, title: st.label + (st.message ? ' — ' + st.message : '') }),
        h('button', { class: 'icon-btn', title: 'Run now', 'aria-label': `Run ${s.name}`, onClick: async (e) => { e.stopPropagation(); await call(kf.runShortcut(s.id)); } }, runningIds.has(s.id) ? '…' : '▶'),
        h('button', { class: 'icon-btn', title: 'More', 'aria-label': 'More actions', onClick: (e) => { e.stopPropagation(); rowMenu(s, e.currentTarget); } }, '⋯')));
  }

  function home() {
    const p = profile();
    const cats = [...new Set(p.shortcuts.map((s) => s.category).filter(Boolean))].sort();
    if (filter.cat && !cats.includes(filter.cat)) filter.cat = '';
    const q = filter.q.trim().toLowerCase();
    const list = p.shortcuts.filter((s) => (!filter.cat || s.category === filter.cat) &&
      (!q || `${s.name} ${s.category} ${pretty(s.keys)} ${s.actions.map(C.summarize).join(' ')}`.toLowerCase().includes(q)));
    const bad = p.shortcuts.filter((s) => s.enabled && ['conflict', 'failed', 'invalid'].includes((S.status[s.id] || {}).state)).length;

    const search = h('input', { class: 'search', type: 'search', placeholder: 'Search shortcuts…', value: filter.q, 'aria-label': 'Search shortcuts' });
    search.addEventListener('input', () => { filter.q = search.value; const pos = search.selectionStart; render(); const n = document.querySelector('.search'); n.focus(); n.setSelectionRange(pos, pos); });

    return h('div', { class: 'wrap' },
      !S.config.onboarded && p.shortcuts.length ? h('div', { class: 'banner info' }, h('div', { class: 'grow' }, h('b', {}, 'Welcome to KeyFlow! '), 'A few example shortcuts are included but switched off. Turn on the ones you like, or edit them to suit you.'),
        h('button', { class: 'btn sm', onClick: async () => { await kf.markOnboarded(); S.config.onboarded = true; render(); } }, 'Got it')) : null,
      S.config.settings.paused ? h('div', { class: 'banner warn' }, h('div', { class: 'grow' }, 'All shortcuts are paused.'), h('button', { class: 'btn sm', onClick: async () => { await call(kf.setPaused(false)); render(); } }, 'Resume')) : null,
      bad ? h('div', { class: 'banner bad' }, `${bad} shortcut${bad > 1 ? 's' : ''} could not be registered — see the red items below.`) : null,
      p.shortcuts.length ? h('div', { class: 'toolbar' }, search) : null,
      cats.length ? h('div', { class: 'chips' }, [['', 'All'], ...cats.map((c) => [c, c])].map(([v, l]) => h('button', { class: 'chip' + (filter.cat === v ? ' on' : ''), onClick: () => { filter.cat = v; render(); } }, l))) : null,
      list.length ? h('div', { class: 'list' }, list.map(shortcutRow))
        : h('div', { class: 'empty' }, p.shortcuts.length ? h('div', {}, 'No shortcuts match your search.')
          : h('div', {}, h('h2', {}, 'No shortcuts yet'), h('p', {}, 'Assign a key combination to anything you do often.'), h('button', { class: 'btn primary', onClick: () => newShortcut() }, '＋ Create your first shortcut'))));
  }

  // ---------- editor ----------
  function newShortcut() {
    draft = { id: C.uid('s'), name: '', keys: '', category: '', enabled: true, actions: [], createdAt: Date.now() };
    draftIsNew = true; openStep = null; errors = []; view = 'editor'; render();
    setTimeout(() => { const n = document.getElementById('f-name'); if (n) n.focus(); }, 0);
  }
  function editShortcut(s) {
    draft = JSON.parse(JSON.stringify(s)); draftIsNew = false; openStep = null; errors = []; view = 'editor'; render();
  }

  function recorder(getKeys, setKeys, { ignoreId, allowEmpty = false, onResult } = {}) {
    const box = h('div', { class: 'recorder', tabindex: 0, role: 'button', 'aria-label': 'Record key combination. Click, then press the keys.' });
    const msg = h('div', { class: 'msg' });
    let recording = false;
    const paint = (live) => {
      box.textContent = '';
      box.classList.toggle('rec', recording);
      const keys = live != null ? live : getKeys();
      if (recording && !live) box.append(h('span', { class: 'ph' }, 'Press your shortcut now… (Esc to cancel)'));
      else if (keys) keys.split('+').forEach((k) => box.append(h('span', { class: 'kbd' }, A.pretty(k) || k)));
      else box.append(h('span', { class: 'ph' }, 'Click here, then press the keys you want'));
    };
    async function stop() {
      if (!recording) return;
      recording = false;
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onUp, true);
      await kf.suspendHotkeys(false);
      paint();
    }
    async function check(fromUser = true) {
      const k = getKeys();
      msg.className = 'msg'; msg.textContent = '';
      if (!k) { if (onResult && fromUser) onResult({ ok: true, accelerator: '' }); return; }
      const r = await kf.checkKeys(k, ignoreId);
      if (!r.ok) { msg.className = 'msg bad'; msg.textContent = r.error; }
      else if (r.warnings && r.warnings.length) { msg.className = 'msg warn'; msg.textContent = r.warnings.join(' '); }
      else { msg.className = 'msg ok'; msg.textContent = 'This combination is available.'; }
      if (onResult && fromUser) onResult(r);
    }
    function onKey(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      const { mods, key } = A.eventToParts(e);
      if (e.key === 'Escape' && !mods.length) { stop(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !mods.length && allowEmpty) { setKeys(''); stop().then(() => check()); return; }
      if (!key) { paint(mods.join('+')); return; }                 // only modifiers so far
      setKeys(A.build(mods, key)); stop().then(() => check());
    }
    function onUp(e) { e.preventDefault(); }
    async function start() {
      if (recording) return;
      recording = true; msg.textContent = '';
      await kf.suspendHotkeys(true);
      document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onUp, true);
      paint();
    }
    box.addEventListener('click', start);
    box.addEventListener('keydown', (e) => { if (!recording && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); } });
    box.addEventListener('blur', () => stop());
    paint(); if (getKeys()) check(false);
    return h('div', {}, box, msg);
  }

  function field(label, input, hint) { return h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null); }
  const text = (obj, key, ph = '', onInput) => h('input', { type: 'text', value: obj[key] || '', placeholder: ph, spellcheck: 'false', onInput: (e) => { obj[key] = e.target.value; if (onInput) onInput(); } });
  function pathField(obj, key, { folder = false, ph = '', filters } = {}) {
    const inp = text(obj, key, ph);
    return h('div', { class: 'with-btn' }, inp, h('button', { class: 'btn', type: 'button', onClick: async () => {
      const p = await kf.pick({ folder, filters, defaultPath: obj[key] || undefined }); if (p) { obj[key] = p; inp.value = p; inp.dispatchEvent(new Event('input')); } } }, 'Browse…'));
  }
  const sel = (obj, key, options, onChange) => h('select', { onChange: (e) => { obj[key] = e.target.value; if (onChange) onChange(); } },
    options.map(([v, l]) => h('option', { value: v, selected: obj[key] === v }, l)));

  const APPS = [['', 'Pick a common app…'], ['chrome', 'Google Chrome'], ['msedge', 'Microsoft Edge'], ['firefox', 'Firefox'], ['code', 'Visual Studio Code'],
    ['notepad.exe', 'Notepad'], ['explorer.exe', 'File Explorer'], ['calc.exe', 'Calculator'], ['mspaint.exe', 'Paint'], ['wt.exe', 'Windows Terminal'],
    ['powershell.exe', 'PowerShell'], ['cmd.exe', 'Command Prompt'], ['taskmgr.exe', 'Task Manager'], ['winword', 'Word'], ['excel', 'Excel'], ['spotify', 'Spotify']];

  function stepForm(a, rerenderSummary) {
    const f = [];
    switch (a.type) {
      case 'app': {
        const pathInp = pathField(a, 'path', { ph: 'e.g. chrome, code, or C:\\Program Files\\App\\app.exe', filters: [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] }] });
        const common = h('select', { onChange: (e) => { if (e.target.value) { a.path = e.target.value; pathInp.querySelector('input').value = a.path; rerenderSummary(); } e.target.value = ''; } },
          APPS.map(([v, l]) => h('option', { value: v }, l)));
        f.push(field('Common apps', common), field('Program', pathInp, 'Program name or full path. Environment variables like %USERPROFILE% work.'),
          field('Arguments (optional)', text(a, 'args', 'e.g. --new-window https://example.com', rerenderSummary)),
          field('Start in folder (optional)', pathField(a, 'cwd', { folder: true })));
        break;
      }
      case 'window':
        f.push(field('What to do', sel(a, 'mode', C.WINDOW_MODES, rerenderSummary)),
          field('Program name', text(a, 'process', 'e.g. chrome, Code, notepad', rerenderSummary), 'The process name shown in Task Manager (without .exe).'),
          field('If it isn\'t running, start it (optional)', pathField(a, 'launchPath', { ph: 'Only used for "Switch to it"' })));
        break;
      case 'folder': {
        const known = ['', 'code', 'cursor'];
        const custom = !known.includes(a.openWith);
        const ow = h('select', { onChange: (e) => { a.openWith = e.target.value === '__custom' ? '' : e.target.value; customRow.style.display = e.target.value === '__custom' ? '' : 'none'; rerenderSummary(); } },
          [['', 'File Explorer'], ['code', 'Visual Studio Code'], ['cursor', 'Cursor'], ['__custom', 'Another program…']].map(([v, l]) => h('option', { value: v, selected: v === (custom ? '__custom' : a.openWith) }, l)));
        const customRow = h('div', { style: custom ? '' : 'display:none' }, field('Program', pathField(a, 'openWith', { ph: 'Path to the program' })));
        f.push(field('Folder', pathField(a, 'path', { folder: true, ph: 'e.g. %USERPROFILE%\\Downloads' })), field('Open with', ow), customRow);
        break;
      }
      case 'file': f.push(field('File', pathField(a, 'path'), 'Opens with the default program for this file type.')); break;
      case 'url':
        f.push(field('Web address', text(a, 'url', 'https://', rerenderSummary)), field('Browser', sel(a, 'browser', C.BROWSERS)));
        break;
      case 'system': {
        const groups = {};
        for (const [id, d] of Object.entries(S.system)) (groups[d.group] = groups[d.group] || []).push([id, d]);
        const s = h('select', { onChange: (e) => { a.sys = e.target.value; rerenderSummary(); } },
          Object.entries(groups).map(([g, items]) => h('optgroup', { label: g }, items.map(([id, d]) => h('option', { value: id, selected: a.sys === id }, d.label + (d.confirm ? ' (asks first)' : ''))))));
        f.push(field('Action', s)); break;
      }
      case 'terminal':
        f.push(field('Start in folder', pathField(a, 'dir', { folder: true, ph: 'e.g. C:\\Projects\\my-app' }), 'Leave empty to use your home folder.'),
          field('Run this command in it (optional)', h('textarea', { spellcheck: 'false', onInput: (e) => { a.command = e.target.value; rerenderSummary(); } }, a.command)),
          field('Terminal', sel(a, 'shell', [['auto', 'Windows Terminal (falls back to PowerShell)'], ['powershell', 'PowerShell'], ['cmd', 'Command Prompt']])));
        break;
      case 'command': {
        const isInline = a.kind === 'powershell' || a.kind === 'cmd';
        const body = h('div');
        const draw = () => {
          body.textContent = '';
          const inline = a.kind === 'powershell' || a.kind === 'cmd';
          body.append(...[
            inline ? field('Command', h('textarea', { spellcheck: 'false', placeholder: a.kind === 'cmd' ? 'e.g. npm run dev' : 'e.g. docker compose up -d', onInput: (e) => { a.command = e.target.value; rerenderSummary(); } }, a.command))
              : field('Script file', pathField(a, 'command', { filters: [{ name: 'Scripts', extensions: a.kind === 'python' ? ['py'] : a.kind === 'psfile' ? ['ps1'] : ['bat', 'cmd'] }] })),
            inline ? null : field('Arguments (optional)', text(a, 'args')),
            field('Working folder (optional)', pathField(a, 'cwd', { folder: true })),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.waitForExit, onChange: (e) => { a.waitForExit = e.target.checked; } }), 'Wait for it to finish before the next step'),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.hidden, onChange: (e) => { a.hidden = e.target.checked; } }), 'Run in the background (hide the window)')].filter(Boolean));
        };
        f.push(field('Type', sel(a, 'kind', C.COMMAND_KINDS, () => { a.command = ''; draw(); rerenderSummary(); })), body,
          h('div', { class: 'note' }, 'Commands run with your Windows permissions. Only add commands you trust.'));
        draw(); void isInline; break;
      }
      case 'wait':
        f.push(field('Seconds to wait', h('input', { type: 'number', min: 0.1, max: 600, step: 0.1, value: a.ms / 1000, onInput: (e) => { a.ms = Math.round(parseFloat(e.target.value || 0) * 1000); rerenderSummary(); } })));
        break;
    }
    if (a.type !== 'wait') {
      f.push(h('details', { class: 'adv' }, h('summary', {}, 'Advanced'),
        h('div', { class: 'grid2' },
          field('If this step fails', sel(a, 'onError', [['stop', 'Stop the shortcut'], ['continue', 'Carry on with the next step']])),
          field('Run this step', sel(a, 'runIf', [['always', 'Always'], ['previousSucceeded', 'Only if the previous step worked']]))),
        field('Wait after this step (seconds)', h('input', { type: 'number', min: 0, max: 600, step: 0.5, value: a.delayAfterMs / 1000, onInput: (e) => { a.delayAfterMs = Math.round(parseFloat(e.target.value || 0) * 1000); } }),
          'Give slow programs time to open before the next step.')));
    }
    return f;
  }

  function stepsEditor() {
    const wrap = h('div');
    const draw = () => {
      wrap.textContent = '';
      draft.actions.forEach((a, i) => {
        const T = C.TYPES[a.type];
        const sum = h('span', { class: 'sum' }, C.summarize(a));
        const open = openStep === a.id;
        const body = open ? h('div', { class: 'step-body' }, stepForm(a, () => { sum.textContent = C.summarize(a); })) : null;
        const move = (d) => (e) => { e.stopPropagation(); const j = i + d; if (j < 0 || j >= draft.actions.length) return; [draft.actions[i], draft.actions[j]] = [draft.actions[j], draft.actions[i]]; draw(); };
        wrap.append(h('div', { class: 'step' + (a.enabled ? '' : ' disabled') },
          h('div', { class: 'step-head', onClick: () => { openStep = open ? null : a.id; draw(); } },
            h('span', { class: 'num' }, i + 1), h('span', {}, T.icon), sum,
            h('button', { class: 'icon-btn', title: 'Move up', 'aria-label': 'Move step up', disabled: i === 0, onClick: move(-1) }, '↑'),
            h('button', { class: 'icon-btn', title: 'Move down', 'aria-label': 'Move step down', disabled: i === draft.actions.length - 1, onClick: move(1) }, '↓'),
            h('label', { class: 'switch', title: 'Skip this step', onClick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: a.enabled, 'aria-label': 'Step enabled', onChange: (e) => { a.enabled = e.target.checked; draw(); } }), h('span')),
            h('button', { class: 'icon-btn', title: 'Remove step', 'aria-label': 'Remove step', onClick: (e) => { e.stopPropagation(); draft.actions.splice(i, 1); draw(); } }, '✕')),
          body));
      });
      const picker = h('div', { class: 'picker', style: 'display:none' },
        Object.entries(C.TYPES).map(([t, T]) => h('button', { class: 'pick', type: 'button', onClick: () => {
          const a = C.defaultAction(t); if (t === 'wait') a.ms = 1000; draft.actions.push(a); openStep = a.id; draw();
          setTimeout(() => { const el = wrap.querySelector('.step:last-of-type'); if (el) el.scrollIntoView({ block: 'nearest' }); }, 0); } },
          h('b', {}, `${T.icon} ${T.label}`), h('small', {}, T.hint))));
      const empty = !draft.actions.length;
      if (!empty) picker.style.display = 'none'; else picker.style.display = '';
      wrap.append(...[
        empty ? h('p', { class: 'hint' }, 'Choose what this shortcut should do. You can add several steps — they run in order.') : null,
        empty ? null : h('button', { class: 'btn', type: 'button', onClick: () => { picker.style.display = picker.style.display === 'none' ? '' : 'none'; } }, '＋ Add another action'),
        picker].filter(Boolean));
    };
    draw();
    return wrap;
  }

  async function saveDraft() {
    draft.name = draft.name.trim();
    errors = C.shortcutProblems(draft);
    if (errors.length) { render(); window.scrollTo(0, 0); document.querySelector('.main').scrollTop = 0; return; }
    const res = await kf.saveShortcut(draft);
    if (!res.ok) { errors = res.errors || ['Could not save.']; render(); document.querySelector('.main').scrollTop = 0; return; }
    S = res.state;
    if (res.registration && draft.enabled && ['failed', 'conflict'].includes(res.registration.state)) toast('Saved, but ' + res.registration.message, 'bad');
    else toast('Saved.', 'ok');
    view = 'home'; render();
  }

  function editor() {
    const nameInp = h('input', { id: 'f-name', type: 'text', value: draft.name, maxlength: 80, placeholder: 'e.g. Open my project', onInput: (e) => { draft.name = e.target.value; } });
    const cats = [...new Set(S.config.profiles.flatMap((p) => p.shortcuts.map((s) => s.category)).filter(Boolean))];
    return h('div', { class: 'wrap' },
      h('button', { class: 'btn ghost back', onClick: async () => { if (await confirmDialog('Discard changes?', 'Your edits to this shortcut will be lost.', 'Discard')) { view = 'home'; render(); } } }, '← Back'),
      h('h2', { style: 'margin:0 0 12px' }, draftIsNew ? 'New shortcut' : 'Edit shortcut'),
      errors.length ? h('div', { class: 'errors', role: 'alert' }, h('ul', {}, errors.map((e) => h('li', {}, e)))) : null,
      h('div', { class: 'card' },
        h('div', { class: 'grid2' }, field('1. Name', nameInp), field('Category (optional)', h('div', {}, h('input', { class: 'inp', type: 'text', list: 'cats', value: draft.category, maxlength: 40, placeholder: 'e.g. Work', onInput: (e) => { draft.category = e.target.value; } }), h('datalist', { id: 'cats' }, cats.map((c) => h('option', { value: c })))))),
        field('2. Keyboard shortcut', recorder(() => draft.keys, (k) => { draft.keys = k; }, { ignoreId: draft.id }), 'Include Ctrl, Alt, Shift or Win. Tip: Ctrl + Alt + a letter rarely clashes with other programs.')),
      h('div', { class: 'card' }, h('h3', {}, '3. What should it do?'), stepsEditor()),
      h('div', { class: 'card' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.enabled, onChange: (e) => { draft.enabled = e.target.checked; } }), 'Shortcut is turned on')),
      h('div', { class: 'savebar' },
        h('button', { class: 'btn', onClick: () => { view = 'home'; render(); } }, 'Cancel'),
        h('button', { class: 'btn primary', onClick: saveDraft }, 'Save shortcut')));
  }

  // ---------- settings ----------
  function toggleRow(title, desc, key) {
    return h('div', { class: 'set-row' }, h('div', {}, h('div', { class: 't' }, title), h('div', { class: 'd' }, desc)),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.config.settings[key], 'aria-label': title, onChange: async (e) => { await call(kf.setSettings({ [key]: e.target.checked })); render(); } }), h('span')));
  }
  function hotkeyRow(title, desc, key) {
    let val = S.config.settings[key];
    const st = S.appStatus[key.replace('Hotkey', '')];
    const rec = recorder(() => val, (k) => { val = k; }, { allowEmpty: true, ignoreId: key.replace('Hotkey', ''), onResult: async (r) => {
      if (r.ok === false && !r.accelerator) return;
      const res = await call(kf.setSettings({ [key]: val })); if (res.ok) toast('Saved.', 'ok'); } });
    return h('div', { class: 'set-row', style: 'align-items:flex-start' }, h('div', { style: 'flex:1' }, h('div', { class: 't' }, title), h('div', { class: 'd' }, desc),
      st && st.state === 'failed' ? h('div', { class: 'status-msg' }, st.message) : null), h('div', { style: 'width:280px' }, rec));
  }
  function ago(t) { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }

  function settingsView() {
    const p = profile();
    const rows = p.shortcuts.map((s) => ({ s, st: S.stats[s.id] || { runs: 0, failures: 0, lastRun: 0 } })).sort((a, b) => b.st.runs - a.st.runs);
    return h('div', { class: 'wrap' },
      h('button', { class: 'btn ghost back', onClick: () => { view = 'home'; render(); } }, '← Back'),
      h('h2', { style: 'margin:0 0 12px' }, 'Settings'),
      h('div', { class: 'card' }, h('h3', {}, 'General'),
        toggleRow('Start with Windows', S.packaged ? 'KeyFlow starts quietly in the tray when you sign in.' : 'Available in the installed version of KeyFlow.', 'startWithWindows'),
        toggleRow('Start minimized to tray', 'Don\'t open the window at startup.', 'startMinimized'),
        toggleRow('Keep running when the window is closed', 'Closing the window hides KeyFlow in the system tray so shortcuts keep working. Quit from the tray menu.', 'closeToTray'),
        toggleRow('Notify me when a shortcut fails', 'Shows a Windows notification with the reason.', 'notifyOnFailure'),
        toggleRow('Notify me when a shortcut succeeds', 'Usually unnecessary; off by default.', 'notifyOnSuccess')),
      h('div', { class: 'card' }, h('h3', {}, 'Master hotkeys'),
        hotkeyRow('Command palette', 'Search and run any shortcut from anywhere. Click, press new keys; Backspace clears.', 'paletteHotkey'),
        hotkeyRow('Pause / resume all shortcuts', 'Quickly switch every shortcut off and on again.', 'pauseHotkey')),
      h('div', { class: 'card' }, h('h3', {}, `Profiles — "${p.name}"`),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', { class: 'btn', onClick: async () => { const n = await promptText('Rename profile', '', p.name); if (n) { await call(kf.renameProfile(p.id, n)); render(); } } }, 'Rename'),
          h('button', { class: 'btn danger', onClick: async () => { if (await confirmDialog('Delete profile?', `"${p.name}" and its ${p.shortcuts.length} shortcut(s) will be removed (a backup is made first).`)) { await call(kf.deleteProfile(p.id), 'Profile deleted.'); render(); } } }, 'Delete')),
        h('p', { class: 'hint' }, 'Only the shortcuts of the selected profile are active. Switch profiles from the top bar or the tray menu.')),
      h('div', { class: 'card' }, h('h3', {}, 'Import, export & backup'),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', { class: 'btn', onClick: async () => { const r = await call(kf.exportConfig('profile')); if (r.ok) toast('Exported.', 'ok'); } }, 'Export this profile'),
          h('button', { class: 'btn', onClick: async () => { const r = await call(kf.exportConfig('all')); if (r.ok) toast('Exported.', 'ok'); } }, 'Export everything'),
          h('button', { class: 'btn', onClick: async () => { const r = await call(kf.importConfig()); if (r.ok) { toast(`Imported ${r.imported} shortcut(s). Imported commands ask for approval before their first run.`, 'ok'); view = 'home'; render(); } } }, 'Import…'),
          h('button', { class: 'btn', onClick: async () => { await call(kf.createBackup(), 'Backup created.'); render(); } }, 'Back up now'),
          h('button', { class: 'btn', onClick: () => kf.openBackupFolder() }, 'Open backup folder')),
        S.backups.length ? h('div', { style: 'margin-top:12px' }, h('div', { class: 'lbl' }, 'Restore from a backup'),
          h('select', { class: 'inp', 'aria-label': 'Backups', onChange: async (e) => { const n = e.target.value; e.target.value = ''; if (!n) return; const r = await call(kf.restoreBackup(n), 'Backup restored.'); if (r.ok) { view = 'home'; render(); } } },
            h('option', { value: '' }, 'Choose a backup…'), S.backups.map((b) => h('option', { value: b.name }, new Date(b.time).toLocaleString() + ' — ' + (b.name.match(/-(auto|manual|startup|pre-[a-z]+)\.json$/) || [, 'backup'])[1])))) : null,
        h('p', { class: 'hint' }, 'A backup is made automatically at every start and before risky changes (import, restore, deleting a profile).')),
      h('div', { class: 'card' }, h('h3', {}, 'Usage statistics'),
        rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Shortcut', 'Runs', 'Failed', 'Last used'].map((x) => h('th', {}, x)))),
          h('tbody', {}, rows.map(({ s, st }) => h('tr', {}, h('td', {}, s.name), h('td', {}, st.runs), h('td', {}, st.failures), h('td', {}, ago(st.lastRun)))))) : h('p', { class: 'hint' }, 'Nothing yet.'),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm', onClick: async () => { await call(kf.resetStats(), 'Statistics reset.'); render(); } }, 'Reset statistics'))),
      h('p', { class: 'hint', style: 'text-align:center' }, `KeyFlow ${S.version}`));
  }

  // ---------- render ----------
  function render() {
    if (!S) return;
    const scroll = document.querySelector('.main') ? document.querySelector('.main').scrollTop : 0;
    $app.textContent = '';
    $app.append(header(), h('main', { class: 'main' }, view === 'editor' ? editor() : view === 'settings' ? settingsView() : home()));
    document.querySelector('.main').scrollTop = scroll;
  }

  kf.onState((patch) => {
    if (patch.config) { S = { ...S, ...patch }; if (view !== 'editor') render(); else if (patch.config) { /* keep editing */ } }
    else if (patch.stats) { S.stats = patch.stats; if (view === 'home' || view === 'settings') render(); }
  });
  kf.onRun((r) => {
    if (r.running) runningIds.add(r.id); else runningIds.delete(r.id);
    if (!r.running && r.manual) {
      if (r.cancelled) toast('Cancelled.');
      else if (r.ok) toast('Done.', 'ok');
      else toast(r.message || 'The shortcut failed.', 'bad');
    }
    if (view === 'home') render();
  });

  kf.getState().then((st) => { S = st; render(); });
})();
