'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_PATH     = path.join(app.getPath('userData'), 'data.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// ── IPC modules ───────────────────────────────────────────────────────────────
const registerDataHandlers    = require('./src/main/ipc/data');
const registerFilesHandlers   = require('./src/main/ipc/files');
const registerN3dHandlers     = require('./src/main/ipc/n3d');
const registerPrinterHandlers = require('./src/main/ipc/printers');
const startLocalServer        = require('./src/main/server');
const { loadSettings }        = require('./src/main/ipc/data');

let mainWin    = null;
let popoutWin  = null;
let mobilePort = 8081; // local mobile HTTP server (distinct from the cloud Express API)

function getSettings() {
  return loadSettings(SETTINGS_PATH);
}

// ── Window factory ────────────────────────────────────────────────────────────
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,          // custom CSS titlebar handles chrome
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Dev: load from Vite dev server (proxied to API on 8080)
    mainWin.loadURL('http://localhost:5000');
    mainWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Prod: load the built React app
    mainWin.loadFile(path.join(__dirname, 'dist-web', 'index.html'));
  }

  mainWin.on('closed', () => { mainWin = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow(); // sets mainWin before registering modules that need it

  registerDataHandlers(ipcMain, DATA_PATH, SETTINGS_PATH, () => mobilePort);
  registerFilesHandlers(ipcMain, mainWin, getSettings);
  registerN3dHandlers(ipcMain);
  registerPrinterHandlers(ipcMain, mainWin, getSettings);

  // Local mobile companion HTTP server — accessible on LAN for phone access
  startLocalServer(mobilePort, DATA_PATH, SETTINGS_PATH, mainWin, (port) => { mobilePort = port; });

  // ── Pop-out windows ─────────────────────────────────────────────────────────
  ipcMain.handle('open-printers-popout', () => {
    if (popoutWin && !popoutWin.isDestroyed()) { popoutWin.focus(); return; }
    popoutWin = new BrowserWindow({
      width: 900,
      height: 700,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    if (isDev) {
      popoutWin.loadURL('http://localhost:5000/?popout=printers');
    } else {
      popoutWin.loadFile(path.join(__dirname, 'dist-web', 'index.html'), { query: { popout: 'printers' } });
    }
    popoutWin.on('closed', () => { popoutWin = null; });
  });

  ipcMain.handle('open-main-window', () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.focus();
    else createWindow();
  });

  // ── Cloud sync stubs (Electron always uses local files) ─────────────────────
  ipcMain.handle('is-using-cloud',      () => false);
  ipcMain.handle('push-local-to-cloud', () => ({ ok: false, error: 'Cloud sync not configured' }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWin) createWindow();
});
