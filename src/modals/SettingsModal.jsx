import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function esc(s) { return String(s || ''); }

function SettingsSection({ id, collapsed, toggleSection, title, children }) {
  const isOpen = !collapsed.has(id);
  return (
    <div className={`settings-section${isOpen ? ' open' : ' collapsed'}`} id={id}>
      <div className="settings-section-label" onClick={() => toggleSection(id)}>
        <span className="ssec-chevron">▶</span>{title}
      </div>
      <div className="settings-section-content">{children}</div>
    </div>
  );
}

export default function SettingsModal() {
  const {
    closeModal, appSettings, saveAppSettings, isElectron,
    getCategoryOrder, getStorageLocations, getOutgoingDests, getBoxLocations, getLabelSize,
    addCategory, removeCategory, moveCategoryOrder, openModal,
    addStorageLocation, removeStorageLocation, moveStorageLocation,
    addOutgoingDest, removeOutgoingDest, moveOutgoingDest,
    addBoxLocation, removeBoxLocation, moveBoxLocation,
    exportData,
  } = useApp();

  const [isCloud, setIsCloud] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [dbUrl, setDbUrl] = useState(appSettings.databaseUrl || '');
  const [connectStatus, setConnectStatus] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.isUsingCloud) {
      window.electronAPI.isUsingCloud().then(v => setIsCloud(!!v));
    }
  }, []);

  const handleConnect = async () => {
    if (!dbUrl.trim()) return;
    setConnecting(true);
    setConnectStatus('connecting…');
    const r = await window.electronAPI.connectToCloud(dbUrl.trim());
    if (r.ok) {
      setIsCloud(true);
      setConnectStatus('connected ✓ — push your data below to sync');
      await saveAppSettings({ ...appSettings, databaseUrl: dbUrl.trim() });
    } else {
      setConnectStatus('error: ' + r.error);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await window.electronAPI.disconnectFromCloud();
    setIsCloud(false);
    setDbUrl('');
    setConnectStatus('disconnected');
    await saveAppSettings({ ...appSettings, databaseUrl: '' });
  };

  const [pushing, setPushing] = useState(false);
  const handlePushToCloud = async () => {
    setPushing(true);
    setPushStatus('pushing…');
    try {
      const r = await window.electronAPI.pushLocalToCloud();
      setPushStatus(r.ok ? 'pushed — reload the app to confirm' : ('error: ' + r.error));
    } finally { setPushing(false); }
  };

  const [form, setForm] = useState({
    theme: appSettings.theme || 'auto',
    threeMfFolder: appSettings.threeMfFolder || '',
    slicer: appSettings.slicer || 'bambu',
    bambuPath: appSettings.bambuPath || '',
    orcaPath: appSettings.orcaPath || '',
    invPopup: appSettings.invPopup !== false,
    n3dApiKey: appSettings.n3dApiKey || '',
    n3dAuthToken0: appSettings.n3dAuthToken0 || '',
    n3dAuthToken1: appSettings.n3dAuthToken1 || '',
  });
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ssec-collapsed') || '[]')); } catch { return new Set(); }
  });
  const [newCat, setNewCat] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newDest, setNewDest] = useState('');
  const [newBoxLetter, setNewBoxLetter] = useState('');
  const [newBoxName, setNewBoxName] = useState('');
  const [labelW, setLabelW] = useState(String(getLabelSize().width));
  const [labelH, setLabelH] = useState(String(getLabelSize().height));
  const [labelShowParts, setLabelShowParts] = useState(appSettings.labelShowParts !== false);

  const toggleSection = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('ssec-collapsed', JSON.stringify([...next]));
      return next;
    });
  };

  const handleSave = async () => {
    const w = parseFloat(labelW);
    const h = parseFloat(labelH);
    const labelSize = (w > 0 && h > 0) ? { width: w, height: h } : getLabelSize();
    await saveAppSettings({ ...appSettings, ...form, labelSize, labelShowParts });
    closeModal();
  };

  const [confirmState, setConfirmState] = useState(null);

  const SYSTEM_CATS = ['ready to build', 'printing', 'commenced'];
  const cats = getCategoryOrder().filter(c => !SYSTEM_CATS.includes(c.toLowerCase()));
  const locs = getStorageLocations();
  const dests = getOutgoingDests();
  const boxLocs = getBoxLocations();


  return (
    <div id="settings-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span className="settings-title">Settings</span>
            <button className="icon-btn settings-close-btn" onClick={closeModal}>✕</button>
          </div>
          <div className="settings-body">

            {isElectron && (
              <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-cloud" title="Cloud Sync">
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
                  Paste your <strong>Supabase connection string</strong> to sync data with the cloud web app.
                  Get it from <em>Supabase → Project Settings → Database → Connection string → URI</em>.
                </p>
                <div className="field">
                  <label>Supabase connection string {isCloud && <span style={{ color: 'var(--green)', fontSize: 11 }}>● connected</span>}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      value={dbUrl}
                      onChange={e => setDbUrl(e.target.value)}
                      placeholder="postgresql://postgres:[password]@[host]:5432/postgres"
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                    />
                    {isCloud
                      ? <button className="btn" onClick={handleDisconnect} style={{ whiteSpace: 'nowrap', color: 'var(--red-text, #ef4444)' }}>Disconnect</button>
                      : <button className="btn btn-primary" onClick={handleConnect} disabled={connecting || !dbUrl.trim()} style={{ whiteSpace: 'nowrap' }}>{connecting ? 'connecting…' : 'Connect'}</button>
                    }
                  </div>
                  {connectStatus && (
                    <p style={{ fontSize: 11, marginTop: 6, color: connectStatus.startsWith('error') ? 'var(--red-text, #ef4444)' : 'var(--green)' }}>{connectStatus}</p>
                  )}
                </div>
              </SettingsSection>
            )}

            <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-appearance" title="Appearance">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Theme</label>
                <div className="theme-toggle">
                  {['auto', 'light', 'dark'].map(t => (
                    <button key={t} className={`theme-btn${form.theme === t ? ' active' : ''}`} onClick={() => setForm(f => ({ ...f, theme: t }))}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </SettingsSection>

            <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-categories" title="Product Categories">
              {cats.map((cat, idx) => (
                <div key={cat} className="cat-row">
                  <span className="cat-row-name">{esc(cat)}</span>
                  <button className="btn cat-row-btn" disabled={idx === 0} onClick={() => moveCategoryOrder(cat, 'up')}>↑</button>
                  <button className="btn cat-row-btn" disabled={idx === cats.length - 1} onClick={() => moveCategoryOrder(cat, 'down')}>↓</button>
                  <button className="btn cat-row-btn" onClick={() => openModal('rename-cat', { oldName: cat, mode: 'category', title: 'Rename Category' })}>Rename</button>
                  <button className="btn cat-row-btn cat-row-del" onClick={() => setConfirmState({ message: `Remove category "${cat}" from all products?`, confirmLabel: 'remove', danger: true, onConfirm: () => { setConfirmState(null); removeCategory(cat); } })}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && newCat.trim() && !SYSTEM_CATS.includes(newCat.trim().toLowerCase())) { addCategory(newCat.trim()); setNewCat(''); } }} />
                <button className="btn btn-primary" onClick={() => { if (newCat.trim() && !SYSTEM_CATS.includes(newCat.trim().toLowerCase())) { addCategory(newCat.trim()); setNewCat(''); } }}>Add</button>
              </div>
              {SYSTEM_CATS.includes(newCat.trim().toLowerCase()) && (
                <p style={{ fontSize: 11, color: 'var(--amber-text)', marginTop: 4 }}>"{newCat.trim()}" is a system section and can't be used as a category.</p>
              )}
            </SettingsSection>

            {isElectron && (
              <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-3mf" title="3MF Files">
                <div className="field">
                  <label>Root folder</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={form.threeMfFolder || ''} readOnly placeholder="No folder selected" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} />
                    <button className="btn" onClick={async () => { if (window.electronAPI?.pick3mfFolder) { const f = await window.electronAPI.pick3mfFolder(); if (f) setForm(x => ({ ...x, threeMfFolder: f })); } }}>Browse</button>
                  </div>
                </div>
                <div className="field">
                  <label>N3D session token 0 <span className="settings-hint">(sb-n3d-auth-token.0 cookie — for 3MF downloads)</span></label>
                  <input
                    type="password"
                    value={form.n3dAuthToken0 || ''}
                    onChange={e => setForm(f => ({ ...f, n3dAuthToken0: e.target.value }))}
                    placeholder="Paste from browser DevTools → Application → Cookies"
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>N3D session token 1 <span className="settings-hint">(sb-n3d-auth-token.1 cookie — for 3MF downloads)</span></label>
                  <input
                    type="password"
                    value={form.n3dAuthToken1 || ''}
                    onChange={e => setForm(f => ({ ...f, n3dAuthToken1: e.target.value }))}
                    placeholder="Paste from browser DevTools → Application → Cookies"
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
              </SettingsSection>
            )}

            {isElectron && (
              <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-slicer" title="Slicer">
                <div className="field">
                  <label>Default slicer</label>
                  <select value={form.slicer || 'bambu'} onChange={e => setForm(f => ({ ...f, slicer: e.target.value }))}>
                    <option value="bambu">Bambu Studio</option>
                    <option value="orca">Orca Slicer</option>
                  </select>
                </div>
                <div className="field">
                  <label>Bambu Studio path <span className="settings-hint">(leave blank for default)</span></label>
                  <input value={form.bambuPath || ''} onChange={e => setForm(f => ({ ...f, bambuPath: e.target.value }))} placeholder="C:\Program Files\Bambu Studio\bambu-studio.exe" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Orca Slicer path <span className="settings-hint">(leave blank for default)</span></label>
                  <input value={form.orcaPath || ''} onChange={e => setForm(f => ({ ...f, orcaPath: e.target.value }))} placeholder="C:\Program Files\OrcaSlicer\orca-slicer.exe" />
                </div>
              </SettingsSection>
            )}

            <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-inventory" title="Inventory">
              <div className="field" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id="s-inv-popup" checked={form.invPopup !== false} onChange={e => setForm(f => ({ ...f, invPopup: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="s-inv-popup" style={{ marginBottom: 0, cursor: 'pointer', fontSize: 14 }}>Show <strong>+ inv</strong> button on product cards</label>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, marginLeft: 26 }}>When off, the button is hidden from all product cards</div>
              </div>

              <div className="field">
                <label>Storage locations</label>
                {locs.map((loc, idx) => (
                  <div key={loc} className="cat-row">
                    <span className="cat-row-name">{esc(loc)}</span>
                    <button className="btn cat-row-btn" disabled={idx === 0} onClick={() => moveStorageLocation(loc, 'up')}>↑</button>
                    <button className="btn cat-row-btn" onClick={() => openModal('rename-cat', { oldName: loc, mode: 'storage', title: 'Rename Location' })}>Rename</button>
                    <button className="btn cat-row-btn cat-row-del" disabled={locs.length <= 1} onClick={() => setConfirmState({ message: `Remove "${loc}"?`, confirmLabel: 'remove', danger: true, onConfirm: () => { setConfirmState(null); removeStorageLocation(loc); } })}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="New location name" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && newLoc.trim()) { addStorageLocation(newLoc.trim()); setNewLoc(''); } }} />
                  <button className="btn btn-primary" onClick={() => { if (newLoc.trim()) { addStorageLocation(newLoc.trim()); setNewLoc(''); } }}>Add</button>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Outgoing destinations</label>
                {dests.map((dest, idx) => (
                  <div key={dest} className="cat-row">
                    <span className="cat-row-name">{esc(dest)}</span>
                    <button className="btn cat-row-btn" disabled={idx === 0} onClick={() => moveOutgoingDest(idx, 'up')}>↑</button>
                    <button className="btn cat-row-btn" onClick={() => openModal('rename-cat', { oldName: dest, idx, mode: 'dest', title: 'Rename Destination' })}>Rename</button>
                    <button className="btn cat-row-btn cat-row-del" onClick={() => setConfirmState({ message: `Remove destination "${dest}"?`, confirmLabel: 'remove', danger: true, onConfirm: () => { setConfirmState(null); removeOutgoingDest(dest); } })}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={newDest} onChange={e => setNewDest(e.target.value)} placeholder="New destination name" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && newDest.trim()) { addOutgoingDest(newDest.trim()); setNewDest(''); } }} />
                  <button className="btn btn-primary" onClick={() => { if (newDest.trim()) { addOutgoingDest(newDest.trim()); setNewDest(''); } }}>Add</button>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection collapsed={collapsed} toggleSection={toggleSection} id="ssec-partsbox" title="📦 Parts Box Labels">
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
                Named storage locations — each gets a letter used in box codes (e.g. <strong>A</strong> → A1, A2…).
                Click a box badge on any product card to preview and print its label.
              </p>

              <div className="field">
                <label>Locations</label>
                {boxLocs.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 8 }}>No locations yet — add one below.</p>
                )}
                {boxLocs.map((loc, idx) => (
                  <div key={loc.letter} className="cat-row">
                    <span className="cat-row-name" style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 20 }}>{esc(loc.letter)}</span>
                    <span className="cat-row-name" style={{ flex: 1 }}>{esc(loc.name)}</span>
                    <button className="btn cat-row-btn" disabled={idx === 0} onClick={() => moveBoxLocation(loc.letter, 'up')}>↑</button>
                    <button className="btn cat-row-btn" disabled={idx === boxLocs.length - 1} onClick={() => moveBoxLocation(loc.letter, 'down')}>↓</button>
                    <button className="btn cat-row-btn cat-row-del" onClick={() => setConfirmState({ message: `Remove location "${loc.letter} — ${loc.name}"?`, confirmLabel: 'remove', danger: true, onConfirm: () => { setConfirmState(null); removeBoxLocation(loc.letter); } })}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    value={newBoxLetter}
                    onChange={e => setNewBoxLetter(e.target.value.slice(0, 1).toUpperCase())}
                    placeholder="A"
                    maxLength={1}
                    style={{ width: 40, textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700, textAlign: 'center' }}
                  />
                  <input
                    value={newBoxName}
                    onChange={e => setNewBoxName(e.target.value)}
                    placeholder="Location name (e.g. Drawer 1)"
                    style={{ flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newBoxLetter.trim() && newBoxName.trim()) {
                        addBoxLocation(newBoxLetter.trim(), newBoxName.trim());
                        setNewBoxLetter(''); setNewBoxName('');
                      }
                    }}
                  />
                  <button className="btn btn-primary" onClick={() => {
                    if (newBoxLetter.trim() && newBoxName.trim()) {
                      addBoxLocation(newBoxLetter.trim(), newBoxName.trim());
                      setNewBoxLetter(''); setNewBoxName('');
                    }
                  }}>Add</button>
                </div>
                {boxLocs.some(l => l.letter === newBoxLetter.toUpperCase()) && newBoxLetter && (
                  <p style={{ fontSize: 11, color: 'var(--amber-text)', marginTop: 4 }}>Letter "{newBoxLetter}" is already used.</p>
                )}
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Label size (inches)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>W</span>
                    <input
                      type="number" step="0.05" min="0.5" max="8"
                      value={labelW}
                      onChange={e => setLabelW(e.target.value)}
                      style={{ width: 70 }}
                    />
                  </div>
                  <span style={{ color: 'var(--text3)' }}>×</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>H</span>
                    <input
                      type="number" step="0.05" min="0.5" max="8"
                      value={labelH}
                      onChange={e => setLabelH(e.target.value)}
                      style={{ width: 70 }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>in</span>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => { setLabelW('2.25'); setLabelH('1.25'); }}>Reset</button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Default: 2.25 × 1.25 in (standard Dymo label). Changes saved with Settings.</p>
              </div>

              <div className="field" style={{ marginBottom: 0, marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={labelShowParts} onChange={e => setLabelShowParts(e.target.checked)} />
                  Show parts list on label
                </label>
                <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>When on, you can choose which parts to include each time you print a label.</p>
              </div>
            </SettingsSection>

          </div>
          <div className="settings-footer">
            <button className="btn" onClick={() => openModal('filament-library')} style={{ marginRight: 'auto' }}>📚 Filament Library</button>
            <button className="btn" onClick={() => { openModal('import', { mode: 'import' }); }}>↑ Import CSV</button>
            <button className="btn" onClick={exportData}>↓ Export CSV</button>
            {isElectron && isCloud && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pushStatus && <span style={{ fontSize: 11, color: pushStatus.startsWith('error') ? 'var(--red-text, #ef4444)' : 'var(--text2)' }}>{pushStatus}</span>}
                <button className="btn" onClick={handlePushToCloud} disabled={pushing} title="Overwrite Supabase with your local data.json">{pushing ? 'pushing…' : '↑ Push local to cloud'}</button>
              </div>
            )}
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
      {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
    </div>
  );
}
