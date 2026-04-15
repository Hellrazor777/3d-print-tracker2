import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function esc(s) { return String(s || ''); }

export default function ArchiveView() {
  const { parts, products, unarchiveProduct, restartProduct, deleteProductPermanently, openModal } = useApp();
  const archived = [...new Set(parts.map(p => p.item).filter(Boolean))].filter(i => products[i]?.archived);
  const [confirmState, setConfirmState] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('az');

  // Apply search — matches product name or category
  const q = search.trim().toLowerCase();
  const filtered = q
    ? archived.filter(i =>
        i.toLowerCase().includes(q) ||
        (products[i]?.category || '').toLowerCase().includes(q)
      )
    : archived;

  // Apply sort
  const natCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'za')        return b.localeCompare(a);
    if (sort === 'num-asc')   return natCmp(a, b);
    if (sort === 'num-desc')  return natCmp(b, a);
    if (sort === 'parts') {
      const pa = parts.filter(p => p.item === a).length;
      const pb = parts.filter(p => p.item === b).length;
      return pb - pa || a.localeCompare(b);
    }
    return a.localeCompare(b); // az default
  });

  if (!archived.length) {
    return <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>no archived products yet.</p>;
  }

  return (
    <div>
      {/* Filter bar — matches Products view style */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {filtered.length}{filtered.length !== archived.length ? ` of ${archived.length}` : ''} archived product{archived.length !== 1 ? 's' : ''}
        </span>
        <select
          value={sort} onChange={e => setSort(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', marginLeft: 'auto', cursor: 'pointer' }}
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="num-asc">1 → 9</option>
          <option value="num-desc">9 → 1</option>
          <option value="parts">Most parts</option>
        </select>
        <input
          type="search" placeholder="search archive…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', width: 160, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {sorted.length === 0 && (
        <p style={{ color: 'var(--text2)', fontSize: 13, padding: '0.5rem 0' }}>no results for "{search}"</p>
      )}

      <div className="product-list">
        {sorted.map(item => {
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
                  setConfirmState({
                    message: `Restart "${item}" from scratch? All part statuses and print counts will be reset to queue. Your inventory history is kept.`,
                    confirmLabel: 'restart',
                    onConfirm: () => {
                      setConfirmState(null);
                      if (products[item]?.partsBoxEnabled) {
                        openModal('parts-box-check', { item, action: 'restart' });
                      } else {
                        restartProduct(item);
                      }
                    },
                  });
                }}>⟳ restart</button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 12px', marginLeft: 4, color: 'var(--red-text)', borderColor: 'var(--red-text)' }} onClick={() => {
                  setConfirmState({
                    message: `Permanently delete "${item}" and all its parts? This cannot be undone.`,
                    confirmLabel: 'delete',
                    danger: true,
                    onConfirm: () => { setConfirmState(null); deleteProductPermanently(item); },
                  });
                }}>delete</button>
              </div>
            </div>
          );
        })}
      </div>
      {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
    </div>
  );
}
