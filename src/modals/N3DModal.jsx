import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { n3dRequest } from '../lib/n3dClient';

function esc(s) { return String(s || ''); }

function n3dColour(name) {
  if (!name) return '#888888';
  const n = name.toLowerCase();
  const map = {
    'black':'#1a1a1a','white':'#f0f0f0','red':'#e63946','blue':'#4a90d9','yellow':'#f4c542',
    'green':'#639922','orange':'#f4833d','purple':'#7c6be0','pink':'#e98bbd','brown':'#8b5e3c',
    'grey':'#888888','gray':'#888888','silver':'#c0c0c0','gold':'#d4af37','cyan':'#22b8cf',
    'teal':'#1d9e75','navy':'#1a3a5c','cream':'#f5f0e8','beige':'#d4b896','coral':'#d85a30',
    'lime':'#7ab83a','sakura':'#f4a7b9','indigo':'#534ab7','violet':'#7f77dd','magenta':'#d4537e',
    'caramel':'#c47c2b','charcoal':'#3d3d3d','desert':'#c2955d','tan':'#c2955d',
    'ivory':'#f0ead6','lilac':'#b39ddb','rose':'#e8758a','mint':'#7dc49a',
    'sky':'#7eb9e0','copper':'#b87333','bronze':'#cd7f32','amber':'#e6a817',
    'olive':'#7a8c2a','slate':'#6d8299','mustard':'#d4a017','terracotta':'#c4622d',
    'sand':'#c8b06a','peach':'#f4a460','lavender':'#9b8ec4','turquoise':'#2ab0b0',
    'maroon':'#7d1a1a','forest':'#2d6a2d','matte':'#888888','pastel':'#b8d4e8',
  };
  for (const [k, v] of Object.entries(map)) { if (n.includes(k)) return v; }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return '#' + ((h & 0xffffff) | 0x404040).toString(16).padStart(6, '0').slice(0, 6);
}

