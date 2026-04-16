/**
 * Bambu Lab cloud MQTT integration for the Express server.
 * Ported from src/main/ipc/printers.js — pure Node.js, no Electron.
 * Exposes an EventEmitter so server/index.js can broadcast printer updates via SSE.
 */

const tls     = require('tls');
const https   = require('https');
const dgram   = require('dgram');
const { EventEmitter } = require('events');

// ─── Bambu LAN Discovery (SSDP/UDP port 2021) ────────────────────────────────
// Bambu printers broadcast SSDP-style NOTIFY packets to UDP port 2021 on the
// LAN.  We listen for them, extract the IP (Location header) and serial (USN
// header), and cache them so the camera endpoint can auto-connect.

const discoveredPrinters = {};   // serial → { ip, model, name, lastSeen }

function parseSsdpPacket(buf) {
  const text = buf.toString('utf8');
  if (!text.startsWith('NOTIFY') && !text.includes('urn:bambulab-com:device')) return null;
  const get = (header) => {
    const m = new RegExp(`^${header}:\\s*(.+)$`, 'im').exec(text);
    return m ? m[1].trim() : null;
  };
  const ip     = get('Location');
  const usn    = get('USN');         // printer serial number
  const model  = get('DevModel\\.bambu\\.com');
  const name   = get('DevName\\.bambu\\.com');
  if (!ip || !usn) return null;
  // USN is just the serial or "uuid::serial" — take last segment
  const serial = usn.split('::').pop().split(':').pop();
  return { ip, serial, model, name };
}

let ssdpSocket = null;

function startDiscovery() {
  try {
    ssdpSocket = dgram.createSocket('udp4');
    ssdpSocket.on('message', (buf) => {
      const info = parseSsdpPacket(buf);
      if (!info) return;
      const prev = discoveredPrinters[info.serial];
      discoveredPrinters[info.serial] = {
        ip: info.ip,
        model: info.model || (prev && prev.model) || '',
        name:  info.name  || (prev && prev.name)  || '',
        lastSeen: Date.now(),
      };
    });
    ssdpSocket.on('error', () => { /* silently ignore — not all environments allow binding */ });
    ssdpSocket.bind(2021, () => {
      try { ssdpSocket.setBroadcast(true); } catch {}
    });
  } catch {
    // UDP discovery is best-effort; failures do not affect other functionality.
  }
}

startDiscovery();

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
  let flags = 0x02;
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
    // Bambu cloud MQTT uses a valid public certificate — verify it.
    this.socket = tls.connect({ host, port });
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
    if (type === 2) {
      if (body.length >= 2 && body[1] === 0) {
        this.connected = true;
        this._ping = setInterval(() => { if (this.connected && !this.socket.destroyed) this.socket.write(Buffer.from([0xC0, 0x00])); }, this._ka * 800);
        this.emit('connect');
      } else { this.emit('error', new Error(`CONNACK code ${body[1]}`)); }
    } else if (type === 3) {
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

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function isExpired(token) {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(Buffer.from(p + '=='.slice(0, (4 - p.length % 4) % 4), 'base64').toString('utf8'));
    return exp && Date.now() / 1000 > exp - 60;
  } catch { return false; }
}

// ─── Bambu Cloud HTTP helpers ─────────────────────────────────────────────────

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

