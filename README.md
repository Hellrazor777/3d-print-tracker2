# 3D Print Tracker — Cloud Web App

The browser-based companion to the [3D Print Tracker desktop app](https://github.com/Hellrazor777/3d-print-tracker). View your products, inventory and live printer status from any browser — phone, tablet or computer.

Data is stored in [Supabase](https://supabase.com) (PostgreSQL) and synced from the desktop app. The web app is hosted on [Render](https://render.com).

---

## Features

- Full products, parts, inventory and colour views — same as the desktop app
- Live Bambu Lab printer status and camera feeds
- Live camera relay — stream LAN printer cameras through the desktop app
- Mobile-friendly layout
- Dark / light / auto theme

---

## Deployment

### What you need
- A free [Supabase](https://supabase.com) account
- A free [Render](https://render.com) account
- This repository pushed to your own GitHub account

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Project Settings → Database → Connection string → URI** and copy the connection string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres
   ```
3. That's it — the app creates its own table automatically on first connection. No SQL to run.

### 2. Deploy to Render

1. Fork or push this repo to your GitHub account
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Set these values:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build:web`
   - **Start command:** `node server/index.js`
5. Add these **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Supabase connection string from step 1 |
   | `NODE_ENV` | `production` |
   | `CAMERA_RELAY_TOKEN` | Any random string (e.g. `mysecrettoken123`) — used to authenticate the desktop relay |

6. Click **Deploy** — the app goes live in a few minutes

### 3. Connect the desktop app

1. In the desktop app, open **Settings → Cloud Sync**
2. Paste the Supabase connection string and click **Connect**
3. Click **↑ Push local to cloud** to send your existing data
4. Your cloud app now shows all your products

### 4. Enable camera relay *(optional)*

The camera relay lets you see live printer cameras in the cloud app by streaming frames from your desktop (which is on the same LAN as your printers).

1. In the desktop app, go to the **Printers** tab
2. Enter your Render app URL and the `CAMERA_RELAY_TOKEN` value you set above
3. Click **Start relay** — cameras will appear in the cloud app

---

## Local Development

```bash
# Install dependencies
npm install

# Start API server + Vite dev server together
npm run dev

# API server only
node server/index.js

# Vite only
npm run dev:web
```

For local dev without a Supabase connection the server falls back to `.local-data.json` in the project root.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (cloud) | Supabase PostgreSQL connection string |
| `NODE_ENV` | Yes | Set to `production` on Render |
| `PORT` | No | API port (default 8080 dev / 5000 prod, Render sets this automatically) |
| `CAMERA_RELAY_TOKEN` | No | Secret token for desktop camera relay WebSocket |

---

## Tech Stack

- [Express](https://expressjs.com/) — API server
- [React](https://react.dev/) 18 + [Vite](https://vitejs.dev/) 5 — frontend
- [Supabase](https://supabase.com) (PostgreSQL) — database
- [Render](https://render.com) — hosting
- WebSocket — camera relay from desktop to cloud

---

## License

MIT — free to use, modify and distribute.
