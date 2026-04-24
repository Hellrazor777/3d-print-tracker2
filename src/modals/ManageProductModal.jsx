import { useState } from 'react';
import { useApp, localFileUrl } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function esc(s) { return String(s || ''); }

// Compute next box code given a letter, considering all currently-used codes
// plus any boxes already added locally in this modal session.
function nextCodeForLetter(letter, globalCodes, localBoxes, currentProductOldCodes) {
  const L = letter.toUpperCase();
  // Exclude the current product's old codes (they will be replaced on save)
  const effective = globalCodes.filter(c => !currentProductOldCodes.includes(c));
  const allCodes = [...effective, ...localBoxes.map(b => b.code)];
  const nums = allCodes
    .filter(c => c && c.toUpperCase().startsWith(L))
    .map(c => parseInt(c.slice(L.length)))
    .filter(n => Number.isFinite(n) && n > 0);
  return L + ((nums.length ? Math.max(...nums) : 0) + 1);
}

export default function ManageProductModal() {
  const {
    modal, closeModal, saveManageProduct, deleteProductPermanently,
    products, parts, getCategoryOrder, getBoxLocations, getAllPartsBoxCodes,
    isElectron, appSettings, openModal,
  } = useApp();
  const item = modal?.item || '';
  const prod = products[item] || {};
  const [name, setName] = useState(item);
  const [category, setCategory] = useState(prod.category || '');
  const [description, setDescription] = useState(prod.description || '');
  const [shiny, setShiny] = useState(!!prod.shiny);
  const [n3dUrl, setN3dUrl] = useState(prod.n3dUrl || '');
  const [designer, setDesigner] = useState(prod.designer || '');
  const [source, setSource] = useState(prod.source || '');
  const [imagePath, setImagePath] = useState(prod.imagePath || '');

  // Multi-box state — initialised from saved data (support legacy single-box too)
  const initBoxes = () => {
    if (prod.partsBoxes?.length) return prod.partsBoxes;
    // Migrate legacy single-box data
    if (prod.partsBoxEnabled && prod.partsBox) {
      return [{ code: prod.partsBox, locationLetter: prod.partsBox[0] || 'A' }];
    }
    return [];
  };
  const [partsBoxes, setPartsBoxes] = useState(initBoxes);
  const [newBoxLetter, setNewBoxLetter] = useState('');

  const cats = getCategoryOrder();
  const boxLocations = getBoxLocations();

  const handleAddBox = () => {
    if (!newBoxLetter) return;
    const globalCodes = getAllPartsBoxCodes();
    const currentProductOldCodes = (prod.partsBoxes || []).map(b => b.code);
    const code = nextCodeForLetter(newBoxLetter, globalCodes, partsBoxes, currentProductOldCodes);
    setPartsBoxes(prev => [...prev, { code, locationLetter: newBoxLetter.toUpperCase() }]);
    setNewBoxLetter('');
  };

  const handleRemoveBox = (code) => {
    setPartsBoxes(prev => prev.filter(b => b.code !== code));
  };

  const [uploadingImage, setUploadingImage] = useState(false);
  const handleUploadImage = async () => {
    if (!window.electronAPI) return;
    setUploadingImage(true);
    try {
      let destFolder = '';
      if (imagePath) {
        destFolder = imagePath.replace(/[^/\\]*$/, '');
      } else if (appSettings.threeMfFolder && item) {
        destFolder = await window.electronAPI.getProductFolder(item, appSettings.threeMfFolder) || '';
      }
      const result = await window.electronAPI.uploadImage(destFolder, item + '_cover');
      const filePath = result?.destPath || result?.path;
      if (filePath) setImagePath(filePath);
    } finally { setUploadingImage(false); }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    saveManageProduct({ oldName: item, newName: name.trim(), category, description, shiny, n3dUrl, designer, source, imagePath, partsBoxes });
  };

  const [confirmState, setConfirmState] = useState(null);

  const handleDelete = () => {
    const partCount = parts.filter(p => p.item === item).length;
    setConfirmState({
      message: `Delete "${item}" and all ${partCount} part${partCount !== 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'delete',
      danger: true,
      onConfirm: () => { setConfirmState(null); deleteProductPermanently(item); },
    });
  };

  const locationName = (letter) => boxLocations.find(l => l.letter === letter)?.name || letter;

  return (
    <div id="rename-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
          <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <h3>Manage Product</h3>
          <div className="field"><label>product name</label><input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
          <div className="field">
            <label>category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— no category —</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>description</label><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="notes about this product..." style={{ minHeight: 60 }} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="manage-shiny" checked={shiny} onChange={e => setShiny(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="manage-shiny" style={{ marginBottom: 0, cursor: 'pointer', fontSize: 14 }}>✨ shiny variant</label>
          </div>

          {/* ── Parts Boxes ── */}
          <div className="field">
            <label style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📦 Parts boxes</span>
              {partsBoxes.length > 0 && <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{partsBoxes.length} box{partsBoxes.length !== 1 ? 'es' : ''}</span>}
            </label>

            {partsBoxes.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {partsBoxes.map(box => (
                  <div key={box.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, minWidth: 36 }}>{esc(box.code)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{esc(locationName(box.locationLetter))}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ fontSize: 11, color: 'var(--text3)' }}
                      title="remove this box"
                      onClick={() => handleRemoveBox(box.code)}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {boxLocations.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={newBoxLetter}
                  onChange={e => setNewBoxLetter(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <option value="">— pick location —</option>
                  {boxLocations.map(loc => (
                    <option key={loc.letter} value={loc.letter}>
                      {loc.letter} — {loc.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!newBoxLetter}
                  onClick={handleAddBox}
                  style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                >+ Add box</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>No locations set up yet.</span>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => { closeModal(); openModal('settings'); }}
                >Open Settings</button>
              </div>
            )}
          </div>

          <div className="field"><label>N3D website URL (optional)</label><input value={n3dUrl} onChange={e => setN3dUrl(e.target.value)} placeholder="https://www.n3dmelbourne.com/designs/..." /></div>
          <div className="field"><label>designer</label><input value={designer} onChange={e => setDesigner(e.target.value)} placeholder="e.g. N3D Melbourne" /></div>
          <div className="field">
            <label>source</label>
            <select value={source} onChange={e => setSource(e.target.value)}>
              <option value="">— select source —</option>
              <option value="n3d-membership">N3D Membership</option>
              <option value="thangs">Thangs</option>
              <option value="makersworld">MakersWorld</option>
              <option value="other">Other</option>
            </select>
          </div>
          {isElectron && (
            <div className="field">
              <label>product photo</label>
              {localFileUrl(imagePath) && (
                <div style={{ marginBottom: 8 }}>
                  <img src={localFileUrl(imagePath)} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--border2)' }} alt="" />
                </div>
              )}
              <button className="btn" type="button" onClick={handleUploadImage} disabled={uploadingImage} style={{ width: '100%' }}>
                {uploadingImage ? 'uploading…' : (imagePath ? 'change photo' : 'upload photo')}
              </button>
            </div>
          )}
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <button className="btn" type="button" style={{ color: 'var(--red-text)', borderColor: 'var(--red-text)' }} onClick={handleDelete}>delete product</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="button" onClick={closeModal}>cancel</button>
              <button className="btn btn-primary" type="submit">save</button>
            </div>
          </div>
          </form>
        </div>
      </div>
      {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
    </div>
  );
}
