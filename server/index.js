const http    = require('http');
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getData, saveData, saveSettings, updateInventoryItem } = require('./db');
const printers = require('./printers');
const cameraRelay = require('./camera-relay');

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || (process.env.NODE_ENV === 'production' ? 5000 : 8080);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── SSE clients ──────────────────────────────────────────────────────────────

const sseClients = new Set();

function sseWrite(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

printers.emitter.on('printer-update', ({ serial, state }) => {
  sseWrite('printer-update', { serial, state });
});

printers.emitter.on('bambu-conn', (state) => {
  sseWrite('bambu-conn', state);
});

printers.emitter.on('bambu-token-refreshed', ({ auth }) => {
  // Persist updated token to DB silently
  getData().then(({ settings }) => {
    const next = { ...settings, bambuAuth: { ...settings.bambuAuth, ...auth } };
    saveSettings(next).catch(() => {});
  }).catch(() => {});
});

// Forward relay status changes to SSE so the browser can update its UI
cameraRelay.emitter.on('relay-status', (state) => {
  sseWrite('camera-relay-status', { ...state, activeSerials: cameraRelay.getActiveSerials() });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function sanitizeStorage(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || k.length > 80) continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1e9) out[k] = Math.floor(n);
  }
  return out;
}

function sanitizeDistributions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw.slice(0, 500)) {
    if (!isPlainObject(d)) continue;
    const dest = typeof d.dest === 'string' ? d.dest.slice(0, 120) : '';
    const qty = Number(d.qty);
    if (!dest || !Number.isFinite(qty) || qty < 0 || qty > 1e9) continue;
    const note = typeof d.note === 'string' ? d.note.slice(0, 2000) : '';
    const date = typeof d.date === 'string' ? d.date.slice(0, 64) : new Date().toISOString();
    out.push({ dest, qty: Math.floor(qty), note, date });
  }
  return out;
}

function validateInventoryUpdate(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: 'Body must be a JSON object' };
  const id = raw.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > 128) {
    return { ok: false, error: 'Invalid id' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
    return { ok: false, error: 'Invalid id format' };
  }
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 500) : '';
  if (!name) return { ok: false, error: 'name is required' };
  let built = Number(raw.built);
  if (!Number.isFinite(built) || built < 0 || built > 1e9) built = 0;
  built = Math.floor(built);
  const category = typeof raw.category === 'string' ? raw.category.slice(0, 200) : '';
  const location = typeof raw.location === 'string' ? raw.location.slice(0, 200) : '';
  const source = typeof raw.source === 'string' ? raw.source.slice(0, 64) : 'mobile';
  const item = {
    id, name, category, built, location,
    storage: sanitizeStorage(raw.storage),
    distributions: sanitizeDistributions(raw.distributions),
    source,
  };
  return { ok: true, item };
}

// ─── Data / Settings ──────────────────────────────────────────────────────────

