import { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(minutes) {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtAgo(ts) {
  if (!ts) return null;
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtEta(minutes) {
  if (!minutes || minutes <= 0) return null;
  const d = new Date(Date.now() + minutes * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  if (!ts) return '—';
  let ms;
  if (typeof ts === 'string') {
    // Bambu returns "YYYY-MM-DD HH:mm:ss" — replace space with T for reliable parsing
    ms = Date.parse(ts.includes('T') ? ts : ts.replace(' ', 'T'));
  } else {
    ms = ts > 1e12 ? ts : ts * 1000;
  }
  const d = new Date(ms);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const BAMBU_STATUS_MAP = {
  1: 'running', 2: 'pause', 3: 'failed', 4: 'finish', 5: 'closed',
  6: 'slicing', 7: 'uploading',
};
function bambuStatusLabel(status) {
  if (status === null || status === undefined) return '';
  if (typeof status === 'number') return BAMBU_STATUS_MAP[status] || `status ${status}`;
  return String(status).toLowerCase();
}
function bambuStatusColor(status) {
  const s = typeof status === 'number' ? status : null;
  const label = bambuStatusLabel(status);
  if (s === 4 || label === 'finish') return 'var(--green-text, #22c55e)';
  if (s === 3 || s === 5 || label === 'failed' || label === 'closed') return 'var(--red-text, #ef4444)';
  return 'var(--text2)';
}

function stateLabel(s) {
  const map = { RUNNING: 'Printing', IDLE: 'Idle', PAUSE: 'Paused', FAILED: 'Failed', FINISH: 'Finished', OFFLINE: 'Offline', UNKNOWN: 'Unknown' };
  return map[s] || s || 'Unknown';
}

function stateColor(s) {
  if (s === 'RUNNING') return 'var(--green-text, #22c55e)';
  if (s === 'PAUSE')   return 'var(--amber-text, #f59e0b)';
  if (s === 'FAILED')  return 'var(--red-text, #ef4444)';
  if (s === 'FINISH')  return 'var(--accent, #5b8dee)';
  if (s === 'OFFLINE') return 'var(--text2)';
  return 'var(--text2)';
}

function amsHexColor(raw) {
  if (!raw) return '#888888';
  const s = raw.replace('#', '').padEnd(6, '0');
  return '#' + s.slice(0, 6);
}

function isDark(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// ─── Web API wrappers ─────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const timeoutMs = options.timeout ?? 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      signal: controller.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── TempGauge ────────────────────────────────────────────────────────────────

function TempGauge({ label, current, target }) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0;
  return (
    <div style={{ textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{Math.round(current)}°C</div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text2)' }}>/ {Math.round(target)}°C</div>
      <div style={{ marginTop: 4, height: 3, background: 'var(--border2)', borderRadius: 2 }}>
        <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'var(--accent, #5b8dee)', borderRadius: 2, transition: 'width .6s' }} />
      </div>
    </div>
  );
}

// ─── AmsDisplay ──────────────────────────────────────────────────────────────

function FilamentSwatch({ tray, isActive, size = 32 }) {
  if (!tray) return null;
  const color = amsHexColor(tray.tray_color);
  const hasFilament = !!(tray.tray_type);
  const textColor = hasFilament ? (isDark(color) ? '#fff' : '#000') : 'var(--text2)';
  const label = tray.tray_type ? tray.tray_type.slice(0, 4) : '';
  const remain = tray.remain >= 0 ? ` (${tray.remain}%)` : '';
  const tooltip = hasFilament
    ? `${tray.tray_sub_brands || tray.tray_type}${remain}`
    : 'Empty';
  return (
    <div
      title={tooltip}
      style={{
        width: size, height: size, borderRadius: 5,
        background: hasFilament ? color : 'var(--bg3, var(--bg))',
        border: isActive ? '2px solid var(--accent, #5b8dee)' : '0.5px solid var(--border2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 7, color: textColor, fontWeight: 700,
        position: 'relative', flexShrink: 0, cursor: 'default',
        boxShadow: isActive ? '0 0 0 1px var(--accent, #5b8dee)' : 'none',
      }}
    >
      {label}
      {isActive && (
        <span style={{
          position: 'absolute', top: -5, right: -5,
          width: 9, height: 9, borderRadius: '50%',
          background: 'var(--accent, #5b8dee)',
          border: '1.5px solid var(--bg2)',
        }} />
      )}
    </div>
  );
}

function AmsDisplay({ ams, vtTray }) {
  const units = ams?.ams || [];
  const nowTray = parseInt(ams?.tray_now ?? -1, 10);
  const vtActive = nowTray === 254;
  const hasVt = vtTray && vtTray.tray_type;

  // Non-AMS printer — show external spool only
  if (!units.length) {
    if (!hasVt) return null;
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Filament
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilamentSwatch tray={vtTray} isActive={false} size={36} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
              {vtTray.tray_sub_brands || vtTray.tray_type}
            </div>
            {vtTray.remain >= 0 && (
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{vtTray.remain}% remaining</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // AMS printer — show slots, with external spool at the end if it has filament
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        AMS
      </div>
      {units.map((unit, ui) => (
        <div key={ui} style={{ display: 'flex', gap: 4, marginBottom: ui < units.length - 1 ? 4 : 0 }}>
          {(unit.tray || []).map((tray, ti) => {
            const globalIdx = ui * 4 + ti;
            return <FilamentSwatch key={ti} tray={tray} isActive={globalIdx === nowTray} />;
          })}
        </div>
      ))}
      {hasVt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid var(--border)' }}>
          <FilamentSwatch tray={vtTray} isActive={vtActive} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ext</div>
            <div style={{ fontSize: 11, color: 'var(--text)' }}>{vtTray.tray_sub_brands || vtTray.tray_type}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Camera modal ─────────────────────────────────────────────────────────────
// Works on both Electron (IPC) and web (MJPEG proxy via server).
// X1 series: RTSP on port 322  |  P1/A1 series: JPEG stream on port 6000

function isX1Model(name) {
  return /x1/i.test(name || '');
}

function CameraModal({ device, storedIp, onSaveIp, onClose, isElectron }) {
  const serial = device.dev_id;
  const name   = device.name || device.dev_product_name || serial;
  const model  = device.dev_product_name || device.name || '';
  const x1     = isX1Model(model);

  // Auto-fetch state
  const [fetchState, setFetchState] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'
  const [fetchError, setFetchError] = useState('');

  // IP + access code — filled from storedIp, cloud auto-fetch, or manual entry
  const [ip,         setIp]         = useState(storedIp || device.ip || '');
  const [accessCode, setAccessCode] = useState(
    device.dev_access_code || device.access_code || ''
  );
  const [showConfig, setShowConfig] = useState(false);
  const [copied,     setCopied]     = useState(false);

  // Electron JPEG-stream state
  const [frame,   setFrame]   = useState(null);
  const [error,   setError]   = useState('');
  const [running, setRunning] = useState(false);

  // Web MJPEG state — key changes force <img> to reconnect
  const [mjpegKey, setMjpegKey] = useState(0);
  const [started,  setStarted]  = useState(false);
  const [webError, setWebError] = useState('');

  // ── Auto-fetch credentials on open ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchCreds() {
      setFetchState('loading');

      // ── Electron path ────────────────────────────────────────────────────
      // Auth lives in the Electron app's local settings.json, not in the API
      // server's store — so hitting /api/printers/camera-creds/ would 401.
      // The IPC camera-start handler already auto-looks up ip + access code
      // from its in-memory bambuDevices list, so we just trigger it directly.
      if (isElectron) {
        // Seed state from device props when available (helps X1 RTSP URL)
        const devCode = device.dev_access_code || device.access_code || '';
        const devIp   = device.ip || '';
        if (devCode) setAccessCode(devCode);
        if (devIp)   setIp(devIp);
        setFetchState('done');
        if (!x1) {
          // P1/A1: IPC handler auto-resolves credentials — just trigger start
          setAutoStart(true);
        } else if (!devIp) {
          // X1 needs IP for the RTSP URL; show manual config if we don't have it
          setShowConfig(true);
          setFetchError('Enter the printer IP to generate the RTSP stream URL');
          setFetchState('error');
        }
        return;
      }

      // ── Web path — call the API server ───────────────────────────────────
      try {
        const r = await fetch(`/api/printers/camera-creds/${serial}`);
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) {
          if (data.accessCode) setAccessCode(data.accessCode);
          if (data.ip)         setIp(data.ip);
          setFetchState('done');
          if (data.ip && data.accessCode) {
            if (!x1) setAutoStart(true);
          } else {
            setShowConfig(true);
            setFetchError(data.ip ? '' : 'Printer not found on local network — enter IP manually');
            setFetchState('error');
          }
        } else {
          setFetchState('error');
          setFetchError(data.error || 'Could not fetch credentials');
          setShowConfig(true);
        }
      } catch (e) {
        if (!cancelled) { setFetchState('error'); setFetchError(e.message); setShowConfig(true); }
      }
    }
    fetchCreds();
    return () => { cancelled = true; };
  }, [serial, x1, isElectron]);

  const [autoStart, setAutoStart] = useState(false);

  // Derived URLs
  const rtspUrl  = ip ? `rtsps://bblp:${accessCode}@${ip}:322/streaming/live/1` : '';
  const mjpegUrl = `/api/printers/camera/${serial}${ip ? `?ip=${encodeURIComponent(ip)}&code=${encodeURIComponent(accessCode)}` : ''}`;

  // ── Electron camera controls ─────────────────────────────────────────────
  const elStart = useCallback(async (overrideIp, overrideCode) => {
    const useIp   = overrideIp   || ip;
    const useCode = overrideCode || accessCode;
    setError(''); setRunning(true); setFrame(null);
    const res = await window.electronAPI.printerBambuCameraStart(serial, useIp, useCode);
    if (res?.error) { setError(res.error); setRunning(false); }
    else if (useIp && useIp !== storedIp) onSaveIp(useIp);
  }, [serial, ip, accessCode, storedIp, onSaveIp]);

  const elStop = useCallback(() => {
    window.electronAPI.printerBambuCameraStop(serial);
    setRunning(false);
  }, [serial]);

  useEffect(() => {
    if (!isElectron || x1) return; // X1 uses RTSP, not the IPC stream
    const unsub = window.electronAPI.onBambuCameraFrame((_, { serial: s, dataUrl, error: err }) => {
      if (s !== serial) return;
      if (err) { setError(err); setRunning(false); return; }
      if (dataUrl) setFrame(dataUrl);
    });
    return () => { elStop(); unsub(); };
  }, [serial, isElectron, x1, elStop]);

  // Auto-start when credentials arrive
  useEffect(() => {
    if (!autoStart || !ip || !accessCode) return;
    if (isElectron && !x1) { elStart(ip, accessCode); }
    else if (!isElectron && !x1) { setStarted(true); setMjpegKey(k => k + 1); }
    setAutoStart(false);
  }, [autoStart, ip, accessCode, isElectron, x1, elStart]);

  // ── Web MJPEG controls ───────────────────────────────────────────────────
  const webStart = () => {
    if (!ip) { setWebError('Enter the printer IP address to connect'); return; }
    setWebError(''); setStarted(true); setMjpegKey(k => k + 1);
    if (ip !== storedIp) onSaveIp(ip);
  };
  const webStop = () => { setStarted(false); };

  // Copy to clipboard
  const copyRtsp = async () => {
    try { await navigator.clipboard.writeText(rtspUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  // ── Config panel ─────────────────────────────────────────────────────────
  const configPanel = (
    <div style={{ padding: '10px 16px', background: 'var(--bg3, var(--bg))', borderBottom: '0.5px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Printer IP</div>
          <input
            value={ip} onChange={e => setIp(e.target.value)}
            placeholder="192.168.1.x"
            style={{ width: '100%', fontSize: 12, padding: '4px 8px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 2, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Access Code</div>
          <input
            value={accessCode} onChange={e => setAccessCode(e.target.value)}
            placeholder="From printer Settings → Network"
            style={{ width: '100%', fontSize: 12, padding: '4px 8px', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6 }}>
        Find these in Bambu Studio or on the printer screen under Settings → Network.
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: 14, overflow: 'hidden', maxWidth: 860, width: '95vw', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>📷 {name}</span>
          {/* Auto-fetch status badge */}
          {fetchState === 'loading' && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg3, var(--bg))', color: 'var(--text2)' }}>
              Connecting via cloud…
            </span>
          )}
          {fetchState === 'done' && ip && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: '#22c55e' }}>
              Auto-connected
            </span>
          )}
          {x1 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg3, var(--bg))', color: 'var(--text2)' }}>RTSP</span>}
          <button className="btn" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => setShowConfig(s => !s)}>
            {showConfig ? 'Hide Config' : '⚙ Config'}
          </button>
          {/* Electron P1/A1 controls */}
          {isElectron && !x1 && (
            <button className="btn" style={{ fontSize: 11, padding: '2px 10px' }} onClick={running ? elStop : () => elStart()}>
              {running ? '⏹ Stop' : '▶ Start'}
            </button>
          )}
          {/* Web controls */}
          {!isElectron && !x1 && (
            <button className="btn" style={{ fontSize: 11, padding: '2px 10px' }} onClick={started ? webStop : webStart}>
              {started ? '⏹ Stop' : '▶ Start'}
            </button>
          )}
          <button className="btn" style={{ fontSize: 13, padding: '2px 8px' }} onClick={onClose}>✕</button>
        </div>

        {/* Config panel */}
        {showConfig && configPanel}

        {/* X1: RTSP info panel */}
        {x1 ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>X1 Series — RTSP Stream</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
              X1 printers stream via RTSP (port 322). Open the URL below in VLC, ffplay, or Bambu Studio's camera view.
            </div>
            {ip ? (
              <>
                <div style={{ background: 'var(--bg3, var(--bg))', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 12, border: '0.5px solid var(--border2)' }}>
                  {rtspUrl}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={copyRtsp}>
                    {copied ? '✓ Copied!' : 'Copy URL'}
                  </button>
                  {isElectron && (
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => window.electronAPI?.openExternal?.(rtspUrl)}>
                      Open in VLC
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--amber-text, #f59e0b)' }}>
                Enter your printer IP in ⚙ Config above to generate the RTSP URL.
              </div>
            )}
          </div>
        ) : (
          /* P1 / A1: JPEG stream */
          <>
            <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, position: 'relative' }}>
              {/* Electron mode */}
              {isElectron && (
                frame ? (
                  <img src={frame} alt="Camera feed" style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain' }} />
                ) : (
                  <div style={{ padding: 40, color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                    {error ? (
                      <>
                        <div style={{ color: '#ef4444', marginBottom: 8 }}>⚠ {error}</div>
                        <div style={{ fontSize: 11, maxWidth: 320, margin: '0 auto' }}>
                          Check that the printer is on your local network and the IP / access code are correct in ⚙ Config.
                        </div>
                      </>
                    ) : running ? 'Connecting…' : 'Press Start to connect'}
                  </div>
                )
              )}

              {/* Web MJPEG mode */}
              {!isElectron && (
                started ? (
                  <>
                    <img
                      key={mjpegKey}
                      src={mjpegUrl}
                      alt="Camera feed"
                      style={{ width: '100%', display: 'block', maxHeight: '65vh', objectFit: 'contain' }}
                      onError={() => setWebError('Could not connect — check IP, access code, and that the printer is on the same local network as this server')}
                    />
                    {webError && (
                      <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ color: '#ef4444', padding: 32, fontSize: 12, textAlign: 'center', maxWidth: 360 }}>
                          ⚠ {webError}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: 40, color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                    {webError ? (
                      <>
                        <div style={{ color: '#ef4444', marginBottom: 8 }}>⚠ {webError}</div>
                        <div style={{ fontSize: 11 }}>The server must be on the same local network as your printer.</div>
                      </>
                    ) : fetchState === 'loading' ? (
                      <>
                        <div>Fetching credentials via Bambu Cloud…</div>
                        <div style={{ fontSize: 11, marginTop: 6, color: '#666' }}>Auto-detecting printer on local network</div>
                      </>
                    ) : fetchError ? (
                      <>
                        <div style={{ color: '#f59e0b', marginBottom: 8 }}>⚠ {fetchError}</div>
                        <div style={{ fontSize: 11 }}>Enter the printer IP in ⚙ Config and press Start.</div>
                      </>
                    ) : (
                      <>Press Start to connect<div style={{ fontSize: 11, marginTop: 6, color: '#666' }}>Requires server + printer on the same network</div></>
                    )}
                  </div>
                )
              )}

              {/* LIVE badge */}
              {((isElectron && frame) || (!isElectron && started && !webError)) && (
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.55)', color: '#22c55e', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                  ● LIVE
                </div>
              )}
            </div>

            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text2)', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 12 }}>
              <span>{ip ? `${ip}:6000` : 'Discovering printer…'} · JPEG stream</span>
              {!isElectron && <span>· via server proxy</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Inline camera feed ───────────────────────────────────────────────────────

function InlineCameraFeed({ serial, device, storedIp, storedCode, onSaveConfig, isElectron }) {
  const deviceCode = device.dev_access_code || device.access_code || '';
  const [on,       setOn]      = useState(!!storedIp);
  const [frame,    setFrame]   = useState(null);
  const [error,    setError]   = useState('');
  const [ip,       setIp]      = useState(storedIp || '');
  const [code,     setCode]    = useState(storedCode || deviceCode);
  const [editing,  setEditing] = useState(!storedIp);
  const [mjpegKey, setMjpegKey] = useState(0);

  const mjpegUrl = ip
    ? `/api/printers/camera/${serial}?ip=${encodeURIComponent(ip)}&code=${encodeURIComponent(code)}`
    : `/api/printers/camera/${serial}`;

  const startEl = useCallback(async (useIp, useCode) => {
    const trimmedIp   = (useIp   || ip).trim();
    const trimmedCode = (useCode || code).trim();
    if (!trimmedIp) { setEditing(true); return; }
    setError(''); setFrame(null);
    const res = await window.electronAPI.printerBambuCameraStart(serial, trimmedIp, trimmedCode);
    if (res?.error) { setError(res.error); setOn(false); }
    else if (trimmedIp !== storedIp || trimmedCode !== storedCode) onSaveConfig(trimmedIp, trimmedCode);
  }, [serial, ip, code, storedIp, storedCode, onSaveConfig]);

  const stopEl = useCallback(() => {
    if (window.electronAPI) window.electronAPI.printerBambuCameraStop(serial);
    setFrame(null);
  }, [serial]);

  // Subscribe to frames (Electron only)
  useEffect(() => {
    if (!isElectron) return;
    const unsub = window.electronAPI.onBambuCameraFrame((_, { serial: s, dataUrl, error: err }) => {
      if (s !== serial) return;
      if (err) { setError(err); setOn(false); return; }
      if (dataUrl) { setFrame(dataUrl); setError(''); }
    });
    if (storedIp) startEl(storedIp, storedCode || deviceCode);
    return () => { stopEl(); unsub(); };
  // eslint-disable-next-line
  }, [serial, isElectron]);

  const toggle = () => {
    if (on) {
      setOn(false);
      if (isElectron) stopEl();
    } else {
      if (!ip.trim() && isElectron) { setEditing(true); setOn(false); return; }
      setOn(true); setError('');
      if (isElectron) startEl();
      else setMjpegKey(k => k + 1);
    }
  };

  const applyConfig = () => {
    if (!ip.trim()) return;
    setEditing(false); setOn(true); setError('');
    if (isElectron) startEl(ip.trim(), code.trim());
    else setMjpegKey(k => k + 1);
  };

  return (
    <div style={{ background: '#000', position: 'relative', minHeight: on ? 0 : 44 }}>
      {/* Feed */}
      {on && (
        <>
          {error ? (
            <div style={{ padding: '18px 12px', fontSize: 11, color: '#ef4444', textAlign: 'center', lineHeight: 1.5 }}>
              ⚠ {error}
              <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>Check IP / access code and make sure printer is on your network</div>
            </div>
          ) : isElectron ? (
            frame
              ? <img src={frame} alt="Camera" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'contain' }} />
              : <div style={{ padding: 24, fontSize: 11, color: '#666', textAlign: 'center' }}>Connecting…</div>
          ) : (
            <img key={mjpegKey} src={mjpegUrl} alt="Camera"
              style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'contain' }}
              onError={() => setError('Could not connect to camera')} />
          )}
          {(frame || (!isElectron && on && !error)) && (
            <div style={{ position: 'absolute', top: 6, right: 8, background: 'rgba(0,0,0,.6)', color: '#22c55e', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em' }}>● LIVE</div>
          )}
        </>
      )}

      {/* Config inputs — shown when no IP yet or editing */}
      {editing && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: 'rgba(0,0,0,.85)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            style={{ fontSize: 11, padding: '3px 6px', flex: 2, minWidth: 110, background: '#1a1a1a', border: '0.5px solid #444', color: '#eee' }}
            placeholder="IP  192.168.x.x"
            value={ip}
            onChange={e => setIp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyConfig(); }}
          />
          <input
            className="input"
            style={{ fontSize: 11, padding: '3px 6px', flex: 2, minWidth: 90, background: '#1a1a1a', border: '0.5px solid #444', color: '#eee', fontFamily: 'monospace' }}
            placeholder="Access code"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyConfig(); }}
          />
          <button onClick={applyConfig}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#1d4ed8', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ▶ Start
          </button>
        </div>
      )}

      {/* Control bar — shown when not editing */}
      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(0,0,0,.7)', position: on ? 'absolute' : 'relative', bottom: on ? 0 : undefined, left: on ? 0 : undefined, right: on ? 0 : undefined }}>
          <span style={{ fontSize: 10, color: '#aaa', flex: 1 }}>📷</span>
          {ip && (
            <span style={{ fontSize: 10, color: '#888', cursor: 'pointer' }} title="Edit IP / access code"
              onClick={() => { if (isElectron) stopEl(); setOn(false); setEditing(true); }}>
              {ip}
            </span>
          )}
          <button onClick={toggle}
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? '#333' : '#1d4ed8', color: on ? '#aaa' : '#fff', fontWeight: 600 }}>
            {on ? '⏹ Stop' : '▶ Start'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Printer card ─────────────────────────────────────────────────────────────

function PrinterCard({ device, state, onRefresh, storedIp, storedCode, onSaveConfig, onPrintCmd, isElectron }) {
  const [, setTick]     = useState(0);
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdErr,  setCmdErr]  = useState('');
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const sendCmd = async (cmd) => {
    if (!onPrintCmd) return;
    setCmdErr(''); setCmdBusy(true); setConfirmStop(false);
    try {
      const res = await onPrintCmd(cmd);
      if (res?.error) setCmdErr(res.error);
    } catch (e) { setCmdErr(e.message); }
    finally { setCmdBusy(false); }
  };

  const name = device.name || device.dev_product_name || device.dev_id || 'Printer';
  const model = device.dev_product_name || device.type || '';
  const gstate = state?.gcode_state || (state?.status) || 'OFFLINE';
  const isPrinting = gstate === 'RUNNING';
  const isOffline = !state || gstate === 'OFFLINE';
  const progress = state?.progress ?? 0;
  const eta = fmtEta(state?.remaining_min);
  const lastSeen = state?.ts ? fmtAgo(state.ts) : null;

  return (
    <div style={{
      background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 12,
      padding: 0, overflow: 'hidden',
    }}>
      {/* Inline camera feed at top of card */}
      <InlineCameraFeed
        serial={device.dev_id}
        device={device}
        storedIp={storedIp}
        storedCode={storedCode}
        onSaveConfig={onSaveConfig}
        isElectron={isElectron}
      />

      <div style={{ padding: '14px 16px 10px', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg3, var(--bg))', border: '0.5px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            🖨
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            {model && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{model}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
              background: isOffline ? 'var(--bg3, var(--bg))' : isPrinting ? 'rgba(34,197,94,.15)' : 'var(--bg3, var(--bg))',
              color: stateColor(gstate), border: `0.5px solid ${stateColor(gstate)}44`,
            }}>{stateLabel(gstate)}</span>
            <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} title="Refresh status" onClick={onRefresh}>↻</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {state?.wifi && <div style={{ fontSize: 10, color: 'var(--text2)' }}>📶 {state.wifi}</div>}
          {lastSeen && <div style={{ fontSize: 10, color: 'var(--text2)' }}>Updated {lastSeen}</div>}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {isPrinting || gstate === 'PAUSE' ? (
          <>
            {state?.file && (
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📄 {state.file}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, height: 8, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: gstate === 'PAUSE' ? 'var(--amber-text, #f59e0b)' : 'var(--accent, #5b8dee)', borderRadius: 4, transition: 'width .6s' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 36, textAlign: 'right' }}>{progress}%</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
              <span>⏱ {fmtTime(state.remaining_min)} remaining</span>
              {eta && <span>ETA {eta}</span>}
              {state.layer > 0 && <span>Layer {state.layer}{state.total_layers > 0 ? ` / ${state.total_layers}` : ''}</span>}
            </div>

            {onPrintCmd && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                {gstate === 'RUNNING' && (
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--amber-text, #f59e0b)' }}
                    disabled={cmdBusy} onClick={() => sendCmd('pause')}>
                    ⏸ Pause
                  </button>
                )}
                {gstate === 'PAUSE' && (
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--green-text, #22c55e)' }}
                    disabled={cmdBusy} onClick={() => sendCmd('resume')}>
                    ▶ Resume
                  </button>
                )}
                {confirmStop ? (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--text2)', alignSelf: 'center' }}>Confirm stop?</span>
                    <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red-text, #ef4444)' }}
                      disabled={cmdBusy} onClick={() => sendCmd('stop')}>Yes, stop</button>
                    <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => setConfirmStop(false)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red-text, #ef4444)' }}
                    disabled={cmdBusy} onClick={() => setConfirmStop(true)}>
                    ⬛ Stop
                  </button>
                )}
                {cmdBusy && <span style={{ fontSize: 11, color: 'var(--text2)', alignSelf: 'center' }}>Sending…</span>}
                {cmdErr  && <span style={{ fontSize: 11, color: 'var(--red-text, #ef4444)', alignSelf: 'center' }}>{cmdErr}</span>}
              </div>
            )}
          </>
        ) : gstate === 'FINISH' ? (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            ✅ {state?.file ? `Finished: ${state.file}` : 'Print complete'}
          </div>
        ) : isOffline ? (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            No data yet — waiting for response
            <div style={{ fontSize: 10, marginTop: 2 }}>Printer may be offline, sleeping, or in LAN-only mode</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Idle</div>
        )}

        {state && !isOffline && (
          <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
            <TempGauge label="Nozzle" current={state.nozzle_temp ?? 0} target={state.nozzle_target ?? 0} />
            <div style={{ width: '0.5px', background: 'var(--border)' }} />
            <TempGauge label="Bed" current={state.bed_temp ?? 0} target={state.bed_target ?? 0} />
          </div>
        )}
        {state && (state.ams || state.vt_tray) && <AmsDisplay ams={state.ams} vtTray={state.vt_tray} />}
      </div>
    </div>
  );
}

