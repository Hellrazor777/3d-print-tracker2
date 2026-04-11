import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function AddInventoryModal() {
  const { closeModal, addInventoryManual } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [cat, setCat] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    addInventoryManual(name.trim(), parseInt(qty) || 0, cat.trim());
    closeModal();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={closeModal}>
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: 320, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>add to inventory</h3>
          <div className="field"><label>product name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pikachu V3" autoFocus /></div>
          <div className="field"><label>quantity on hand</label><input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div className="field"><label>category</label><input value={cat} onChange={e => setCat(e.target.value)} placeholder="e.g. character" /></div>
          <div className="modal-footer">
            <button className="btn" type="button" onClick={closeModal}>cancel</button>
            <button className="btn btn-primary" type="submit">add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
