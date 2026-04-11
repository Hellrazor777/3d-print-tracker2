const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const MAX_BODY_BYTES = 512 * 1024;

function jsonErr(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

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

/**
 * Validates and normalizes a mobile client inventory row before merging into data.json.
 * @returns {{ ok: true, item: object } | { ok: false, error: string }}
 */
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
    id,
    name,
    category,
    built,
    location,
    storage: sanitizeStorage(raw.storage),
    distributions: sanitizeDistributions(raw.distributions),
    source,
  };

  return { ok: true, item };
}

function startLocalServer(PORT, DATA_PATH, mainWin, onListening, SETTINGS_PATH) {
  const mobileHtmlPath = path.join(__dirname, '..', 'mobile.html');
  const localServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && url.pathname === '/data') {
      try {
        const data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) : {};
        // Inject outgoing destinations from settings so mobile UI renders custom dests dynamically
        if (SETTINGS_PATH && fs.existsSync(SETTINGS_PATH)) {
          try {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            if (Array.isArray(settings.outgoingDests) && settings.outgoingDests.length) {
              data._outgoingDests = settings.outgoingDests;
            }
          } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
        res.end(JSON.stringify(data));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/inventory') {
      let body = '';
      let tooLarge = false;
      req.on('data', chunk => {
        if (tooLarge) return;
        body += chunk;
        if (body.length > MAX_BODY_BYTES) {
          tooLarge = true;
          req.resume(); // drain remaining data so the socket isn't left open
        }
      });
      req.on('end', () => {
        if (tooLarge) {
          jsonErr(res, 413, 'Request body too large');
          res.end();
          return;
        }
        try {
          let parsed;
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            jsonErr(res, 400, 'Invalid JSON');
            return;
          }

          const validated = validateInventoryUpdate(parsed);
          if (!validated.ok) {
            jsonErr(res, 400, validated.error);
            return;
          }
          const update = validated.item;

          const data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) : {};
          if (!data.inventory) data.inventory = [];
          if (!Array.isArray(data.inventory)) data.inventory = [];

          const idx = data.inventory.findIndex(i => i && i.id === update.id);
          if (idx > -1) data.inventory[idx] = { ...data.inventory[idx], ...update };
          else data.inventory.push(update);

          fs.writeFileSync(DATA_PATH, JSON.stringify(data), 'utf8');
          // Also push to cloud (Supabase) so mobile updates reach the cloud db.
          // Fire-and-forget: local write already succeeded, cloud failure is logged.
          db.saveData(data, DATA_PATH, fs).catch(err =>
            console.warn('[server] Cloud sync after mobile POST failed:', err.message)
          );
          if (mainWin) mainWin.webContents.send('inventory-updated');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch(e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/mobile')) {
      try {
        const html = fs.readFileSync(mobileHtmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch(e) { res.writeHead(404); res.end('Mobile page not found'); }
      return;
    }

    res.writeHead(404); res.end('Not found');
  });
  let currentPort = PORT;

  localServer.on('listening', () => {
    console.log('Mobile server running on port', currentPort);
    if (onListening) onListening(currentPort);
  });

  localServer.on('error', e => {
    if (e.code === 'EADDRINUSE' && currentPort < PORT + 10) {
      currentPort++;
      console.log('Port in use, trying', currentPort);
      localServer.close();
      localServer.listen(currentPort, '0.0.0.0');
    } else {
      console.error('Mobile server error:', e.message);
    }
  });

  localServer.listen(currentPort, '0.0.0.0');
  return localServer;
}

module.exports = startLocalServer;