// ─── Bambu login form ─────────────────────────────────────────────────────────

// region: 'global' → api.bambulab.com + us.mqtt.bambulab.com (covers AU, EU, US, etc.)
//         'china'  → api.bambulab.cn  + cn.mqtt.bambulab.com

async function finishBambuLoginElectron(accessToken, refreshToken, region, onConnected, setError, setBusy, setStep) {
  try {
    const devRes = await window.electronAPI.printerBambuGetDevices(accessToken, region || 'global');
    const devices = Array.isArray(devRes) ? devRes : [];
    const uidRes  = await window.electronAPI.printerBambuGetUid(accessToken, region || 'global');
    const uid     = uidRes?.uid || null;
    const auth    = { accessToken, refreshToken: refreshToken || null, devices, uid, region: region || 'global' };
    await window.electronAPI.printerBambuConnect(auth);
    onConnected(auth);
  } catch (e) {
    setError(e.message || 'Failed to connect');
    setBusy(false);
    setStep('credentials');
  }
}

async function finishBambuLoginWeb(accessToken, refreshToken, region, onConnected, setError, setBusy, setStep) {
  try {
    const result = await apiFetch('/api/printers/bambu/connect', {
      method: 'POST',
      body: { auth: { accessToken, refreshToken: refreshToken || null, region: region || 'global' } },
    });
    onConnected({ accessToken, refreshToken: refreshToken || null, region: region || 'global', devices: result.devices, uid: result.uid });
  } catch (e) {
    setError(e.message || 'Failed to connect');
    setBusy(false);
    setStep('credentials');
  }
}

