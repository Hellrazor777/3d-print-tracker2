/**
 * N3D Melbourne API client (browser/Electron renderer).
 * @see https://www.n3dmelbourne.com/llms.txt
 * @see https://www.n3dmelbourne.com/resources/docs/designs-api
 */

const N3D_BASE = 'https://www.n3dmelbourne.com/api/v1';

/**
 * @param {string} path - e.g. "/version" or "/designs?page=1"
 * @param {string} method
 * @param {object|null} body - JSON body for POST
 * @param {string} apiKey - optional; omit header when empty (e.g. /version)
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string, isHttpError?: boolean }>}
 */
export async function n3dRequestFetch(path, method = 'GET', body = null, apiKey = '') {
  const url = N3D_BASE + path;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `HTTP ${res.status} — unexpected response`,
        isHttpError: true,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: parsed.error || parsed.message || `HTTP ${res.status}`,
        isHttpError: true,
      };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { ok: false, error: 'Request timed out after 15s' };
    }
    return { ok: false, error: e.message || 'Network error' };
  }
}

/**
 * Prefer same-origin-friendly fetch; fall back to Electron main-process proxy only when
 * fetch fails for transport reasons (CORS, offline, timeout), not for HTTP 4xx/5xx.
 */
export async function n3dRequest(apiKey, path, method = 'GET', body = null) {
  const direct = await n3dRequestFetch(path, method, body, apiKey || '');
  if (direct.ok) return { ok: true, data: direct.data };

  if (direct.isHttpError) {
    return { ok: false, error: direct.error };
  }

  if (typeof window !== 'undefined' && window.electronAPI?.n3dRequest) {
    return window.electronAPI.n3dRequest(path, method, body, apiKey);
  }

  return { ok: false, error: direct.error };
}
