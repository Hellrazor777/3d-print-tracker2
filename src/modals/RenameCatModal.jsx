import { useState } from 'react';
import { useApp } from '../context/AppContext';

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
    <div id="rename-cat-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
          <form onSubmit={e => { e.preventDefault(); handleConfirm(); }}>
            <h3>{title}</h3>
            <div className="field">
              <label>New name</label>
              <input value={value} onChange={e => setValue(e.target.value)} placeholder="Name" autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" type="submit">Rename</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
