import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// ── Filament Library Picker ──────────────────────────────────────────────────
function FilamentPicker({ filaments, onSelect, onClose }) {
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const brands = [...new Set(filaments.map(f => f.brand).filter(Boolean))].sort();
  const types = [...new Set(
    filaments.filter(f => !brand || f.brand === brand).map(f => f.type).filter(Boolean)
  )].sort();

  const filtered = filaments.filter(f => {
    if (brand && f.brand !== brand) return false;
    if (type && f.type !== type) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (f.name || '').toLowerCase().includes(lq) ||
        (f.brand || '').toLowerCase().includes(lq) ||
        (f.type || '').toLowerCase().includes(lq);
    }
    return true;
  });

  const pickerStyle = {
    position: 'absolute', zIndex: 200, top: '100%', left: 0, right: 0,
    background: 'var(--bg)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)',
    boxShadow: '0 4px 16px rgba(0,0,0,.18)', padding: 10, marginTop: 4,
  };
  const selStyle = {
    fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)',
    border: '0.5px solid var(--border2)', background: 'var(--bg2)',
    color: 'var(--text)', fontFamily: 'inherit', outline: 'none', flex: 1,
  };

  return (
    <div ref={ref} style={pickerStyle}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select value={brand} onChange={e => { setBrand(e.target.value); setType(''); }} style={selStyle}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} style={selStyle}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <input
        type="search" placeholder="search…" value={q} autoFocus
        onChange={e => setQ(e.target.value)}
        style={{ ...selStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 4px' }}>no filaments found</div>
        )}
        {filtered.map(f => (
          <div key={f.id} onClick={() => onSelect(f)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: f.hex || '#888', border: '0.5px solid rgba(0,0,0,.15)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 11 }}>{[f.brand, f.type].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{f.hex}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Colour Row ───────────────────────────────────────────────────────────────
function ColourRow({ colour, onChange, onRemove, canRemove, filaments }) {
  const [showPicker, setShowPicker] = useState(false);
  const inputStyle = { fontSize: 13, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%' };

  const handleLibrarySelect = (f) => {
    onChange({ ...colour, hex: f.hex || colour.hex, name: f.name || colour.name, brand: f.brand || colour.brand, brandName: f.type || colour.brandName });
    setShowPicker(false);
  };

  return (
    <div className="colour-row" style={{ marginBottom: 10, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg2)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <input type="color" value={colour.hex} style={{ width: 36, height: 36, padding: 2, borderRadius: 6, border: '0.5px solid var(--border2)', cursor: 'pointer', background: 'var(--bg)', flexShrink: 0 }}
          onChange={e => onChange({ ...colour, hex: e.target.value })} />
        <input type="text" value={colour.name} placeholder="Colour name e.g. Galaxy Black"
          style={{ ...inputStyle }}
          onChange={e => {
            const v = e.target.value;
            onChange({ ...colour, name: v, hex: /^#[0-9a-f]{6}$/i.test(v) ? v : colour.hex });
          }} />
        <button type="button" onClick={onRemove} disabled={!canRemove}
          style={{ background: 'transparent', border: 'none', cursor: canRemove ? 'pointer' : 'default', padding: '4px 6px', borderRadius: 4, fontSize: 15, color: 'var(--text3)', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: filaments.length > 0 ? 6 : 0 }}>
        <input type="text" value={colour.brand || ''} placeholder="Brand e.g. Bambu Lab"
          style={{ ...inputStyle }}
          onChange={e => onChange({ ...colour, brand: e.target.value })} />
        <input type="text" value={colour.brandName || ''} placeholder="Product name e.g. Hyper PLA"
          style={{ ...inputStyle }}
          onChange={e => onChange({ ...colour, brandName: e.target.value })} />
      </div>
      {filaments.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button type="button"
            onClick={() => setShowPicker(v => !v)}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            {showPicker ? 'close library' : '📚 pick from library'}
          </button>
          {showPicker && (
            <FilamentPicker filaments={filaments} onSelect={handleLibrarySelect} onClose={() => setShowPicker(false)} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export default function PartModal() {
  const { modal, closeModal, saveCard, parts, products, filaments } = useApp();
  const editId = modal?.editId ?? null;
  const part = editId ? parts.find(p => p.id === editId) : null;

  const [name, setName] = useState(part?.name || '');
  const [item, setItem] = useState(part?.item || modal?.defaultItem || '');
  const [variant, setVariant] = useState(part?.variant || '');
  const [qty, setQty] = useState(part?.qty || 1);
  const [status, setStatus] = useState(part?.status || 'queue');
  const [colours, setColours] = useState(() => {
    if (part?.colours?.length) return part.colours.map(c => ({ brand: '', brandName: '', ...c }));
    if (part?.colour) return [{ hex: part.colour, name: part.colourName || '', brand: '', brandName: '' }];
    return [{ hex: '#4a90d9', name: '', brand: '', brandName: '' }];
  });

  // Include all products (even ones with no parts yet) so newly added products appear in the dropdown
  const items = [...new Set([
    ...Object.keys(products).filter(k => !products[k]?.archived),
    ...parts.map(p => p.item).filter(Boolean),
  ])].sort();

  const handleSave = () => {
    if (!name.trim()) return;
    saveCard({ name: name.trim(), item: item.trim(), variant: variant.trim(), colours, qty: parseInt(qty) || 1, status }, editId);
  };

  return (
    <div id="modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>{editId ? 'edit part' : 'add part'}</h3>
          <div className="section-label">part info</div>
          <div className="field"><label>part name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. motor mount bracket" autoFocus /></div>
          <div className="field">
            <label>product it belongs to</label>
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Robot Arm" list="part-modal-item-list" />
            <datalist id="part-modal-item-list">{items.map(i => <option key={i} value={i} />)}</datalist>
          </div>
          <div className="field"><label>variant / sub-part</label><input value={variant} onChange={e => setVariant(e.target.value)} placeholder="e.g. left side, v2" /></div>
          <div className="section-label">print settings</div>
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ marginBottom: 0 }}>filament colours</label>
              <button type="button" className="btn" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setColours(c => [...c, { hex: '#4a90d9', name: '', brand: '', brandName: '' }])}>+ add colour</button>
            </div>
            {colours.map((c, i) => (
              <ColourRow key={i} colour={c} filaments={filaments}
                onChange={nc => setColours(prev => prev.map((x, xi) => xi === i ? nc : x))}
                onRemove={() => setColours(prev => prev.filter((_, xi) => xi !== i))}
                canRemove={colours.length > 1} />
            ))}
          </div>
          <div className="field"><label>quantity needed</label><input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div className="field">
            <label>status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="planning">planning</option>
              <option value="queue">queue</option>
              <option value="printing">printing</option>
              <option value="done">done</option>
            </select>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
