// Printer integration: Bambu Lab cloud MQTT + Snapmaker local HTTP polling.
// Uses only Node built-ins (tls, https, http) — no external mqtt package needed.

const tls   = require('tls');
const https = require('https');
const http  = require('http');
const { EventEmitter } = require('events');

// ─── Minimal MQTT 3.1.1 over TLS ─────────────────────────────────────────────

function encodeRemLen(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

function encodeStr(s) {
  const b = Buffer.from(String(s), 'utf8');
  const h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]);
}

function buildConnect(clientId, username, password, keepalive = 60) {
  let flags = 0x02; // clean session
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const varHdr = Buffer.concat([
    encodeStr('MQTT'), Buffer.from([0x04, flags, keepalive >> 8, keepalive & 0xFF]),
  ]);
  const payload = Buffer.concat([
    encodeStr(clientId),
    ...(username ? [encodeStr(username)] : []),
    ...(password ? [encodeStr(password)] : []),
  ]);
  const body = Buffer.concat([varHdr, payload]);
  return Buffer.concat([Buffer.from([0x10]), encodeRemLen(body.length), body]);
}

function buildSubscribe(msgId, topic, qos = 0) {
  const hdr = Buffer.from([msgId >> 8, msgId & 0xFF]);
  const body = Buffer.concat([hdr, encodeStr(topic), Buffer.from([qos])]);
  return Buffer.concat([Buffer.from([0x82]), encodeRemLen(body.length), body]);
}

function buildPublish(topic, payload) {
  const body = Buffer.concat([encodeStr(topic), Buffer.from(payload, 'utf8')]);
  return Buffer.concat([Buffer.from([0x30]), encodeRemLen(body.length), body]);
}

function parsePackets(buf) {
  const pkts = []; let off = 0;
  while (off < buf.length) {
    const start = off;
    if (off + 1 >= buf.length) break;
    const type = (buf[off] & 0xF0) >> 4;
    const flags = buf[off] & 0x0F; off++;
    let rem = 0, mul = 1, lb = 0;
    while (true) {
      if (off >= buf.length) { off = start; break; }
      const b = buf[off++]; lb++;
      rem += (b & 0x7F) * mul; mul *= 128;
      if (!(b & 0x80)) break;
      if (lb >= 4) break;
    }
    if (off === start) break;
    if (off + rem > buf.length) { off = start; break; }
    pkts.push({ type, flags, body: buf.slice(off, off + rem) });
    off += rem;
  }
  return { pkts, leftover: buf.slice(off) };
}

class MqttTls extends EventEmitter {
  constructor() {
    super(); this.socket = null; this._buf = Buffer.alloc(0);
    this._ping = null; this._msgId = 1; this.connected = false; this._dead = false;
  }
  connect({ host, port = 8883, clientId, username, password, keepalive = 60 }) {
    this._ka = keepalive;
    this.socket = tls.connect({ host, port, rejectUnauthorized: false });
    this.socket.on('secureConnect', () => this.socket.write(buildConnect(clientId, username, password, keepalive)));
    this.socket.on('data', d => { this._buf = Buffer.concat([this._buf, d]); this._drain(); });
    this.socket.on('error', e => { if (!this._dead) this.emit('error', e); });
    this.socket.on('close', () => { this.connected = false; clearInterval(this._ping); if (!this._dead) this.emit('close'); });
  }
  _drain() {
    const { pkts, leftover } = parsePackets(this._buf); this._buf = leftover;
    for (const p of pkts) this._handle(p);
  }
  _handle({ type, flags, body }) {
    if (type === 2) { // CONNACK
      if (body.length >= 2 && body[1] === 0) {
        this.connected = true;
        this._ping = setInterval(() => { if (this.connected && !this.socket.destroyed) this.socket.write(Buffer.from([0xC0, 0x00])); }, this._ka * 800);
        this.emit('connect');
      } else { this.emit('error', new Error(`CONNACK code ${body[1]}`)); }
    } else if (type === 3) { // PUBLISH
      const qos = (flags & 0x06) >> 1;
      let o = 0; const tl = body.readUInt16BE(o); o += 2;
      const topic = body.slice(o, o + tl).toString('utf8'); o += tl;
      if (qos > 0) o += 2;
      this.emit('message', topic, body.slice(o));
    }
  }
  subscribe(topic) {
    const id = this._msgId++ % 65535 || 1;
    if (this.socket && !this.socket.destroyed) this.socket.write(buildSubscribe(id, topic));
  }
  publish(topic, payload) {
    if (this.socket && !this.socket.destroyed) this.socket.write(buildPublish(topic, payload));
  }
  end() {
    this._dead = true; clearInterval(this._ping); this.connected = false;
    try { if (this.socket && !this.socket.destroyed) { this.socket.write(Buffer.from([0xE0, 0x00])); this.socket.destroy(); } } catch {}
  }
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function parseJwt(token) {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(p + '=='.slice(0, (4 - p.length % 4) % 4), 'base64').toString('utf8'));
  } catch { return {}; }
}

