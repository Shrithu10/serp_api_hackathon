# PocketMonitor

**Pair once. Open your phone anytime.** See whether your Windows laptop is online, what's running, what you're doing in your browser, how you use your computer, and watch its screen live.

A personal monitoring tool for **your own laptop**. It is *not* remote control: there is no mouse/keyboard input, no command execution, no keystroke capture.

```
┌────────────── Windows laptop ──────────────┐        ┌──────── relay (you host) ────────┐        ┌──── phone (any browser / PWA) ────┐
│ PocketMonitor (Electron tray app)          │  wss   │ serves the phone app              │  wss   │ Overview · Live · Apps · Browser  │
│  • monitor: foreground app, processes,     │───────▶│ routes opaque encrypted messages  │◀───────│ Analytics                         │
│    idle, battery, CPU/RAM (PowerShell)     │        │ knows: laptop id + hash of phone  │        │ pairing keys in IndexedDB         │
│  • local history (JSONL, on this laptop)   │        │ auth token. Cannot read anything. │        │                                   │
│  • browser bridge  127.0.0.1 ◀── Chrome/Edge extension                                  │        │                                   │
│  • on-demand screen capture                │                                                      │                                   │
└────────────────────────────────────────────┘◀═══════ WebRTC P2P video (direct when possible) ═══════▶└───────────────────────────────────┘
                                                          fallback: encrypted JPEG frames via relay
```

## Components

| Folder | What it is |
|---|---|
| `agent/` | Windows desktop app (Electron): tray, control window, monitoring, history, pairing, screen capture. `agent/src/core` is plain Node (no Electron) and also runs headless. |
| `relay/` | Small Node server: hosts the phone web app and forwards end-to-end-encrypted traffic. Dockerfile included. |
| `relay/public/` | The phone interface (installable PWA, no build step). |
| `extension/` | Chrome / Edge extension (Manifest V3) that reports tab titles + domains to the app on `127.0.0.1`. |
| `shared/pmcrypto.js` | The one crypto module used by both phone and laptop (WebCrypto). |
| `test/e2e.js` | End-to-end test: real relay + real agent + simulated phone. |

## Quick start

### 1. Host the relay (once, ~5 minutes)

The relay is what lets your phone reach your laptop on mobile data. It only forwards encrypted bytes, so any small VPS or free tier works. **It must be served over HTTPS** (the phone encrypts with WebCrypto, which browsers only allow on secure origins; HTTPS is also required to install it to the home screen).

```bash
cd pocketmonitor/relay
docker build -t pocketmonitor-relay .
docker run -d --restart unless-stopped -p 8787:8787 -v pm-data:/data pocketmonitor-relay
```

Put HTTPS in front of it: `docker-compose.example.yml` does it with Caddy and automatic certificates; or use a platform that terminates TLS for you (Fly.io, Render, Railway, …); or `cloudflared tunnel --url http://localhost:8787` for a no-server setup from your own PC. Without Docker: `cd relay && npm install && node server.js`.

Optional environment variables: `REGISTRATION_TOKEN` (only laptops that know it can register), `TURN_URLS` + `TURN_SECRET` (coturn time-limited credentials, only needed if you want video to stay P2P/relayed through TURN on strict networks), `ICE_SERVERS` (JSON), `PORT`, `DATA_DIR`.

### 2. Install the Windows app

Download the installer built by the GitHub Action (*Actions → PocketMonitor Windows installer → Run workflow*), or build it yourself on Windows:

```bash
cd pocketmonitor/agent
npm install
npm start          # run from source
npm run dist       # build the NSIS installer into agent/dist
```

On first launch enter your relay address (for example `https://pm.example.com`). The app then shows a **QR code**.

### 3. Pair your phone — once

Scan the QR code with the phone camera, tap **Pair this phone**. That's it. Add the page to your home screen (the app nudges you) and it opens like an app. The pairing survives laptop restarts, phone restarts and closing the browser; there are no logins or approvals afterwards.

* Only **one** phone can ever be paired. While one is registered, the relay and the laptop both refuse every other pairing attempt.
* **Only the laptop can revoke**: *Remove phone…* in the app (or tray). The phone is kicked immediately and a new QR code appears.

### 4. Browser activity (Chrome / Edge)

In the app: **Browser activity → Install the browser extension**. Load `extension/` as an unpacked extension (Developer mode → Load unpacked), open its options, paste the key from *Copy key*. The popup shows status and a one-click off switch.

### 5. Use it

Open PocketMonitor on the phone:

* **Overview** – online / offline / sleeping / paused, last seen, battery + charging, CPU, RAM, network, the app in front right now, today's active vs idle, quick access to the live screen.
* **Live** – real-time screen. Quality (Auto/Low/Medium/High), display picker, pinch / double-tap zoom, pan, full screen, automatic reconnection. Streams only while this tab is open.
* **Apps** – open apps (the one in front is marked), background processes, CPU/RAM, time used today; history with per-app totals and recent sessions for any day.
* **Browser** – active tab, all open tabs (title + domain), time per tab, browser usage, top sites, recently visited tabs.
* **Analytics** – day and week: active vs idle, timeline, active-by-hour, application / browser / website breakdowns.

