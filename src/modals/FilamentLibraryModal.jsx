import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

const isElectron = !!window.electronAPI;

function esc(s) { return String(s || ''); }

const COMMON_TYPES = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'HIPS', 'PVA', 'Resin', 'Other'];

// ── Add / Edit row form ──────────────────────────────────────────────────────
function FilamentForm({ initial, onSave, onCancel }) {
  const [brand, setBrand] = useState(initial?.brand || '');
  // If initial type is a known type, use it directly. If it's a custom value, start with '__custom__'
  // so the custom input is bound to customType and edits are correctly reflected.
  const [type, setType] = useState(
    COMMON_TYPES.includes(initial?.type || '') ? (initial?.type || '') : (initial?.type ? '__custom__' : '')
  );
  const [customType, setCustomType] = useState(
    !COMMON_TYPES.includes(initial?.type || '') ? (initial?.type || '') : ''
  );
  const [name, setName] = useState(initial?.name || '');
  const [hex, setHex] = useState(initial?.hex || '#4a90d9');

  const effectiveType = type === '__custom__' ? customType : type;

  const inp = { fontSize: 13, padding: '6px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' };

  const handleSave = () => {
    if (!brand.trim() || !effectiveType.trim() || !name.trim()) return;
    onSave({ brand: brand.trim(), type: effectiveType.trim(), name: name.trim(), hex });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '10px 12px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)', marginBottom: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 120px' }}>
        <label style={{ fontSize: 11, color: 'var(--text2)' }}>Brand *</label>
        <input style={inp} value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Bambu Lab" autoFocus />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 120px' }}>
        <label style={{ fontSize: 11, color: 'var(--text2)' }}>Type *</label>
        <select style={{ ...inp, width: '100%' }} value={COMMON_TYPES.includes(type) ? type : (type ? '__custom__' : '')}
          onChange={e => { setType(e.target.value); if (e.target.value !== '__custom__') setCustomType(''); }}>
          <option value="">select…</option>
          {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          <option value="__custom__">other…</option>
        </select>
        {(type === '__custom__' || (!COMMON_TYPES.includes(type) && type)) && (
          <input style={inp} value={customType} onChange={e => setCustomType(e.target.value)} placeholder="type name" />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
        <label style={{ fontSize: 11, color: 'var(--text2)' }}>Colour name *</label>
        <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Galaxy Black" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
        <label style={{ fontSize: 11, color: 'var(--text2)' }}>Hex</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="color" value={hex} onChange={e => setHex(e.target.value)}
            style={{ width: 36, height: 34, padding: 2, border: '0.5px solid var(--border2)', borderRadius: 6, cursor: 'pointer', background: 'var(--bg)' }} />
          <input style={{ ...inp, width: 78 }} value={hex} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setHex(e.target.value); }} placeholder="#rrggbb" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
        <button className="btn" onClick={onCancel} style={{ fontSize: 12 }}>cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!brand.trim() || !effectiveType.trim() || !name.trim()} style={{ fontSize: 12 }}>
          {initial ? 'update' : 'add'}
        </button>
      </div>
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export default function FilamentLibraryModal() {
  const { filaments, addFilament, updateFilament, deleteFilament, saveFilaments, closeModal } = useApp();
  const [confirmState, setConfirmState] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [importError, setImportError] = useState('');
  const fileRef = useRef(null);

  // ── Group and filter ──
  const brands = [...new Set(filaments.map(f => f.brand).filter(Boolean))].sort();
  const types = [...new Set(
    filaments.filter(f => !filterBrand || f.brand === filterBrand).map(f => f.type).filter(Boolean)
  )].sort();

  const filtered = filaments.filter(f => {
    if (filterBrand && f.brand !== filterBrand) return false;
    if (filterType && f.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (f.name || '').toLowerCase().includes(q) || (f.brand || '').toLowerCase().includes(q) || (f.type || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Group: brand → type → filaments
  const grouped = {};
  filtered.forEach(f => {
    const b = f.brand || 'Unknown';
    const t = f.type || 'Unknown';
    if (!grouped[b]) grouped[b] = {};
    if (!grouped[b][t]) grouped[b][t] = [];
    grouped[b][t].push(f);
  });

  // ── CSV Export ──
  const handleExport = () => {
    const rows = ['brand,type,name,hex'];
    filaments.forEach(f => {
      rows.push([f.brand, f.type, f.name, f.hex].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    });
    const csv = rows.join('\n');
    if (isElectron && window.electronAPI?.saveCsvDialog) {
      window.electronAPI.saveCsvDialog(csv, 'filament-library.csv');
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = 'filament-library.csv';
      a.click();
    }
  };

  // ── CSV Import ──
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setImportError('');
        const text = ev.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) { setImportError('Empty file'); return; }
        // Detect header
        const firstLow = lines[0].toLowerCase();
        const hasHeader = firstLow.includes('brand') || firstLow.includes('type') || firstLow.includes('name');
        const dataLines = hasHeader ? lines.slice(1) : lines;
        const parsed = [];
        for (const line of dataLines) {
          if (!line.trim()) continue;
          // Handle quoted CSV
          const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)
            .filter((_, i) => i % 2 === 0)
            .map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
          const [brand, type, name, hex] = cols;
          if (!brand || !type || !name) continue;
          const cleanHex = /^#?[0-9a-fA-F]{6}$/.test(hex || '') ? (hex.startsWith('#') ? hex : '#' + hex) : '#888888';
          parsed.push({ brand, type, name, hex: cleanHex });
        }
        if (!parsed.length) { setImportError('No valid rows found. Expected: brand,type,name,hex'); return; }
        // Merge: skip exact duplicates (same brand+type+name), add new
        const existing = new Set(filaments.map(f => `${f.brand}|${f.type}|${f.name}`));
        const toAdd = parsed.filter(f => !existing.has(`${f.brand}|${f.type}|${f.name}`));
        if (!toAdd.length) { setImportError(`All ${parsed.length} row(s) already exist — nothing to import`); return; }
        const newFilaments = [...filaments, ...toAdd.map(f => ({ ...f, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '_' + Math.random().toString(36).slice(2, 4) }))];
        saveFilaments(newFilaments);
        setImportError(`Imported ${toAdd.length} filament${toAdd.length !== 1 ? 's' : ''}${parsed.length > toAdd.length ? ` (${parsed.length - toAdd.length} duplicate${parsed.length - toAdd.length !== 1 ? 's' : ''} skipped)` : ''}`);
      } catch {
        setImportError('Failed to parse CSV');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const selStyle = { fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' };

  return (
    <div id="filament-library-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal settings-modal" style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span className="settings-title">Filament Library</span>
            <button className="icon-btn settings-close-btn" onClick={closeModal}>✕</button>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0 8px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
            <select style={selStyle} value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setFilterType(''); }}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select style={selStyle} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="search" placeholder="search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...selStyle, flex: 1, minWidth: 100 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{filtered.length} / {filaments.length}</span>
            <button className="btn" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => setAdding(v => !v)}>
              {adding ? 'cancel' : '+ add filament'}
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={handleExport} title="Export as CSV" disabled={!filaments.length}>↑ export</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} title="Import from CSV">↓ import</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
          </div>

          {/* Add form */}
          {adding && (
            <div style={{ flexShrink: 0, paddingTop: 10 }}>
              <FilamentForm
                onSave={async (f) => { await addFilament(f); setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {/* Import feedback */}
          {importError && (
            <div style={{ fontSize: 12, color: importError.startsWith('Imported') ? 'var(--accent, #5b8dee)' : 'var(--red, #e63946)', padding: '6px 0', flexShrink: 0 }}>
              {importError}
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
            {filaments.length === 0 ? (
              <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: '2rem 0' }}>
                No filaments yet. Click "+ add filament" or import a CSV.
                <div style={{ marginTop: 8, fontSize: 12 }}>CSV format: <code>brand,type,name,hex</code></div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>No filaments match the current filters.</div>
            ) : (
              Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([brand, types]) => (
                <div key={brand} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{brand}</div>
                  {Object.entries(types).sort(([a], [b]) => a.localeCompare(b)).map(([type, items]) => (
                    <div key={type} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, paddingLeft: 4 }}>{type}</div>
                      {items.map(f => (
                        editId === f.id ? (
                          <FilamentForm key={f.id} initial={f}
                            onSave={async (upd) => { await updateFilament(f.id, upd); setEditId(null); }}
                            onCancel={() => setEditId(null)}
                          />
                        ) : (
                          <div key={f.id} className="product-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: f.hex || '#888', border: '0.5px solid rgba(0,0,0,.15)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{esc(f.name)}</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{esc(f.hex)}</div>
                            </div>
                            <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEditId(f.id)}>edit</button>
                            <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red-text, #e63946)' }} onClick={() => setConfirmState({ message: `Delete "${f.name}"?`, confirmLabel: 'delete', danger: true, onConfirm: () => { setConfirmState(null); deleteFilament(f.id); } })}>delete</button>
                          </div>
                        )
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="modal-footer" style={{ flexShrink: 0 }}>
            <button className="btn btn-primary" onClick={closeModal}>done</button>
          </div>
        </div>
      </div>
      {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
    </div>
  );
}