function isExpired(token) {
  try { const { exp } = parseJwt(token); return exp && Date.now() / 1000 > exp - 60; } catch { return false; }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsReq(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    }, res => {
      let s = ''; res.on('data', c => s += c);
      res.on('end', () => {
        // Extract token from Set-Cookie header (Bambu TFA endpoint returns token this way)
        let cookieToken = null;
        for (const c of (res.headers['set-cookie'] || [])) {
          const m = /\btoken=([^;]+)/i.exec(c);
          if (m && m[1]) { cookieToken = decodeURIComponent(m[1]); break; }
        }
        try { resolve({ status: res.statusCode, data: JSON.parse(s), cookieToken }); }
        catch { resolve({ status: res.statusCode, data: s, cookieToken }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function httpReq(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const data = body ? JSON.stringify(body) : null;
    const path = u.pathname + (u.search || '');
    const req = http.request({
      hostname: u.hostname, port: parseInt(u.port) || 7125, path, method, timeout: 6000,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'X-Api-Key': token } : {}),
      },
    }, res => {
      let s = ''; res.on('data', c => s += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(s) }); } catch { resolve({ status: res.statusCode, data: s }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// ─── Bambu Cloud ─────────────────────────────────────────────────────────────

// Headers that Bambu's API expects — mirrors what OrcaSlicer/Bambu Studio sends.
// The api.bambulab.com endpoint sits behind Cloudflare; these headers identify us
// as a trusted native client and bypass the bot challenge.
const BAMBU_HEADERS = {
  'User-Agent':            'bambu_network_agent/01.09.05.01',
  'X-BBL-Client-Name':    'OrcaSlicer',
  'X-BBL-Client-Type':    'slicer',
  'X-BBL-Client-Version': '01.09.05.51',
  'X-BBL-Language':       'en-US',
  'X-BBL-OS-Type':        'linux',
  'X-BBL-OS-Version':     '6.2.0',
  'X-BBL-Agent-Version':  '01.09.05.01',
  'X-BBL-Agent-OS-Type':  'linux',
  'Accept':               'application/json',
};

async function bambuLogin(account, password) {
  // Endpoint: api.bambulab.com (not bambulab.com) — matches the Python SDK.
  // Payload must include apiError: '' or the server may reject the request.
  // Returns: { success, accessToken } on direct login,
  //          { loginType: 'verifyCode' } when email code is needed,
  //          { loginType: 'tfa', tfaKey } when authenticator app is needed.
  const r = await httpsReq('POST', 'https://api.bambulab.com/v1/user-service/user/login',
    { account, password, apiError: '' }, BAMBU_HEADERS);
  const d = r.data;

  if (d?.loginType === 'verifyCode') {
    // Explicitly send the verification email.
    // Payload requires { email, type: 'codeLogin' } — the type field is mandatory.
    try {
      await httpsReq('POST', 'https://api.bambulab.com/v1/user-service/user/sendemail/code',
        { email: account, type: 'codeLogin' }, BAMBU_HEADERS);
    } catch {}
  }
  return d;
}

// verifyCode flow: re-POST to the same login endpoint with just { account, code }.
// No password needed at this stage — matches the Python SDK exactly.
// Returns { accessToken } in the response body.
async function bambuVerifyCode(account, code) {
  const r = await httpsReq('POST', 'https://api.bambulab.com/v1/user-service/user/login',
    { account, code }, BAMBU_HEADERS);
  return r.data;
}

// TFA flow (authenticator app):
// POST to the TFA endpoint with { tfaKey, tfaCode }.
// The JWT token is returned in the Set-Cookie header as 'token', not in the body.
async function bambuVerify(account, tfaKey, code) {
  const r = await httpsReq('POST', 'https://bambulab.com/api/sign-in/tfa', { tfaKey, tfaCode: code }, BAMBU_HEADERS);
  // HA extracts from cookies; also check body as fallback
  const token = r.cookieToken || r.data?.token || r.data?.accessToken || null;
  return { token, refreshToken: r.data?.refreshToken || null, ...r.data };
}

async function bambuGetDevices(accessToken) {
  const r = await httpsReq('GET', 'https://api.bambulab.com/v1/iot-service/api/user/bind', null, { Authorization: `Bearer ${accessToken}` });
  return r.data?.devices || r.data?.message || [];
}

async function bambuGetUid(accessToken) {
  // UID is no longer embedded in the JWT — must be fetched from the preferences API.
  // API response: { code, message, data: { uid: <number>, ... } }
  const r = await httpsReq('GET', 'https://api.bambulab.com/v1/design-user-service/my/preference', null, { Authorization: `Bearer ${accessToken}` });
  const uid = r.data?.data?.uid ?? r.data?.uid;
  return uid ? String(uid) : null;
}

async function bambuRefresh(refreshToken) {
  const r = await httpsReq('POST', 'https://bambulab.com/api/sign-in/refresh', { refreshToken });
  return r.data;
}

async function bambuGetTasks(accessToken, page = 1, limit = 20, region = 'global') {
  const base = region === 'china' ? 'https://api.bambulab.cn' : 'https://api.bambulab.com';
  // Try primary endpoint first, then fall back to alternate path
  const endpoints = [
    `${base}/v1/iot-service/api/user/task?page=${page}&limit=${limit}`,
    `${base}/v1/user-service/my/tasks?page=${page}&limit=${limit}`,
  ];
  let lastStatus = 0;
  for (const url of endpoints) {
    const r = await httpsReq('GET', url, null, { Authorization: `Bearer ${accessToken}` });
    lastStatus = r.status;
    if (r.status === 401 || r.status === 403) throw new Error('Auth failed — please disconnect and reconnect your Bambu account');
    if (r.status === 404) continue; // try next endpoint
    if (r.status !== 200) throw new Error(`Bambu API returned ${r.status}`);
    if (r.data?.code !== undefined && r.data.code !== 0) throw new Error(r.data.message || `API code ${r.data.code}`);
    return r.data;
  }
  if (lastStatus === 404) throw new Error('Print history is not available for this Bambu account');
  throw new Error(`Bambu API returned ${lastStatus}`);
}

// Parse a Bambu MQTT message into a partial state patch.
// Only fields that are *present* in the message are included — callers must
// merge this patch into the existing state so incremental updates (which only
// contain changed fields) don't clobber the last-known full state.
function parseBambuMsg(serial, payload) {
  const s = payload?.print; if (!s) return null;
  const patch = { serial, ts: Date.now() };
  if (s.gcode_state   !== undefined) patch.gcode_state    = s.gcode_state;
  if (s.mc_percent    !== undefined) patch.progress       = s.mc_percent;
  if (s.mc_remaining_time !== undefined) patch.remaining_min = s.mc_remaining_time;
  if (s.nozzle_temper !== undefined) patch.nozzle_temp    = s.nozzle_temper;
  if (s.nozzle_target_temper !== undefined) patch.nozzle_target = s.nozzle_target_temper;
  if (s.bed_temper    !== undefined) patch.bed_temp       = s.bed_temper;
  if (s.bed_target_temper !== undefined) patch.bed_target = s.bed_target_temper;
  if (s.subtask_name  !== undefined || s.gcode_file !== undefined) { patch.file = s.subtask_name || s.gcode_file || ''; }
  if (s.layer_num     !== undefined) patch.layer          = s.layer_num;
  if (s.total_layer_num !== undefined) patch.total_layers = s.total_layer_num;
  if (s.wifi_signal   !== undefined) patch.wifi           = s.wifi_signal;
  if (s.spd_lvl       !== undefined) patch.spd            = s.spd_lvl;
  if (s.ams           !== undefined) patch.ams            = s.ams;
  if (s.vt_tray       !== undefined) patch.vt_tray        = s.vt_tray;
  if (s.print_error   !== undefined) patch.error          = s.print_error;
  if (s.hms           !== undefined) patch.hms            = s.hms; // Array of { attr, code } HMS error objects
  // Only meaningful if we got at least one real field beyond serial+ts
  return Object.keys(patch).length > 2 ? patch : null;
}

// ─── Main module state ────────────────────────────────────────────────────────

let mainWin   = null;
let mqttClient = null;
let bambuDevices = [];
const printerStates = {};
const snapPollers = {};
let reconnectTimer = null;
let currentAuth = null;
let cleanupCalled = false;
let pushallTimer = null; // periodic status refresh

function send(ch, d) {
  // Broadcast to all open windows (main + any popouts like the printers popout)
  const { BrowserWindow } = require('electron');
  BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.webContents.send(ch, d); });
}

// ─── Bambu MQTT ───────────────────────────────────────────────────────────────

// CONNACK return codes that are permanent auth failures — do NOT reconnect after these.
const CONNACK_PERMANENT_FAIL = new Set([4, 5]); // 4 = bad credentials, 5 = not authorised

function connectBambu(auth) {
  if (cleanupCalled) return;
  clearTimeout(reconnectTimer);
  if (mqttClient) { try { mqttClient.end(); } catch {} mqttClient = null; }

  // auth.uid MUST be the numeric Bambu user ID from /v1/design-user-service/my/preference.
  // prepareAuth() always resolves this before calling connectBambu — we no longer
  // rely on JWT claims here because sub/preferred_username are unreliable.
  const uid = String(auth.uid || '').trim();

  if (!uid) {
    send('bambu-conn', { connected: false, error: 'User ID not found — please disconnect and sign in again' });
    return;
  }

  currentAuth = auth;
  send('bambu-conn', { connected: false, connecting: true });

  let permanentFailure = false;
  const client = new MqttTls();
  mqttClient = client;

  client.connect({
    host: 'us.mqtt.bambulab.com', port: 8883,
    clientId: `3dprinttracker_${Math.random().toString(36).slice(2, 10)}`,
    username: `u_${uid}`, password: auth.accessToken,
    keepalive: 60,
  });

  function doPushall() {
    if (!client.connected || client === null) return;
    (bambuDevices || []).forEach(d => {
      client.publish(`device/${d.dev_id}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
    });
  }

  client.on('connect', () => {
    send('bambu-conn', { connected: true });
    // Subscribe to each device's exact report topic.
    // Bambu's broker blocks wildcard (device/+/report) subscriptions — it only
    // allows subscriptions to topics owned by the authenticated user, matching
    // what the official Python SDK does: one subscribe per device serial.
    (bambuDevices || []).forEach(d => {
      client.subscribe(`device/${d.dev_id}/report`);
    });
    // Initial pushall — small delay lets the SUBACKs arrive first
    setTimeout(() => doPushall(), 800);
    // Periodic refresh every 45 s so printers that wake up later get picked up
    clearInterval(pushallTimer);
    pushallTimer = setInterval(() => doPushall(), 45000);
  });

  client.on('message', (topic, msg) => {
    const parts = topic.split('/');
    if (parts.length < 3 || parts[2] !== 'report') return;
    const serial = parts[1];
    try {
      const parsed = JSON.parse(msg.toString('utf8'));
      const patch = parseBambuMsg(serial, parsed);
      if (patch) {
        // Merge patch into the last-known state so incremental updates (which
        // only contain changed fields) don't reset un-changed fields to defaults.
        const state = { ...printerStates[serial], ...patch };
        printerStates[serial] = state;
        send('printer-update', { type: 'bambu', serial, state });
      }
    } catch {}
  });

  let lastError = null;
  client.on('error', err => {
    lastError = err.message;
    // Detect permanent auth failures (CONNACK 4/5).
    // Try a token refresh once before giving up — an expired JWT is the most common cause.
    const code = /CONNACK code (\d+)/i.exec(err.message);
    if (code && CONNACK_PERMANENT_FAIL.has(Number(code[1]))) {
      permanentFailure = true;
      if (currentAuth?.refreshToken && !currentAuth._refreshAttempted) {
        // Mark that we've tried so we don't loop
        currentAuth = { ...currentAuth, _refreshAttempted: true };
        send('bambu-conn', { connected: false, connecting: true, error: 'Auth failed — refreshing token…' });
        bambuRefresh(currentAuth.refreshToken).then(r => {
          const newTok = r.accessToken || r.token;
          if (newTok) {
            currentAuth = { ...currentAuth, accessToken: newTok, refreshToken: r.refreshToken || currentAuth.refreshToken, _refreshAttempted: true };
            send('bambu-token-refreshed', { auth: currentAuth });
            permanentFailure = false; // allow the reconnect below to fire
          }
        }).catch(() => {}).finally(() => {
          if (!permanentFailure) {
            // Short delay then reconnect with the new token
            reconnectTimer = setTimeout(() => tryReconnect(), 2000);
          } else {
            send('bambu-conn', { connected: false, error: `${err.message} — please disconnect and sign in again` });
          }
        });
      } else {
        send('bambu-conn', { connected: false, error: `${err.message} — please disconnect and sign in again` });
      }
    } else {
      send('bambu-conn', { connected: false, error: err.message });
    }
  });

  client.on('close', () => {
    clearInterval(pushallTimer); pushallTimer = null;
    if (cleanupCalled) return;
    if (permanentFailure) {
      // Auth was rejected — stop here, do not loop
      send('bambu-conn', { connected: false, error: lastError ? `${lastError} — please disconnect and sign in again` : 'Authentication failed — please disconnect and sign in again' });
      return;
    }
    // Transient disconnect — schedule reconnect
    send('bambu-conn', { connected: false, reconnecting: true, error: lastError });
    reconnectTimer = setTimeout(() => tryReconnect(), 10000);
  });
}

// Always re-fetch uid from the Bambu preferences API before connecting.
// This ensures a stale or wrong uid from a previous broken session never causes CONNACK 5.
async function prepareAuth(auth) {
  try {
    const uid = await bambuGetUid(auth.accessToken);
    if (uid) {
      const updated = { ...auth, uid };
      if (uid !== String(auth.uid || '')) {
        // uid changed (or was missing) — persist the corrected value
        send('bambu-token-refreshed', { auth: updated });
      }
      return updated;
    }
  } catch {}
  return auth; // API call failed — proceed with stored uid (connectBambu will error if empty)
}

async function tryReconnect() {
  if (!currentAuth || cleanupCalled) return;
  // Refresh expired token first
  if (isExpired(currentAuth.accessToken) && currentAuth.refreshToken) {
    try {
      const r = await bambuRefresh(currentAuth.refreshToken);
      // Bambu refresh endpoint returns 'token' (legacy) or 'accessToken' — accept both.
      const newAccessToken = r.accessToken || r.token;
      if (newAccessToken) {
        currentAuth = { ...currentAuth, accessToken: newAccessToken, refreshToken: r.refreshToken || currentAuth.refreshToken };
        send('bambu-token-refreshed', { auth: currentAuth });
      }
    } catch {}
  }
  // Re-resolve uid in case it was missing (saved before fix) or token was just refreshed
  currentAuth = await prepareAuth(currentAuth);
  connectBambu(currentAuth);
}

function disconnectBambu() {
  clearInterval(pushallTimer); pushallTimer = null;
  clearTimeout(reconnectTimer);
  if (mqttClient) { try { mqttClient.end(); } catch {} mqttClient = null; }
  currentAuth = null;
  send('bambu-conn', { connected: false });
}

function requestBambuStatus(serial) {
  if (!mqttClient || !mqttClient.connected) return;
  mqttClient.publish(`device/${serial}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } }));
}

// ─── Bambu LAN MQTT ──────────────────────────────────────────────────────────
// Connects directly to the printer over LAN using its local IP + access code.
// Username: bblp  |  Password: access code (from printer Settings → Network)
// No Bambu account or cloud token required.

let lanMqttClient = null;
let lanReconnectTimer = null;
let lanPrinter = null; // { id, name, ip, accessCode }
let lanCleanupCalled = false;

function connectBambuLan(printer) {
  if (lanCleanupCalled) return;
  clearTimeout(lanReconnectTimer);
  if (lanMqttClient) { try { lanMqttClient.end(); } catch {} lanMqttClient = null; }

  lanPrinter = printer;
  send('bambu-lan-conn', { connected: false, connecting: true });

  const client = new MqttTls();
  lanMqttClient = client;

  client.connect({
    host: printer.ip, port: 8883,
    clientId: `3dprinttracker_lan_${Math.random().toString(36).slice(2, 10)}`,
    username: 'bblp', password: printer.accessCode,
    keepalive: 60,
  });

  client.on('connect', () => {
    send('bambu-lan-conn', { connected: true });
    client.subscribe('device/+/report');
    if (printer.serial) {
      client.publish(`device/${printer.serial}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } }));
    }
  });

  client.on('message', (topic, msg) => {
    const parts = topic.split('/');
    if (parts.length < 3 || parts[2] !== 'report') return;
    const serial = parts[1];
    // Persist serial for reconnects if we discovered it via wildcard subscription
    if (!lanPrinter.serial) lanPrinter = { ...lanPrinter, serial };
    try {
      const parsed = JSON.parse(msg.toString('utf8'));
      const patch = parseBambuMsg(serial, parsed);
      if (patch) {
        const state = { ...printerStates[serial], ...patch };
        printerStates[serial] = state;
        send('printer-update', { type: 'bambu', serial, state });
      }
    } catch {}
  });

  let lanLastError = null;
  client.on('error', err => { lanLastError = err.message; send('bambu-lan-conn', { connected: false, error: err.message }); });
  client.on('close', () => {
    if (lanCleanupCalled || !lanPrinter) return;
    send('bambu-lan-conn', { connected: false, reconnecting: true, error: lanLastError });
    lanReconnectTimer = setTimeout(() => { if (lanPrinter) connectBambuLan(lanPrinter); }, 10000);
  });
}

function disconnectBambuLan() {
  clearTimeout(lanReconnectTimer);
  if (lanMqttClient) { try { lanMqttClient.end(); } catch {} lanMqttClient = null; }
  lanPrinter = null;
  send('bambu-lan-conn', { connected: false });
}

// ─── Moonraker HTTP (Snapmaker via Moonraker API) ─────────────────────────────
// Endpoint: GET http://<ip>:7125/printer/objects/query?...
// Auth:     X-Api-Key header (optional — the device config uses trusted_clients
//           covering all LAN ranges, so no key is needed for local connections)
// mDNS:    printer is also reachable as lava.local (zeroconf mdns_hostname)

const MOONRAKER_STATE_MAP = { printing: 'RUNNING', standby: 'IDLE', paused: 'PAUSE', error: 'FAILED', complete: 'FINISH' };

// Objects to query on each poll — covers the U1's 4-head tool-changer layout
const MOONRAKER_QUERY = [
  'print_stats',
  'virtual_sdcard',
  'toolhead',
  'extruder', 'extruder1', 'extruder2', 'extruder3',
  'heater_bed',
  'temperature_sensor%20cavity',       // enclosure temperature
  'filament_motion_sensor%20e0_filament',
  'filament_motion_sensor%20e1_filament',
  'filament_motion_sensor%20e2_filament',
  'filament_motion_sensor%20e3_filament',
].join('&');

function parseSnapState(id, name, d) {
  // Moonraker wraps its response: { result: { status: { ... } } }
  const s   = (d.result && d.result.status) ? d.result.status : {};
  const ps  = s.print_stats    || {};
  const bed = s.heater_bed     || {};
  const vsd = s.virtual_sdcard || {};
  const th  = s.toolhead       || {};

  const rawState   = ps.state || 'standby';
  const progress   = vsd.progress || 0;   // 0.0–1.0
  const printedSec = ps.print_duration || 0;
  const remainSec  = progress > 0 ? Math.max(0, (printedSec / progress) - printedSec) : 0;

  // All 4 extruder heads (U1 is a tool-changer with up to 4 active heads)
  const extruderNames = ['extruder', 'extruder1', 'extruder2', 'extruder3'];
  const extruders = extruderNames.map((n, i) => {
    const e = s[n];
    if (!e) return null;
    const filamentKey = `filament_motion_sensor e${i}_filament`;
    const filSensor   = s[filamentKey] || {};
    return {
      temp:             parseFloat(e.temperature || 0),
      target:           parseFloat(e.target      || 0),
      filament_loaded:  filSensor.filament_detected ?? null,
    };
  });

  // Determine the active extruder for backward-compat nozzle_temp field
  const activeExtName = th.active_extruder || 'extruder';
  const activeIdx     = extruderNames.indexOf(activeExtName);
  const activeExt     = extruders[activeIdx >= 0 ? activeIdx : 0] || extruders[0] || {};

  // Enclosure/cavity temperature
  const cavityObj  = s['temperature_sensor cavity'] || s['temperature_sensor%20cavity'] || {};
  const cavity_temp = cavityObj.temperature != null ? parseFloat(cavityObj.temperature) : null;

  return {
    id, name,
    status:        MOONRAKER_STATE_MAP[rawState] || 'UNKNOWN',
    progress:      Math.round(progress * 100),
    remaining_min: Math.round(remainSec / 60),
    file:          ps.filename || '',
    // Primary nozzle (backward-compat with Bambu card rendering)
    nozzle_temp:   activeExt.temp   || 0,
    nozzle_target: activeExt.target || 0,
    bed_temp:      parseFloat(bed.temperature || 0),
    bed_target:    parseFloat(bed.target      || 0),
    // Extended U1 fields
    extruders,
    cavity_temp,
    ts: Date.now(),
  };
}

const snapConfigs = {}; // id → { ip, token } for use by print-cmd handler

function startSnapPoll(printer) {
  const { id, name, ip, token } = printer;
  snapConfigs[id] = { ip, token };
  stopSnapPoll(id);
  const poll = async () => {
    try {
      const r = await httpReq('GET', `http://${ip}:7125/printer/objects/query?${MOONRAKER_QUERY}`, null, token);
      if (r.status === 200 && r.data && typeof r.data === 'object') {
        const state = parseSnapState(id, name, r.data);
        printerStates[id] = state;
        send('printer-update', { type: 'snapmaker', id, state });
      } else {
        send('printer-update', { type: 'snapmaker', id, state: { id, name, status: 'OFFLINE', ts: Date.now() } });
      }
    } catch {
      send('printer-update', { type: 'snapmaker', id, state: { id, name, status: 'OFFLINE', ts: Date.now() } });
    }
  };
  poll();
  snapPollers[id] = setInterval(poll, 5000);
}

function stopSnapPoll(id) {
  if (snapPollers[id]) { clearInterval(snapPollers[id]); delete snapPollers[id]; }
}

// ─── Bambu camera (JPEG frame stream, port 6000, TLS) ────────────────────────
//
// Auth packet format (80 bytes, all little-endian):
//   [0..3]  payload size  = 0x40 (64)
//   [4..7]  type          = 0x3000
//   [8..11] flags         = 0
//   [12..15] reserved     = 0
//   [16..47] username     = 'bblp' padded to 32 bytes with 0x00
//   [48..79] password     = access_code padded to 32 bytes with 0x00
//
// Each frame:
//   [0..3]  payload_size (little-endian uint32) — size of the JPEG data
//   [4..7]  itrack
//   [8..11] flags
//   [12..15] reserved
//   [16..16+payload_size] JPEG data (starts 0xFF 0xD8, ends 0xFF 0xD9)

const cameraConnections = {}; // serial → { socket, active }

function startCameraStream(serial, ip, accessCode) {
  stopCameraStream(serial); // clean up any previous connection

  const socket = tls.connect({ host: ip, port: 6000, rejectUnauthorized: false });

  const conn = { socket, active: true };
  cameraConnections[serial] = conn;

  socket.once('secureConnect', () => {
    // Build and send authentication packet
    const auth = Buffer.alloc(80);
    auth.writeUInt32LE(0x40,   0);  // payload size
    auth.writeUInt32LE(0x3000, 4);  // type
    auth.writeUInt32LE(0,      8);  // flags
    auth.writeUInt32LE(0,      12); // reserved
    Buffer.from('bblp').copy(auth, 16);                           // username (padded)
    Buffer.from(String(accessCode)).copy(auth, 48);              // password (padded)
    socket.write(auth);

    // Stream frames
    let buf = Buffer.alloc(0);
    let lastSent = 0;

    socket.on('data', (chunk) => {
      if (!conn.active) return;
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 16) {
        const payloadSize = buf.readUInt32LE(0);
        if (payloadSize === 0 || payloadSize > 4 * 1024 * 1024) { buf = Buffer.alloc(0); break; } // sanity cap 4 MiB
        if (buf.length < 16 + payloadSize) break; // wait for more data

        const frame = buf.slice(16, 16 + payloadSize);
        buf = buf.slice(16 + payloadSize);

        // Rate-limit to ~5 fps (200 ms between sent frames)
        const now = Date.now();
        if (now - lastSent < 200) continue;
        lastSent = now;

        // Only send valid JPEG frames
        if (frame.length >= 2 && frame[0] === 0xFF && frame[1] === 0xD8) {
          const dataUrl = 'data:image/jpeg;base64,' + frame.toString('base64');
          send('printer-camera-frame', { serial, dataUrl });
          sendFrameToRelay(serial, frame); // push raw JPEG to cloud relay
        }
      }
    });
  });

  socket.on('error', (err) => {
    send('printer-camera-frame', { serial, error: err.message });
    stopCameraStream(serial);
  });

  socket.on('close', () => {
    if (conn.active) {
      send('printer-camera-frame', { serial, error: 'Connection closed' });
    }
    delete cameraConnections[serial];
  });
}

function stopCameraStream(serial) {
  const conn = cameraConnections[serial];
  if (conn) {
    conn.active = false;
    try { conn.socket.destroy(); } catch {}
    delete cameraConnections[serial];
  }
}

function stopAllCameras() {
  Object.keys(cameraConnections).forEach(stopCameraStream);
}

// ─── Cloud camera relay (WebSocket to cloud server) ──────────────────────────
//
// When enabled, the desktop opens a WebSocket connection to the cloud server
// and pushes raw JPEG frames for every active camera stream.  The cloud server
// then serves those frames as MJPEG to browser clients — no LAN access needed
// on the server side.
//
// Binary message format (desktop → cloud):
//   [0..3]  serial length  (uint32 LE)
//   [4..N]  serial string  (UTF-8)
//   [N..]   JPEG bytes

const crypto = require('crypto');

let relaySocket         = null;  // raw TCP/TLS socket after WebSocket upgrade
let relayActive         = false; // true while the user has relay enabled
let relayReconnectTimer = null;

/**
 * Minimal WebSocket client using only Node built-ins.
 * Sends binary frames; no receive handling needed.
 */
function wsClientConnect(url, token, onOpen, onClose) {
  const u = new URL(url);
  const isSecure = u.protocol === 'wss:';
  const port = parseInt(u.port) || (isSecure ? 443 : 80);
  const wsKey = crypto.randomBytes(16).toString('base64');

  const options = {
    hostname: u.hostname,
    port,
    path: u.pathname + (u.search || ''),
    method: 'GET',
    rejectUnauthorized: false,
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': wsKey,
      'Sec-WebSocket-Version': '13',
      'Authorization': `Bearer ${token}`,
    },
  };

  const mod = isSecure ? require('https') : require('http');
  const req = mod.request(options);

  req.on('upgrade', (_res, socket) => {
    relaySocket = socket;
    socket.on('error', () => { relaySocket = null; onClose(); });
    socket.on('close', () => { relaySocket = null; onClose(); });
    socket.on('end',   () => { relaySocket = null; onClose(); });
    onOpen();
  });

  req.on('error', (err) => { onClose(err); });
  req.setTimeout(10000, () => { req.destroy(); onClose(new Error('Connection timeout')); });
  req.end();
}

/**
 * Send a masked binary WebSocket frame (RFC 6455 — clients must mask).
 */
function wsSendFrame(socket, data) {
  if (!socket || socket.destroyed) return;
  const len  = data.length;
  const mask = crypto.randomBytes(4);
  let hLen = 2;
  if (len > 65535) hLen += 8;
  else if (len >= 126) hLen += 2;

  const header = Buffer.alloc(hLen);
  header[0] = 0x82; // FIN + binary opcode
  if (len > 65535) {
    header[1] = 0xFF;
    header.writeBigUInt64BE(BigInt(len), 2);
  } else if (len >= 126) {
    header[1] = 0xFE;
    header.writeUInt16BE(len, 2);
  } else {
    header[1] = 0x80 | len;
  }

  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];

  try { socket.write(Buffer.concat([header, mask, masked])); } catch {}
}

/** Package serial + JPEG and push to the relay WebSocket. */
function sendFrameToRelay(serial, jpegBuffer) {
  if (!relaySocket || relaySocket.destroyed) return;
  const serialBuf = Buffer.from(serial, 'utf8');
  const lenBuf    = Buffer.alloc(4);
  lenBuf.writeUInt32LE(serialBuf.length, 0);
  wsSendFrame(relaySocket, Buffer.concat([lenBuf, serialBuf, jpegBuffer]));
}

function startRelay(cloudApiUrl, token) {
  stopRelay();
  if (!cloudApiUrl || !token) return;
  relayActive = true;

  // Convert http(s):// → ws(s):// and add relay path
  const wsUrl = cloudApiUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/camera-relay';

  function attemptConnect() {
    if (!relayActive) return;
    wsClientConnect(wsUrl, token,
      () => {
        send('camera-relay-status', { connected: true });
        console.log('[camera-relay] Relay connected to', wsUrl);
      },
      (err) => {
        relaySocket = null;
        send('camera-relay-status', {
          connected: false,
          error: err ? err.message : 'Disconnected',
        });
        if (relayActive) {
          relayReconnectTimer = setTimeout(attemptConnect, 8000);
        }
      }
    );
  }

  attemptConnect();
}

function stopRelay() {
  relayActive = false;
  clearTimeout(relayReconnectTimer);
  relayReconnectTimer = null;
  if (relaySocket) {
    try {
      relaySocket.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); // WS close frame
      relaySocket.destroy();
    } catch {}
    relaySocket = null;
  }
  send('camera-relay-status', { connected: false });
}

function getRelayStatus() {
  return {
    active:    relayActive,
    connected: relaySocket !== null && !relaySocket.destroyed,
  };
}

// ─── Auto-start helper ────────────────────────────────────────────────────────

function autoStart(loadSettings) {
  const tryStart = async () => {
    try {
      const settings = loadSettings();
      if (!settings) return;
      if (settings.bambuAuth?.accessToken) {
        bambuDevices = settings.bambuAuth.devices || [];
        const auth = await prepareAuth(settings.bambuAuth);
        connectBambu(auth);
      }
      if (Array.isArray(settings.printers)) {
        settings.printers.filter(p => p.type === 'snapmaker').forEach(p => startSnapPoll(p));
      }
    } catch {}
  };
  // Wait for renderer to be ready
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.once('did-finish-load', () => setTimeout(tryStart, 500));
  } else {
    setTimeout(tryStart, 3000);
  }
}

// ─── IPC registration ─────────────────────────────────────────────────────────

module.exports = function registerPrinterHandlers(ipcMain, win, loadSettings) {
  mainWin = win;
  autoStart(loadSettings);

  ipcMain.handle('printer-bambu-login', async (_, { account, password }) => {
    try { return await bambuLogin(account, password); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-bambu-verify', async (_, { account, tfaKey, code }) => {
    try { return await bambuVerify(account, tfaKey, code); }
    catch (e) { return { error: e.message }; }
  });

  // verifyCode (Microsoft/Google/Apple OAuth accounts): re-posts to login endpoint with code only
  ipcMain.handle('printer-bambu-verify-code', async (_, { account, code }) => {
    try { return await bambuVerifyCode(account, code); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-bambu-get-devices', async (_, { accessToken }) => {
    try { return await bambuGetDevices(accessToken); }
    catch (e) { return { error: e.message }; }
  });

  // Opens a real browser window so Cloudflare / MFA are handled by Bambu's own site.
  // Uses Chrome DevTools Protocol to capture the accessToken directly from the
  // Bambu sign-in API response body — the most reliable source.
  ipcMain.handle('printer-bambu-web-login', () => {
    const { BrowserWindow, session } = require('electron');
    return new Promise((resolve) => {
      let resolved = false;
      // cdpToken: captured from sign-in/refresh API response via CDP (most reliable)
      // bearerToken: captured from outgoing Authorization header (if web app uses it)
      // cdpUid: captured from sign-in API response (some responses include uid)
      let cdpToken = null;
      let cdpRefreshToken = null;
      let bearerToken = null;
      let cdpUid = null;
      const partition = 'persist:bambu-login-' + Date.now();
      const loginSession = session.fromPartition(partition);

      // Secondary: catch any outgoing Bearer header (works if web app uses explicit auth)
      loginSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://*.bambulab.com/*', 'https://api.bambulab.com/*'] },
        (details, cb) => {
          const auth = details.requestHeaders['Authorization'] || details.requestHeaders['authorization'];
          if (auth && auth.startsWith('Bearer ')) {
            const t = auth.slice(7);
            if (t.split('.').length === 3 && t.length > 50) bearerToken = t;
          }
          cb({ cancel: false, requestHeaders: details.requestHeaders });
        }
      );

      const SENTINEL = 'https://3dpt-auth.invalid/done';

      // Injected button — localStorage scan is the last-resort fallback only
      const INJECT_BUTTON_JS = `
        (function () {
          if (document.getElementById('_3dpt_done_btn')) return;
          const btn = document.createElement('button');
          btn.id = '_3dpt_done_btn';
          btn.textContent = '✓ Done — Connect to 3D Print Tracker';
          Object.assign(btn.style, {
            position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
            background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px',
            padding: '14px 24px', fontSize: '15px', fontWeight: '700',
            cursor: 'pointer', boxShadow: '0 4px 18px rgba(0,0,0,0.28)',
            fontFamily: 'system-ui, sans-serif', letterSpacing: '0.01em',
          });
          btn.onclick = function () {
            btn.disabled = true;
            btn.textContent = 'Connecting…';
            // Storage scan — last resort if CDP didn't capture the token
            function isJwt(v) { return typeof v === 'string' && v.split('.').length === 3 && v.length > 100; }
            function scanObj(o) {
              if (!o || typeof o !== 'object') return null;
              for (const [, v] of Object.entries(o)) {
                if (isJwt(v)) return v;
                const r = scanObj(v); if (r) return r;
              }
              return null;
            }
            function findToken() {
              const keys = ['access_token','accessToken','token','auth_token','bambu_token','userToken','userAccessToken','jwt'];
              for (const s of [localStorage, sessionStorage]) {
                for (const k of keys) { const v = s.getItem(k); if (isJwt(v)) return v; }
              }
              for (const s of [localStorage, sessionStorage]) {
                for (let i = 0; i < s.length; i++) {
                  const v = s.getItem(s.key(i));
                  if (isJwt(v)) return v;
                  try { const r = scanObj(JSON.parse(v)); if (r) return r; } catch {}
                }
              }
              return '';
            }
            window.location.href = '${SENTINEL}?t=' + encodeURIComponent(findToken());
          };
          document.body.appendChild(btn);
        })();
      `;

      function injectButton() {
        try { loginWin.webContents.executeJavaScript(INJECT_BUTTON_JS).catch(() => {}); } catch {}
      }

      const loginWin = new BrowserWindow({
        width: 960, height: 720,
        title: 'Sign in to Bambu Lab — then click the green button',
        webPreferences: { partition, contextIsolation: true, nodeIntegration: false },
      });
      loginWin.setMenuBarVisibility(false);

      // PRIMARY: attach CDP debugger to capture the accessToken from auth API responses
      // This intercepts /api/sign-in/legacy, /tfa, /verify, /refresh responses directly.
      const cdpPending = new Map(); // requestId → url
      try {
        loginWin.webContents.debugger.attach('1.3');
        loginWin.webContents.debugger.sendCommand('Network.enable').catch(() => {});
        loginWin.webContents.debugger.on('message', async (_, method, params) => {
          try {
            if (method === 'Network.responseReceived') {
              const url = params.response && params.response.url ? params.response.url : '';
              // Watch ALL bambulab.com endpoints — both bambulab.com/api/ (web-app sign-in)
              // AND api.bambulab.com/ (OrcaSlicer-style API, used after OAuth redirects).
              if (/bambulab\.com/i.test(url)) {
                cdpPending.set(params.requestId, url);
              }
            } else if (method === 'Network.loadingFinished' && cdpPending.has(params.requestId)) {
              cdpPending.delete(params.requestId);
              let text = '';
              try {
                const resp = await loginWin.webContents.debugger.sendCommand(
                  'Network.getResponseBody', { requestId: params.requestId }
                );
                text = resp.base64Encoded ? Buffer.from(resp.body, 'base64').toString('utf8') : resp.body;
              } catch { return; } // body not available (redirect, cached, etc.)
              const data = JSON.parse(text);
              // Bambu sign-in API returns the JWT as 'token' (legacy/tfa endpoints) OR
              // 'accessToken' (some refresh / OrcaSlicer API endpoints) — check both.
              const rawTok = data?.accessToken || data?.token;
              if (rawTok && rawTok.split('.').length === 3 && rawTok.length > 50) {
                cdpToken = rawTok;
              }
              // Capture refresh token so we can refresh without re-login later
              if (data?.refreshToken) cdpRefreshToken = data.refreshToken;
              // uid may be top-level OR nested under data.data (preferences API returns { data: { uid } })
              const uidVal = data?.data?.uid ?? data?.uid;
              if (uidVal) cdpUid = String(uidVal);
            }
          } catch {}
        });
      } catch {}

      loginWin.loadURL('https://bambulab.com/sign-in');

      // Inject button on any bambulab.com page that isn't the initial sign-in.
      // OAuth (Microsoft/Google/Apple) can redirect to many different post-login URLs
      // so we inject broadly and let the user click when they're ready.
      function shouldInject(url) {
        return url.includes('bambulab.com') && !url.includes('microsoftonline') && !url.includes('google.com') && !url.includes('apple.com');
      }
      loginWin.webContents.on('did-finish-load', () => {
        if (resolved) return;
        if (shouldInject(loginWin.webContents.getURL())) injectButton();
      });

      loginWin.webContents.on('did-navigate-in-page', () => {
        if (resolved) return;
        if (shouldInject(loginWin.webContents.getURL())) setTimeout(injectButton, 600);
      });

      // Intercept sentinel URL — button clicked
      loginWin.webContents.on('will-navigate', async (event, url) => {
        if (!url.startsWith(SENTINEL)) return;
        event.preventDefault();
        if (resolved) return;
        resolved = true;

        // Token priority:
        //  1. CDP response body  (standard sign-in — most reliable; now catches api.bambulab.com too)
        //  2. Outgoing Bearer header (captured from web app's API calls after OAuth redirect)
        //  3. Electron session cookies (HTTPOnly cookies — readable by Electron, not JS)
        //  4. CDP Network.getCookies (alternative cookie read)
        //  5. In-browser fetch to Bambu refresh endpoint using session cookie
        //  6. localStorage/sessionStorage scan (last resort)
        let storageToken = '';
        try { storageToken = new URL(url).searchParams.get('t') || ''; } catch {}

        // Electron session cookie scan — reads HTTPOnly cookies that JS cannot access.
        // Most reliable for Microsoft/Google/Apple OAuth logins where JWT is in session cookie.
        let cookieToken = null;
        try {
          const eCookies = await loginSession.cookies.get({ url: 'https://bambulab.com' });
          for (const c of eCookies) {
            const v = c.value || '';
            if (v.split('.').length === 3 && v.length > 100) { cookieToken = v; break; }
          }
        } catch {}

        // CDP cookie scan as secondary fallback
        if (!cookieToken) {
          try {
            const cookieResult = await loginWin.webContents.debugger.sendCommand('Network.getCookies', {
              urls: ['https://bambulab.com', 'https://api.bambulab.com'],
            });
            for (const c of (cookieResult.cookies || [])) {
              const v = c.value || '';
              if (v.split('.').length === 3 && v.length > 100) { cookieToken = v; break; }
            }
          } catch {}
        }

        // In-browser fetch fallback: if the browser has a valid session (OAuth succeeded)
        // but we couldn't find the JWT in cookies or responses, try calling the Bambu
        // sign-in endpoint from within the browser (which sends the session cookie automatically).
        let fetchedToken = null;
        if (!cdpToken && !cookieToken && !bearerToken && !storageToken) {
          try {
            fetchedToken = await loginWin.webContents.executeJavaScript(`
              (function() {
                return fetch('https://bambulab.com/api/sign-in/refresh', {
                  method: 'POST', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' }, body: '{}'
                }).then(function(r) { return r.json(); })
                  .then(function(d) { return d.accessToken || d.token || ''; })
                  .catch(function() { return ''; });
              })()
            `);
            if (!fetchedToken || fetchedToken.split('.').length !== 3 || fetchedToken.length <= 50) fetchedToken = null;
          } catch {}
        }

        const finalToken = cdpToken || bearerToken || cookieToken || fetchedToken || storageToken;

        if (!finalToken || finalToken.split('.').length !== 3 || finalToken.length <= 50) {
          try { loginWin.close(); } catch {}
          resolve({ canceled: true, reason: 'no_token' });
          return;
        }

        // Fetch devices + uid using the captured token.
        // If token is available, use explicit Bearer auth; otherwise fall back to
        // session-cookie-based credentials (works if the OAuth session is still active).
        let devices = [];
        let uid = cdpUid || null;
        try {
          const tokenJson = JSON.stringify(finalToken || '');
          const raw = await loginWin.webContents.executeJavaScript(`
            (function(tok) {
              var hdrs = tok ? { 'Authorization': 'Bearer ' + tok } : {};
              var opts = tok ? { headers: hdrs } : { credentials: 'include', headers: hdrs };
              function fetchJson(url) {
                return fetch(url, opts).then(function(r) { return r.json(); }).catch(function() { return {}; });
              }
              return Promise.all([
                fetchJson('https://api.bambulab.com/v1/iot-service/api/user/bind')
                  .then(function(d) { return Array.isArray(d.devices) ? d.devices : []; }),
                fetchJson('https://api.bambulab.com/v1/design-user-service/my/preference')
                  .then(function(d) {
                    return (d && d.data && d.data.uid) ? String(d.data.uid) : (d && d.uid ? String(d.uid) : '');
                  })
              ]).then(function(res) { return JSON.stringify({ devs: res[0], uidVal: res[1] }); });
            })(${tokenJson})
          `);
          const parsed = JSON.parse(raw);
          devices = parsed.devs || [];
          if (parsed.uidVal) uid = parsed.uidVal;
        } catch {}

        try { loginWin.close(); } catch {}
        resolve({ accessToken: finalToken, devices, uid, refreshToken: cdpRefreshToken || null });
      });

      loginWin.on('closed', () => { if (!resolved) resolve({ canceled: true }); });
    });
  });

  ipcMain.handle('printer-bambu-connect', async (_, { auth }) => {
    bambuDevices = auth.devices || [];
    let resolved = await prepareAuth(auth);
    // Refresh token if expired before attempting to connect (same logic as tryReconnect).
    // Without this, clicking "Reconnect" with a stale stored token causes CONNACK 5.
    if (isExpired(resolved.accessToken) && resolved.refreshToken) {
      try {
        const r = await bambuRefresh(resolved.refreshToken);
        const newAccessToken = r.accessToken || r.token;
        if (newAccessToken) {
          resolved = { ...resolved, accessToken: newAccessToken, refreshToken: r.refreshToken || resolved.refreshToken };
          send('bambu-token-refreshed', { auth: resolved });
        }
      } catch {}
    }
    connectBambu(resolved);
    return { ok: true };
  });

  ipcMain.handle('printer-bambu-get-uid', async (_, { accessToken }) => {
    try { return { uid: await bambuGetUid(accessToken) }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-bambu-get-tasks', async (_, { accessToken, page, limit, region }) => {
    try { return await bambuGetTasks(accessToken, page || 1, limit || 20, region || 'global'); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-bambu-disconnect', () => { disconnectBambu(); return { ok: true }; });

  ipcMain.handle('printer-bambu-refresh-status', (_, { serial }) => {
    if (serial) requestBambuStatus(serial);
    else (bambuDevices || []).forEach(d => requestBambuStatus(d.dev_id));
    return { ok: true };
  });

  ipcMain.handle('printer-bambu-lan-connect', (_, { printer }) => {
    connectBambuLan(printer);
    return { ok: true };
  });

  ipcMain.handle('printer-bambu-lan-disconnect', () => { disconnectBambuLan(); return { ok: true }; });

  ipcMain.handle('printer-snap-connect-request', async (_, { ip }) => {
    try {
      const r = await httpReq('POST', `http://${ip}:8080/api/v1/connect`, { token: '' });
      return r.data;
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-snap-start', (_, { printer }) => { startSnapPoll(printer); return { ok: true }; });
  ipcMain.handle('printer-snap-stop',  (_, { id })      => { stopSnapPoll(id); return { ok: true }; });

  ipcMain.handle('printer-bambu-camera-start', (_, { serial, ip, accessCode }) => {
    // Auto-lookup ip and accessCode from the cloud device list when not supplied.
    // The Bambu bind API returns 'ip' and 'dev_access_code' for each device, so
    // no manual LAN configuration is needed — we use what the cloud already gave us.
    let effectiveIp   = ip;
    let effectiveCode = accessCode;
    if (!effectiveIp) {
      const dev = (bambuDevices || []).find(d => d.dev_id === serial);
      effectiveIp   = dev?.ip || '';
      effectiveCode = effectiveCode || dev?.dev_access_code || dev?.access_code || '';
    }
    if (!effectiveIp) {
      return { error: 'No IP address found for this printer. Make sure it is online and on your local network.' };
    }
    try { startCameraStream(serial, effectiveIp, effectiveCode); return { ok: true }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('printer-bambu-camera-stop', (_, { serial }) => {
    stopCameraStream(serial); return { ok: true };
  });

  // ── Camera relay IPC ───────────────────────────────────────────────────────
  // Start relaying all active camera streams to the cloud server.
  // cloudApiUrl: base URL of the cloud API, e.g. https://your-app.onrender.com
  // token:       CAMERA_RELAY_TOKEN configured in the Render environment
  // Print control commands (pause / resume / stop) via MQTT
  ipcMain.handle('printer-bambu-print-cmd', (_, { serial, cmd }) => {
    if (!['pause', 'resume', 'stop', 'unload_filament'].includes(cmd)) return { error: 'Invalid command' };
    if (!mqttClient?.connected) return { error: 'Not connected to Bambu' };
    const payload = JSON.stringify({ print: { sequence_id: '0', command: cmd, param: '' } });
    mqttClient.publish(`device/${serial}/request`, payload);
    return { ok: true };
  });

  // Snapmaker print control
  ipcMain.handle('printer-snap-print-cmd', async (_, { id, cmd }) => {
    const cfg = snapConfigs[id];
    if (!cfg) return { error: 'Snapmaker not connected' };
    try {
      const map = { pause: 'pause_print', resume: 'resume_print', stop: 'stop_print' };
      const endpoint = map[cmd];
      if (!endpoint) return { error: 'Invalid command' };
      const res = await httpReq('POST', `http://${cfg.ip}:7125/printer/print/${endpoint}`, null, cfg.token);
      return res.status < 300 ? { ok: true } : { error: `HTTP ${res.status}` };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('camera-relay-start', (_, { cloudApiUrl, token }) => {
    try {
      startRelay(cloudApiUrl, token);
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('camera-relay-stop', () => {
    stopRelay();
    return { ok: true };
  });

  ipcMain.handle('camera-relay-status', () => {
    return getRelayStatus();
  });

  return {
    cleanup() {
      cleanupCalled = true;
      lanCleanupCalled = true;
      clearInterval(pushallTimer); pushallTimer = null;
      clearTimeout(reconnectTimer);
      clearTimeout(lanReconnectTimer);
      stopAllCameras();
      stopRelay();
      if (mqttClient) { try { mqttClient.end(); } catch {} mqttClient = null; }
      if (lanMqttClient) { try { lanMqttClient.end(); } catch {} lanMqttClient = null; }
      Object.keys(snapPollers).forEach(stopSnapPoll);
    },
  };
};