app.get('/api/data', async (req, res) => {
  try {
    const { data } = await getData();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(data);
  } catch (e) {
    console.error('GET /api/data error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const body = req.body;
    if (!isPlainObject(body)) return res.status(400).json({ error: 'Body must be a JSON object' });
    await saveData(body);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/data error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const { settings } = await getData();
    res.set('Cache-Control', 'no-store');
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const body = req.body;
    if (!isPlainObject(body)) return res.status(400).json({ error: 'Body must be a JSON object' });
    await saveSettings(body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const validated = validateInventoryUpdate(req.body);
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    await updateInventoryItem(validated.item);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/inventory error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Printer SSE ──────────────────────────────────────────────────────────────

app.get('/api/printers/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send current state immediately on connect
  const { conn, devices, printerStates } = printers.getState();
  res.write(`event: bambu-conn\ndata: ${JSON.stringify(conn)}\n\n`);
  res.write(`event: devices\ndata: ${JSON.stringify(devices)}\n\n`);
  for (const [serial, state] of Object.entries(printerStates)) {
    res.write(`event: printer-update\ndata: ${JSON.stringify({ serial, state })}\n\n`);
  }
  // Send current relay status
  res.write(`event: camera-relay-status\ndata: ${JSON.stringify({ connected: cameraRelay.isConnected(), activeSerials: cameraRelay.getActiveSerials() })}\n\n`);

  // Heartbeat
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);

  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
});

// ─── Bambu login ──────────────────────────────────────────────────────────────

app.post('/api/printers/bambu/login', async (req, res) => {
  try {
    const { email, password, region } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const result = await printers.bambuLogin(email.trim(), password, region || 'global');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/printers/bambu/verify-code', async (req, res) => {
  try {
    const { email, code, region } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'email and code required' });
    const result = await printers.bambuVerifyCode(email.trim(), code.trim(), region || 'global');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/printers/bambu/verify-tfa', async (req, res) => {
  try {
    const { email, tfaKey, code, region } = req.body;
    if (!email || !tfaKey || !code) return res.status(400).json({ error: 'email, tfaKey and code required' });
    const result = await printers.bambuVerify(email.trim(), tfaKey, code.trim(), region || 'global');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/printers/bambu/connect', async (req, res) => {
  try {
    const { auth } = req.body;
    if (!auth?.accessToken) return res.status(400).json({ error: 'auth.accessToken required' });
    const { devices, uid } = await printers.connectBambuWithAuth(auth);
    const fullAuth = { ...auth, devices, uid };
    // Persist auth to settings
    const { settings } = await getData();
    await saveSettings({ ...settings, bambuAuth: fullAuth });
    res.json({ ok: true, devices, uid });
  } catch (e) {
    console.error('Bambu connect error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/printers/bambu/disconnect', async (req, res) => {
  try {
    printers.disconnectBambu();
    const { settings } = await getData();
    await saveSettings({ ...settings, bambuAuth: null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/printers/bambu/refresh', async (req, res) => {
  try {
    const { serial } = req.body || {};
    printers.requestBambuStatus(serial || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/printers/status', (req, res) => {
  const { conn, devices, printerStates } = printers.getState();
  res.set('Cache-Control', 'no-store');
  res.json({ conn, devices, printerStates });
});

// Print control — cmd: 'stop' | 'pause' | 'resume'
app.post('/api/printers/bambu/print-cmd', async (req, res) => {
  try {
    const { serial, cmd } = req.body;
    if (!serial || !['stop', 'pause', 'resume', 'unload_filament', 'unload_filament_external', 'clean_print_error'].includes(cmd))
      return res.status(400).json({ error: 'serial and cmd (stop|pause|resume|unload_filament|unload_filament_external|clean_print_error) required' });
    const result = printers.bambuPrintCmd(serial, cmd);
    if (result.error) return res.status(503).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/printers/bambu/tasks', async (req, res) => {
  try {
    const { settings } = await getData();
    const { accessToken, region } = settings?.bambuAuth || {};
    if (!accessToken) return res.status(401).json({ error: 'Not connected to Bambu' });
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 30;
    const result = await printers.bambuGetTasks(accessToken, page, limit, region || 'global');
    res.json(result);
  } catch (e) {
    const msg = e.message || '';
    const httpStatus = e.httpStatus || 0;
    const isAuthErr  = httpStatus === 401 || httpStatus === 403 || msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized');
    const isNotFound = httpStatus === 404 || (httpStatus === 0 && msg.toLowerCase() === 'not found');
    const friendlyMsg = isAuthErr
      ? 'Bambu session expired — please disconnect and reconnect your Bambu account'
      : isNotFound
        ? 'Print history is not available for this Bambu account'
        : msg || 'Failed to load print history';
    res.status(isAuthErr ? 401 : isNotFound ? 404 : 500).json({ error: friendlyMsg });
  }
});

// ─── Camera credentials auto-fetch ───────────────────────────────────────────
// Returns { ip, accessCode, ttcode, authkey, source } for a given printer serial.
// ip   → from UDP LAN discovery cache, then device list
// accessCode → from Bambu Cloud ttcode API (passwd field), then device list
// Source tells the client how the credentials were obtained.

app.get('/api/printers/camera-creds/:serial', async (req, res) => {
  const { serial } = req.params;
  try {
    const { settings } = await getData();
    const accessToken = settings?.bambuAuth?.accessToken;
    if (!accessToken) return res.status(401).json({ error: 'Not logged in to Bambu Cloud' });

    // 1. Get access code via ttcode API (cloud → no LAN mode required)
    let accessCode = '';
    let ttcode = '', authkey = '';
    try {
      const creds = await printers.bambuGetCameraCreds(accessToken, serial);
      accessCode = creds?.passwd || '';
      ttcode     = creds?.ttcode || '';
      authkey    = creds?.authkey || '';
    } catch {}

    // 2. Fall back to device list access code if cloud call failed
    if (!accessCode) {
      const dev = (printers.bambuDevices || []).find(d => d.dev_id === serial);
      accessCode = dev?.dev_access_code || dev?.access_code || '';
    }

    // 3. Discover IP: UDP LAN broadcast cache first, then device list
    const ip = printers.getDiscoveredIp(serial) || '';
    const discovered = !!printers.discoveredPrinters[serial];

    res.json({ ip, accessCode, ttcode, authkey, discoveredByUdp: discovered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Camera relay status ──────────────────────────────────────────────────────
// Quick poll endpoint for clients that want relay state without SSE.

app.get('/api/camera-relay/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    connected: cameraRelay.isConnected(),
    activeSerials: cameraRelay.getActiveSerials(),
    configured: !!(process.env.CAMERA_RELAY_TOKEN),
  });
});

// ─── Camera MJPEG proxy ───────────────────────────────────────────────────────
// Streams live JPEG frames from a Bambu printer as a standard MJPEG stream.
//
// Priority:
//   1. Desktop relay (works from anywhere — desktop must be running)
//   2. Direct LAN connection (works only when server is on same LAN as printers)
//
// Browser usage:  <img src="/api/printers/camera/SERIAL">

app.get('/api/printers/camera/:serial', (req, res) => {
  const { serial } = req.params;
  let ip = (req.query.ip || '').trim();
  let code = (req.query.code || '').trim();

  // Fall back to UDP discovery / device list if ip not provided
  if (!ip) {
    ip   = printers.getDiscoveredIp(serial) || '';
    const dev = (printers.bambuDevices || []).find(d => d.dev_id === serial);
    code = code || dev?.dev_access_code || dev?.access_code || '';
  }

  // ── Option 1: Serve frames from the desktop relay ─────────────────────────
  // The desktop Electron app connects to the LAN cameras and pushes frames here
  // via WebSocket.  This works from anywhere — no server-side LAN access needed.
  if (cameraRelay.isConnected()) {
    res.set({
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let closed = false;

    function writeFrame(frame) {
      if (closed) return;
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch { closed = true; }
    }

    // Immediately send the latest cached frame so there's no blank period
    const cached = cameraRelay.getLatestFrame(serial);
    if (cached) writeFrame(cached);

    const onFrame = (s, frame) => { if (s === serial) writeFrame(frame); };
    const onRelayDisconnect = ({ connected }) => {
      if (!connected) {
        closed = true;
        cameraRelay.emitter.off('frame', onFrame);
        cameraRelay.emitter.off('relay-status', onRelayDisconnect);
        try { res.end(); } catch {}
      }
    };

    cameraRelay.emitter.on('frame', onFrame);
    cameraRelay.emitter.on('relay-status', onRelayDisconnect);

    req.on('close', () => {
      closed = true;
      cameraRelay.emitter.off('frame', onFrame);
      cameraRelay.emitter.off('relay-status', onRelayDisconnect);
    });

    return;
  }

  // ── Option 2: Direct LAN connection ──────────────────────────────────────
  // Only works when the server itself is on the same network as the printer.
  if (!ip) {
    return res.status(503).json({
      error: 'Camera not available. Open the desktop app on the same network as your printers to enable live camera relay.',
    });
  }

  res.set({
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let stopped = false;

  // H2D, H2S, X1C, P2S use RTSPS on port 322 (via ffmpeg).
  // P1S/P1P use the proprietary binary protocol on port 6000.
  const discovered = printers.discoveredPrinters[serial];
  const devInfo = (printers.bambuDevices || []).find(d => d.dev_id === serial);
  const model = discovered?.model || devInfo?.dev_product_name || devInfo?.dev_model_name || '';

  const streamFn = printers.isRtspPrinter(model)
    ? printers.streamCameraRtsp
    : printers.streamCamera;

  const stop = streamFn(ip, code, res, (errMsg) => {
    if (!stopped) {
      stopped = true;
      try {
        res.write(`--frame\r\nContent-Type: text/plain\r\n\r\n${errMsg}\r\n`);
        res.end();
      } catch {}
    }
  });

  req.on('close', () => {
    stopped = true;
    stop();
  });
});

// ─── Mobile companion ─────────────────────────────────────────────────────────

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'mobile.html'));
});

// ─── Serve built frontend in production ───────────────────────────────────────

const DIST_DIR = path.join(__dirname, '..', 'dist-web');
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.use((req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
// Use http.createServer() rather than app.listen() so the event loop handle
// is held by the http.Server instance — required for Node v24+ where
// app.listen() drops its handle and the process exits prematurely.
const server = http.createServer(app);
server.listen(PORT, HOST, async () => {
  console.log(`API server running on http://${HOST}:${PORT}`);

  // Attach camera relay WebSocket server to the same HTTP server.
  // Token comes from CAMERA_RELAY_TOKEN env var.
  cameraRelay.attach(server, () => process.env.CAMERA_RELAY_TOKEN);
  if (process.env.CAMERA_RELAY_TOKEN) {
    console.log('[camera-relay] Relay endpoint ready at /api/camera-relay');
  } else {
    console.log('[camera-relay] CAMERA_RELAY_TOKEN not set — relay disabled');
  }

  // Auto-reconnect Bambu if stored auth exists
  try {
    const { settings } = await getData();
    const bambuAuth = settings?.bambuAuth;
    if (bambuAuth?.accessToken && bambuAuth?.uid) {
      console.log('Restoring Bambu connection from saved auth…');
      printers.bambuDevices = bambuAuth.devices || [];
      const auth = await printers.prepareAuth(bambuAuth);
      printers.connectBambu(auth);
    }
  } catch (e) {
    console.warn('Could not restore Bambu connection:', e.message);
  }
});

server.keepAliveTimeout = 65000;