export default function N3DModal() {
  const { closeModal, isElectron, products, getCategoryOrder, importData, appSettings, saveAppSettings, setProductImagePath, addProduct3mfFiles } = useApp();

  const [apiKey, setApiKey] = useState(() => appSettings.n3dApiKey || '');
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState({ msg: '', type: '' });
  const [designs, setDesigns] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDesigns, setTotalDesigns] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  /** @see https://www.n3dmelbourne.com/llms.txt — API: category standard | character; profile ams | split */
  const [category, setCategory] = useState('');
  const [profile, setProfile] = useState('ams');
  const [colourMode, setColourMode] = useState('together');
  const [importCat, setImportCat] = useState('');
  const [selected, setSelected] = useState(new Set()); // Set of slugs
  const designCache = useRef(new Map()); // slug → design object
  const searchTimer = useRef(null);
  const loadPageRef = useRef(async () => {});
  const initialSavedN3dKeyRef = useRef(null);
  if (initialSavedN3dKeyRef.current === null) {
    initialSavedN3dKeyRef.current = (appSettings.n3dApiKey || '').trim();
  }

  const cats = getCategoryOrder();

  const n3dFetch = useCallback(async (path, method = 'GET', body = null) => {
    return n3dRequest(apiKey.trim(), path, method, body);
  }, [apiKey]);

  const showStatus = (msg, type) => setStatus({ msg, type });

  const loadPage = useCallback(async (p) => {
    if (p < 1) return;
    setLoading(true);
    setPage(p);
    const prof = profile === 'split' ? 'split' : 'ams';
    let path = `/designs?page=${p}&limit=100&profile=${prof}&include=details&locale=AU`;
    if (search.trim()) path += `&query=${encodeURIComponent(search.trim())}`;
    if (category === 'standard' || category === 'character') path += `&category=${category}`;
    const res = await n3dFetch(path);
    setLoading(false);
    if (!res.ok) { showStatus('error: ' + res.error, 'err'); setDesigns([]); return; }
    const { data, pagination } = res.data;
    const tp = Math.max(1, pagination?.total_pages || 1);
    setTotalPages(tp);
    setTotalDesigns(pagination?.total ?? 0);
    const rows = Array.isArray(data) ? data : [];
    rows.forEach(d => designCache.current.set(d.slug, d));
    setDesigns(rows);
    if (p > tp) setPage(tp);
  }, [n3dFetch, profile, search, category]);

  loadPageRef.current = loadPage;

  const connect = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    showStatus('connecting...', 'info');
    const res = await n3dFetch('/version');
    if (!res.ok) { showStatus('could not connect: ' + res.error, 'err'); return; }
    await saveAppSettings({ ...appSettings, n3dApiKey: key });
    showStatus('', '');
    setConnected(true);
    loadPage(1);
  }, [apiKey, appSettings, loadPage, n3dFetch, saveAppSettings]);

  // Auto-connect once if settings already contained a key on first open (Strict Mode–safe)
  useEffect(() => {
    const saved = initialSavedN3dKeyRef.current || '';
    if (!saved) return undefined;
    let cancelled = false;
    (async () => {
      showStatus('connecting...', 'info');
      const res = await n3dRequest(saved, '/version', 'GET', null);
      if (cancelled) return;
      if (!res.ok) {
        showStatus('could not connect: ' + res.error, 'err');
        return;
      }
      showStatus('', '');
      setConnected(true);
      await loadPageRef.current(1);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadPage(1), 400);
  };

  const toggleSelect = (slug) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => {
      const allSlugs = designs.map(d => d.slug);
      const allSelected = allSlugs.every(s => prev.has(s));
      const next = new Set(prev);
      if (allSelected) { allSlugs.forEach(s => next.delete(s)); }
      else { allSlugs.forEach(s => next.add(s)); }
      return next;
    });
  };

  const doImport = async () => {
    if (!selected.size) return;
    const selectedDesigns = [...selected].map(slug => designCache.current.get(slug)).filter(Boolean);
    const newParts = [];
    const newProducts = {};
    const base = Date.now();

    selectedDesigns.forEach((d, di) => {
      const filaments = d.filaments || [];
      const productName = d.title;
      const isNewProduct = !products[productName];
      if (isNewProduct) {
        newProducts[productName] = {
          category: importCat || d.category || '',
          n3dUrl: d.slug ? 'https://www.n3dmelbourne.com/design/' + d.slug : '',
          designer: 'N3D Melbourne',
          source: 'n3d-membership',
        };
      }

      // Desktop file downloads — folder is always resolved so 3MFs are fetched
      // even when re-importing a product that already exists in the tracker
      if (isElectron && appSettings.threeMfFolder) {
        window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder).then(async folder => {
          if (!folder) return;
          // Cover image — only needed once for new products
          if (isNewProduct && d.image_url) {
            const ext = d.image_url.split('.').pop().split('?')[0] || 'webp';
            const result = await window.electronAPI.downloadImage(d.image_url, folder, 'cover.' + ext);
            if (result?.ok && result.destPath) {
              await setProductImagePath(productName, result.destPath);
            }
          }
          // 3MF profiles — always attempt so new/renamed files on the site are fetched
          // API returns `profiles` as an array; derive count from it
          const profileCount = Array.isArray(d.profiles) ? d.profiles.length : (typeof d.profiles === 'number' ? d.profiles : 0);
          const tok0 = appSettings.n3dAuthToken0;
          const tok1 = appSettings.n3dAuthToken1;
          if (tok0 && tok1 && profileCount > 0) {
            window.electronAPI.downloadN3dFiles(d.slug, profileCount, folder, tok0, tok1).then(r => {
              if (r?.error === 'AUTH_INVALID') {
                showStatus('3MF auth tokens invalid — update them in Settings → 3MF Files', 'err');
              } else if (r?.ok && r.files?.length) {
                addProduct3mfFiles(productName, r.files);
              }
            });
          }
        });
      }

      if (filaments.length === 0) {
        newParts.push({ id: base + di * 100, name: productName, item: productName, variant: '', desc: d.pokemon?.description || '', colour: '#888888', colourName: '', stl: d.slug + '.3mf', qty: 1, printed: 0, status: 'queue', reprints: 0 });
      } else if (colourMode === 'together') {
        const primary = filaments[0];
        const colour = n3dColour(primary.color);
        newParts.push({ id: base + di * 100, name: productName, item: productName, variant: '', desc: d.pokemon?.description || '', colour, colourName: primary.color, colourSwatch: primary.img_swatch || '', stl: d.slug + '.3mf', qty: 1, printed: 0, status: 'queue', reprints: 0 });
      } else {
        filaments.forEach((f, fi) => {
          const colour = n3dColour(f.color);
          newParts.push({ id: base + di * 100 + fi, name: `${d.title} — ${f.color}`, item: productName, variant: '', desc: '', colour, colourName: f.color, colourSwatch: f.img_swatch || '', stl: d.slug + '.3mf', qty: 1, printed: 0, status: 'queue', reprints: 0 });
        });
      }
    });

    await importData(newParts, newProducts);
    const added = newParts.length;
    showStatus(`${added} part${added !== 1 ? 's' : ''} added across ${selectedDesigns.length} design${selectedDesigns.length !== 1 ? 's' : ''}!`, 'ok');
    setSelected(new Set());
    loadPage(page);
  };

  return (
    <div id="n3d-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 780, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }} onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span className="settings-title">N3D Melbourne</span>
            <button className="icon-btn settings-close-btn" onClick={closeModal}>✕</button>
          </div>

          {/* API Key row */}
          <div style={{ padding: '12px 20px', borderBottom: '0.5px solid var(--border2)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="N3D API key"
              type="password"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              onKeyDown={e => { if (e.key === 'Enter') connect(); }}
            />
            <button className="btn btn-primary" onClick={connect}>
              {connected ? 'Reconnect' : 'Connect'}
            </button>
            {!isElectron && (
              <span style={{ fontSize: 11, color: 'var(--text2)' }} title="Cover images save to disk in the desktop app only">
                Web — import works; local cover images: desktop only
              </span>
            )}
          </div>

          {status.msg && (
            <div className={`import-status ${status.type}`} style={{ margin: '8px 20px 0' }}>{status.msg}</div>
          )}

          {connected && (
            <>
              {/* Search / filter bar */}
              <div style={{ padding: '10px 20px', borderBottom: '0.5px solid var(--border2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={search}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search designs…"
                  style={{ flex: 1, minWidth: 140 }}
                />
                <select value={category} onChange={e => { setCategory(e.target.value); loadPage(1); }} style={{ minWidth: 140 }} title="N3D API category filter">
                  <option value="">All categories</option>
                  <option value="standard">Standard</option>
                  <option value="character">Character</option>
                </select>
                <select value={profile} onChange={e => { setProfile(e.target.value); loadPage(1); }} style={{ minWidth: 160 }} title="Print profile for listings (AMS vs split)">
                  <option value="ams">AMS (multi-material)</option>
                  <option value="split">Split (single extruder)</option>
                </select>
                <a href="https://www.n3dmelbourne.com/resources/docs/designs-api" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text2)', alignSelf: 'center' }}>API docs</a>
              </div>

              {/* Grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', fontSize: 13, color: 'var(--text2)' }}>loading…</div>
                ) : designs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', fontSize: 13, color: 'var(--text2)' }}>no designs found</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {designs.map(d => {
                      const sel = selected.has(d.slug);
                      const inTracker = !!products[d.title];
                      const swatches = (d.filaments || []).slice(0, 6).map(f =>
                        f.img_swatch
                          ? <img key={f.color} src={f.img_swatch} style={{ width: 13, height: 13, borderRadius: '50%', objectFit: 'cover', border: '0.5px solid rgba(0,0,0,.15)', flexShrink: 0 }} title={esc(f.color)} />
                          : <span key={f.color} style={{ width: 13, height: 13, borderRadius: '50%', background: n3dColour(f.color), border: '0.5px solid rgba(0,0,0,.2)', display: 'inline-block', flexShrink: 0 }} title={esc(f.color)} />
                      );

                      return (
                        <div
                          key={d.slug}
                          onClick={() => toggleSelect(d.slug)}
                          style={{ background: 'var(--bg)', border: sel ? '2px solid #378add' : '0.5px solid var(--border2)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer', transition: 'border-color .12s', position: 'relative' }}
                        >
                          <div style={{ position: 'relative' }}>
                            {d.image_url
                              ? <img src={d.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', background: 'var(--bg2)' }} loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
                              : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text3)' }}>no image</div>
                            }
                            {d.entitled === false && <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4 }}>🔒 not owned</div>}
                            {d.entitled === true && <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(30,100,20,.75)', color: '#c8f0a0', fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4 }}>✓ owned</div>}
                            {inTracker && <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(20,60,120,.75)', color: '#aad4f5', fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4 }}>✓ in tracker</div>}
                          </div>
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: sel ? 'var(--info-text)' : 'var(--text)', lineHeight: 1.3 }}>{esc(d.title)}</div>
                              {sel && <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--info-bg)', border: '2px solid #378add', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#0c447c', flexShrink: 0 }}>✓</div>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                              {d.print_time || ''}{d.total_weight_grams ? ` · ${d.total_weight_grams.toFixed(1)}g` : ''}
                            </div>
                            {swatches.length > 0 && <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>{swatches}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 20px', borderTop: '0.5px solid var(--border2)', fontSize: 12, color: 'var(--text2)' }}>
                  <button className="btn" disabled={page <= 1} onClick={() => loadPage(page - 1)}>← Prev</button>
                  <span>page {page} of {totalPages} · {totalDesigns} designs</span>
                  <button className="btn" disabled={page >= totalPages} onClick={() => loadPage(page + 1)}>Next →</button>
                </div>
              )}

              {/* Selection bar */}
              {selected.size > 0 && (
                <div style={{ padding: '10px 20px', borderTop: '0.5px solid var(--border2)', background: 'var(--info-bg)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--info-text)', flex: 1 }}>
                    {selected.size} design{selected.size !== 1 ? 's' : ''} selected
                  </span>
                  <select value={importCat} onChange={e => setImportCat(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Category (optional)</option>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={colourMode} onChange={e => setColourMode(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="together">One part (primary colour)</option>
                    <option value="split">One part per colour</option>
                  </select>
                  <button className="btn btn-primary" onClick={doImport}>Import selected</button>
                </div>
              )}

              {/* Bottom bar */}
              <div style={{ padding: '10px 20px', borderTop: selected.size > 0 ? 'none' : '0.5px solid var(--border2)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" onClick={selectAll} style={{ fontSize: 12 }}>
                  {designs.length > 0 && designs.every(d => selected.has(d.slug)) ? 'Deselect all' : 'Select all on page'}
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn" onClick={closeModal}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
