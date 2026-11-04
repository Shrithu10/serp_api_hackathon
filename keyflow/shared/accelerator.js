'use strict';
// Keyboard-combination helpers shared by the main process (authoritative
// validation) and the renderer (key recorder + friendly messages).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KFAccel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Super'];

  // KeyboardEvent.code -> Electron accelerator key name
  function codeToKey(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    if (/^Numpad[0-9]$/.test(code)) return 'num' + code.slice(6);
    const map = {
      Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
      Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
      Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
      NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv',
      NumpadDecimal: 'numdec', PrintScreen: 'PrintScreen', ScrollLock: 'Scrolllock', CapsLock: 'Capslock',
      NumLock: 'Numlock',
    };
    return map[code] || null;
  }

  const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;
  const isModifierCode = (code) => MODIFIER_CODES.test(code);

  function eventToParts(e) {
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    return { mods, key: isModifierCode(e.code) ? null : codeToKey(e.code) };
  }

  function build(mods, key) {
    const m = MOD_ORDER.filter((x) => mods.includes(x));
    return key ? [...m, key].join('+') : m.join('+');
  }

  const KEY_NAMES = new Set([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
    ...Array.from({ length: 24 }, (_, i) => 'F' + (i + 1)),
    ...Array.from({ length: 10 }, (_, i) => 'num' + i),
    'Space', 'Return', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
    'Up', 'Down', 'Left', 'Right', 'Esc', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`',
    'numadd', 'numsub', 'nummult', 'numdiv', 'numdec', 'PrintScreen', 'Scrolllock', 'Capslock', 'Numlock',
  ]);

  const ALIASES = {
    control: 'Ctrl', ctrl: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', alt: 'Alt', option: 'Alt',
    shift: 'Shift', super: 'Super', meta: 'Super', win: 'Super', windows: 'Super', cmd: 'Super',
  };

  /** Parse and normalise "ctrl+alt+c" -> {ok, accelerator, mods, key} */
  function parse(str) {
    if (typeof str !== 'string' || !str.trim()) return { ok: false, error: 'No keys pressed yet.' };
    const parts = str.split('+').map((s) => s.trim());
    // A literal "+" key is written as "Ctrl+Plus" — Electron's name for it.
    const mods = [];
    let key = null;
    for (const p of parts) {
      if (!p) return { ok: false, error: 'Invalid key combination.' };
      const mod = ALIASES[p.toLowerCase()];
      if (mod) { if (!mods.includes(mod)) mods.push(mod); continue; }
      if (key) return { ok: false, error: 'Only one non-modifier key is allowed.' };
      const norm = KEY_NAMES.has(p) ? p : [...KEY_NAMES].find((k) => k.toLowerCase() === p.toLowerCase());
      if (!norm) return { ok: false, error: `Unsupported key "${p}".` };
      key = norm;
    }
    if (!key) return { ok: false, error: 'Add a key after the modifiers (e.g. Ctrl + Alt + C).' };
    return { ok: true, mods, key, accelerator: build(mods, key) };
  }

  // Combinations that must never be hijacked (blocked) or that deserve a warning.
  const BLOCKED = new Set([
    'Ctrl+Alt+Delete', 'Alt+F4', 'Alt+Tab', 'Alt+Esc', 'Ctrl+Esc', 'Ctrl+Shift+Esc', 'Alt+Shift+Tab',
    'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+W',
    'Ctrl+T', 'Ctrl+N', 'Ctrl+O', 'Ctrl+R', 'Ctrl+Tab', 'Super+L', 'Super+D', 'Super+E', 'Super+R',
    'Super+Tab', 'Super+Space', 'Alt+Space', 'Shift+Delete', 'Ctrl+Shift+Z',
  ]);

  /** Validate an accelerator for use as a *global* hotkey. */
  function validate(str) {
    const p = parse(str);
    if (!p.ok) return { ok: false, error: p.error };
    const { mods, key, accelerator } = p;
    const isFn = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
    if (BLOCKED.has(accelerator)) {
      return { ok: false, error: `${pretty(accelerator)} is an important Windows/app shortcut and can't be reassigned.` };
    }
    if (mods.length === 0 && !(isFn && Number(key.slice(1)) >= 13)) {
      return { ok: false, error: 'Include at least one modifier (Ctrl, Alt, Shift or Win) so normal typing isn\'t affected.' };
    }
    const warnings = [];
    if (mods.length === 1 && mods[0] === 'Shift') warnings.push('Shift + key will interfere with normal typing. Add Ctrl or Alt.');
    if (mods.length === 1 && mods[0] === 'Super') warnings.push('Many Win-key shortcuts are reserved by Windows and may not register.');
    if (mods.length === 1 && mods[0] === 'Ctrl' && !isFn) warnings.push('Ctrl + key is used by most apps. Consider adding Alt.');
    return { ok: true, accelerator, warnings };
  }

  function pretty(str) {
    const p = parse(str);
    if (!p.ok) return str || '';
    const names = { Super: 'Win', Esc: 'Esc', Return: 'Enter' };
    return [...p.mods, p.key].map((x) => names[x] || x).join(' + ');
  }

  return { codeToKey, eventToParts, build, parse, validate, pretty, isModifierCode, MOD_ORDER };
});