function BambuLogin({ onConnected, isElectron }) {
  const [step,        setStep]        = useState('credentials');
  const [region,      setRegion]      = useState('global');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [code,        setCode]        = useState('');
  const [tfaKey,      setTfaKey]      = useState('');
  const [manualToken, setManualToken] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  const finishLogin = (accessToken, refreshToken, ...rest) =>
    (isElectron ? finishBambuLoginElectron : finishBambuLoginWeb)(accessToken, refreshToken, region, ...rest);

  const doLogin = async () => {
    if (!email.trim() || !password) return;
    setBusy(true); setError('');
    try {
      const r = isElectron
        ? await window.electronAPI.printerBambuLogin(email.trim(), password, region)
        : await apiFetch('/api/printers/bambu/login', { method: 'POST', body: { email: email.trim(), password, region } });
      if (r?.error) { setError(r.error); setBusy(false); return; }
      if (r?.loginType === 'verifyCode') { setStep('verify-code'); setBusy(false); return; }
      if (r?.loginType === 'tfa')        { setTfaKey(r.tfaKey || ''); setStep('tfa'); setBusy(false); return; }
      if (r?.accessToken) {
        setStep('connecting');
        await finishLogin(r.accessToken, r.refreshToken, onConnected, setError, setBusy, setStep);
        return;
      }
      setError('Unexpected response — please try again'); setBusy(false);
    } catch (e) { setError(e.message || 'Login failed'); setBusy(false); }
  };

  const doVerifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true); setError('');
    try {
      const r = isElectron
        ? await window.electronAPI.printerBambuVerifyCode(email.trim(), code.trim(), region)
        : await apiFetch('/api/printers/bambu/verify-code', { method: 'POST', body: { email: email.trim(), code: code.trim(), region } });
      if (r?.error) { setError(r.error); setBusy(false); return; }
      if (r?.accessToken) {
        setStep('connecting');
        await finishLogin(r.accessToken, r.refreshToken, onConnected, setError, setBusy, setStep);
        return;
      }
      setError('Invalid code — please try again'); setBusy(false);
    } catch (e) { setError(e.message || 'Verification failed'); setBusy(false); }
  };

  const doVerifyTfa = async () => {
    if (!code.trim()) return;
    setBusy(true); setError('');
    try {
      const r = isElectron
        ? await window.electronAPI.printerBambuVerify(email.trim(), tfaKey, code.trim(), region)
        : await apiFetch('/api/printers/bambu/verify-tfa', { method: 'POST', body: { email: email.trim(), tfaKey, code: code.trim(), region } });
      const token = r?.token || r?.accessToken;
      if (r?.error) { setError(r.error); setBusy(false); return; }
      if (token) {
        setStep('connecting');
        await finishLogin(token, r?.refreshToken, onConnected, setError, setBusy, setStep);
        return;
      }
      setError('Invalid code — please try again'); setBusy(false);
    } catch (e) { setError(e.message || 'Verification failed'); setBusy(false); }
  };

  const doTokenConnect = async () => {
    if (!manualToken.trim()) return;
    setBusy(true); setError(''); setStep('connecting');
    await finishLogin(manualToken.trim(), null, onConnected, setError, setBusy, setStep);
  };

  const doWebLogin = async () => {
    if (!isElectron) return;
    setBusy(true); setError('');
    try {
      const r = await window.electronAPI.printerBambuWebLogin();
      if (r?.error) { setError(r.error); setBusy(false); return; }
      const token = r?.accessToken || r?.token;
      if (token) {
        setStep('connecting');
        await finishLogin(token, r?.refreshToken, onConnected, setError, setBusy, setStep);
        return;
      }
      setError('No token captured — please try again'); setBusy(false);
    } catch (e) { setError(e.message || 'Web login failed'); setBusy(false); }
  };

  const onKey = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  const card = (children) => (
    <div style={{ maxWidth: 420, padding: 20, background: 'var(--bg2)', borderRadius: 12, border: '0.5px solid var(--border2)' }}>
      {children}
    </div>
  );

  const title = (t, sub) => (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: sub ? 4 : 16 }}>Connect Bambu Lab</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>{sub}</div>}
      {t && t !== 'Connect Bambu Lab' && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, marginTop: -8 }}>{t}</div>}
    </>
  );

  const errMsg = error && (
    <div style={{ fontSize: 12, color: 'var(--red-text, #ef4444)', marginBottom: 10 }}>{error}</div>
  );

  if (step === 'connecting') { return card(
    <>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Connect Bambu Lab</div>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>Connecting to Bambu Cloud…</div>
    </>
  ); }

  if (step === 'token') { return card(
    <>
      {title('Connect Bambu Lab', 'Paste an access token you already have.')}
      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Access Token</label>
        <input
          value={manualToken} onChange={e => setManualToken(e.target.value)}
          onKeyDown={onKey(doTokenConnect)}
          placeholder="Paste your Bambu access token…"
          style={{ fontFamily: 'monospace', fontSize: 11 }}
          autoFocus
        />
      </div>
      {errMsg}
      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}
        disabled={!manualToken.trim() || busy} onClick={doTokenConnect}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      <button className="btn" style={{ width: '100%', fontSize: 12 }}
        onClick={() => { setStep('credentials'); setError(''); }}>
        ← Back
      </button>
    </>
  ); }

  if (step === 'tfa') { return card(
    <>
      {title('Connect Bambu Lab', 'Enter the 6-digit code from your authenticator app.')}
      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Authenticator Code</label>
        <input value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={onKey(doVerifyTfa)}
          placeholder="6-digit code" maxLength={6} autoFocus
          style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
        />
      </div>
      {errMsg}
      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}
        disabled={!code.trim() || busy} onClick={doVerifyTfa}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      <button className="btn" style={{ width: '100%', fontSize: 12 }}
        onClick={() => { setStep('credentials'); setCode(''); setError(''); }}>
        ← Back
      </button>
    </>
  ); }

  if (step === 'verify-code') { return card(
    <>
      {title('Connect Bambu Lab', `A verification code was sent to ${email}. Enter it below.`)}
      <div className="field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Verification Code</label>
        <input value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={onKey(doVerifyCode)}
          placeholder="6-digit code" maxLength={8} autoFocus
          style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
        />
      </div>
      {errMsg}
      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}
        disabled={!code.trim() || busy} onClick={doVerifyCode}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      <button className="btn" style={{ width: '100%', fontSize: 12 }}
        onClick={() => { setStep('credentials'); setCode(''); setError(''); }}>
        ← Back
      </button>
    </>
  ); }

  return card(
    <>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Connect Bambu Lab</div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>Region</label>
        <select value={region} onChange={e => setRegion(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
          <option value="global">Global / International (AU, EU, US, etc.)</option>
          <option value="china">Mainland China</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={onKey(doLogin)}
          placeholder="your@email.com" type="email" autoFocus
        />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12 }}>Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={onKey(doLogin)}
          placeholder="Password" type="password"
        />
      </div>
      {errMsg}
      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}
        disabled={!email.trim() || !password || busy} onClick={doLogin}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        {isElectron && (
          <button className="btn" style={{ flex: 1, fontSize: 12 }} disabled={busy} onClick={doWebLogin}>
            🌐 Browser Login
          </button>
        )}
        <button className="btn" style={{ flex: 1, fontSize: 12 }}
          onClick={() => { setStep('token'); setError(''); }}>
          Paste Token
        </button>
      </div>
    </>
  );
}

