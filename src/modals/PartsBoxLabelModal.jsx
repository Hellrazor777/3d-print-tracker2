import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';

function esc(s) { return String(s || ''); }

export default function PartsBoxLabelModal() {
  const { modal, closeModal, products, parts, getLabelSize, getLabelShowParts, getBoxLocations } = useApp();
  const item = modal?.item || '';
  const code = modal?.code || '';

  const labelSize = getLabelSize();
  const showPartsEnabled = getLabelShowParts();
  const boxLocations = getBoxLocations();
  const prod = products[item] || {};
  const box = (prod.partsBoxes || []).find(b => b.code === code);
  const locationName = box ? (boxLocations.find(l => l.letter === box.locationLetter)?.name || box.locationLetter) : '';

  const productParts = parts.filter(p => p.item === item);

  const [selectedParts, setSelectedParts] = useState(() => new Set(productParts.map((_, i) => i)));

  const allSelected = selectedParts.size === productParts.length;
  const toggleAll = () => {
    if (allSelected) setSelectedParts(new Set());
    else setSelectedParts(new Set(productParts.map((_, i) => i)));
  };
  const togglePart = (i) => {
    setSelectedParts(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const chosenParts = showPartsEnabled
    ? productParts.filter((_, i) => selectedParts.has(i))
    : [];

  const partLines = chosenParts.map(p => {
    const variant = p.variant ? ` (${p.variant})` : '';
    const qty = p.qty > 1 ? ` \u00d7${p.qty}` : '';
    return p.name + variant + qty;
  });

  // Preview scale
  const PREVIEW_SCALE = 2.5;
  const pw = labelSize.width * 96 * PREVIEW_SCALE;
  const ph = labelSize.height * 96 * PREVIEW_SCALE;

  const printLabel = useCallback(() => {
    const w = window.open('', '_blank', `width=600,height=400,menubar=0,toolbar=0`);
    if (!w) return;

    const partsListHtml = partLines.map(line =>
      `<div class="part-line">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
    ).join('');

    const locationLine = locationName ? `<div class="location-line">${esc(locationName)}</div>` : '';

    w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  @page { size: ${labelSize.width}in ${labelSize.height}in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${labelSize.width}in;
    height: ${labelSize.height}in;
    font-family: Arial, Helvetica, sans-serif;
    overflow: hidden;
    background: white;
    color: black;
  }
  .label {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: stretch;
    padding: 3pt 3pt 3pt 10pt;
    gap: 5pt;
  }
  .label-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex-shrink: 0;
    width: 42%;
    overflow: hidden;
  }
  .box-code {
    font-size: 36pt;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -1pt;
    white-space: nowrap;
  }
  .location-line {
    font-size: 11pt;
    font-weight: 700;
    margin-top: 2pt;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .product-name {
    font-size: 7pt;
    color: #444;
    margin-top: 1pt;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .divider {
    width: 0.75pt;
    background: #000;
    margin: 3pt 0;
    flex-shrink: 0;
  }
  .label-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
  }
  .parts-list {
    font-size: 6.5pt;
    line-height: 1.45;
    overflow: hidden;
  }
  .part-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
</head>
<body>
<div class="label">
  <div class="label-left">
    <div class="box-code">${esc(code)}</div>
    ${locationLine}
    <div class="product-name">${esc(item)}</div>
  </div>
  ${partLines.length > 0 ? `<div class="divider"></div>
  <div class="label-right">
    <div class="parts-list">${partsListHtml}</div>
  </div>` : ''}
</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  }, [labelSize, item, code, partLines, locationName]);

  return (
    <div id="modal" style={{ display: '' }}>
      <div className="modal-bg" onClick={closeModal}>
        <div className="modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
          <h3>&#x1F4E6; Parts Box Label</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
            <strong>{esc(code)}</strong>{locationName ? ` \u00b7 ${esc(locationName)}` : ''} \u00b7 {esc(item)}
          </p>

          {/* Label preview */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{
              border: '2px dashed var(--border2)',
              padding: 10,
              borderRadius: 6,
              background: 'var(--bg2)',
              display: 'inline-flex',
            }}>
              <div style={{
                width: pw,
                height: ph,
                background: 'white',
                color: 'black',
                display: 'flex',
                alignItems: 'stretch',
                border: '1px solid #ccc',
                paddingTop: `${3 * PREVIEW_SCALE}px`,
                paddingRight: `${3 * PREVIEW_SCALE}px`,
                paddingBottom: `${3 * PREVIEW_SCALE}px`,
                paddingLeft: `${10 * PREVIEW_SCALE}px`,
                gap: `${5 * PREVIEW_SCALE}px`,
                fontFamily: 'Arial, Helvetica, sans-serif',
                boxSizing: 'border-box',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {/* Left */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0, width: '42%', overflow: 'hidden' }}>
                  <div style={{ fontSize: 36 * PREVIEW_SCALE, fontWeight: 900, lineHeight: 1, letterSpacing: -1, whiteSpace: 'nowrap' }}>
                    {esc(code)}
                  </div>
                  {locationName && (
                    <div style={{ fontSize: 11 * PREVIEW_SCALE, fontWeight: 700, marginTop: 2 * PREVIEW_SCALE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {esc(locationName)}
                    </div>
                  )}
                  <div style={{ fontSize: 7 * PREVIEW_SCALE, color: '#444', marginTop: 1 * PREVIEW_SCALE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {esc(item)}
                  </div>
                </div>
                {/* Vertical divider */}
                {partLines.length > 0 && (
                  <div style={{ width: 0.75 * PREVIEW_SCALE, background: '#000', margin: `${3 * PREVIEW_SCALE}px 0`, flexShrink: 0 }} />
                )}
                {/* Right: parts */}
                {partLines.length > 0 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ fontSize: 6.5 * PREVIEW_SCALE, lineHeight: 1.45, overflow: 'hidden' }}>
                      {partLines.map((line, i) => (
                        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Part selector */}
          {showPartsEnabled && productParts.length > 0 && (
            <div style={{ marginBottom: 14, border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg2)', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Parts on label</span>
                <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={toggleAll}>
                  {allSelected ? 'Deselect all' : 'All parts'}
                </button>
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', padding: '4px 10px' }}>
                {productParts.map((p, i) => {
                  const label = p.name + (p.variant ? ` (${p.variant})` : '') + (p.qty > 1 ? ` \u00d7${p.qty}` : '');
                  return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={selectedParts.has(i)} onChange={() => togglePart(i)} />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 14 }}>
            Label size: <strong>{labelSize.width}&quot; \u00d7 {labelSize.height}&quot;</strong> \u2014 change in Settings \u2192 Parts Box Labels
          </p>

          <div className="modal-footer">
            <button className="btn" onClick={closeModal}>close</button>
            <button className="btn btn-primary" onClick={printLabel}>&#x1F5A8; Print label</button>
          </div>
        </div>
      </div>
    </div>
  );
}
