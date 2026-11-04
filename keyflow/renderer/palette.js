'use strict';
(() => {
  const q = document.getElementById('q');
  const list = document.getElementById('list');
  let items = []; let sel = 0; let state = null;

  function visible() {
    const t = q.value.trim().toLowerCase();
    return items.filter((s) => !t || `${s.name} ${s.category} ${s.keys} ${s.actions.map(KFCatalog.summarize).join(' ')}`.toLowerCase().includes(t));
  }
  function render() {
    const v = visible();
    sel = Math.min(sel, Math.max(v.length - 1, 0));
    list.textContent = '';
    if (!v.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No matching shortcuts'; list.appendChild(li); return; }
    v.forEach((s, i) => {
      const li = document.createElement('li');
      if (i === sel) li.className = 'sel';
      if (!s.enabled) li.classList.add('off');
      const name = document.createElement('span'); name.className = 'pname'; name.textContent = s.name;
      const sub = document.createElement('span'); sub.className = 'psub'; sub.textContent = s.actions.map(KFCatalog.summarize).join(' → ');
      const keys = document.createElement('kbd'); keys.textContent = s.keys ? KFAccel.pretty(s.keys) : '';
      const left = document.createElement('div'); left.className = 'pleft'; left.append(name, sub);
      li.append(left, keys);
      li.addEventListener('click', () => kf.paletteRun(s.id));
      list.appendChild(li);
    });
    const el = list.querySelector('.sel'); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function load(st) {
    state = st;
    const p = st.config.profiles.find((x) => x.id === st.config.activeProfileId);
    items = p.shortcuts.filter((s) => s.actions.length);
    q.value = ''; sel = 0; render(); q.focus();
  }
  q.addEventListener('input', () => { sel = 0; render(); });
  document.addEventListener('keydown', (e) => {
    const v = visible();
    if (e.key === 'Escape') { e.preventDefault(); kf.paletteClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, v.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === 'Enter' && v[sel]) { e.preventDefault(); kf.paletteRun(v[sel].id); }
  });
  kf.onPaletteOpen(load);
  kf.getState().then(load);
})();
