import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function SubpartModal() {
  const { modal, closeModal, addSubPart } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);

  const handleSave = () => {
    if (!name.trim() || !modal?.partId) return;
    addSubPart(modal.partId, name.trim(), parseInt(qty) || 1);
    closeModal();
  };

  return (
    <div id="subpart-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={e => e.stopPropagation()}>
        <div className="modal" style={{ width: 300 }}>
          <h3>add sub-part</h3>
          <div className="field"><label>sub-part name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. left claw, piece 2" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} /></div>
          <div className="field"><label>quantity</label><input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
