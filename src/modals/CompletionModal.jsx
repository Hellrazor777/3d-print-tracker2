import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function CompletionModal() {
  const { modal, closeModal, confirmCompletion } = useApp();
  const [qty, setQty] = useState(1);
  const productName = modal?.productName || '';

  return (
    <div id="completion-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 340 }} onClick={e => e.stopPropagation()}>
          <h3>all parts printed!</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: '1rem', lineHeight: 1.5 }}>How many completed builds are you adding to inventory? The product will be archived after this.</p>
          <div className="field">
            <label>quantity built</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <div style={{ width: 60, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)' }}>{qty}</div>
                <button className="qty-btn" onClick={() => setQty(q => q + 1)}>+</button>
              </div>
              <input
                type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 64, fontSize: 16, fontFamily: 'inherit', background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '6px 8px', color: 'var(--text)', textAlign: 'center' }}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-success" onClick={() => confirmCompletion(productName, qty)}>add to inventory &amp; archive</button>
          </div>
        </div>
      </div>
    </div>
  );
}
