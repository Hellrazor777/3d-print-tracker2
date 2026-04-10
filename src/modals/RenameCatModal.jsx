import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ModalShell from '../components/ModalShell';

export default function RenameCatModal() {
  const { modal, closeModal, renameCategory, renameStorageLocation, renameOutgoingDest } = useApp();
  const { mode, oldName, idx, title = 'Rename Category' } = modal || {};
  const [value, setValue] = useState(oldName || '');

  const handleConfirm = async () => {
    const newName = value.trim();
    if (!newName || newName === oldName) { closeModal(); return; }
    if (mode === 'storage') await renameStorageLocation(oldName, newName);
    else if (mode === 'dest') await renameOutgoingDest(idx, newName);
    else await renameCategory(oldName, newName);
    closeModal();
  };

  return (
    <ModalShell onClose={closeModal} width={320}>
      <h3>{title}</h3>
      <div className="field">
        <label>New name</label>
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="Name" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }} />
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={closeModal}>Cancel</button>
        <button className="btn btn-primary" onClick={handleConfirm}>Rename</button>
      </div>
    </ModalShell>
  );
}
