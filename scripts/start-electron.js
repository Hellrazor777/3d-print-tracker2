/**
 * Cross-platform dev launcher for Electron.
 * Starts: API server → Vite → Electron (each waits for the previous).
 * Works on Windows, macOS, and Linux — no shell && chaining needed.
 */

const { spawn } = require('child_process');
const http  = require('http');
const path  = require('path');

const env = { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '1' };

// ─── Coloured prefix on stdout/stderr ─────────────────────────────────────────
const COLORS = { green: '\x1b[32m', cyan: '\x1b[36m', magenta: '\x1b[35m', reset: '\x1b[0m' };

function prefix(tag, color, proc) {
  const pre = `${COLORS[color] || ''}[${tag}]${COLORS.reset} `;
  const stamp = chunk => chunk.toString().replace(/\n(?=[\s\S])/g, '\n' + pre);
  proc.stdout.on('data', d => process.stdout.write(pre + stamp(d)));
  proc.stderr.on('data', d => process.stderr.write(pre + stamp(d)));
}

// ─── Poll a URL until it responds ─────────────────────────────────────────────
function waitForHttp(url, intervalMs = 500) {
  const { hostname, port, pathname } = new URL(url);
  return new Promise(resolve => {
    function check() {
      const req = http.get(
        { hostname, port: Number(port) || 80, path: pathname, timeout: 1000 },
        res => { res.resume(); resolve(); }
      );
      req.on('error', () => setTimeout(check, intervalMs));
      req.on('timeout', () => { req.destroy(); setTimeout(check, intervalMs); });
    }
    check();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const procs = [];

function kill() {
  for (const p of procs) try { p.kill(); } catch {}
}

process.on('SIGINT',  kill);
process.on('SIGTERM', kill);
process.on('exit',    kill);

(async () => {
  // 1. API server
  console.log(`${COLORS.green}[API]${COLORS.reset} Starting API server…`);
  const api = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  prefix('API', 'green', api);
  api.on('exit', code => { if (code !== 0 && code !== null) { console.error(`[API] exited ${code}`); kill(); } });
  procs.push(api);

  // 2. Vite — start once API is healthy
  await waitForHttp('http://127.0.0.1:8080/api/data');
  console.log(`${COLORS.cyan}[WEB]${COLORS.reset} API ready — starting Vite…`);
  const viteBin = path.join('node_modules', 'vite', 'bin', 'vite.js');
  const vite = spawn(process.execPath, [viteBin], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  prefix('WEB', 'cyan', vite);
  procs.push(vite);

  // 3. Electron — start once Vite is serving
  await waitForHttp('http://127.0.0.1:5000');
  console.log(`${COLORS.magenta}[ELECTRON]${COLORS.reset} Vite ready — launching Electron…`);
  const electronBin = require('electron'); // resolves to the binary path
  const electron = spawn(electronBin, ['.'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  prefix('ELECTRON', 'magenta', electron);
  procs.push(electron);

  electron.on('close', code => {
    console.log(`${COLORS.magenta}[ELECTRON]${COLORS.reset} Window closed — shutting down`);
    kill();
    process.exit(0);
  });
})().catch(err => { console.error(err); process.exit(1); });
