import { useApp } from '../context/AppContext';

function esc(s) { return String(s || ''); }

export default function PartsBoxCheckModal() {
  const { modal, closeModal, unarchiveProduct, restartProduct, products } = useApp();
  const item = modal?.item || '';
  const action = modal?.action || 'restore';
  const prod = products[item] || {};
  const boxLabel = prod.partsBox ? `#${prod.partsBox}` : 'the parts box';

  const handleConfirm = () => {
    closeModal();
    if (action === 'restart') {
      restartProduct(item);
    } else {
      unarchiveProduct(item);
    }
  };

  return (
    <div id="modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ maxWidth: 340, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <h3 style={{ marginBottom: 8 }}>Check parts box {boxLabel}</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
            Have you checked <strong style={{ color: 'var(--text)' }}>parts box {boxLabel}</strong> for <strong style={{ color: 'var(--text)' }}>{esc(item)}</strong>?
          </p>
          <div className="modal-footer" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn" onClick={closeModal}>not yet</button>
            <button className="btn btn-primary" onClick={handleConfirm}>
              yes — {action === 'restart' ? 'restart' : 'restore'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