## How the requirements are met

**Pairing.** The QR code carries `laptopId`, the laptop's long-term ECDH P-256 public key, and a single-use 128-bit code valid for 10 minutes (in the URL *fragment*, so it never reaches server logs). The phone creates its own key pair, derives a shared secret with the laptop key from the QR (so the relay cannot man-in-the-middle it), and sends its public key + code. The laptop validates the code, derives the same secret, and stores `hash(authToken)`. Both sides derive an AES-256-GCM key and a relay auth token via HKDF. The phone stores them in IndexedDB (non-extractable `CryptoKey`); the laptop stores its identity encrypted with Windows DPAPI (Electron `safeStorage`). The laptop is the source of truth: it re-sends the paired phone's token hash to the relay on every connect.

**Online/offline & heartbeat.** The laptop keeps one outbound WebSocket to the relay with 15 s heartbeats, ping/pong liveness (half-open connections are detected and re-established), jittered exponential reconnect, and an immediate reconnect after resume or a network change. The relay tracks `online / sleeping / paused / offline` + last seen; before sleep the app announces `sleeping`. The phone reconnects by itself, and shows the last known snapshot (stored encrypted at the relay) while the laptop is away.

**Live screen.** Capture happens in a hidden window *only* while a phone is watching (destroyed afterwards). The laptop offers WebRTC (hardware-accelerated encode, adaptive bitrate; direct P2P when NAT allows, STUN by default, TURN if configured). If ICE doesn't connect in ~6 s or later fails, it automatically falls back to encrypted JPEG frames over the relay with backpressure and auto-adapting quality. A keepalive every 4 s stops the stream if the viewer vanishes; leaving the Live tab or hiding the page stops it immediately. Pairing (permanent) is separate from stream sessions (temporary, per-request).

**Apps / analytics.** A single long-lived PowerShell process (no native modules) reports the foreground window, the process table and battery; idle time comes from the OS. A tracker turns that into per-app active/idle segments and per-tab browser segments, stored as JSONL per day in `%APPDATA%\PocketMonitor\history` on the laptop. Nothing is uploaded; the phone asks the laptop, over the encrypted channel. Retention is configurable (default 90 days).

## Security & privacy

* **End-to-end encryption.** All data and all screen frames are AES-256-GCM encrypted between laptop and phone. The relay sees ciphertext, the laptop id and a hash of the phone's token. Direction is bound as AAD; each phone connection gets a fresh session id issued by the laptop, so replayed messages are ignored. WebRTC media is additionally DTLS-SRTP encrypted.
* **Exactly one phone**, revocable only from the laptop; rate-limited authentication at the relay; no unauthenticated public access to any data.
* **Visible, controllable.** Tray icon (green = monitoring, amber = paused, red = screen being viewed), an always-on-top pill whenever a phone is connected or the screen is being streamed (with a *Stop* button), *Pause monitoring* and *Pause broadcasting* switches in the window and tray.
* **Not collected:** passwords, form contents, keystrokes, page contents, full URLs (only domains), private/incognito windows (the extension cannot run there). Window titles of non-browser apps are shown live only if enabled and are never stored. Domains can be excluded entirely.
* **No remote control:** the protocol has no input events and no command execution; there is nothing to enable.
* The extension bridge listens on `127.0.0.1` only, accepts only browser-extension origins, requires a secret key, and guards against DNS rebinding.

## Honest status & limits

* **Verified here (Linux sandbox):** the relay; encrypted pairing, single-phone enforcement, reconnect with persisted credentials, revocation (24 automated checks in `test/e2e.js`); the phone app driven in a real browser (pairing, all five tabs, persistence across reload, offline state); the real Electron app under Xvfb including the control window, **live screen via direct WebRTC and via the relay fallback**, capture teardown when the viewer leaves; and the real Chrome extension talking to the real app.
* **Not verified on real Windows hardware:** the PowerShell data source (foreground window, per-process CPU/memory, battery), Windows idle/lock/sleep events, auto-start, DPAPI storage and the NSIS installer build. These use standard Windows/Electron APIs but expect to fix small things on first run.
* The relay needs HTTPS and a place to run. No relay is provided; WebRTC across strict NAT/cellular carriers may need a TURN server (otherwise the relay-JPEG fallback is used automatically).
* iOS Safari can clear site storage for sites you don't use; installing to the home screen avoids that. If a phone ever loses its stored keys, the laptop owner removes it and pairs again.
* Unsigned installer: Windows SmartScreen will warn until you code-sign it.

## Development

```bash
cd agent && npm install && cd ../relay && npm install
node ../test/e2e.js                                   # end-to-end test
node agent/src/headless.js --relay http://localhost:8787   # agent without Electron (prints a pairing link)
node tools/make-icons.js                              # regenerate icons
node tools/sync-shared.js                             # after editing shared/pmcrypto.js
```
