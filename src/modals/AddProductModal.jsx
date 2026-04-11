import { useState } from 'react';
import { useApp, localFileUrl } from '../context/AppContext';

export default function AddProductModal() {
  const { closeModal, saveAddProduct, getCategoryOrder, isElectron, products, appSettings } = useApp();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [shiny, setShiny] = useState(false);
  const [designer, setDesigner] = useState('');
  const [source, setSource] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [showDupWarning, setShowDupWarning] = useState(false);
  const cats = getCategoryOrder();

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (products[trimmed] !== undefined) {
      setShowDupWarning(true);
      return;
    }
    saveAddProduct({ name: trimmed, category, description, shiny, designer, source, imagePath });
  };

  const handleConfirmDup = () => {
    setShowDupWarning(false);
    saveAddProduct({ name: name.trim(), category, description, shiny, designer, source, imagePath });
  };

  const handleUploadImage = async () => {
    if (!window.electronAPI) return;
    let destFolder = '';
    if (appSettings.threeMfFolder && name.trim()) {
      destFolder = await window.electronAPI.getProductFolder(name.trim(), appSettings.threeMfFolder) || '';
    }
    const result = await window.electronAPI.uploadImage(destFolder, name.trim() + '_cover');
    const filePath = result?.destPath || result?.path;
    if (filePath) setImagePath(filePath);
  };

  return (
    <div id="add-product-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 360, position: 'relative' }} onClick={e => e.stopPropagation()}>
          <h3>Add Product</h3>
          <div className="field"><label>product name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pikachu V3" autoFocus /></div>
          <div className="field">
            <label>category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— no category —</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>description</label><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="notes about this product..." style={{ minHeight: 60 }} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="ap-shiny" checked={shiny} onChange={e => setShiny(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="ap-shiny" style={{ marginBottom: 0, cursor: 'pointer', fontSize: 14 }}>✨ shiny variant</label>
          </div>
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
              <label>product image</label>
              {localFileUrl(imagePath) && <div style={{ marginBottom: 8 }}><img src={localFileUrl(imagePath)} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--border2)' }} alt="" /></div>}
              <button className="btn" onClick={handleUploadImage} style={{ width: '100%' }}>upload image</button>
            </div>
          )}
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>create product</button>
          </div>
          {showDupWarning && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16, zIndex: 10 }}>
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div style={{ fontWeight: 600, fontSize: 15, textAlign: 'center' }}>"{name.trim()}" is already in the tracker</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Are you sure you want to add it again?</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn" onClick={() => setShowDupWarning(false)}>cancel</button>
                <button className="btn btn-primary" onClick={handleConfirmDup}>add anyway</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
