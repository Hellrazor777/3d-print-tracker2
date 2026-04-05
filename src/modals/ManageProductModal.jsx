import { useState } from 'react';
import { useApp, localFileUrl } from '../context/AppContext';

export default function ManageProductModal() {
  const { modal, closeModal, saveManageProduct, deleteProductPermanently, products, parts, getCategoryOrder, isElectron, appSettings } = useApp();
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
  const [partsBoxEnabled, setPartsBoxEnabled] = useState(!!prod.partsBoxEnabled);
  const [partsBox, setPartsBox] = useState(prod.partsBox || '');
  const cats = getCategoryOrder();

  const handleUploadImage = async () => {
    if (!window.electronAPI) return;
    let destFolder = '';
    if (imagePath) {
      destFolder = imagePath.replace(/[^/\\]*$/, '');
    } else if (appSettings.threeMfFolder && item) {
      destFolder = await window.electronAPI.getProductFolder(item, appSettings.threeMfFolder) || '';
    }
    const result = await window.electronAPI.uploadImage(destFolder, item + '_cover');
    const filePath = result?.destPath || result?.path;
    if (filePath) setImagePath(filePath);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    saveManageProduct({ oldName: item, newName: name.trim(), category, description, shiny, n3dUrl, designer, source, imagePath, partsBoxEnabled, partsBox: partsBox.trim() });
  };

  const handleDelete = () => {
    const partCount = parts.filter(p => p.item === item).length;
    if (confirm(`Delete "${item}" and all ${partCount} part${partCount !== 1 ? 's' : ''}? This cannot be undone.`)) {
      deleteProductPermanently(item);
    }
  };

  return (
    <div id="rename-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={e => e.stopPropagation()}>
        <div className="modal" style={{ width: 300 }}>
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
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: partsBoxEnabled ? 8 : 0 }}>
              <input type="checkbox" id="manage-parts-box" checked={partsBoxEnabled} onChange={e => setPartsBoxEnabled(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <label htmlFor="manage-parts-box" style={{ marginBottom: 0, cursor: 'pointer', fontSize: 14 }}>📦 has a parts box</label>
            </div>
            {partsBoxEnabled && (
              <input value={partsBox} onChange={e => setPartsBox(e.target.value)} placeholder="Box # or label e.g. 12" style={{ marginTop: 2 }} />
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
              <button className="btn" onClick={handleUploadImage} style={{ width: '100%' }}>
                {imagePath ? 'change photo' : 'upload photo'}
              </button>
            </div>
          )}
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <button className="btn" style={{ color: 'var(--red-text)', borderColor: 'var(--red-text)' }} onClick={handleDelete}>delete product</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={closeModal}>cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
