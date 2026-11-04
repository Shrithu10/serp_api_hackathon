'use strict';
const C = require('../shared/catalog');

function sc(name, keys, category, actions) {
  return C.sanitizeShortcut({ name, keys, category, enabled: false, actions: actions.map((a) => ({ ...C.defaultAction(a.type), ...a })) });
}

/** Starter shortcuts: all disabled so nothing surprising happens until the user opts in. */
function starterShortcuts() {
  return [
    sc('Open Downloads', 'Ctrl+Alt+D', 'Folders', [{ type: 'folder', path: '%USERPROFILE%\\Downloads' }]),
    sc('Open Notepad', 'Ctrl+Alt+N', 'Apps', [{ type: 'app', path: 'notepad.exe' }]),
    sc('Open Windows Settings', 'Ctrl+Alt+S', 'Windows', [{ type: 'system', sys: 'settings' }]),
    sc('Open Gmail', 'Ctrl+Alt+G', 'Web', [{ type: 'url', url: 'https://mail.google.com' }]),
    sc('Open Terminal', 'Ctrl+Alt+T', 'Developer', [{ type: 'terminal', dir: '%USERPROFILE%' }]),
    sc('Mail + Calendar morning', 'Ctrl+Alt+2', 'Web', [
      { type: 'url', url: 'https://mail.google.com', delayAfterMs: 800 },
      { type: 'url', url: 'https://calendar.google.com' },
    ]),
    sc('Lock computer', 'Ctrl+Alt+L', 'Windows', [{ type: 'system', sys: 'lock' }]),
  ];
}

module.exports = { starterShortcuts };
