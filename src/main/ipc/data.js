const fs = require('fs');
const os = require('os');
const db = require('../db');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      // Skip APIPA addresses (169.254.x.x) — these are unconnected virtual/VPN adapters
      if (iface.address.startsWith('169.254.')) continue;
      return iface.address;
    }
  }
  return 'localhost';
}

module.exports = function registerDataHandlers(ipcMain, DATA_PATH, SETTINGS_PATH, getPort) {
  // ── Data persistence ──
  ipcMain.handle('load-data', () => db.loadData(DATA_PATH, fs));

  ipcMain.handle('save-data', (_, data) => db.saveData(data, DATA_PATH, fs));

  ipcMain.handle('get-local-ip', () => getLocalIP() + ':' + (typeof getPort === 'function' ? getPort() : getPort));

  // ── Settings ──
  ipcMain.handle('load-settings', () => db.loadSettings(SETTINGS_PATH, fs));
  ipcMain.handle('save-settings', (_, s) => db.saveSettings(s, SETTINGS_PATH, fs));

  // ── Cloud sync helpers ──
  ipcMain.handle('is-using-cloud', () => db.isUsingCloud());

  // Connect to Supabase at runtime using a URL pasted into Settings.
  // Saves the URL to settings.json so it persists across restarts.
  ipcMain.handle('connect-to-cloud', async (_, url) => {
    const result = await db.connectToCloud(url || '');
    if (result.ok) {
      // Persist the URL so main.js can inject it on next startup
      try {
        const current = fs.existsSync(SETTINGS_PATH)
          ? JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
          : {};
        const updated = { ...current, databaseUrl: url };
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated), 'utf8');
      } catch {}
    }
    return result;
  });

  ipcMain.handle('disconnect-from-cloud', async () => {
    try {
      const current = fs.existsSync(SETTINGS_PATH)
        ? JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
        : {};
      const { databaseUrl: _removed, ...rest } = current;
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(rest), 'utf8');
    } catch {}
    return { ok: true };
  });

  // Reads local data.json directly and pushes it to Supabase
  ipcMain.handle('push-local-to-cloud', async () => {
    try {
      const isCloud = await db.isUsingCloud();
      if (!isCloud) return { ok: false, error: 'Not connected to Supabase — check DATABASE_URL env var' };
      if (!fs.existsSync(DATA_PATH)) return { ok: false, error: 'No local data.json found' };
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      await db.pushDataToCloud(data, DATA_PATH, fs);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
};

module.exports.getLocalIP = getLocalIP;
module.exports.loadSettings = (SETTINGS_PATH) => db.loadSettings(SETTINGS_PATH, fs);
module.exports.saveSettings = (SETTINGS_PATH, s) => db.saveSettings(s, SETTINGS_PATH, fs);
