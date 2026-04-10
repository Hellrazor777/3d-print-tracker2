# 3D Print Tracker V3 — CLAUDE.md

Agent-oriented project memory. Update when architecture or conventions change materially.

---

## What this is

A 3D print job tracker for a maker/selling business. Tracks products → parts → kanban status.
Manages finished goods inventory. Monitors Bambu Lab printers via MQTT. Supports N3D Melbourne
marketplace import, CSV import/export, 3MF file management, filament library, mobile companion page.

Forked from `Hellrazor777/3d-print-tracker2` (v3.0.0). Upstream of that: `Hellrazor777/3d-print-tracker`.
This repo: `cyanidesugar/3d-print-tracker-v3`.

---

## Stack

- **Frontend**: React 18, Vite 5, JSX, Context API (AppContext is the single source of truth)
- **Backend**: Express 5 (`server/index.js`), Node 24
- **Realtime**: Server-Sent Events (`GET /api/printers/events`) for printer state
- **Camera**: WebSocket relay (`/api/camera-relay`) — desktop Electron pushes frames, server serves MJPEG
- **DB**: Supabase Postgres (`DATABASE_URL` env var) or local `.local-data.json` fallback
- **Desktop**: Electron 29 (optional wrapper — adds file system, local camera, 3MF management)
- **Deploy**: Render.com (`render.yaml` + `supabase-schema.sql` ready to go)
- **Packaging**: electron-builder, Windows NSIS

---

## Current state (as of session 2)

### What works
- Express server (`server/index.js`) — all REST endpoints functional
- Supabase read/write via `server/db.js`
- Bambu MQTT cloud + LAN via `server/printers.js`
- Camera relay via `server/camera-relay.js`
- React frontend renders, all views and modals wired to REST API
- Web mode data persistence — AppContext uses fetch('/api/data') and fetch('/api/settings')
- SSE wired in PrintersView for web mode printer state
- Electron main.js + preload.js restored and working
- All 7 audit phases complete (see git log)
- RTSPS camera streaming for H2D, H2S, X1C, X1E, P2S via ffmpeg
- Camera IP/access code persists across page refreshes (saved to bambuAuth.cameraIps[serial])
- `npm run dev` working on Windows + Node 24
- `npm run serve` for production local use

### Known remaining issues
- `server/db.js` — Supabase UPSERT is fixed, but if 'default' row is ever manually deleted, saves fail silently
- `AppContext.jsx` — filaments may be dropped from saveData in some edge paths (needs audit)
- `src/main/ipc/files.js:280` — PowerShell injection in get-bambu-version (Electron only)
- `window.confirm()`/`prompt()` still used in some places
- subParts keyed by array index, not stable id

### Dead code (safe to delete)
- `src/js/*.js` (all 12 files) — legacy vanilla JS, not imported anywhere
- Root `index.html` — legacy shell, not used

---

## Repository layout

```
3d-print-tracker-v3/
├── server/
│   ├── index.js          # Express app — all REST endpoints, SSE, camera MJPEG proxy
│   ├── db.js             # Postgres UPSERT or local JSON fallback (.local-data.json)
│   ├── printers.js       # Bambu MQTT, LAN, login, UDP discovery, print control, camera streaming
│   └── camera-relay.js   # WebSocket relay: desktop→server→browser MJPEG
├── src/
│   ├── index.html        # Vite entry (clean — only <div id="root">)
│   ├── main.jsx          # React entry, StrictMode, AppContext provider
│   ├── App.jsx           # View routing, modal rendering
│   ├── context/
│   │   └── AppContext.jsx # ALL app state, persistence, IPC/API wrappers
│   ├── views/            # ProductView, InventoryView, PrintersView, ColourView, ArchiveView
│   ├── modals/           # 14 modal components
│   ├── components/       # Stats, TopBar
│   ├── lib/
│   │   └── n3dClient.js  # N3D API: fetch-first, Electron IPC fallback
│   ├── main/             # Electron IPC handlers (data, files, n3d, printers)
│   └── styles/main.css
├── scripts/
│   └── start-electron.js # Cross-platform dev launcher: API → Vite → Electron
├── main.js               # Electron main process
├── preload.js            # contextBridge for Electron IPC
├── render.yaml           # Render.com deployment config
├── supabase-schema.sql   # Run once in Supabase SQL editor
├── vite.config.js
└── package.json
```

---

## Commands

```bash
# Development (API on :8080, Vite on :5000, hot reload)
npm run dev

# Production local use — build once, then just serve
npm run build:web       # compiles React → dist-web/
npm run serve           # starts server in prod mode → http://localhost:5000

# Production web build (for Render.com / Cloudflare Pages)
npm run build:cloud     # sets VITE_BASE_URL=/ for absolute paths

# Electron dev
node scripts/start-electron.js

# Lint
npm run lint
npm run lint:fix

# Build desktop EXE
npm run build
```

---

## Node v24 / Express 5 compatibility

`app.listen()` in Express 5 drops its HTTP server handle from the Node v24 event loop, causing
the process to exit immediately with code 0. Always use:

```javascript
const server = http.createServer(app);
server.listen(PORT, HOST, () => { ... });
```

Never use `app.listen()` directly.

---

