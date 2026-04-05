import React, { useState, useEffect } from 'react';
import { useApp, localFileUrl } from '../context/AppContext';

function esc(s) { return String(s || ''); }

export default function ProductView() {
  const {
    parts, products, appSettings, sliceFilter, setSliceFilter, productSearch, setProductSearch,
    openProducts, catExpanded, isReady, getCategoryOrder,
    openModal, toggleProduct, toggleCat, archiveProduct, togglePreSliced,
    openProductFolder, openProductInSlicer, uploadProduct3mf, uploadProductImage, openExternalUrl, isElectron,
  } = useApp();

  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const has3mf = (i) => !!(products[i]?.threeMfFiles?.length || products[i]?.threeMfFolder);

  const handle3mfUpload = async (item) => {
    if (!appSettings.threeMfFolder) {
      setToast('⚠ Set a 3MF root folder in Settings first');
      return;
    }
    try {
      const count = await uploadProduct3mf(item);
      if (count > 0) setToast(`✓ ${count} file${count !== 1 ? 's' : ''} added to ${item}`);
      else if (count === 0) { /* cancelled or copy failed silently */ }
    } catch {
      setToast('⚠ Upload failed — check the 3MF folder in Settings');
    }
  };

  // Include all non-archived products — even ones with no parts yet (so newly added products are visible)
  const items = [...new Set([
    ...Object.keys(products).filter(k => !products[k]?.archived),
    ...parts.map(p => p.item).filter(Boolean).filter(i => !products[i]?.archived),
  ])];

  // Apply 3MF filter
  const sliceFiltered = sliceFilter === 'presliced' ? items.filter(i => has3mf(i) && products[i]?.preSliced)
    : sliceFilter === 'sliced' ? items.filter(i => has3mf(i))
    : sliceFilter === 'unsliced' ? items.filter(i => !has3mf(i))
    : items;

  // Apply search
  const q = productSearch.trim().toLowerCase();
  const filteredItems = q ? sliceFiltered.filter(i =>
    i.toLowerCase().includes(q) ||
    (products[i]?.category || '').toLowerCase().includes(q) ||
    parts.some(p => p.item === i && p.name.toLowerCase().includes(q))
  ) : sliceFiltered;

  // Bucket items
  const printingItems = filteredItems.filter(item => parts.filter(p => p.item === item).some(p => p.status === 'printing'));
  const readyItems = filteredItems.filter(item => isReady(item));
  const commencedItems = filteredItems.filter(item => {
    if (isReady(item)) return false;
    const ps = parts.filter(p => p.item === item);
    if (ps.some(p => p.status === 'printing')) return false;
    return ps.some(p => p.status === 'done');
  });
  const activeItems = [...printingItems, ...commencedItems, ...readyItems];
  const otherItems = filteredItems.filter(i => !activeItems.includes(i));

  // Group others by category
  const cats = {};
  otherItems.forEach(item => {
    const cat = products[item]?.category || 'uncategorised';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(item);
  });

  const catOrder = getCategoryOrder();
  const sortedCats = Object.keys(cats).sort((a, b) => {
    if (a === 'uncategorised') return 1;
    if (b === 'uncategorised') return -1;
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const allItems2 = items;
  const slicedCount = allItems2.filter(i => has3mf(i)).length;
  const preSlicedCount = allItems2.filter(i => has3mf(i) && products[i]?.preSliced).length;

  return (
    <div>
      {/* Filter bar */}
      <div id="product-filter-bar" style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { val: 'all', label: 'all products' },
          { val: 'presliced', label: '✓ pre-sliced' },
          { val: 'sliced', label: '3MF attached' },
          { val: 'unsliced', label: '✗ no 3MF' },
        ].map(f => (
          <button key={f.val} className={`pill${sliceFilter === f.val ? ' active' : ''}`} onClick={() => setSliceFilter(f.val)}>{f.label}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 4 }}>{preSlicedCount} pre-sliced · {slicedCount}/{allItems2.length} have 3MF</span>
        <input
          type="search" placeholder="search products…" value={productSearch}
          onChange={e => setProductSearch(e.target.value)}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', width: 160, fontFamily: 'inherit', outline: 'none', marginLeft: 'auto' }}
        />
      </div>

      {/* Sections */}
      {readyItems.length > 0 && <Section title="ready to build" titleColor="var(--green)" items={readyItems} defaultOpen catExpanded={catExpanded} toggleCat={toggleCat} openProducts={openProducts} toggleProduct={toggleProduct} parts={parts} products={products} isReady={isReady} appSettings={appSettings} openModal={openModal} archiveProduct={archiveProduct} togglePreSliced={togglePreSliced} openProductFolder={openProductFolder} openProductInSlicer={openProductInSlicer} uploadProduct3mf={handle3mfUpload} uploadProductImage={uploadProductImage} openExternalUrl={openExternalUrl} isElectron={isElectron} />}
      {printingItems.length > 0 && <Section title="printing" titleColor="var(--amber-text)" items={printingItems} defaultOpen catExpanded={catExpanded} toggleCat={toggleCat} openProducts={openProducts} toggleProduct={toggleProduct} parts={parts} products={products} isReady={isReady} appSettings={appSettings} openModal={openModal} archiveProduct={archiveProduct} togglePreSliced={togglePreSliced} openProductFolder={openProductFolder} openProductInSlicer={openProductInSlicer} uploadProduct3mf={handle3mfUpload} uploadProductImage={uploadProductImage} openExternalUrl={openExternalUrl} isElectron={isElectron} />}
      {commencedItems.length > 0 && <Section title="commenced" titleColor="var(--blue-text)" items={commencedItems} defaultOpen catExpanded={catExpanded} toggleCat={toggleCat} openProducts={openProducts} toggleProduct={toggleProduct} parts={parts} products={products} isReady={isReady} appSettings={appSettings} openModal={openModal} archiveProduct={archiveProduct} togglePreSliced={togglePreSliced} openProductFolder={openProductFolder} openProductInSlicer={openProductInSlicer} uploadProduct3mf={handle3mfUpload} uploadProductImage={uploadProductImage} openExternalUrl={openExternalUrl} isElectron={isElectron} />}

      {sortedCats.map(cat => (
        <Section key={cat} title={cat} titleColor={null} items={cats[cat].sort((a, b) => a.localeCompare(b))} defaultOpen={false} catExpanded={catExpanded} toggleCat={toggleCat} openProducts={openProducts} toggleProduct={toggleProduct} parts={parts} products={products} isReady={isReady} appSettings={appSettings} openModal={openModal} archiveProduct={archiveProduct} togglePreSliced={togglePreSliced} openProductFolder={openProductFolder} openProductInSlicer={openProductInSlicer} uploadProduct3mf={handle3mfUpload} uploadProductImage={uploadProductImage} openExternalUrl={openExternalUrl} isElectron={isElectron} />
      ))}

      {activeItems.length === 0 && otherItems.length === 0 && (
        <p style={{ color: 'var(--text2)', padding: '1rem 0' }}>no parts yet — add a product to get started.</p>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 8, padding: '10px 20px', fontSize: 13, color: 'var(--text)', boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

function Section({ title, titleColor, items, defaultOpen, catExpanded, toggleCat, openProducts, toggleProduct, parts, products, isReady, appSettings, openModal, archiveProduct, togglePreSliced, openProductFolder, openProductInSlicer, uploadProduct3mf, uploadProductImage, openExternalUrl, isElectron }) {
  const neverSet = !catExpanded.has(title) && !catExpanded.has('__closed__' + title);
  const isOpen = neverSet ? defaultOpen : catExpanded.has(title);
  const allExpanded = items.every(i => openProducts.has(i));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', userSelect: 'none', marginBottom: 8, borderBottom: '0.5px solid var(--border)' }} onClick={() => toggleCat(title, defaultOpen)}>
        <span className={`chevron${isOpen ? ' open' : ''}`} style={{ fontSize: 10, color: 'var(--text3)' }}>▶</span>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: titleColor || 'var(--text2)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 2 }}>({items.length})</span>
        <button style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
          onClick={e => {
            e.stopPropagation();
            if (allExpanded) {
              items.forEach(i => { if (openProducts.has(i)) toggleProduct(i); });
            } else {
              items.forEach(i => { if (!openProducts.has(i)) toggleProduct(i); });
            }
          }}>
          {allExpanded ? '− collapse all' : '+ expand all'}
        </button>
      </div>
      {isOpen && (
        <div className="product-list">
          {items.map(item => (
            <ProductCard key={item} item={item} parts={parts} products={products} isOpen={openProducts.has(item)} isReady={isReady(item)} toggleProduct={toggleProduct} appSettings={appSettings} openModal={openModal} archiveProduct={archiveProduct} togglePreSliced={togglePreSliced} openProductFolder={openProductFolder} openProductInSlicer={openProductInSlicer} uploadProduct3mf={uploadProduct3mf} uploadProductImage={uploadProductImage} openExternalUrl={openExternalUrl} isElectron={isElectron} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ item, parts, products, isOpen, isReady, toggleProduct, appSettings, openModal, archiveProduct, togglePreSliced, openProductFolder, openProductInSlicer, uploadProduct3mf, uploadProductImage, openExternalUrl, isElectron }) {
  const ps = parts.filter(p => p.item === item);
  const tp = ps.reduce((a, p) => a + p.qty, 0), dp = ps.reduce((a, p) => a + p.printed, 0);
  const pct = tp > 0 ? Math.round(dp / tp * 100) : 0;
  const cat = products[item]?.category || '';
  const planN = ps.filter(p => p.status === 'planning').length;
  const qN = ps.filter(p => p.status === 'queue').length;
  const prN = ps.filter(p => p.status === 'printing').length;
  const dN = ps.filter(p => p.status === 'done').length;
  const iconPath = products[item]?.imagePath;
  const has3mf = !!(products[item]?.threeMfFiles?.length || products[item]?.threeMfFolder);
  const isPreSliced = products[item]?.preSliced;
  const [imgOpen, setImgOpen] = React.useState(false);

  React.useEffect(() => {
    if (!imgOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setImgOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [imgOpen]);

  return (
    <div id={`product-card-${item.replace(/[^a-zA-Z0-9]/g, '_')}`} className={`product-card${isReady ? ' ready' : ''}`}>
      {imgOpen && localFileUrl(iconPath) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setImgOpen(false)}
        >
          <img
            src={localFileUrl(iconPath)}
            alt={esc(item)}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 48px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>{esc(item)}</span>
            <button style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 20, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={() => setImgOpen(false)}>✕</button>
          </div>
        </div>
      )}
      <div className="product-header" onClick={() => toggleProduct(item)}>
        <div className="product-title-wrap">
          {localFileUrl(iconPath) ? (
            <img className="product-icon" src={localFileUrl(iconPath)} alt="" style={{ cursor: 'zoom-in' }} onClick={e => { e.stopPropagation(); setImgOpen(true); }} onError={e => e.target.style.display = 'none'} />
          ) : (
            <div className="product-icon-placeholder" title="click to add image" style={{ fontSize: 16 }} onClick={e => { e.stopPropagation(); uploadProductImage(item); }}>🖼</div>
          )}
          <span className="product-title">{esc(item)}</span>
          <button className="rename-btn" onClick={e => { e.stopPropagation(); openModal('manage-product', { item }); }}>Manage</button>
          <button className="rename-btn" style={{ color: 'var(--amber-text)' }} title="move to archive" onClick={e => { e.stopPropagation(); if (confirm(`Archive "${item}"?`)) archiveProduct(item); }}>↓ Archive</button>
          {isElectron && <button className="rename-btn" title="open product folder" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); openProductFolder(item); }}>🗂 Folder</button>}
          {isElectron && <button className="rename-btn" title="open in slicer" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); openProductInSlicer(item); }}>▶ Slicer</button>}
          {isElectron && <button className="rename-btn" title="upload 3MF file" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); uploadProduct3mf(item); }}>↑ 3MF</button>}
          {appSettings.invPopup !== false && (
            <button className="rename-btn" title="add to inventory" style={{ fontSize: 12, color: 'var(--green-dark)' }} onClick={e => { e.stopPropagation(); openModal('quick-add', { productName: item }); }}>+ Inv</button>
          )}
          {products[item]?.n3dUrl && (
            <button className="rename-btn" title="view on N3D Melbourne" style={{ fontSize: 12, color: '#3C3489' }} onClick={e => { e.stopPropagation(); openExternalUrl(products[item].n3dUrl); }}>🌐 website</button>
          )}
        </div>

        {has3mf && (
          <span className="badge-3mf" style={{ cursor: 'pointer', ...(isPreSliced ? { background: '#EAF3DE', color: '#27500A', borderColor: '#97C459' } : {}) }}
            title={isPreSliced ? 'Pre-sliced ✓ — click to unmark' : 'Click to mark as pre-sliced'}
            onClick={e => { e.stopPropagation(); togglePreSliced(item); }}>
            {isPreSliced ? '✓ 3MF' : '3MF'}
          </span>
        )}
        {products[item]?.shiny && <span className="badge-shiny">✨ shiny</span>}
        {products[item]?.partsBoxEnabled && (
          <span className="badge-shiny" style={{ background: 'var(--bg2)', color: 'var(--text2)', borderColor: 'var(--border2)' }} title="has a parts box">
            📦{products[item].partsBox ? ` #${products[item].partsBox}` : ' parts box'}
          </span>
        )}

        {ps.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>no parts yet — expand to add one</span>
        ) : isReady ? (
          <span className="ready-badge" style={{ cursor: 'pointer' }} title="click to mark as done and add to inventory"
            onClick={e => { e.stopPropagation(); openModal('completion', { productName: item }); }}>
            <span className="ready-dot"></span>ready to build — click when done
          </span>
        ) : (
          <>
            <span className="in-progress-badge">{dp}/{tp} pcs · {pct}%</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {planN > 0 && <span className="badge bpl">{planN}</span>}
              {qN > 0 && <span className="badge bq">{qN}</span>}
              {prN > 0 && <span className="badge bp">{prN}</span>}
              {dN > 0 && <span className="badge bd">{dN}</span>}
            </div>
          </>
        )}
        <div className="progress-bar-wrap"><div className={`progress-bar-fill ${isReady ? 'done' : 'going'}`} style={{ width: pct + '%' }}></div></div>
        <span className={`chevron${isOpen ? ' open' : ''}`}>▶</span>
      </div>

      {(cat || isOpen || products[item]?.description) && (
        <div className="product-subheader">
          {cat && <span className="cat-tag">{esc(cat)}</span>}
          {products[item]?.source && <span className="cat-tag">{esc(products[item].source)}</span>}
          {products[item]?.designer && <span style={{ fontSize: 12, color: 'var(--text2)' }}>by {esc(products[item].designer)}</span>}
          {products[item]?.description && <span style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>{esc(products[item].description)}</span>}
          {!isReady && isOpen && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{ps.filter(p => p.status !== 'done').length} part{ps.filter(p => p.status !== 'done').length !== 1 ? 's' : ''} left</span>}
          {isReady && <span style={{ fontSize: 11, color: 'var(--green-dark)' }}>all {tp} pieces printed</span>}
        </div>
      )}

      {isOpen && <PartsTable parts={ps} item={item} openModal={openModal} />}
    </div>
  );
}

