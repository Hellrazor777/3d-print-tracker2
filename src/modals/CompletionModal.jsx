import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ModalShell from '../components/ModalShell';

export default function CompletionModal() {
  const { modal, closeModal, confirmCompletion } = useApp();
  const [qty, setQty] = useState(1);
  const productName = modal?.productName || '';

  return (
    <ModalShell onClose={closeModal} width={340}>
          <h3>all parts printed!</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: '1rem', lineHeight: 1.5 }}>How many completed builds are you adding to inventory? The product will be archived after this.</p>
          <div className="field">
            <label>quantity built</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 4 }}>
              <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <div style={{ width: 60, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)' }}>{qty}</div>
              <button className="qty-btn" onClick={() => setQty(q => q + 1)}>+</button>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-success" onClick={() => confirmCompletion(productName, qty)}>add to inventory &amp; archive</button>
          </div>
    </ModalShell>
  );
}
