/**
 * Bambu Lab cloud MQTT integration for the Express server.
 * Ported from src/main/ipc/printers.js — pure Node.js, no Electron.
 * Exposes an EventEmitter so server/index.js can broadcast printer updates via SSE.
 */

const tls     = require('tls');
const https   = require('https');
const dgram   = require('dgram');
const fs      = require('fs');
const path    = require('path');
const { spawn, execSync } = require('child_process');
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

// ─── RTSPS streaming for X1/H2D/H2S/P2S (port 322, H.264 via ffmpeg) ─────────
//
// These models don't speak the port-6000 binary JPEG protocol.
// They expose an RTSPS stream at rtsps://bblp:<code>@<ip>:322/streaming/live/1
// which carries H.264 video — a codec we can't decode in pure Node.
// ffmpeg decodes and re-muxes to MJPEG frames which we pipe into the HTTP response.
//
// Prerequisite on the printer: Settings → Network → LAN Only Liveview → Enable

// Models that use port 322 RTSPS instead of port 6000 binary
const RTSP_MODEL_RE = /\b(X1C?|X1E|H2D|H2S|P2S)\b/i;

function getDeviceModel(serial) {
  const dev = (bambuDevices || []).find(d => d.dev_id === serial);
  if (dev?.dev_product_name) return dev.dev_product_name;
  return discoveredPrinters[serial]?.model || '';
}

function isRtspPrinter(serial) {
  return RTSP_MODEL_RE.test(getDeviceModel(serial));
}

// Locate the ffmpeg binary — checks PATH first, then winget install directory.
let _ffmpegBin = null;
function getFfmpeg() {
  if (_ffmpegBin) return _ffmpegBin;
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const found = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split(/\r?\n/)[0].trim();
    if (found) { _ffmpegBin = found; return found; }
  } catch {}
  if (process.platform === 'win32') {
    const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const pkg of fs.readdirSync(base).filter(d => d.startsWith('Gyan.FFmpeg'))) {
        for (const build of fs.readdirSync(path.join(base, pkg)).filter(d => d.includes('ffmpeg'))) {
          const exe = path.join(base, pkg, build, 'bin', 'ffmpeg.exe');
          if (fs.existsSync(exe)) { _ffmpegBin = exe; return exe; }
        }
      }
    } catch {}
  }
  _ffmpegBin = 'ffmpeg';
  return 'ffmpeg';
}

function streamCameraRtsp(ip, accessCode, res, onError) {
  const ffmpegBin = getFfmpeg();
  const rtspUrl = `rtsps://bblp:${accessCode}@${ip}:322/streaming/live/1`;

  const args = [
    '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '3',
    '-r', '10',
    'pipe:1',
  ];

  let active = true;
  let proc;
  try {
    proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    onError(`ffmpeg not found: ${e.message}`);
    return () => {};
  }

  const SOI = Buffer.from([0xFF, 0xD8]);
  const EOI = Buffer.from([0xFF, 0xD9]);
  let buf = Buffer.alloc(0);

  proc.stdout.on('data', (chunk) => {
    if (!active) return;
    buf = Buffer.concat([buf, chunk]);

    // Extract complete JPEG frames (SOI … EOI)
    while (buf.length > 4) {
      const start = buf.indexOf(SOI);
      if (start === -1) { buf = Buffer.alloc(0); break; }
      const end = buf.indexOf(EOI, start + 2);
      if (end === -1) { if (start > 0) buf = buf.slice(start); break; }
      const frame = buf.slice(start, end + 2);
      buf = buf.slice(end + 2);
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch {
        active = false;
        try { proc.kill('SIGKILL'); } catch {}
        return;
      }
    }
  });

  let stderrBuf = '';
  proc.stderr.on('data', (d) => {
    stderrBuf += d.toString();
    if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-2000);
  });

  proc.on('exit', (code) => {
    if (active) {
      const hint = stderrBuf.includes('Connection refused') ? 'connection refused — is the printer IP correct? Is LAN Only Liveview enabled on the printer (Settings → Network)?'
        : stderrBuf.includes('401') || stderrBuf.includes('Unauthorized') ? 'auth failed — check the access code'
        : stderrBuf.includes('No such file') || stderrBuf.includes('not found') ? 'ffmpeg not found — check ffmpeg is installed'
        : `stream ended (ffmpeg exit ${code})`;
      onError(hint);
    }
    active = false;
  });

  proc.on('error', (err) => {
    if (active) onError(`ffmpeg error: ${err.message}`);
    active = false;
  });

  return () => {
    active = false;
    try { proc.kill('SIGKILL'); } catch {}
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
  const payload = JSON.stringify({ print: { sequence_id: '0', command: cmd, param: '' } });
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
  streamCamera,
  streamCameraRtsp,
  isRtspPrinter,
  bambuGetCameraCreds,
  getDiscoveredIp,
  get discoveredPrinters() { return discoveredPrinters; },
  get bambuDevices() { return bambuDevices; },
  set bambuDevices(v) { bambuDevices = v; },
};
