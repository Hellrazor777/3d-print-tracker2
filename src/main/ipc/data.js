const fs = require('fs');
const os = require('os');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function loadSettings(SETTINGS_PATH) {
  try { if (fs.existsSync(SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch(e) {}
  return {};
}
function saveSettings(SETTINGS_PATH, s) {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s), 'utf8'); return true; }
  catch(e) { return false; }
}

module.exports = function registerDataHandlers(ipcMain, DATA_PATH, SETTINGS_PATH, getPort) {
  // ── Data persistence ──
  ipcMain.handle('load-data', () => {
    try { if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); }
    catch(e) {}
    return null;
  });

  ipcMain.handle('save-data', (_, data) => {
    try {
      // Keep one rolling backup so a bad save is always recoverable
      const bakPath = DATA_PATH + '.bak';
      if (fs.existsSync(DATA_PATH)) fs.copyFileSync(DATA_PATH, bakPath);
      fs.writeFileSync(DATA_PATH, JSON.stringify(data), 'utf8');
      return true;
    }
    catch(e) { return false; }
  });

  ipcMain.handle('get-local-ip', () => getLocalIP() + ':' + (typeof getPort === 'function' ? getPort() : getPort));

  // ── Settings ──
  ipcMain.handle('load-settings', () => loadSettings(SETTINGS_PATH));
  ipcMain.handle('save-settings', (_, s) => saveSettings(SETTINGS_PATH, s));
};

module.exports.getLocalIP = getLocalIP;
module.exports.loadSettings = loadSettings;
module.exports.saveSettings = saveSettings;
