import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function esc(s) { return String(s || ''); }


/** RFC 4180-compliant CSV field parser. */
function parseCsvRow(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let val = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; } // closing quote
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++; // skip delimiter
    } else {
      // Unquoted field — read until comma or end
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCSV(text) {
  // Split into lines preserving quoted newlines is not needed for our export format,
  // but we do need to handle \r\n and skip blank lines.
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: 'Need at least a header row and one data row.' };

  const header = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const idx = k => header.indexOf(k);
  const missing = ['product', 'part_name'].filter(k => idx(k) === -1);
  if (missing.length) return { error: `Missing required columns: ${missing.join(', ')}.` };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const get = k => idx(k) > -1 ? (cols[idx(k)] || '').trim() : '';
    const product = get('product'), part_name = get('part_name');
    if (!product || !part_name) continue;
    rows.push({
      product, part_name,
      variant: get('variant'),
      colour_name: get('colour_name'),
      colour_hex: get('colour_hex') || '#888888',
      stl: get('stl'),
      qty: Math.max(1, parseInt(get('qty')) || 1),
      category: get('category'),
      description: get('description'),
    });
  }

  if (!rows.length) return { error: 'No valid rows found.' };
  return { rows };
}

export default function ImportModal() {
  const { closeModal, openModal, isElectron, getItems, importData } = useApp();

  const [status, setStatus] = useState({ msg: '', type: '' });
  const [pendingRows, setPendingRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [filePicked, setFilePicked] = useState(false);

  const showStatus = (msg, type) => setStatus({ msg, type });

  // Pick file on mount
  useEffect(() => {
    pickFile();
  }, []); // intentionally run once on mount

  const pickFile = async () => {
    setFilePicked(false);
    setPendingRows([]);
    setPreviewRows([]);
    showStatus('', '');

    let text;
    if (isElectron) {
      text = await window.electronAPI.openCsvDialog();
      if (!text) { closeModal(); return; }
    } else {
      text = await new Promise(res => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
          const reader = new FileReader();
          reader.onload = ev => res(ev.target.result);
          reader.readAsText(e.target.files[0]);
        };
        input.oncancel = () => res(null);
        input.click();
      });
      if (!text) { closeModal(); return; }
    }

    const result = parseCSV(text);
    if (result.error) {
      showStatus(result.error, 'err');
      setFilePicked(true);
      return;
    }

    const { rows } = result;
    const existingItems = getItems();
    const uniqueProducts = [...new Set(rows.map(r => r.product))];
    const conflicts = uniqueProducts.filter(p => existingItems.includes(p));

    const total = rows.length;
    const prods = uniqueProducts.length;
    showStatus(
      `${total} part${total !== 1 ? 's' : ''} across ${prods} product${prods !== 1 ? 's' : ''}${conflicts.length ? ` · ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} to resolve` : ''}. Ready to import.`,
      'ok'
    );
    setPendingRows(rows);
    setPreviewRows(rows.slice(0, 5));
    setFilePicked(true);
  };

  const handleImport = () => {
    const existingItems = getItems();
    const uniqueProducts = [...new Set(pendingRows.map(r => r.product))];
    const conflicts = uniqueProducts.filter(p => existingItems.includes(p));

    if (conflicts.length > 0) {
      openModal('conflict', { pendingRows, conflictQueue: conflicts, existingItems });
    } else {
      applyImport(pendingRows, {});
    }
  };

  const applyImport = async (rows, decisions) => {
    const existingItems = getItems();
    const newProductSuffixes = {};
    const newParts = [];
    const newProducts = {};
    const base = Date.now();

    rows.forEach((r, i) => {
      let productName = r.product;
      if (existingItems.includes(productName)) {
        const decision = decisions[productName] || 'add';
        if (decision === 'new') {
          if (!newProductSuffixes[productName]) {
            let s = 2;
            let c = `${productName} (${s})`;
            while (existingItems.includes(c) || Object.values(newProductSuffixes).includes(c)) { s++; c = `${productName} (${s})`; }
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

  return (
    <div id="import-modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
          <h3>Import CSV</h3>

          {status.msg && (
            <div className={`import-status ${status.type}`} style={{ marginBottom: 12 }}>{status.msg}</div>
          )}

          {previewRows.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                Preview — first {previewRows.length} of {pendingRows.length} row{pendingRows.length !== 1 ? 's' : ''}
              </div>
              <div style={{ overflowX: 'auto', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['product', 'part_name', 'colour_name', 'stl', 'qty'].map(c => (
                        <th key={c} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '0.5px solid var(--border2)', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c.replace('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '0.5px solid var(--border2)' : 'none' }}>
                        {['product', 'part_name', 'colour_name', 'stl', 'qty'].map(c => (
                          <td key={c} style={{ padding: '6px 10px', color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {esc(String(r[c] || ''))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filePicked && !pendingRows.length && (
            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
              No file loaded.{' '}
              <button className="btn" style={{ fontSize: 12 }} onClick={pickFile}>Pick file</button>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 16 }}>
            <strong>Required columns:</strong> product, part_name<br />
            <strong>Optional:</strong> variant, colour_name, colour_hex, stl, qty, category, description
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>Cancel</button>
            {pendingRows.length > 0 && (
              <button className="btn btn-primary" onClick={handleImport}>Import</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
