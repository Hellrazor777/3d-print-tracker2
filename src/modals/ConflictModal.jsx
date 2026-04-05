import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function ConflictModal() {
  const { modal, closeModal, getItems, importData } = useApp();
  const { pendingRows = [], conflictQueue: initialQueue = [] } = modal || {};

  const [queue, setQueue] = useState([...initialQueue]);
  const [decisions, setDecisions] = useState({});
  const [opt, setOpt] = useState('add');

  const currentProduct = queue[0];
  const currentIdx = Object.keys(decisions).length + 1;
  const totalConflicts = initialQueue.length;
  const incomingCount = pendingRows.filter(r => r.product === currentProduct).length;
  // Count existing parts for this product from context
  const { parts } = useApp();
  const existingPartsCount = parts.filter(p => p.item === currentProduct).length;

  const resolve = async () => {
    const newDecisions = { ...decisions, [currentProduct]: opt };
    const newQueue = queue.slice(1);
    setDecisions(newDecisions);
    setQueue(newQueue);
    setOpt('add'); // reset for next conflict

    if (newQueue.length === 0) {
      // All conflicts resolved — apply the import
      await applyImport(pendingRows, newDecisions);
    }
  };

  const applyImport = async (rows, resolvedDecisions) => {
    const existingItems = getItems();
    const newProductSuffixes = {};
    const newParts = [];
    const newProducts = {};
    const base = Date.now();

    rows.forEach((r, i) => {
      let productName = r.product;
      if (existingItems.includes(productName)) {
        const decision = resolvedDecisions[productName] || 'add';
        if (decision === 'new') {
          if (!newProductSuffixes[productName]) {
            let s = 2;
            let c = `${productName} (${s})`;
            while (existingItems.includes(c) || Object.values(newProductSuffixes).includes(c)) {
              s++;
              c = `${productName} (${s})`;
            }
            newProductSuffixes[productName] = c;
          }
          productName = newProductSuffixes[productName];
        }
      }
      if (!newProducts[productName]) newProducts[productName] = { category: r.category || '' };
      else if (r.category && !newProducts[productName].category) newProducts[productName].category = r.category;

      newParts.push({
        id: base + i,
        name: r.part_name,
        item: productName,
        variant: r.variant,
        desc: r.description,
        colour: r.colour_hex,
        colourName: r.colour_name,
        stl: r.stl,
        qty: r.qty,
        printed: 0,
        status: 'queue',
        reprints: 0,
      });
    });

    await importData(newParts, newProducts);
    closeModal();
  };

  if (!currentProduct) return null;

  return (
    <div id="conflict-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={e => e.stopPropagation()}>
        <div className="modal" style={{ width: 420 }}>
          <h3>Import Conflict</h3>

          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
            conflict {currentIdx} of {totalConflicts} — <strong style={{ color: 'var(--text)' }}>{currentProduct}</strong>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 18, lineHeight: 1.5 }}>
            This product already has <strong>{existingPartsCount}</strong> part{existingPartsCount !== 1 ? 's' : ''} tracked.
            Your CSV adds <strong>{incomingCount}</strong> more. What would you like to do?
          </p>

          <div className="conflict-options">
            <div
              className={`conflict-option${opt === 'add' ? ' selected' : ''}`}
              onClick={() => setOpt('add')}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', background: opt === 'add' ? 'var(--accent)' : 'transparent', marginTop: 1, flexShrink: 0 }} />
              <div>
                <div className="conflict-option-title">Add to existing</div>
                <div className="conflict-option-desc">
                  Import CSV parts and add them alongside the {existingPartsCount} already tracked
                </div>
              </div>
            </div>

            <div
              className={`conflict-option${opt === 'new' ? ' selected' : ''}`}
              onClick={() => setOpt('new')}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', background: opt === 'new' ? 'var(--accent)' : 'transparent', marginTop: 1, flexShrink: 0 }} />
              <div>
                <div className="conflict-option-title">Create as new product</div>
                <div className="conflict-option-desc">
                  Import under a new name like &ldquo;{currentProduct} (2)&rdquo;, keeping originals untouched
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>Cancel import</button>
            <button className="btn btn-primary" onClick={resolve}>
              {queue.length > 1 ? `Next conflict →` : 'Apply import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