function PartsTable({ parts: ps, item, openModal }) {
  const { reprint, deletePart, adjustSubPrinted, deleteSubPart } = useApp();

  return (
    <div className="parts-table">
      {ps.map(p => {
        const colours = p.colours?.length ? p.colours : (p.colour ? [{ hex: p.colour, name: p.colourName || '', swatchUrl: p.colourSwatch || '' }] : []);
        const hasSubParts = p.subParts?.length > 0;
        const displayPrinted = hasSubParts ? p.subParts.filter(s => s.status === 'done').length : p.printed;
        const displayQty = hasSubParts ? p.subParts.length : p.qty;

        return (
          <div key={p.id}>
            <div className="part-row">
              <div>
                <div className="part-row-name">{esc(p.name)}{p.variant && <span className="part-row-sub"> ({esc(p.variant)})</span>}</div>
                {p.stl && <div className="part-row-stl">{esc(p.stl)}</div>}
              </div>
              <div className="colour-cell" style={{ gap: 3, flexWrap: 'wrap' }}>
                {colours.filter(c => c?.hex).map((c, ci) => {
                  const tip = [c.brand, c.brandName, c.name].filter(Boolean).join(' — ');
                  return c.swatchUrl
                    ? <img key={ci} className="swatch" src={c.swatchUrl} title={tip || ''} style={{ objectFit: 'cover' }} alt="" />
                    : <span key={ci} className="swatch" style={{ background: c.hex }} title={tip || ''}></span>;
                })}
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {colours.filter(c => c?.hex).map(c => [c.brand, c.name].filter(Boolean).join(' ')).filter(Boolean).join(', ')}
                </span>
              </div>
              <QtyCell partId={p.id} displayed={displayPrinted} total={displayQty} qty={p.qty} />
              <span className={`sp sp-${p.status}`} style={{ cursor: 'pointer' }} title="click to change status" onClick={e => { e.stopPropagation(); openModal('status', { partId: p.id }); }}>{p.status}</span>
              <div className="part-row-actions">
                {p.status === 'done' && <button className="icon-btn" title="reprint" onClick={() => reprint(p.id)}>↺</button>}
                <button className="icon-btn" title="add sub-part" onClick={e => { e.stopPropagation(); openModal('subpart', { partId: p.id }); }}>+</button>
                <button className="icon-btn" title="edit" onClick={() => openModal('part', { editId: p.id })}>✎</button>
                <button className="icon-btn" title="delete" onClick={() => deletePart(p.id)}>✕</button>
              </div>
            </div>
            {hasSubParts && p.subParts.map((sp, si) => (
              <div key={si} className="sub-row">
                <div className="sub-row-name">↳ {esc(sp.name)}</div>
                <span className="part-row-qty" style={{ fontSize: 11 }}>{sp.printed || 0}/{sp.qty || 1}</span>
                <span className={`sp sp-${sp.status}`} style={{ cursor: 'pointer', fontSize: 11 }} title="click to change" onClick={() => openModal('status', { partId: p.id, subIdx: si })}>{sp.status}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button className="icon-btn" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); adjustSubPrinted(p.id, si, -1); }}>−</button>
                  <button className="icon-btn" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); adjustSubPrinted(p.id, si, 1); }}>+</button>
                  <button className="icon-btn" style={{ fontSize: 11 }} onClick={() => deleteSubPart(p.id, si)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <button className="btn" style={{ margin: '10px 0', fontSize: 12 }} onClick={() => openModal('part', { editId: null, defaultItem: item })}>+ add part</button>
    </div>
  );
}

function QtyCell({ partId, displayed, total, qty }) {
  const { updatePartQty } = useApp();
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(qty);

  const commit = async () => {
    setEditing(false);
    const v = Math.max(1, parseInt(val) || 1);
    if (v !== qty) await updatePartQty(partId, v);
  };

  if (editing) {
    return (
      <input
        type="number" min="1" value={val}
        style={{ width: 50, fontSize: 12, fontFamily: 'inherit', background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 4, padding: '2px 4px', color: 'var(--text)', textAlign: 'center', outline: 'none' }}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditing(false); setVal(qty); } }}
      />
    );
  }
  return (
    <span className="part-row-qty" style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border2)' }} title="click to edit qty" onClick={e => { e.stopPropagation(); setEditing(true); setVal(qty); }}>
      {displayed}/{total}
    </span>
  );
}

