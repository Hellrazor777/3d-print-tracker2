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
- **Backend**: Express 5 (`server/index.js`), Node 18+
- **Realtime**: Server-Sent Events (`GET /api/printers/events`) for printer state
- **Camera**: WebSocket relay (`/api/camera-relay`) — desktop Electron pushes frames, server serves MJPEG
- **DB**: Supabase Postgres (`DATABASE_URL` env var) or local `.local-data.json` fallback
- **Desktop**: Electron 29 (optional wrapper — adds file system, local camera, 3MF management)
- **Deploy**: Render.com (`render.yaml` + `supabase-schema.sql` ready to go)
- **Packaging**: electron-builder, Windows NSIS

---

## Current state (as of V3 start)

### What works
- Express server (`server/index.js`) — all REST endpoints functional
- Supabase read/write via `server/db.js`
- Bambu MQTT cloud + LAN via `server/printers.js`
- Camera relay via `server/camera-relay.js`
- React frontend renders, all views and modals present

### What is broken / not yet wired
- **Electron mode**: `main.js` does not exist. Electron cannot launch. Needs to be created (port from V1).
- **Frontend ↔ API**: `AppContext.jsx` and `PrintersView.jsx` still use `window.electronAPI.*` for
  data load/save, printer connect, Bambu login, camera. The Express REST API exists but React
  doesn't call it yet. Web mode falls back to `localStorage`.
- **SSE not connected**: `AppContext` listens for `window.electronAPI.onPrinterUpdate` which never
  fires in web mode. The SSE stream at `/api/printers/events` is not subscribed to by React.

### Dead code (delete immediately, no risk)
- `src/js/*.js` (all 12 files) — not imported by React, not loaded by any HTML. Legacy vanilla JS.
- Root `index.html` — inline vanilla JS shell, not loaded by anything (no main.js).

---

## Repository layout

```
3d-print-tracker-v3/
├── server/
│   ├── index.js          # Express app — all REST endpoints, SSE, camera MJPEG proxy
│   ├── db.js             # Postgres UPSERT or local JSON fallback
│   ├── printers.js       # Bambu MQTT, LAN, login, UDP discovery, print control
│   └── camera-relay.js   # WebSocket relay: desktop→server→browser MJPEG
├── src/
│   ├── index.html        # Vite entry (clean — only <div id="root">)
│   ├── main.jsx          # React entry, StrictMode, AppContext provider
│   ├── App.jsx           # View routing, modal rendering
│   ├── context/
│   │   └── AppContext.jsx # ALL app state, persistence, IPC/API wrappers (1119 lines)
│   ├── views/            # ProductView, InventoryView, PrintersView, ColourView, ArchiveView
│   ├── modals/           # 14 modal components
│   ├── components/       # Stats, TopBar
│   ├── lib/
│   │   └── n3dClient.js  # N3D API: fetch-first, Electron IPC fallback
│   ├── js/               # *** DEAD CODE — delete entire directory ***
│   ├── main/             # Electron IPC handlers (data, files, n3d, printers) — keep for Electron mode
│   └── styles/main.css
├── scripts/
│   └── start-electron.js # Cross-platform dev launcher: API → Vite → Electron
├── render.yaml           # Render.com deployment config
├── supabase-schema.sql   # Run once in Supabase SQL editor
├── vite.config.js
├── package.json          # version 3.0.0
│
│  (to create:)
├── main.js               # Electron main process — port from cyanidesugar/3d-print-tracker
└── preload.js            # Already exists — contextBridge for Electron IPC
```

---

## Commands

```bash
# Web-only dev (API server + Vite, no Electron)
npm run dev

# Electron dev (API server + Vite + Electron)
node scripts/start-electron.js

# Production web build (for Render.com)
npm run build:cloud

# Lint
npm run lint
npm run lint:fix

# Build desktop EXE (after main.js is restored)
npm run build
```

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
| GET | /api/printers/camera/:serial | Live MJPEG stream |
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

## Known bugs to fix (from audit of V1/V2, all apply here)

Priority order:

### Immediate (data integrity)
1. `server/db.js` — SQL `UPDATE` only, no INSERT. Fresh Supabase rows silently lost.
2. `AppContext.jsx` — filaments dropped from saveData calls in multiple places.
3. `AppContext.jsx:156` — saveSettingsStorage() inside React state updater (must be pure).
4. `AppContext.jsx:263-289` — stale closure in reprint/saveCard write paths.

### Security
5. `src/main/ipc/files.js:145` — path traversal: `..` not stripped from product folder names.
6. `src/main/ipc/files.js:280` — PowerShell injection in get-bambu-version.
7. `src/main/ipc/files.js:212` — no size limit on image download.
8. `src/mobile.html` — XSS: user data interpolated directly into innerHTML.

### Wiring (makes the app actually work in web mode)
9. AppContext: replace electronAPI.loadData/saveData with fetch('/api/data') (dual-mode).
10. AppContext: subscribe to SSE stream, dispatch events into React state.
11. PrintersView: replace all electronAPI.printerBambu* calls with fetch('/api/printers/bambu/*').

### UX
12. `src/modals/AddInventoryModal.jsx` — never closes after save.
13. No `:focus-visible` CSS.
14. No click-outside or Escape to close modals.
15. No Enter-to-submit on modal forms.
16. window.confirm()/prompt() throughout.
17. Toast shows ✓ on error messages.
18. subParts keyed by array index, not stable id.
19. Mobile: adjustStocktake overcounts built count.
20. Mobile: outgoing destinations hardcoded.

---

## Supabase setup

Run `supabase-schema.sql` once in the Supabase SQL Editor. Creates `app_data` table with seeded
'default' row. Then set `DATABASE_URL` env var to the Supabase connection string.

Note: `server/db.js` currently uses bare `UPDATE` (not UPSERT). Until fixed, if the 'default' row
is ever deleted from Supabase, all saves silently fail. Fix: use INSERT ... ON CONFLICT DO UPDATE.

---

## Render.com deployment

1. Connect GitHub repo in Render dashboard
2. Render reads `render.yaml` automatically
3. Set `DATABASE_URL` and (optionally) `CAMERA_RELAY_TOKEN` in Environment section
4. Deploy — build runs `npm run build:cloud`, start runs `node server/index.js`