function httpsReq(method, url, body, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
      timeout: timeoutMs,
    }, res => {
      let s = ''; res.on('data', c => s += c);
      res.on('end', () => {
        let cookieToken = null;
        for (const c of (res.headers['set-cookie'] || [])) {
          const m = /\btoken=([^;]+)/i.exec(c);
          if (m && m[1]) { cookieToken = decodeURIComponent(m[1]); break; }
        }
        try { resolve({ status: res.statusCode, data: JSON.parse(s), cookieToken }); }
        catch { resolve({ status: res.statusCode, data: s, cookieToken }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`Request to ${u.hostname} timed out after ${timeoutMs / 1000}s`)); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Bambu Cloud API functions ────────────────────────────────────────────────

// Region-aware base URLs.
// 'china'  → api.bambulab.cn  /  cn.mqtt.bambulab.com
// anything else (global, au, eu, us, …) → api.bambulab.com / us.mqtt.bambulab.com
function bambuBaseUrls(region) {
  const china = region === 'china';
  return {
    api:  china ? 'https://api.bambulab.cn'  : 'https://api.bambulab.com',
    web:  china ? 'https://bambulab.cn'       : 'https://bambulab.com',
    mqtt: china ? 'cn.mqtt.bambulab.com'      : 'us.mqtt.bambulab.com',
  };
}

async function bambuLogin(account, password, region = 'global') {
  const { api } = bambuBaseUrls(region);
  const r = await httpsReq('POST', `${api}/v1/user-service/user/login`,
    { account, password, apiError: '' }, BAMBU_HEADERS);
  const d = r.data;
  if (d?.loginType === 'verifyCode') {
    try { await httpsReq('POST', `${api}/v1/user-service/user/sendemail/code`,
      { email: account, type: 'codeLogin' }, BAMBU_HEADERS); } catch {}
  }
  return d;
}

async function bambuVerifyCode(account, code, region = 'global') {
  const { api } = bambuBaseUrls(region);
  const r = await httpsReq('POST', `${api}/v1/user-service/user/login`,
    { account, code }, BAMBU_HEADERS);
  return r.data;
}

async function bambuVerify(account, tfaKey, code, region = 'global') {
  const { web } = bambuBaseUrls(region);
  const r = await httpsReq('POST', `${web}/api/sign-in/tfa`, { tfaKey, tfaCode: code }, BAMBU_HEADERS);
  const token = r.cookieToken || r.data?.token || r.data?.accessToken || null;
  return { token, refreshToken: r.data?.refreshToken || null, ...r.data };
}

async function bambuGetDevices(accessToken, region = 'global') {
  const { api } = bambuBaseUrls(region);
  const r = await httpsReq('GET', `${api}/v1/iot-service/api/user/bind`, null, { ...BAMBU_HEADERS, Authorization: `Bearer ${accessToken}` });
  return r.data?.devices || [];
}

async function bambuGetUid(accessToken, region = 'global') {
  const { api } = bambuBaseUrls(region);
  const r = await httpsReq('GET', `${api}/v1/design-user-service/my/preference`, null, { ...BAMBU_HEADERS, Authorization: `Bearer ${accessToken}` });
  const uid = r.data?.data?.uid ?? r.data?.uid;
  return uid ? String(uid) : null;
}

async function bambuRefresh(refreshToken, region = 'global') {
  const { web } = bambuBaseUrls(region);
  const r = await httpsReq('POST', `${web}/api/sign-in/refresh`, { refreshToken }, BAMBU_HEADERS);
  return r.data;
}

async function bambuGetTasks(accessToken, page = 1, limit = 20, region = 'global') {
  const { api } = bambuBaseUrls(region);
  const r = await httpsReq('GET', `${api}/v1/iot-service/api/user/task?page=${page}&limit=${limit}`,
    null, { ...BAMBU_HEADERS, Authorization: `Bearer ${accessToken}` });
  if (r.status < 200 || r.status >= 300) {
    const err = new Error(r.data?.message || r.data?.detail || r.data?.error || `Bambu API error ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  if (r.data?.detail || (r.data?.message && r.data.message !== 'success' && !r.data?.hits)) {
    throw new Error(r.data.detail || r.data.message || 'Bambu returned an unexpected response');
  }
  return r.data;
}

// Fetch camera credentials from Bambu Cloud (ttcode API).
// Returns { ttcode, passwd, authkey } where passwd == dev_access_code for port 6000.
async function bambuGetCameraCreds(accessToken, serial) {
  const r = await httpsReq('POST', 'https://api.bambulab.com/v1/iot-service/api/user/ttcode',
    { dev_id: serial },
    { ...BAMBU_HEADERS, Authorization: `Bearer ${accessToken}` });
  return r.data;
}

// ─── MQTT message parser ──────────────────────────────────────────────────────

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
  if (s.subtask_name  !== undefined || s.gcode_file !== undefined) patch.file = s.subtask_name || s.gcode_file || '';
  if (s.layer_num     !== undefined) patch.layer          = s.layer_num;
  if (s.total_layer_num !== undefined) patch.total_layers = s.total_layer_num;
  if (s.wifi_signal   !== undefined) patch.wifi           = s.wifi_signal;
  if (s.spd_lvl       !== undefined) patch.spd            = s.spd_lvl;
  if (s.ams           !== undefined) patch.ams            = s.ams;
  if (s.vt_tray       !== undefined) patch.vt_tray        = s.vt_tray;
  if (s.print_error   !== undefined) patch.error          = s.print_error;
  return Object.keys(patch).length > 2 ? patch : null;
}

// ─── Module state + EventEmitter ─────────────────────────────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

let mqttClient    = null;
let bambuDevices  = [];
const printerStates = {};
let reconnectTimer  = null;
let pushallTimer    = null;
let currentAuth     = null;
let cleanupCalled   = false;
let bambuConnState  = { connected: false };

function setBambuConn(state) {
  bambuConnState = state;
  emitter.emit('bambu-conn', state);
}

function setPrinterState(serial, patch) {
  const state = { ...printerStates[serial], ...patch };
  printerStates[serial] = state;
  emitter.emit('printer-update', { serial, state });
}

// ─── MQTT connection ──────────────────────────────────────────────────────────

const CONNACK_PERMANENT_FAIL = new Set([4, 5]);

async function prepareAuth(auth) {
  try {
    const uid = await bambuGetUid(auth.accessToken, auth.region || 'global');
    if (uid) return { ...auth, uid };
  } catch {}
  return auth;
}

function connectBambu(auth) {
  if (cleanupCalled) return;
  clearTimeout(reconnectTimer);
  if (mqttClient) { try { mqttClient.end(); } catch {} mqttClient = null; }

  const uid = String(auth.uid || '').trim();
  if (!uid) {
    setBambuConn({ connected: false, error: 'User ID not found — please disconnect and sign in again' });
    return;
  }

  currentAuth = auth;
  setBambuConn({ connected: false, connecting: true });

  let permanentFailure = false;
  const client = new MqttTls();
  mqttClient = client;

  const { mqtt: mqttHost } = bambuBaseUrls(auth.region || 'global');
  client.connect({
    host: mqttHost, port: 8883,
    clientId: `3dprinttracker_${Math.random().toString(36).slice(2, 10)}`,
    username: `u_${uid}`, password: auth.accessToken,
    keepalive: 60,
  });

  function doPushall() {
    if (!client.connected) return;
    (bambuDevices || []).forEach(d => {
      client.publish(`device/${d.dev_id}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
    });
  }

  client.on('connect', () => {
    setBambuConn({ connected: true });
    (bambuDevices || []).forEach(d => client.subscribe(`device/${d.dev_id}/report`));
    setTimeout(() => doPushall(), 800);
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
      if (patch) setPrinterState(serial, patch);
    } catch {}
  });

  let lastError = null;
  client.on('error', err => {
    lastError = err.message;
    const code = /CONNACK code (\d+)/i.exec(err.message);
    if (code && CONNACK_PERMANENT_FAIL.has(Number(code[1]))) {
      permanentFailure = true;
      if (currentAuth?.refreshToken && !currentAuth._refreshAttempted) {
        currentAuth = { ...currentAuth, _refreshAttempted: true };
        setBambuConn({ connected: false, connecting: true, error: 'Auth failed — refreshing token…' });
        bambuRefresh(currentAuth.refreshToken, currentAuth.region || 'global').then(r => {
          const newTok = r.accessToken || r.token;
          if (newTok) {
            currentAuth = { ...currentAuth, accessToken: newTok, refreshToken: r.refreshToken || currentAuth.refreshToken, _refreshAttempted: true };
            emitter.emit('bambu-token-refreshed', { auth: currentAuth });
            permanentFailure = false;
          }
        }).catch(() => {}).finally(() => {
          if (!permanentFailure) {
            reconnectTimer = setTimeout(() => tryReconnect(), 2000);
          } else {
            setBambuConn({ connected: false, error: `${err.message} — please disconnect and sign in again` });
          }
        });
      } else {
        setBambuConn({ connected: false, error: `${err.message} — please disconnect and sign in again` });
      }
    } else {
      setBambuConn({ connected: false, error: err.message });
    }
  });

  client.on('close', () => {
    clearInterval(pushallTimer); pushallTimer = null;
    if (cleanupCalled) return;
    if (permanentFailure) {
      setBambuConn({ connected: false, error: lastError ? `${lastError} — please disconnect and sign in again` : 'Authentication failed' });
      return;
    }
    setBambuConn({ connected: false, reconnecting: true, error: lastError });
    reconnectTimer = setTimeout(() => tryReconnect(), 10000);
  });
}

async function tryReconnect() {
  if (!currentAuth || cleanupCalled) return;
  if (isExpired(currentAuth.accessToken) && currentAuth.refreshToken) {
    try {
      const r = await bambuRefresh(currentAuth.refreshToken, currentAuth.region || 'global');
      const newAccessToken = r.accessToken || r.token;
      if (newAccessToken) {
        currentAuth = { ...currentAuth, accessToken: newAccessToken, refreshToken: r.refreshToken || currentAuth.refreshToken };
        emitter.emit('bambu-token-refreshed', { auth: currentAuth });
      }
    } catch {}
  }
  currentAuth = await prepareAuth(currentAuth);
  connectBambu(currentAuth);
}

function disconnectBambu() {
  cleanupCalled = false;
  clearInterval(pushallTimer); pushallTimer = null;
  clearTimeout(reconnectTimer);
  if (mqttClient) { try { mqttClient.end(); } catch {} mqttClient = null; }
  currentAuth = null;
  bambuDevices = [];
  setBambuConn({ connected: false });
}

function requestBambuStatus(serial) {
  if (!mqttClient || !mqttClient.connected) return;
  if (serial) {
    mqttClient.publish(`device/${serial}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } }));
  } else {
    (bambuDevices || []).forEach(d => {
      mqttClient.publish(`device/${d.dev_id}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } }));
    });
  }
}