## Windows dev script

`concurrently` on Windows must use direct node commands, not `npm:script` references. The npm
wrapper process exits after spawning the child, which triggers concurrently's `-k` kill-all.

```json
"dev": "concurrently -k -n API,WEB -c green,cyan \"node server/index.js\" \"node node_modules/vite/bin/vite.js\""
```

---

## Camera streaming — Bambu printer protocol split

Two completely different protocols depending on printer generation:

| Models | Protocol | Port | Notes |
|--------|----------|------|-------|
| P1S, P1P, A1, A1 Mini | Proprietary binary TCP+JPEG over TLS | 6000 | `streamCamera()` in printers.js |
| X1C, X1E, H2D, H2S, P2S | RTSPS (H.264 via ffmpeg) | 322 | `streamCameraRtsp()` in printers.js |

Detection: `isRtspPrinter(serial)` checks `dev_product_name` from the Bambu cloud device list
against `RTSP_MODEL_RE = /\b(X1C?|X1E|H2D|H2S|P2S)\b/i`.

### RTSPS stream URL
```
rtsps://bblp:<access_code>@<printer_ip>:322/streaming/live/1
```

### Printer-side requirement (H2D / H2S / P2S)
Port 322 is closed by default. Must enable on each printer:
> Settings → Network → LAN Only Liveview → ON
(Separate from LAN Mode. Without it the port is closed and ffmpeg gets connection refused.)

### ffmpeg
Required for RTSPS streaming. Installed via winget (`Gyan.FFmpeg` package).
`getFfmpeg()` in printers.js auto-locates it: checks PATH first, then the winget install
directory (`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*`).

### P2S reliability note
The P2S RTSP implementation is flaky — only one concurrent connection is reliably served,
and the first connection after a printer reboot is the most stable. Multiple connect/disconnect
cycles can cause the stream to stop responding until the printer is rebooted. This is a Bambu
firmware issue, not fixable in our code.

### Camera IP persistence
Camera IP and access code are saved to `bambuAuth.cameraIps[serial]` in settings when the
user clicks Start. On refresh, `storedIp`/`storedCode` are restored and the stream auto-starts.
The fix was in `InlineCameraFeed.applyConfig()` — web mode was not calling `onSaveConfig()`.

---

## API surface (server/index.js)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/data | Full data snapshot |
| POST | /api/data | Save all app state |
| GET | /api/settings | Settings only |
| POST | /api/settings | Save settings |
| POST | /api/inventory | Mobile inventory update (validated) |
| GET | /api/printers/events | SSE stream — printer state, bambu-conn, relay-status |
| POST | /api/printers/bambu/login | Bambu login (email+password) |
| POST | /api/printers/bambu/verify-code | Email verification |
| POST | /api/printers/bambu/verify-tfa | TFA verification |
| POST | /api/printers/bambu/connect | Connect with auth token |
| POST | /api/printers/bambu/disconnect | Disconnect |
| POST | /api/printers/bambu/print-cmd | stop / pause / resume |
| GET | /api/printers/bambu/tasks | Print history |
| GET | /api/printers/camera-creds/:serial | Auto-fetch camera IP + access code |
| GET | /api/printers/camera/:serial | Live MJPEG stream (auto-routes port 6000 vs RTSPS) |
| GET | /api/camera-relay/status | Relay connection status |
| GET | /mobile | Mobile companion page |

---

## Conventions

- `AppContext.jsx` is the single source of truth for ALL app state. No module-level globals.
- `isElectron = !!window.electronAPI` gates Electron-only features (file pickers, local paths).
- Data persistence: in web mode, `fetch('/api/data')` and `fetch('/api/settings')`. In Electron mode,
  `window.electronAPI.loadData()` / `window.electronAPI.saveData()`.
- Printer state: in web mode, SSE stream (`/api/printers/events`). In Electron mode, IPC events.
- Main process = CommonJS. Renderer = ESM.
- IPC modules export `register(ipcMain, ...)`.
- Git: confirm with user before committing.

---

## Hosting options

### Local production (current)
`npm run build:web` + `npm run serve` → http://localhost:5000

### Remote access via Cloudflare Tunnel (recommended for LAN printer access)
Run server locally, expose via tunnel so it's reachable from anywhere:
```bash
cloudflared tunnel --url http://localhost:5000
```
Can be mapped to a subdomain on cyanidesugar.com via named tunnel config.
Best option because Bambu printers, MQTT, and ffmpeg all need LAN access.

### Render.com (cloud, always-on)
- `render.yaml` already configured
- Set `DATABASE_URL` (Supabase) and optionally `CAMERA_RELAY_TOKEN` in Render env vars
- Build: `npm run build:cloud`, start: `node server/index.js`
- Camera streaming only works if the desktop app is running as a relay (no LAN access on Render)

### Cloudflare Pages (frontend only)
- Hosts the static frontend only — backend must run elsewhere (Render.com)
- Build command: `npm run build:cloud`, output dir: `dist-web`
- Frontend needs the Render API URL via env var

---

## Supabase setup

Run `supabase-schema.sql` once in the Supabase SQL Editor. Creates `app_data` table with seeded
'default' row. Then set `DATABASE_URL` env var to the Supabase connection string.
