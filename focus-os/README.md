# Focus OS

A privacy-first productivity operating system for Windows. Focus OS shows where your computer time goes, helps you run focus sessions, and turns real activity data into a focus score and insights. Everything runs and is stored **locally**.

**Stack:** Electron · React + TypeScript · Tailwind CSS · Zustand · Recharts · SQLite (`better-sqlite3`)

## Run it

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # launch the desktop app with hot reload
npm run dist         # build a Windows NSIS installer into release/
npm test             # unit + integration tests (metrics, classifier, SQLite, monitor, focus engine)
npm run dev:web      # UI-only preview in a browser with in-memory demo data (no Electron)
```

On Windows the app reads the real foreground window. On macOS/Linux it falls back to a clearly-labelled **simulated** window feed so the app remains explorable during development.

On first launch open **Settings → Data & privacy → Load demo data** to explore every screen with three weeks of sample activity (flagged as demo and removable).

## What it does

| Area | Implementation |
|---|---|
| Activity tracking | `src/main/windowProbe.ts` keeps one hidden PowerShell host that calls `GetForegroundWindow`, `GetWindowText` and `QueryFullProcessImageName` (user32/kernel32). Idle comes from Electron's `powerMonitor`. `src/main/monitor.ts` merges samples into time segments (start/end, app, exe, title) in SQLite. |
| Metrics | `src/shared/metrics.ts`: per-app time, app switches, context switches/hour, deep-work blocks, hourly breakdown, focus score. Pure functions, unit-tested. |
| Classification | `src/shared/classify.ts`. Productive / Neutral / Distracting from visible rules (app or window-title "contains"). Title rules beat app rules, your rules beat built-ins, unmatched = Neutral. Edit rules in Settings, and test any window against them. Rules apply retroactively because classification happens at read time. |
| Focus sessions | `src/main/focus.ts`: custom durations, Pomodoro with short/long breaks, pause/resume, allowed-apps list, distraction events (after a 5 s grace), uninterrupted streaks, consistency score. Distractions only trigger a notification; **nothing is ever blocked or closed**. |
| Insights | `src/shared/insights.ts`. Each insight is computed from recorded data, states its basis, and is omitted when there isn't enough data. |
| App experience | Tray icon with pause/resume and quick focus, minimize-to-tray, opt-in start with Windows, monitoring schedule, pause (15 min / 1 h / until resumed), CSV export (activity and sessions), delete-all, retention setting. |
| UI | Pages: Overview, Focus Sessions, Activity Timeline, Applications, Analytics, Insights, Settings. Dark theme, command palette (`Ctrl K`), shortcuts below. |

### Focus score (0-100)

`45% productive share + 25% deep-work share + 15% low distraction + 15% switch stability`. Idle time is excluded, and a score needs at least 5 minutes of activity. The breakdown is shown live on the Overview page.

### Keyboard shortcuts

`Ctrl K` command palette · `Ctrl 1-7` switch page · `Ctrl Shift P` pause/resume monitoring · `Ctrl Shift F` start/end a 25-minute focus session

## Privacy

- Data lives in one SQLite file in the app's user-data folder (path shown in Settings). No network requests; production builds ship a CSP that forbids them.
- Only the foreground app name, executable, window title and timestamps are recorded. **No screenshots, keylogging, microphone/webcam, clipboard or credential collection.**
- "Store window titles" can be turned off if titles may contain sensitive text (site detection then stops working).
- A monitoring indicator is always visible (sidebar, top bar, tray icon and tooltip). Pause and delete-everything are one click away.
- CSV export neutralises spreadsheet formula injection from window titles.
- Auto-start is off by default and only enabled when you opt in.

## Layout

```
src/main/      Electron main: SQLite store, window probe, monitor, focus engine, tray, IPC
src/preload/   contextBridge API (sandboxed renderer, no Node access)
src/shared/    Types, classifier, metrics, insights, demo-data generator (used by main and renderer)
src/renderer/  React UI (pages, components, Zustand store)
tests/         node:test suites
```

## Known limitations

- The Windows probe and tray/installer paths could only be exercised by unit/integration tests and a build on Linux; verify on a Windows machine with `npm run dev`.
- Elevated (administrator) windows may not expose their executable path; they are recorded under their window title or as "Unknown".
- Browser tabs are identified from window titles only; no browser extension is used.