async function connectBambuWithAuth(auth) {
  const region = auth.region || 'global';
  const devices = await bambuGetDevices(auth.accessToken, region);
  bambuDevices = devices;
  const uid = await bambuGetUid(auth.accessToken, region);
  const fullAuth = { ...auth, devices, uid };
  connectBambu(fullAuth);
  return { devices, uid };
}

function getState() {
  return {
    conn: bambuConnState,
    devices: bambuDevices,
    printerStates: { ...printerStates },
  };
}

// ─── Camera streaming (MJPEG proxy) ──────────────────────────────────────────
//
// Bambu camera protocol on port 6000 (TLS):
//   Auth packet: 80 bytes little-endian
//     [0..3]  payload size = 0x40
//     [4..7]  type         = 0x3000
//     [8..11] flags        = 0
//     [12..15] reserved    = 0
//     [16..47] username    = 'bblp' padded to 32 bytes
//     [48..79] password    = access_code padded to 32 bytes
//   Each frame: 16-byte header + JPEG data
//     [0..3]  payload_size (LE uint32)
//     [4..15] itrack/flags/reserved
//     [16..16+payload_size] JPEG bytes

/**
 * Stream camera frames from a Bambu printer to an HTTP response as MJPEG.
 * The caller is responsible for setting the Content-Type header before calling this.
 * Returns a cleanup function that stops the stream.
 */
