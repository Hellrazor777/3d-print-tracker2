const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { dialog, shell, app } = require('electron');
const { execFile } = require('child_process');

function sanitize3mfFileName(fileName) {
  let s = fileName.trim();
  if (s.startsWith('#')) s = s.slice(1);
  // "1234 DesignName" → "1234 - DesignName"
  s = s.replace(/^(\d{4}) ([A-Za-z])/, '$1 - $2');
  // Strip chars invalid on Windows
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  return s.trim() || 'model.3mf';
}

function download3mfToPath(url, destDir, authToken0, authToken1, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Cookie': `sb-n3d-auth-token.0=${authToken0}; sb-n3d-auth-token.1=${authToken1}`,
        'User-Agent': '3DPrintTracker/1.0',
      },
    };
    const req = lib.request(opts, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return resolve(download3mfToPath(next, destDir, authToken0, authToken1, redirectCount + 1));
      }
      if (res.statusCode === 401 || res.statusCode === 403) {
        res.resume();
        return reject(new Error('AUTH_INVALID'));
      }
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      // Derive filename from Content-Disposition
      const cd = res.headers['content-disposition'] || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
      const rawName = m ? m[1].trim() : '';
      const fileName = sanitize3mfFileName(rawName || 'model.3mf');
      const destPath = path.join(destDir, fileName);
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ fileName, destPath })));
      file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', err => reject(err));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timed out after 60s')); });
    req.end();
  });
}

