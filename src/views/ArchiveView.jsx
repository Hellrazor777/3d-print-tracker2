import { useApp } from '../context/AppContext';

function esc(s) { return String(s || ''); }

export default function ArchiveView() {
  const { parts, products, unarchiveProduct, restartProduct, deleteProductPermanently, openModal } = useApp();
  const archived = [...new Set(parts.map(p => p.item).filter(Boolean))].filter(i => products[i]?.archived);

  if (!archived.length) {
    return <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>no archived products yet.</p>;
  }

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>{archived.length} archived product{archived.length !== 1 ? 's' : ''}</div>
      <div className="product-list">
        {archived.map(item => {
          const ps = parts.filter(p => p.item === item);
          const tp = ps.reduce((a, p) => a + p.qty, 0), dp = ps.reduce((a, p) => a + p.printed, 0);
          const cat = products[item]?.category || '';
          return (
            <div key={item} className="product-card" style={{ opacity: 0.8 }}>
              <div className="product-header" style={{ cursor: 'default' }}>
                <div className="product-title-wrap">
                  <span className="product-title" style={{ color: 'var(--text2)' }}>{esc(item)}</span>
                  {cat && <span className="cat-tag" style={{ marginLeft: 4 }}>{esc(cat)}</span>}
                  {products[item]?.partsBoxEnabled && (
                    <span className="badge-shiny" style={{ background: 'var(--bg2)', color: 'var(--text2)', borderColor: 'var(--border2)', marginLeft: 4 }} title="has a parts box">
                      📦{products[item].partsBox ? ` #${products[item].partsBox}` : ' parts box'}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)', marginRight: 8 }}>{dp}/{tp} pcs</span>
                <span className="ready-badge" style={{ marginRight: 8 }}>✓ complete</span>
                <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => {
                  if (products[item]?.partsBoxEnabled) {
                    openModal('parts-box-check', { item, action: 'restore' });
                  } else {
                    unarchiveProduct(item);
                  }
                }}>↑ restore</button>
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px', marginLeft: 4 }} onClick={() => {
                  if (confirm(`Restart "${item}" from scratch? All part statuses and print counts will be reset to queue. Your inventory history is kept.`)) {
                    if (products[item]?.partsBoxEnabled) {
                      openModal('parts-box-check', { item, action: 'restart' });
                    } else {
                      restartProduct(item);
                    }
                  }
                }}>⟳ restart</button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 12px', marginLeft: 4, color: 'var(--red-text)', borderColor: 'var(--red-text)' }} onClick={() => { if (confirm(`Permanently delete "${item}" and all its parts? This cannot be undone.`)) deleteProductPermanently(item); }}>delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
