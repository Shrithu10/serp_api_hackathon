# KeyFlow

Assign any keyboard shortcut to anything you repeatedly do on your Windows PC —
open apps, folders, websites, Windows settings, run scripts, or chain several of
them into one workflow. Runs quietly in the system tray; the window doesn't need
to stay open for shortcuts to work.

## Install

* **Installer:** every push touching `keyflow/` builds `KeyFlow Setup x.y.z.exe` in GitHub
  Actions (artifact **KeyFlow-Setup**). Run it — no admin rights needed.
* **From source (Windows):** install Node 20+, then
  ```bash
  cd keyflow
  npm install
  npm start
  ```
* **Build the installer yourself (on Windows):** `npm run dist` → `dist/KeyFlow Setup *.exe`.

## Using it

1. **＋ New shortcut** → name it → click the key box and press e.g. `Ctrl + Alt + C` →
   **Add action** → fill in the details → **Save**.
2. Add several actions to make a **workflow**; reorder with ↑/↓, skip a step with its
   switch, and use *Advanced* for "wait after", "only if previous step worked" and
   "carry on if it fails".
3. Use the top-right switch (or `Ctrl+Alt+Shift+P`) to pause every shortcut.
   `Ctrl+Alt+Space` opens the command palette to search and run anything.

Action types: open app (with arguments), switch to/minimize/maximize/close a running app,
open file / folder (in Explorer, VS Code, Cursor, …), open website (default or chosen browser),
Windows actions (Settings pages, lock, volume & media keys, show desktop, sleep/restart/shut down…),
terminal in a folder, and commands (PowerShell, cmd, `.ps1`, `.bat`, Python), plus *Wait*.

## Safety

* Combinations such as `Ctrl+C`, `Alt+F4`, `Ctrl+Alt+Del`, `Win+L` can't be assigned; a modifier is required.
* Duplicate combinations are refused; combinations Windows or another app already owns are reported in red.
* Shutdown, restart, sign out, sleep and *Empty Recycle Bin* always ask first.
* Commands you type in the editor are trusted; commands that arrive via **import or backup restore**
  must be approved in a dialog before their first run. Nothing is run through string-built shell lines —
  user data is passed via environment variables / encoded commands.
* Config lives in `%APPDATA%\KeyFlow` (`config.json`, `stats.json`, `backups\`). It is written
  atomically; a damaged file is kept aside and restored from the newest backup. Updates never touch it.

## Development

```bash
npm test          # unit tests (key parsing, workflows, config, command building)
npm run icons     # regenerate assets/icon.*
```

Layout: `main/` (Electron main process: hotkeys, actions, config, tray) · `renderer/` (UI, no framework) ·
`shared/` (key + action schema used by both) · `preload/` (the only bridge, contextIsolation on).