function downloadImageToPath(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const lib = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const request = lib.get(url, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        file.destroy();
        fs.unlink(destPath, () => {});
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        resolve(downloadImageToPath(nextUrl, destPath, redirectCount + 1));
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        file.destroy();
        fs.unlink(destPath, () => {});
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }

      const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_BYTES) {
          file.destroy();
          fs.unlink(destPath, () => {});
          res.destroy();
          reject(new Error('Image too large (> 10 MB)'));
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', err => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', err => {
      file.destroy();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

module.exports = function registerFilesHandlers(ipcMain, mainWin, loadSettings) {
  // ── CSV dialogs ──
  ipcMain.handle('open-csv-dialog', async () => {
    const result = await dialog.showOpenDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths.length) return null;
    try { return fs.readFileSync(result.filePaths[0], 'utf8'); } catch(e) { return null; }
  });

  ipcMain.handle('save-csv-dialog', async (_, content) => {
    const result = await dialog.showSaveDialog({ defaultPath: '3d-print-export.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePath) return false;
    try { fs.writeFileSync(result.filePath, content, 'utf8'); return true; } catch(e) { return false; }
  });

  // ── 3MF folder picker ──
  ipcMain.handle('pick-3mf-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ── 3MF upload ──
  ipcMain.handle('upload-3mf', async (_, { productName, destFolder }) => {
    if (!destFolder) return { error: 'No 3MF root folder configured' };
    const result = await dialog.showOpenDialog({
      title: 'Select 3MF file',
      filters: [{ name: '3MF Files', extensions: ['3mf'] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const srcPath = result.filePaths[0];
    const fileName = path.basename(srcPath);
    const safeName = productName.replace(/[<>:"\/\\|?*]/g, '_').replace(/\.{2,}/g, '_');
    try {
      const productFolder = path.resolve(path.join(destFolder, safeName));
      if (!productFolder.startsWith(path.resolve(destFolder))) return { error: 'Invalid product name' };
      if (!fs.existsSync(productFolder)) fs.mkdirSync(productFolder, { recursive: true });
      const destPath = path.join(productFolder, fileName);
      fs.copyFileSync(srcPath, destPath);
      return { fileName, destPath, productFolder };
    } catch(e) { return { error: e.message }; }
  });

  // ── Open folder in Explorer ──
  ipcMain.handle('open-folder', async (_, folderPath) => {
    try { await shell.openPath(folderPath); return true; }
    catch(e) { return false; }
  });

  // ── Get/create product folder ──
  ipcMain.handle('get-product-folder', (_, { productName, rootFolder }) => {
    if (!rootFolder) return null;
    const safeName = productName.replace(/[<>:"\/\\|?*]/g, '_');
    const folderPath = path.join(rootFolder, safeName);
    try { if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true }); }
    catch(e) { console.error('Could not create folder:', e.message); }
    return folderPath;
  });

  // ── Create product folder on product creation ──
  ipcMain.handle('create-product-folder', (_, { productName, rootFolder }) => {
    if (!rootFolder || !productName) return null;
    const safeName = productName.replace(/[<>:"\/\\|?*]/g, '_');
    const folderPath = path.join(rootFolder, safeName);
    try {
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
      return folderPath;
    } catch(e) { return null; }
  });

  // ── Open file or folder in slicer ──
  ipcMain.handle('open-in-slicer', async (_, { filePath, slicer }) => {
    const settings = loadSettings();
    const slicerPath = slicer === 'bambu'
      ? (settings.bambuPath || 'C:\\Program Files\\Bambu Studio\\bambu-studio.exe')
      : (settings.orcaPath || 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe');

    let targetFile = filePath;
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const files = fs.readdirSync(filePath).filter(f => f.toLowerCase().endsWith('.3mf'));
        if (files.length > 0) targetFile = path.join(filePath, files[0]);
        else { await shell.openPath(filePath); return { ok: true, fallback: true }; }
      }
    } catch(e) {}

    try {
      if (fs.existsSync(slicerPath)) {
        const child = execFile(slicerPath, [targetFile], { detached: true, stdio: 'ignore' });
        child.unref();
        return { ok: true };
      } else {
        await shell.openPath(targetFile);
        return { ok: true, fallback: true };
      }
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ── Image download (for N3D thumbnails) ──
  ipcMain.handle('download-image', async (_, { url, destFolder, fileName }) => {
    try {
      if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
      const destPath = path.join(destFolder, fileName);
      await downloadImageToPath(url, destPath);
      return { ok: true, destPath };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ── Image upload (manual product image) ──
  ipcMain.handle('upload-image', async (_, { destFolder, fileName }) => {
    const result = await dialog.showOpenDialog({
      title: 'Select product image',
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp','gif'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const srcPath = result.filePaths[0];
    const ext = path.extname(srcPath);
    const resolvedFolder = destFolder || app.getPath('userData');
    const dest = path.join(resolvedFolder, (fileName || 'cover') + ext);
    try {
      if (!fs.existsSync(resolvedFolder)) fs.mkdirSync(resolvedFolder, { recursive: true });
      fs.copyFileSync(srcPath, dest);
      return { ok: true, destPath: dest };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ── Download N3D 3MF profiles (requires session cookies, desktop only) ──
  ipcMain.handle('download-3mf-n3d', async (_, { slug, profiles, destFolder, authToken0, authToken1 }) => {
    if (!destFolder || !slug || !authToken0 || !authToken1) {
      return { ok: false, error: 'Missing required parameters' };
    }
    try {
      if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
    } catch(e) {
      return { ok: false, error: 'Could not create folder: ' + e.message };
    }
    const count = Math.max(0, profiles || 0);
    if (count === 0) return { ok: true, files: [], errors: [] };

    const downloadedFiles = [];
    const errors = [];

    for (let i = 0; i < count; i++) {
      const url = `https://www.n3dmelbourne.com/api/design/${slug}/download-profile?profileIndex=${i}`;
      try {
        const result = await download3mfToPath(url, destFolder, authToken0, authToken1);
        downloadedFiles.push(result.fileName);
      } catch(e) {
        if (e.message === 'AUTH_INVALID') {
          return { ok: false, error: 'AUTH_INVALID', files: downloadedFiles, errors };
        }
        errors.push(`profile ${i}: ${e.message}`);
      }
    }

    return { ok: true, files: downloadedFiles, errors };
  });

  // ── Open external URL in browser ──
  ipcMain.handle('open-external', async (_, url) => {
    try { await shell.openExternal(url); return true; }
    catch(e) { return false; }
  });

  // ── Get Bambu Studio version ──
  ipcMain.handle('get-bambu-version', async (_, exePath) => {
    if (!exePath || !fs.existsSync(exePath)) return null;
    return new Promise(resolve => {
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        '(Get-Item -LiteralPath $env:BAMBU_EXE_PATH).VersionInfo.FileVersion'
      ], { timeout: 8000, env: { ...process.env, BAMBU_EXE_PATH: exePath } }, (err, stdout) => {
        resolve(err ? null : (stdout.trim() || null));
      });
    });
  });
};
