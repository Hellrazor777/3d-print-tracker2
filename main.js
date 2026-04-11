const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');

// Installed builds use `productName` ("3D Print Tracker") for the default userData path; `npm start`
// uses package `name` ("3d-print-tracker"). Those differ → the EXE was reading an empty folder and
// showing sample data while your real file lived under Roaming\3d-print-tracker. Pin one directory.
app.setPath('userData', path.join(app.getPath('appData'), '3d-print-tracker'));

// Set NODE_ENV=development when running via "npm run dev:electron"
const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5173';

const DATA_PATH = path.join(app.getPath('userData'), 'data.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const PORT = 3000;
let localServer = null;
let mainWin   = null;
let popoutWin = null;
let actualPort = PORT;
let printerHandlers = null;

// Import IPC and server modules
const registerDataHandlers = require('./src/main/ipc/data');
const registerFilesHandlers = require('./src/main/ipc/files');
const registerN3dHandlers = require('./src/main/ipc/n3d');
const registerPrinterHandlers = require('./src/main/ipc/printers');
const startLocalServer = require('./src/main/server');
const dataModule = require('./src/main/ipc/data');

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build-resources', 'icon.ico'),
    title: '3D Print Tracker',
  });
  if (isDev) {
    // Load from Vite dev server (hot reload). Retries once if Vite isn't ready yet.
    mainWin.loadURL(DEV_URL).catch(() => {
      setTimeout(() => mainWin.loadURL(DEV_URL).catch(() => {}), 2000);
    });
    mainWin.webContents.openDevTools();
  } else {
    mainWin.loadFile(path.join(__dirname, 'dist-web', 'index.html'));
  }
  mainWin.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  // Register localfile:// protocol so the renderer (even when served from
  // localhost in dev mode) can safely load images stored on the local filesystem.
  protocol.handle('localfile', (request) => {
    // Strip the scheme: localfile:///S:/foo/bar.webp → S:/foo/bar.webp
    const filePath = decodeURIComponent(request.url.slice('localfile:///'.length));
    // On Windows, paths arrive as S:/foo — keep as-is; on Mac/Linux they're /foo
    return net.fetch('file:///' + filePath);
  });

  createWindow();

  // Register IPC handlers (getPort returns actual bound port after server starts)
  registerDataHandlers(ipcMain, DATA_PATH, SETTINGS_PATH, () => actualPort);
  registerFilesHandlers(ipcMain, mainWin, dataModule.loadSettings.bind(null, SETTINGS_PATH));
  registerN3dHandlers(ipcMain);
  printerHandlers = registerPrinterHandlers(ipcMain, mainWin, dataModule.loadSettings.bind(null, SETTINGS_PATH));

  // ── Printers pop-out window ────────────────────────────────────────────────
  ipcMain.handle('open-printers-popout', () => {
    // If already open, just focus it
    if (popoutWin && !popoutWin.isDestroyed()) {
      popoutWin.focus();
      return;
    }
    popoutWin = new BrowserWindow({
      width: 1100, height: 750, minWidth: 640, minHeight: 480,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      icon: path.join(__dirname, 'build-resources', 'icon.ico'),
      title: 'Printers — 3D Print Tracker',
    });
    popoutWin.setMenuBarVisibility(false);
    if (isDev) {
      popoutWin.loadURL(DEV_URL + '?popout=printers');
    } else {
      popoutWin.loadFile(path.join(__dirname, 'dist-web', 'index.html'), {
        query: { popout: 'printers' },
      });
    }
    popoutWin.on('closed', () => { popoutWin = null; });
  });

  ipcMain.handle('open-main-window', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.show();
      mainWin.focus();
    } else {
      createWindow();
    }
  });

  // Start local server — auto-retries on EADDRINUSE, updates actualPort when bound
  localServer = startLocalServer(PORT, DATA_PATH, mainWin, (port) => { actualPort = port; }, SETTINGS_PATH);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (printerHandlers) printerHandlers.cleanup();
  if (process.platform !== 'darwin') app.quit();
});
