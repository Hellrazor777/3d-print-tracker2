/**
 * Camera relay WebSocket server.
 *
 * The desktop Electron app (on the same LAN as the Bambu printers) connects
 * here and pushes raw JPEG frames.  The cloud server then serves those frames
 * as standard MJPEG to browser clients — no LAN access required on the server.
 *
 * Binary message format (desktop → server):
 *   [0..3]  serial length  (uint32 LE)
 *   [4..N]  serial string  (UTF-8)
 *   [N..]   JPEG bytes     (0xFF 0xD8 … 0xFF 0xD9)
 *
 * Auth: desktop sends  Authorization: Bearer <CAMERA_RELAY_TOKEN>  during the
 *       WebSocket upgrade.  The server rejects connections with a wrong token.
 *
 * Only one desktop relay connection is accepted at a time; a new connection
 * cleanly replaces any stale previous one.
 */

const { WebSocketServer } = require('ws');
const { EventEmitter } = require('events');

// ─── Internal state ───────────────────────────────────────────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(500); // many concurrent browser MJPEG listeners

/** @type {Map<string, Buffer>} Most-recent valid JPEG frame per serial */
const latestFrames = new Map();

/** @type {import('ws').WebSocket | null} */
let desktopWs = null;

// ─── Public helpers ───────────────────────────────────────────────────────────

function isConnected() {
  return desktopWs !== null && desktopWs.readyState === 1 /* OPEN */;
}

function hasSerial(serial) {
  return latestFrames.has(serial);
}

/** Returns the most-recent JPEG Buffer for a serial, or null. */
function getLatestFrame(serial) {
  return latestFrames.get(serial) || null;
}

/** Serials that currently have at least one relayed frame cached. */
function getActiveSerials() {
  return [...latestFrames.keys()];
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

/**
 * Attach the relay WebSocket server to an existing HTTP(S) server.
 *
 * @param {import('http').Server} httpServer
 * @param {() => string | undefined} getToken  Returns the expected relay token.
 */
function attach(httpServer, getToken) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/camera-relay' });

  wss.on('connection', (ws, req) => {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const expected = (getToken() || '').trim();

    if (!expected) {
      console.warn('[camera-relay] CAMERA_RELAY_TOKEN not set — rejecting connection');
      ws.close(4001, 'Relay not configured on server');
      return;
    }
    if (token !== expected) {
      console.warn('[camera-relay] Invalid relay token — rejecting connection');
      ws.close(4001, 'Unauthorized');
      return;
    }

    // ── Replace any stale connection ──────────────────────────────────────────
    if (desktopWs && desktopWs.readyState !== 3 /* CLOSED */) {
      try { desktopWs.close(4000, 'Replaced by newer desktop connection'); } catch {}
    }
    desktopWs = ws;
    latestFrames.clear();

    console.log('[camera-relay] Desktop relay connected from', req.socket.remoteAddress);
    emitter.emit('relay-status', { connected: true });

    // ── Frame messages ────────────────────────────────────────────────────────
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      if (data.length < 6) return;

      const serialLen = data.readUInt32LE(0);
      if (serialLen < 1 || serialLen > 64) return;
      if (4 + serialLen >= data.length) return; // no payload after serial

      const serial = data.slice(4, 4 + serialLen).toString('utf8');
      const frame  = data.slice(4 + serialLen);

      // Validate JPEG magic bytes
      if (frame.length < 2 || frame[0] !== 0xFF || frame[1] !== 0xD8) return;

      latestFrames.set(serial, frame);
      emitter.emit('frame', serial, frame);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    ws.on('close', () => {
      if (desktopWs === ws) {
        desktopWs = null;
        // Keep latestFrames so any in-flight MJPEG streams can drain gracefully
        emitter.emit('relay-status', { connected: false });
        console.log('[camera-relay] Desktop relay disconnected');
      }
    });

    ws.on('error', (err) => {
      console.warn('[camera-relay] WebSocket error:', err.message);
      if (desktopWs === ws) desktopWs = null;
    });
  });

  return wss;
}

module.exports = { attach, emitter, isConnected, hasSerial, getLatestFrame, getActiveSerials };