// ─── Print history + power cost ───────────────────────────────────────────────

function defaultWatts(deviceName) {
  const n = (deviceName || '').toLowerCase();
  if (n.includes('p1s')) return 350;
  if (n.includes('p1p')) return 300;
  if (n.includes('x1c') || n.includes('x1e')) return 400;
  if (n.includes('a1')) return 250;
  return 350;
}

function PrintHistory({ accessToken, devices, powerSettings, onSavePowerSettings, isElectron }) {
  const [tasks,     setTasks]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [expanded,  setExpanded]  = useState(false);
  const [showPower, setShowPower] = useState(false);
  const [rate,          setRate]          = useState(String(powerSettings?.ratePerKwh ?? '0.30'));
  const [filamentPrice, setFilamentPrice] = useState(String(powerSettings?.filamentPricePerKg ?? '25.00'));
  const [wattMap,       setWattMap]       = useState(powerSettings?.wattsBySerial ?? {});

  const devMap = {};
  (devices || []).forEach(d => { devMap[d.dev_id] = d.name || d.dev_product_name || d.dev_id; });

  const effectiveRate          = parseFloat(powerSettings?.ratePerKwh)         || 0.30;
  const effectiveFilamentPrice = parseFloat(powerSettings?.filamentPricePerKg) || 25.00;

  function getWatts(deviceId) {
    if (powerSettings?.wattsBySerial?.[deviceId]) return Number(powerSettings.wattsBySerial[deviceId]);
    return defaultWatts(devMap[deviceId] || deviceId);
  }

  function calcPower(deviceId, costTimeSec) {
    const hours = (costTimeSec || 0) / 3600;
    const watts = getWatts(deviceId);
    const kwh = (watts * hours) / 1000;
    return { kwh, cost: kwh * effectiveRate };
  }

  function calcFilament(weightG) {
    const g = parseFloat(weightG) || 0;
    return (g / 1000) * effectiveFilamentPrice;
  }

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true); setError('');
    try {
      let result;
      if (isElectron && window.electronAPI?.printerBambuGetTasks) {
        const r = await window.electronAPI.printerBambuGetTasks(accessToken, 1, 30);
        if (r?.error) { setError(r.error); setLoading(false); return; }
        result = r;
      } else {
        result = await apiFetch('/api/printers/bambu/tasks?page=1&limit=30');
      }
      const list = result?.hits || result?.tasks || [];
      setTasks(list);
    } catch (e) { setError(e.message || 'Failed to load history'); }
    setLoading(false);
  }, [accessToken, isElectron]);

  useEffect(() => {
    if (expanded && tasks === null && !loading && !error) { load(); }
  }, [expanded, tasks, loading, load, error]);

  function savePower() {
    const parsed = parseFloat(rate);
    const parsedFil = parseFloat(filamentPrice);
    if (isNaN(parsed) || parsed <= 0) return;
    const newSettings = {
      ratePerKwh: parsed,
      filamentPricePerKg: isNaN(parsedFil) ? 25 : parsedFil,
      wattsBySerial: wattMap,
    };
    onSavePowerSettings(newSettings);
    setShowPower(false);
  }

  const totals = { kwh: 0, powerCost: 0, filamentCost: 0, weightG: 0, prints: 0 };
  if (tasks) {
    tasks.forEach(t => {
      const deviceId = t.deviceId || t.dev_id || '';
      const { kwh, cost } = calcPower(deviceId, t.costTime || t.printTime || 0);
      const weightG = parseFloat(t.weight || t.filamentWeight || t.filament_weight || 0);
      const filCost = calcFilament(weightG);
      totals.kwh += kwh;
      totals.powerCost += cost;
      totals.filamentCost += filCost;
      totals.weightG += weightG;
      totals.prints++;
    });
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 12, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, userSelect: 'none' }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>📋 Print History & Cost</span>
        {tasks && !loading && (
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {totals.prints} prints · {totals.kwh.toFixed(2)} kWh · {totals.weightG > 0 ? `${totals.weightG.toFixed(0)}g · ` : ''}${(totals.powerCost + totals.filamentCost).toFixed(2)} total
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text2)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▶</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '0.5px solid var(--border)' }}>
          <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              ⚡ ${effectiveRate.toFixed(2)}/kWh · 🧵 ${effectiveFilamentPrice.toFixed(2)}/kg
            </span>
            <button className="btn" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => setShowPower(s => !s)}>
              {showPower ? 'Hide Settings' : 'Power Settings'}
            </button>
            <button className="btn" style={{ fontSize: 11, padding: '2px 10px' }} onClick={load} disabled={loading}>
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          {showPower && (
            <div style={{ padding: '12px 16px', background: 'var(--bg3, var(--bg))', borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Cost Settings</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <label style={{ fontSize: 12, minWidth: 160, color: 'var(--text2)' }}>Electricity ($/kWh)</label>
                <input value={rate} onChange={e => setRate(e.target.value)} style={{ width: 80, fontSize: 12, padding: '3px 6px' }} type="number" min="0" step="0.01" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <label style={{ fontSize: 12, minWidth: 160, color: 'var(--text2)' }}>Filament ($/kg)</label>
                <input value={filamentPrice} onChange={e => setFilamentPrice(e.target.value)} style={{ width: 80, fontSize: 12, padding: '3px 6px' }} type="number" min="0" step="0.50" />
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Wattage per printer</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {(devices || []).map(d => {
                  const serial = d.dev_id;
                  const name = d.name || d.dev_product_name || serial;
                  const fallback = defaultWatts(d.dev_product_name || '');
                  const val = wattMap[serial] ?? '';
                  return (
                    <div key={serial} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, flex: 1, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <input value={val} placeholder={String(fallback) + 'W'} onChange={e => setWattMap(m => ({ ...m, [serial]: e.target.value }))} style={{ width: 80, fontSize: 12, padding: '3px 6px' }} type="number" min="1" />
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>W</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={savePower}>Save</button>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => setShowPower(false)}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 16px', fontSize: 12, color: error.toLowerCase().includes('not available') ? 'var(--text2)' : 'var(--red-text, #ef4444)' }}>
              {error}
              {error.toLowerCase().includes('not available') && (
                <span style={{ display: 'block', marginTop: 4, fontSize: 11 }}>
                  Print history syncs from Bambu Cloud — it may not be enabled for all account types.
                </span>
              )}
            </div>
          )}
          {loading && <div style={{ padding: '16px', fontSize: 12, color: 'var(--text2)' }}>Loading print history…</div>}
          {tasks && !loading && tasks.length === 0 && <div style={{ padding: '16px', fontSize: 12, color: 'var(--text2)' }}>No print history found.</div>}

          {tasks && !loading && tasks.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['Date', 'File', 'Printer', 'Duration', 'kWh', 'Power $', 'Weight (g)', 'Filament $', 'Total $', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, i) => {
                    const deviceId  = t.deviceId || t.dev_id || '';
                    const devName   = devMap[deviceId] || deviceId || '—';
                    const costSec   = t.costTime || t.printTime || 0;
                    const weightG   = parseFloat(t.weight || t.filamentWeight || t.filament_weight || 0);
                    const { kwh, cost: powerCost } = calcPower(deviceId, costSec);
                    const filCost   = calcFilament(weightG);
                    const totalCost = powerCost + filCost;
                    const statusLabel = bambuStatusLabel(t.status);
                    const statusColor = bambuStatusColor(t.status);
                    return (
                      <tr key={t.id || i} style={{ borderBottom: '0.5px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3, rgba(0,0,0,.03))' }}>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(t.startTime || t.createTime || t.start_time)}</td>
                        <td style={{ padding: '7px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={t.title || t.name || t.fileName || ''}>{t.title || t.name || t.fileName || '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{devName || t.deviceName || '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDuration(costSec)}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{kwh > 0 ? kwh.toFixed(3) : '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{powerCost > 0 ? `$${powerCost.toFixed(3)}` : '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{weightG > 0 ? weightG.toFixed(1) : '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{filCost > 0 ? `$${filCost.toFixed(3)}` : '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>{totalCost > 0 ? `$${totalCost.toFixed(3)}` : '—'}</td>
                        <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: statusColor, fontWeight: 500, textTransform: 'capitalize' }}>{statusLabel || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '0.5px solid var(--border2)' }}>
                    <td colSpan={4} style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Total ({totals.prints} prints)</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{totals.kwh.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>${totals.powerCost.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{totals.weightG > 0 ? totals.weightG.toFixed(0) : '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>${totals.filamentCost.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--accent, #5b8dee)' }}>${(totals.powerCost + totals.filamentCost).toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Snapmaker add panel ──────────────────────────────────────────────────────

function AddSnapmakerPanel({ existingPrinters, onSave, onClose }) {
  const [ip,    setIp]    = useState('');
  const [name,  setName]  = useState('');
  const [step,  setStep]  = useState('form'); // 'form' | 'connecting' | 'waiting' | 'error'
  const [err,   setErr]   = useState('');
  const buildPrinter = (tok) => ({
    id: `snap_${Date.now()}`,
    type: 'snapmaker',
    ip: ip.trim(),
    name: name.trim() || `Snapmaker (${ip.trim()})`,
    ...(tok ? { token: tok } : {}),
  });

  const doConnect = async () => {
    if (!ip.trim()) { setErr('IP address is required'); return; }
    setErr('');
    setStep('connecting');
    try {
      const res = await window.electronAPI.printerSnapConnectReq(ip.trim());
      if (res?.token) {
        setStep('waiting'); // token received — printer confirmed
        const printer = buildPrinter(res.token);
        onSave([...existingPrinters, printer], printer);
      } else if (res?.error) {
        setErr(res.error);
        setStep('error');
      } else {
        // No token returned — printer may not require auth; add without token
        const printer = buildPrinter('');
        onSave([...existingPrinters, printer], printer);
      }
    } catch (e) {
      setErr(e?.message || 'Could not connect. Check the IP address and try again.');
      setStep('error');
    }
  };

  const addWithoutToken = () => {
    const printer = buildPrinter('');
    onSave([...existingPrinters, printer], printer);
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 24, width: 380, border: '0.5px solid var(--border2)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Add Snapmaker</div>

        {step === 'form' && (<>
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>IP Address</label>
            <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.x" autoFocus
              onKeyDown={e => e.key === 'Enter' && doConnect()} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12 }}>Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Snapmaker" />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--red-text, #ef4444)', marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={doConnect}>Connect</button>
            <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          </div>
        </>)}

        {step === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Contacting printer…</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Your Snapmaker screen may show a confirmation prompt.<br />
              <strong>Tap Confirm</strong> on the touchscreen to authorise.
            </div>
          </div>
        )}

        {step === 'error' && (<>
          <div style={{ fontSize: 13, color: 'var(--red-text, #ef4444)', marginBottom: 12 }}>{err}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
            You can still add the printer — some Snapmaker models don't require authorisation for status polling.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={addWithoutToken}>Add anyway</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => setStep('form')}>Try again</button>
            <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── Cloud relay panel ────────────────────────────────────────────────────────

function CloudRelayPanel({ appSettings, saveAppSettings }) {
  const [relayConnected, setRelayConnected] = useState(false);
  const [relayActive,    setRelayActive]    = useState(false);
  const [relayError,     setRelayError]     = useState('');
  const [editing,        setEditing]        = useState(false);
  const [urlInput,       setUrlInput]       = useState('');
  const [tokenInput,     setTokenInput]     = useState('');

  const savedUrl   = appSettings.cloudApiUrl   || '';
  const savedToken = appSettings.cameraRelayToken || '';

  useEffect(() => {
    if (!window.electronAPI?.onCameraRelayStatus) return;
    const unsub = window.electronAPI.onCameraRelayStatus((_, status) => {
      setRelayConnected(!!status.connected);
      if (!status.connected) setRelayError(status.error || '');
      else setRelayError('');
    });
    window.electronAPI.cameraRelayStatus?.().then(s => {
      setRelayActive(s.active);
      setRelayConnected(s.connected);
    }).catch(() => {});
    return unsub;
  }, []);

  const handleStart = useCallback(async () => {
    const url   = urlInput.trim()   || savedUrl;
    const token = tokenInput.trim() || savedToken;
    if (!url || !token) { setEditing(true); return; }
    if (url !== savedUrl || token !== savedToken) {
      await saveAppSettings({ ...appSettings, cloudApiUrl: url, cameraRelayToken: token });
    }
    await window.electronAPI.cameraRelayStart(url, token);
    setRelayActive(true);
    setEditing(false);
  }, [urlInput, tokenInput, savedUrl, savedToken, appSettings, saveAppSettings]);

  const handleStop = useCallback(async () => {
    await window.electronAPI.cameraRelayStop();
    setRelayActive(false);
    setRelayConnected(false);
  }, []);

  const dot = relayConnected ? '#22c55e' : relayActive ? '#f59e0b' : 'var(--text2)';
  const configured = !!(savedUrl && savedToken);

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Cloud Camera Relay</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {relayConnected ? '— streaming to cloud' : relayActive ? '— connecting…' : configured ? '— stopped' : '— not configured'}
          </span>
          {relayError && <span style={{ fontSize: 11, color: 'var(--red-text, #ef4444)' }}>{relayError}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ fontSize: 12 }} onClick={() => { setUrlInput(savedUrl); setTokenInput(savedToken); setEditing(e => !e); }}>
            {editing ? 'Cancel' : 'Configure'}
          </button>
          {relayActive
            ? <button className="btn" style={{ fontSize: 12, color: 'var(--red-text, #ef4444)' }} onClick={handleStop}>Stop relay</button>
            : <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleStart}>Start relay</button>
          }
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Enter your cloud server URL and relay token (set <code>CAMERA_RELAY_TOKEN</code> in your Render env vars).
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ flex: 2, minWidth: 180, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }}
              placeholder="https://your-app.onrender.com"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            <input
              style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }}
              placeholder="Relay token"
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
            />
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleStart}>Save & Start</button>
          </div>
        </div>
      )}
      {!editing && relayConnected && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)' }}>
          Camera feeds are live on your cloud dashboard. Open a printer camera to begin streaming.
        </div>
      )}
      {!editing && !relayConnected && !relayActive && configured && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)' }}>
          Start the relay to make your printer camera feeds viewable from the cloud.
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function PrintersView() {
  const { appSettings, printerStatus: electronStatus, bambuConn: electronConn, saveBambuAuth, saveSnapmakerPrinters, saveAppSettings, isElectron } = useApp();

  // Web-mode state (when not running in Electron)
  const [webConn,    setWebConn]    = useState({ connected: false });
  const [webStatus,  setWebStatus]  = useState({});
  const [webDevices, setWebDevices] = useState([]);

  const [showAddSnap,  setShowAddSnap]  = useState(false);

  // SSE connection for web mode
  useEffect(() => {
    if (isElectron) return;

    const es = new EventSource('/api/printers/events');

    es.addEventListener('bambu-conn', e => {
      try { setWebConn(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('printer-update', e => {
      try {
        const { serial, state } = JSON.parse(e.data);
        setWebStatus(prev => ({ ...prev, [serial]: state }));
      } catch {}
    });
    es.addEventListener('devices', e => {
      try { setWebDevices(JSON.parse(e.data)); } catch {}
    });

    es.onerror = () => {
      // SSE will auto-reconnect; update state to show disconnected
    };

    return () => es.close();
  }, [isElectron]);

  // Resolve which state to use
  const bambuConn   = isElectron ? electronConn    : webConn;
  const printerStatus = isElectron ? electronStatus : webStatus;

  const bambuAuth    = appSettings.bambuAuth;
  const bambuDevices = isElectron
    ? (bambuAuth?.devices || [])
    : webDevices.length > 0 ? webDevices : (bambuAuth?.devices || []);
  const snapPrinters = appSettings.printers?.filter(p => p.type === 'snapmaker') || [];
  const powerSettings  = appSettings.powerSettings || null;

  const handleBambuConnected = useCallback(async (auth) => {
    await saveBambuAuth(auth);
    if (!isElectron) {
      setWebDevices(auth.devices || []);
    }
  }, [saveBambuAuth, isElectron]);

  const handleDisconnectBambu = useCallback(async () => {
    if (isElectron) {
      if (window.electronAPI) await window.electronAPI.printerBambuDisconnect();
    } else {
      await apiFetch('/api/printers/bambu/disconnect', { method: 'POST' }).catch(() => {});
      setWebConn({ connected: false });
      setWebStatus({});
      setWebDevices([]);
    }
    await saveBambuAuth(null);
  }, [saveBambuAuth, isElectron]);

  const handleSaveCameraConfig = useCallback(async (serial, newIp, newCode) => {
    const cameraIps = { ...(bambuAuth?.cameraIps || {}), [serial]: { ip: newIp, accessCode: newCode } };
    await saveBambuAuth({ ...bambuAuth, cameraIps });
  }, [bambuAuth, saveBambuAuth]);

  const handleReconnectBambu = useCallback(async () => {
    if (isElectron) {
      if (window.electronAPI && bambuAuth?.accessToken) window.electronAPI.printerBambuConnect(bambuAuth);
    } else {
      if (!bambuAuth?.accessToken) return;
      await apiFetch('/api/printers/bambu/connect', {
        method: 'POST',
        body: { auth: bambuAuth },
      }).catch(() => {});
    }
  }, [bambuAuth, isElectron]);

  const handleRefreshBambu = useCallback(async (serial) => {
    if (isElectron) {
      if (window.electronAPI) window.electronAPI.printerBambuRefreshStatus(serial || null);
    } else {
      await apiFetch('/api/printers/bambu/refresh', { method: 'POST', body: { serial: serial || null } }).catch(() => {});
    }
  }, [isElectron]);

  const handleBambuPrintCmd = useCallback(async (serial, cmd) => {
    if (isElectron) {
      return window.electronAPI?.printerBambuPrintCmd(serial, cmd);
    } else {
      return apiFetch('/api/printers/bambu/print-cmd', { method: 'POST', body: { serial, cmd } }).catch(e => ({ error: e.message }));
    }
  }, [isElectron]);

  const handleSnapPrintCmd = useCallback(async (id, cmd) => {
    if (isElectron) {
      return window.electronAPI?.printerSnapPrintCmd(id, cmd);
    }
    return { error: 'Snapmaker control requires the desktop app' };
  }, [isElectron]);

  const handleRemoveSnap = useCallback(async (id) => {
    if (isElectron && window.electronAPI) window.electronAPI.printerSnapStop(id);
    const next = snapPrinters.filter(p => p.id !== id);
    await saveSnapmakerPrinters(next);
  }, [snapPrinters, saveSnapmakerPrinters, isElectron]);

  const handleSnapSaved = useCallback(async (printers, newPrinter) => {
    await saveSnapmakerPrinters(printers);
    // Start polling immediately without needing an app restart
    if (isElectron && newPrinter && window.electronAPI) {
      window.electronAPI.printerSnapStart(newPrinter);
    }
    setShowAddSnap(false);
  }, [saveSnapmakerPrinters, isElectron]);

  const handleSavePowerSettings = useCallback(async (ps) => {
    await saveAppSettings({ ...appSettings, powerSettings: ps });
  }, [appSettings, saveAppSettings]);

  const hasBambu = !!(bambuAuth?.accessToken);
  const totalPrinters = bambuDevices.length + snapPrinters.length;
  const printing = [...bambuDevices, ...snapPrinters].filter(d => {
    const key = d.dev_id || d.id;
    const s = printerStatus[key];
    return s?.gcode_state === 'RUNNING' || s?.status === 'RUNNING';
  }).length;

  return (
    <div>
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 16 }}>
          {hasBambu && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: bambuConn.connected ? 'var(--green-text, #22c55e)' : (bambuConn.connecting || bambuConn.reconnecting) ? 'var(--amber-text, #f59e0b)' : 'var(--text2)', display: 'inline-block' }} />
              Bambu Cloud {bambuConn.connected ? 'connected' : bambuConn.connecting ? 'connecting…' : bambuConn.reconnecting ? 'reconnecting…' : 'disconnected'}
              {bambuConn.error && <span style={{ color: 'var(--red-text, #ef4444)', fontSize: 11 }}> — {bambuConn.error}</span>}
            </span>
          )}
          {totalPrinters > 0 && (
            <span>{totalPrinters} printer{totalPrinters !== 1 ? 's' : ''} · {printing} printing</span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {hasBambu && bambuConn.connected && (
            <button className="btn" style={{ fontSize: 12 }} onClick={() => handleRefreshBambu(null)}>↻ Refresh all</button>
          )}
          {hasBambu && !bambuConn.connected && !bambuConn.connecting && !bambuConn.reconnecting && (
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleReconnectBambu}>Reconnect Bambu</button>
          )}
          {hasBambu && (
            <button className="btn" style={{ fontSize: 12, color: 'var(--red-text, #ef4444)' }} onClick={handleDisconnectBambu}>Disconnect</button>
          )}
          {isElectron && (
            <button className="btn" style={{ fontSize: 12 }} onClick={() => setShowAddSnap(true)}>+ Snapmaker</button>
          )}
        </div>
      </div>

      {/* Cloud camera relay — desktop only */}
      {isElectron && (
        <CloudRelayPanel appSettings={appSettings} saveAppSettings={saveAppSettings} />
      )}

      {/* Bambu login — shown when not connected */}
      {!hasBambu && (
        <BambuLogin onConnected={handleBambuConnected} isElectron={isElectron} />
      )}

      {/* Printer grid */}
      {totalPrinters > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[...bambuDevices].sort((a, b) => (a.name || a.dev_product_name || '').localeCompare(b.name || b.dev_product_name || '')).map(device => {
            const serial = device.dev_id;
            const state = printerStatus[serial];
            return (
              <PrinterCard
                key={serial}
                device={{ ...device, name: device.name || device.dev_product_name || 'Bambu Printer' }}
                state={state}
                isElectron={isElectron}
                onRefresh={() => handleRefreshBambu(serial)}
                storedIp={bambuAuth?.cameraIps?.[serial]?.ip || (typeof bambuAuth?.cameraIps?.[serial] === 'string' ? bambuAuth.cameraIps[serial] : '')}
                storedCode={bambuAuth?.cameraIps?.[serial]?.accessCode || ''}
                onSaveConfig={(newIp, newCode) => handleSaveCameraConfig(serial, newIp, newCode)}
                onPrintCmd={(cmd) => handleBambuPrintCmd(serial, cmd)}
              />
            );
          })}

          {isElectron && [...snapPrinters].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(printer => {
            const state = printerStatus[printer.id];
            return (
              <div key={printer.id} style={{ position: 'relative' }}>
                <PrinterCard
                  device={{ ...printer, dev_product_name: 'Snapmaker' }}
                  state={state}
                  isElectron={isElectron}
                  onRefresh={() => {}}
                  onPrintCmd={(cmd) => handleSnapPrintCmd(printer.id, cmd)}
                />
                <button
                  className="btn"
                  style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, color: 'var(--red-text, #ef4444)', padding: '2px 6px' }}
                  onClick={() => handleRemoveSnap(printer.id)}
                  title="Remove printer"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      {hasBambu && bambuDevices.length === 0 && snapPrinters.length === 0 && (
        <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 8 }}>
          No printers found on your Bambu account. Make sure your printers are registered in Bambu Studio / the Bambu app.
        </div>
      )}

      {/* Print history + power cost section */}
      {hasBambu && (
        <PrintHistory
          accessToken={bambuAuth?.accessToken}
          devices={bambuDevices}
          powerSettings={powerSettings}
          onSavePowerSettings={handleSavePowerSettings}
          isElectron={isElectron}
        />
      )}

      {isElectron && showAddSnap && (
        <AddSnapmakerPanel
          existingPrinters={snapPrinters}
          onSave={handleSnapSaved}
          onClose={() => setShowAddSnap(false)}
        />
      )}
    </div>
  );
}
