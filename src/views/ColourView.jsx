import { useState } from 'react';
import { useApp } from '../context/AppContext';

function esc(s) { return String(s || ''); }

const SPECIAL_SECTIONS = ['ready to build', 'printing', 'commenced'];

// Determine which ProductView section an item lands in (mirrors the bucketing in ProductView)
function getProductSection(item, parts, products, isReady) {
  const ps = parts.filter(p => p.item === item);
  if (isReady(item)) return 'ready to build';
  if (ps.some(p => p.status === 'printing')) return 'printing';
  if (ps.some(p => p.status === 'done')) return 'commenced';
  return products[item]?.category || 'uncategorised';
}

export default function ColourView() {
  const { parts, products, colourExpanded, toggleColour, setView, openProducts, toggleProduct, catExpanded, toggleCat, isReady } = useApp();
  const [search, setSearch] = useState('');

  const queuedParts = parts.filter(p => p.status === 'queue');

  if (!queuedParts.length) {
    return <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>no parts in queue — add some parts and set their status to queue.</p>;
  }

  const q = search.trim().toLowerCase();
  const filteredParts = q
    ? queuedParts.filter(p =>
        (p.item || '').toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.colours?.some(c => (c.name || '').toLowerCase().includes(q) || (c.hex || '').toLowerCase().includes(q))) ||
        (p.colourName || '').toLowerCase().includes(q)
      )
    : queuedParts;

  const colourMap = {};
  filteredParts.forEach(p => {
    const colours = p.colours?.length ? p.colours : (p.colour ? [{ hex: p.colour, name: p.colourName || '' }] : [{ hex: '#888888', name: 'unknown' }]);
    colours.forEach(c => {
      const key = (c.name || c.hex || 'unknown').toLowerCase().trim();
      if (!colourMap[key]) colourMap[key] = { name: c.name || c.hex || 'unknown', hex: c.hex || '#888888', parts: [] };
      colourMap[key].parts.push(p);
    });
  });

  const sorted = Object.values(colourMap).sort((a, b) => b.parts.length - a.parts.length);
  const totalPcsAll = filteredParts.reduce((a, p) => a + p.qty, 0);

  const goToProduct = (item) => {
    if (!openProducts.has(item)) toggleProduct(item);
    // Ensure the section containing this product is expanded so the card exists in the DOM
    const section = getProductSection(item, parts, products, isReady);
    if (!SPECIAL_SECTIONS.includes(section)) {
      // Category sections default to closed — open if not already open
      const neverSet = !catExpanded.has(section) && !catExpanded.has('__closed__' + section);
      const isOpen = !neverSet && catExpanded.has(section);
      if (!isOpen) toggleCat(section, false);
    } else {
      // Special sections default to open — open if the user manually closed them
      const manuallyClosed = catExpanded.has('__closed__' + section);
      if (manuallyClosed) toggleCat(section, true);
    }
    setView('product');
    // Allow React to finish rendering the view + section + card before scrolling.
    // 300 ms is enough for even slow renders; we also poll in case it takes slightly longer.
    const safeId = 'product-card-' + item.replace(/[^a-zA-Z0-9]/g, '_');
    const deadline = Date.now() + 1500;
    const tryScroll = () => {
      const el = document.getElementById(safeId);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (Date.now() < deadline) setTimeout(tryScroll, 60);
    };
    setTimeout(tryScroll, 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {sorted.length} colour{sorted.length !== 1 ? 's' : ''} · {filteredParts.length} part{filteredParts.length !== 1 ? 's' : ''} · {totalPcsAll} pieces in queue
        </span>
        <input
          type="search" placeholder="search colours, products…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', width: 180, fontFamily: 'inherit', outline: 'none', marginLeft: 'auto' }}
        />
      </div>
      {sorted.map(group => {
        const key = group.name.toLowerCase().trim();
        const isOpen = colourExpanded.has(key);
        const totalPcs = group.parts.reduce((a, p) => a + p.qty, 0);
        return (
          <div key={key} className="product-card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleColour(key)}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: group.hex, border: '0.5px solid rgba(0,0,0,.15)', flexShrink: 0 }}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{esc(group.name)}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{group.parts.length} part{group.parts.length !== 1 ? 's' : ''} · {totalPcs} piece{totalPcs !== 1 ? 's' : ''}</div>
              </div>
              <span className={`chevron${isOpen ? ' open' : ''}`} style={{ fontSize: 11 }}>▶</span>
            </div>
            {isOpen && (
              <div className="parts-table">
                {group.parts.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{esc(p.name)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {p.item && (
                          <span
                            style={{ color: 'var(--accent, #5b8dee)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                            title="go to product"
                            onClick={e => { e.stopPropagation(); goToProduct(p.item); }}
                          >
                            {esc(p.item)}
                          </span>
                        )}
                        {p.variant ? ' · ' + esc(p.variant) : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{p.qty} pc{p.qty !== 1 ? 's' : ''}</span>
                    <span className="sp sp-queue" style={{ fontSize: 11 }}>queue</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {sorted.length === 0 && q && (
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>no results for "{q}"</p>
      )}
    </div>
  );
}
