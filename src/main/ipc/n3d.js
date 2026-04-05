const https = require('https');
const http = require('http');

function n3dRequest(urlStr, method, body, apiKey, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': '3DPrintTracker/1.0',
      }
    };
    const req = lib.request(opts, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirectCount < 5) {
        const newUrl = res.headers.location.startsWith('http') ? res.headers.location : url.origin + res.headers.location;
        res.resume();
        return n3dRequest(newUrl, method, body, apiKey, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.error || parsed.message || 'HTTP ' + res.statusCode));
          else resolve({ data: parsed, status: res.statusCode, headers: res.headers });
        } catch(e) {
          reject(new Error('HTTP ' + res.statusCode + ' — unexpected response: ' + data.substring(0, 200).replace(/\n/g, ' ')));
        }
      });
    });
    req.on('error', e => reject(new Error('Network error: ' + e.message)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out after 15s')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = function registerN3dHandlers(ipcMain) {
  ipcMain.handle('n3d-request', async (_, { path, method, body, apiKey }) => {
    try {
      const result = await n3dRequest('https://www.n3dmelbourne.com/api/v1' + path, method, body, apiKey, 0);
      return { ok: true, data: result.data, headers: result.headers };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });
};

module.exports.n3dRequest = n3dRequest;