function streamCamera(ip, accessCode, res, onError) {
  let active = true;
  let socket = null;

  try {
    // Bambu LAN camera (port 6000) uses a proprietary self-signed certificate —
    // rejectUnauthorized must stay false here or LAN streaming breaks.
    socket = tls.connect({ host: ip, port: 6000, rejectUnauthorized: false });
  } catch (e) {
    onError(e.message);
    return () => {};
  }

  socket.once('secureConnect', () => {
    if (!active) { socket.destroy(); return; }

    // Build auth packet
    const auth = Buffer.alloc(80);
    auth.writeUInt32LE(0x40,   0);
    auth.writeUInt32LE(0x3000, 4);
    auth.writeUInt32LE(0,      8);
    auth.writeUInt32LE(0,      12);
    Buffer.from('bblp').copy(auth, 16);
    Buffer.from(String(accessCode || '')).copy(auth, 48);
    socket.write(auth);

    let buf = Buffer.alloc(0);
    let lastSent = 0;

    socket.on('data', (chunk) => {
      if (!active) return;
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 16) {
        const payloadSize = buf.readUInt32LE(0);
        if (payloadSize === 0 || payloadSize > 4 * 1024 * 1024) { buf = Buffer.alloc(0); break; }
        if (buf.length < 16 + payloadSize) break;

        const frame = buf.slice(16, 16 + payloadSize);
        buf = buf.slice(16 + payloadSize);

        // Rate-limit to ~10 fps
        const now = Date.now();
        if (now - lastSent < 100) continue;
        lastSent = now;

        // Only valid JPEG frames
        if (frame.length >= 2 && frame[0] === 0xFF && frame[1] === 0xD8) {
          try {
            res.write(
              `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
            );
            res.write(frame);
            res.write('\r\n');
          } catch {
            active = false;
            try { socket.destroy(); } catch {}
          }
        }
      }
    });
  });

  socket.on('error', (err) => {
    if (active) onError(err.message);
    active = false;
  });

  socket.on('close', () => {
    if (active) onError('Connection closed');
    active = false;
  });

  return () => {
    active = false;
    try { socket.destroy(); } catch {}
  };
}

// ─── RTSP camera streaming (H2D, H2S, X1C, P2S) ──────────────────────────────
//
// These models expose an RTSPS endpoint on port 322 instead of the proprietary
// binary JPEG protocol on port 6000 used by P1S/P1P.
// Requires "LAN Only Liveview" enabled on the printer (Settings → Network).

const RTSP_MODEL_RE = /\b(H2D|H2S|X1C|P2S)\b/i;

/**
 * Returns true if the given model string identifies a printer that uses
 * RTSPS on port 322 rather than the binary protocol on port 6000.
 */
function isRtspPrinter(model) {
  if (!model) return false;
  return RTSP_MODEL_RE.test(model);
}

/**
 * Locate ffmpeg: check PATH first, then Windows winget install tree.
 * Returns the executable path string, or null if not found.
 */
function findFfmpeg() {
  const { execFileSync } = require('child_process');
  const fs   = require('fs');
  const path = require('path');

  // 1. Try whatever is on PATH (Linux, macOS, manual Windows installs)
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 3000 });
    return 'ffmpeg';
  } catch {}

  // 2. Windows winget install directory — search across any installed version
  if (process.platform === 'win32') {
    const wingetBase = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft', 'WinGet', 'Packages'
    );
    try {
      const pkgDirs = fs.readdirSync(wingetBase).filter(d => d.startsWith('Gyan.FFmpeg'));
      for (const pkgDir of pkgDirs) {
        const pkgPath = path.join(wingetBase, pkgDir);
        try {
          for (const sub of fs.readdirSync(pkgPath)) {
            const candidate = path.join(pkgPath, sub, 'bin', 'ffmpeg.exe');
            if (fs.existsSync(candidate)) return candidate;
          }
        } catch {}
        // Flat layout (no version subdirectory)
        const flat = path.join(pkgPath, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(flat)) return flat;
      }
    } catch {}

    // 3. Common manual Windows install locations
    for (const candidate of [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      path.join(process.env.USERPROFILE || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    ]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * Stream MJPEG frames from a Bambu RTSPS camera (port 322) via ffmpeg.
 * H2D/H2S/X1C/P2S use H.264 over RTSPS — ffmpeg decodes and re-encodes as MJPEG.
 * Returns a stop() function.
 */
function streamCameraRtsp(ip, accessCode, res, onError) {
  const { spawn } = require('child_process');

  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    onError('ffmpeg not found. Install it via: winget install Gyan.FFmpeg  (or add ffmpeg to PATH)');
    return () => {};
  }

  const rtspUrl = `rtsps://bblp:${accessCode}@${ip}:322/streaming/live/1`;

  const args = [
    '-rtsp_transport', 'tcp',
    '-i',             rtspUrl,
    '-vf',            'fps=10',
    '-f',             'mjpeg',
    '-q:v',           '5',
    'pipe:1',
  ];

  let active = true;
  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });

  // Parse JPEG frames from ffmpeg stdout by scanning for SOI/EOI markers.
  // Within JPEG entropy-coded data, 0xFF is always stuffed as 0xFF 0x00 so
  // a genuine 0xFF 0xD9 (EOI) only appears as the end-of-image marker.
  const SOI = Buffer.from([0xFF, 0xD8]);
  const EOI = Buffer.from([0xFF, 0xD9]);
  let buf = Buffer.alloc(0);

  proc.stdout.on('data', (chunk) => {
    if (!active) return;
    buf = Buffer.concat([buf, chunk]);

    let searchFrom = 0;
    while (true) {
      const soiIdx = buf.indexOf(SOI, searchFrom);
      if (soiIdx === -1) break;
      const eoiIdx = buf.indexOf(EOI, soiIdx + 2);
      if (eoiIdx === -1) break;

      const frame = buf.slice(soiIdx, eoiIdx + 2);
      searchFrom = eoiIdx + 2;

      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch {
        active = false;
        try { proc.kill(); } catch {}
        return;
      }
    }

    // Retain only unprocessed data (from the last SOI onward)
    if (searchFrom > 0) {
      const nextSoi = buf.indexOf(SOI, searchFrom);
      buf = nextSoi >= 0 ? buf.slice(nextSoi) : Buffer.alloc(0);
    }
    // Guard against pathological growth
    if (buf.length > 4 * 1024 * 1024) buf = Buffer.alloc(0);
  });

  proc.on('error', (err) => {
    if (active) onError(err.message);
    active = false;
  });

  proc.on('close', (code) => {
    if (active) onError(`ffmpeg exited (code ${code})`);
    active = false;
  });

  return () => {
    active = false;
    try { proc.kill(); } catch {}
  };
}

// Return the best-known local IP for a serial: UDP discovery first, then device list
function getDiscoveredIp(serial) {
  // Prefer UDP-discovered IP (proved it's on the LAN and recently seen)
  const found = discoveredPrinters[serial];
  if (found && (Date.now() - found.lastSeen) < 30 * 60 * 1000) return found.ip;
  // Fall back to device list from cloud bind response
  const dev = (bambuDevices || []).find(d => d.dev_id === serial);
  return dev?.ip || null;
}

// ─── Print control ───────────────────────────────────────────────────────────
// cmd: 'stop' | 'pause' | 'resume'
function bambuPrintCmd(serial, cmd) {
  if (!mqttClient?.connected) return { error: 'Not connected to Bambu' };
  // unload_filament uses AMS change-filament with target 255 (eject); pause/resume/stop use print command
  const payload = cmd === 'unload_filament'
    ? JSON.stringify({ print: { sequence_id: '0', command: 'ams_change_filament', target: 255, curr_temp: 0, tar_temp: 0 } })
    : JSON.stringify({ print: { sequence_id: '0', command: cmd, param: '' } });
  mqttClient.publish(`device/${serial}/request`, payload);
  return { ok: true };
}

module.exports = {
  emitter,
  bambuPrintCmd,
  bambuLogin,
  bambuVerifyCode,
  bambuVerify,
  bambuGetDevices,
  bambuGetUid,
  bambuGetTasks,
  bambuRefresh,
  connectBambu,
  connectBambuWithAuth,
  disconnectBambu,
  requestBambuStatus,
  prepareAuth,
  getState,
  isRtspPrinter,
  streamCamera,
  streamCameraRtsp,
  bambuGetCameraCreds,
  getDiscoveredIp,
  get discoveredPrinters() { return discoveredPrinters; },
  get bambuDevices() { return bambuDevices; },
  set bambuDevices(v) { bambuDevices = v; },
};
