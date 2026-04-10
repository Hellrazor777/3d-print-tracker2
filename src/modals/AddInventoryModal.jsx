import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ModalShell from '../components/ModalShell';

export default function AddInventoryModal() {
  const { closeModal, addInventoryManual } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [cat, setCat] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    await addInventoryManual(name.trim(), parseInt(qty) || 0, cat.trim());
  };

  return (
    <ModalShell onClose={closeModal} width={320}>
      <h3>add to inventory</h3>
      <div className="field"><label>product name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pikachu V3" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} /></div>
      <div className="field"><label>quantity on hand</label><input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} /></div>
      <div className="field"><label>category</label><input value={cat} onChange={e => setCat(e.target.value)} placeholder="e.g. character" /></div>
      <div className="modal-footer">
        <button className="btn" onClick={closeModal}>cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>add</button>
      </div>
    </ModalShell>
  );
}
