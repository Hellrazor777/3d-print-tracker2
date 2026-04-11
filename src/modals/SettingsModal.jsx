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
    getCategoryOrder, getStorageLocations, getOutgoingDests,
    addCategory, removeCategory, moveCategoryOrder, openModal,
    addStorageLocation, removeStorageLocation, moveStorageLocation,
    addOutgoingDest, removeOutgoingDest, moveOutgoingDest,
  } = useApp();

  const [isCloud, setIsCloud] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  useEffect(() => {
    if (window.electronAPI?.isUsingCloud) {
      window.electronAPI.isUsingCloud().then(v => setIsCloud(!!v));
    }
  }, []);

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

  const toggleSection = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('ssec-collapsed', JSON.stringify([...next]));
      return next;
    });
  };

  const handleSave = async () => {
    await saveAppSettings({ ...appSettings, ...form });
    closeModal();
  };

  const [confirmState, setConfirmState] = useState(null);

  const SYSTEM_CATS = ['ready to build', 'printing', 'commenced'];
  const cats = getCategoryOrder().filter(c => !SYSTEM_CATS.includes(c.toLowerCase()));
  const locs = getStorageLocations();
  const dests = getOutgoingDests();


  return (
    <div id="settings-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span className="settings-title">Settings</span>
            <button className="icon-btn settings-close-btn" onClick={closeModal}>✕</button>
          </div>
          <div className="settings-body">

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

          </div>
          <div className="settings-footer">
            <button className="btn" onClick={() => openModal('filament-library')} style={{ marginRight: 'auto' }}>📚 Filament Library</button>
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
