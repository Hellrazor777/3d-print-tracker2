import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function QuickAddModal() {
  const { modal, closeModal, confirmQuickAdd, getStorageLocations, appSettings } = useApp();
  const productName = modal?.productName || '';
  const locs = getStorageLocations();
  const [qty, setQty] = useState(1);
  const [locations, setLocations] = useState(() => {
    const init = {};
    locs.forEach((loc, i) => { init[loc] = i === locs.length - 1 ? 1 : 0; });
    return init;
  });

  const adjustLocQty = (loc, delta) => {
    setLocations(prev => ({ ...prev, [loc]: Math.max(0, (prev[loc] || 0) + delta) }));
  };

  const adjustQty = (delta) => {
    const newQty = Math.max(0, qty + delta);
    setQty(newQty);
    // Auto-fill last location
    if (locs.length) {
      const lastLoc = locs[locs.length - 1];
      const otherTotal = locs.slice(0, -1).reduce((a, l) => a + (locations[l] || 0), 0);
      setLocations(prev => ({ ...prev, [lastLoc]: Math.max(0, newQty - otherTotal) }));
    }
  };

  return (
    <div id="quick-add-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
          <h3>Add to inventory</h3>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</p>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Stock on hand</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
              <button onClick={() => adjustQty(-1)} style={{ width: 64, height: 64, border: '0.5px solid var(--border2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 30, fontWeight: 300, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius) 0 0 var(--radius)', fontFamily: 'inherit' }}>−</button>
              <div style={{ flex: 1, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 700, borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)', color: 'var(--text)', background: 'var(--bg)' }}>{qty}</div>
              <button onClick={() => adjustQty(1)} style={{ width: 64, height: 64, border: '0.5px solid var(--border2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 30, fontWeight: 300, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 var(--radius) var(--radius) 0', fontFamily: 'inherit' }}>+</button>
            </div>
          </div>
          {appSettings.invPopup !== false && locs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>storage split</div>
              {locs.map((loc, idx) => (
                <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize', flex: 1, color: 'var(--text)' }}>{loc}</span>
                  <div style={{ display: 'flex' }}>
                    <button style={{ width: 48, height: 48, border: '0.5px solid var(--border2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 22, fontWeight: 300, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius) 0 0 var(--radius)', fontFamily: 'inherit' }} onClick={() => adjustLocQty(loc, -1)}>−</button>
                    <div style={{ width: 56, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)', color: 'var(--text)', background: 'var(--bg)' }}>{locations[loc] || 0}</div>
                    <button style={{ width: 48, height: 48, border: '0.5px solid var(--border2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 22, fontWeight: 300, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 var(--radius) var(--radius) 0', fontFamily: 'inherit' }} onClick={() => adjustLocQty(loc, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-success" onClick={() => confirmQuickAdd(productName, qty, locations)}>Add to inventory</button>
          </div>
        </div>
      </div>
    </div>
  );
}
