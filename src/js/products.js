let productSearch = '';

function renderProductView() {
  const container = document.getElementById('view-product');
  const items = getItems().filter(i => !products[i]?.archived);
  items.forEach(it=>{ if(!products[it]) products[it]={category:''}; });

  // Apply 3MF filter then search
  const sliceFiltered = sliceFilter === 'presliced' ? items.filter(i => productHas3mf(i) && products[i]?.preSliced)
    : sliceFilter === 'sliced' ? items.filter(i => productHas3mf(i))
    : sliceFilter === 'unsliced' ? items.filter(i => !productHas3mf(i))
    : items;
  const q = productSearch.trim().toLowerCase();
  const filteredItems = q ? sliceFiltered.filter(i =>
    i.toLowerCase().includes(q) ||
    (products[i]?.category||'').toLowerCase().includes(q) ||
    parts.some(p => p.item === i && p.name.toLowerCase().includes(q))
  ) : sliceFiltered;

  // printing = any part currently being printed
  const printingItems = filteredItems.filter(item => {
    const ps = parts.filter(p=>p.item===item);
    return ps.some(p=>p.status==='printing');
  });
  // ready to build = all parts done
  const readyItems = filteredItems.filter(item => isReady(item));
  // commenced = any part done, nothing printing, not fully done
  const commencedItems = filteredItems.filter(item => {
    if (isReady(item)) return false;
    const ps = parts.filter(p=>p.item===item);
    if (ps.some(p=>p.status==='printing')) return false;
    return ps.some(p=>p.status==='done');
  });
  const activeItems = [...printingItems, ...commencedItems, ...readyItems];
  const otherItems = filteredItems.filter(i => !activeItems.includes(i));

  // Group other items by category
  const cats = {};
  otherItems.forEach(item => {
    const cat = products[item]?.category || 'uncategorised';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(item);
  });

  container.innerHTML = '';

  // ── Render filter bar ──
  const filterBar = document.getElementById('product-filter-bar');
  if (filterBar) {
    filterBar.innerHTML = '';
    const filters = [
      { val: 'all', label: 'all products' },
      { val: 'presliced', label: '✓ pre-sliced' },
      { val: 'sliced', label: '3MF attached' },
      { val: 'unsliced', label: '✗ no 3MF' },
    ];
    filters.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (sliceFilter === f.val ? ' active' : '');
      btn.textContent = f.label;
      btn.addEventListener('click', () => { sliceFilter = f.val; renderProductView(); });
      filterBar.appendChild(btn);
    });
    // Stats
    const allItems2 = getItems().filter(i => !products[i]?.archived);
    const slicedCount = allItems2.filter(i => productHas3mf(i)).length;
    const preSlicedCount = allItems2.filter(i => productHas3mf(i) && products[i]?.preSliced).length;
    const info = document.createElement('span');
    info.style.cssText = 'font-size:12px;color:var(--text2);margin-left:4px';
    info.textContent = preSlicedCount + ' pre-sliced · ' + slicedCount + '/' + allItems2.length + ' have 3MF';
    filterBar.appendChild(info);
    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'search products…';
    searchInput.value = productSearch;
    searchInput.style.cssText = 'font-size:12px;padding:4px 10px;border-radius:var(--radius);border:0.5px solid var(--border2);background:var(--bg2);color:var(--text);width:160px;font-family:inherit;outline:none;margin-left:auto';
    searchInput.addEventListener('input', function() {
      productSearch = this.value;
      const cursorPos = this.selectionStart;
      renderProductView();
      const bar2 = document.getElementById('product-filter-bar');
      if (bar2) {
        const inp2 = bar2.querySelector('input[type="search"]');
        if (inp2) { inp2.focus(); try { inp2.setSelectionRange(cursorPos, cursorPos); } catch(e2) {} }
      }
    });
    filterBar.appendChild(searchInput);
  }

  // ── Ready to build section (top) ──
  if (readyItems.length) {
    const sec = buildSection('ready to build', readyItems, 'var(--green)', true);
    container.appendChild(sec);
  }

  // ── Printing section ──
  if (printingItems.length) {
    const sec = buildSection('printing', printingItems, 'var(--amber-text)', true);
    container.appendChild(sec);
  }

  // ── Commenced section ──
  if (commencedItems.length) {
    const sec = buildSection('commenced', commencedItems, 'var(--blue-text)', true);
    container.appendChild(sec);
  }

  // ── Category sections ──
  const catOrder = typeof getCategoryOrder === 'function' ? getCategoryOrder() : [];
  const sortedCats = Object.keys(cats).sort((a, b) => {
    if (a === 'uncategorised') return 1;
    if (b === 'uncategorised') return -1;
    const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  sortedCats.forEach(cat => {
    const sec = buildSection(cat, cats[cat].sort((a,b)=>a.localeCompare(b)), null, false);
    container.appendChild(sec);
  });

  if (!activeItems.length && !otherItems.length) {
    container.innerHTML = '<p style="color:var(--text2);padding:1rem 0">no parts yet — add a product to get started.</p>';
  }
}

function buildSection(title, itemList, titleColor, defaultOpen) {
  // If section has never been interacted with, use the defaultOpen value
  const neverSet = !catExpanded.has(title) && !catExpanded.has('__closed__' + title);
  if (neverSet && defaultOpen) catExpanded.add(title);
  const isOpen = catExpanded.has(title);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:16px';

  // Section header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;user-select:none;margin-bottom:8px;border-bottom:0.5px solid var(--border)';
  const chevron = document.createElement('span');
  chevron.className = 'chevron' + (isOpen?' open':'');
  chevron.textContent = '▶';
  chevron.style.cssText = 'font-size:10px;color:var(--text3)';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:'+(titleColor||'var(--text2)');
  label.textContent = title;
  const count = document.createElement('span');
  count.style.cssText = 'font-size:11px;color:var(--text3);margin-left:2px';
  count.textContent = '(' + itemList.length + ')';
  const allExpanded = itemList.every(i => openProducts.has(i));
  const expandAllBtn = document.createElement('button');
  expandAllBtn.style.cssText = 'margin-left:auto;font-size:11px;padding:2px 8px;border-radius:var(--radius);border:0.5px solid var(--border2);background:transparent;color:var(--text3);cursor:pointer;white-space:nowrap;font-family:inherit';
  expandAllBtn.textContent = allExpanded ? '− collapse all' : '+ expand all';
  expandAllBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (allExpanded) itemList.forEach(i => openProducts.delete(i));
    else itemList.forEach(i => openProducts.add(i));
    renderProductView();
  });

  hdr.appendChild(chevron); hdr.appendChild(label); hdr.appendChild(count); hdr.appendChild(expandAllBtn);
  hdr.addEventListener('click', () => {
    if (catExpanded.has(title)) {
      catExpanded.delete(title);
      catExpanded.add('__closed__' + title);
    } else {
      catExpanded.add(title);
      catExpanded.delete('__closed__' + title);
    }
    saveCatState();
    renderProductView();
  });
  wrap.appendChild(hdr);

  // Product cards
  const list = document.createElement('div');
  list.className = 'product-list';
  list.style.display = isOpen ? '' : 'none';

  itemList.forEach(item => {
    const ps = parts.filter(p=>p.item===item);
    const tp = ps.reduce((a,p)=>a+p.qty,0), dp = ps.reduce((a,p)=>a+p.printed,0);
    const pct = tp>0?Math.round(dp/tp*100):0;
    const ready = isReady(item), isOpen2 = openProducts.has(item);
    const cat = products[item]?.category||'';
    const planN = ps.filter(p=>p.status==='planning').length;
    const qN = ps.filter(p=>p.status==='queue').length;
    const prN = ps.filter(p=>p.status==='printing').length;
    const dN = ps.filter(p=>p.status==='done').length;

    const card = document.createElement('div');
    card.className = 'product-card' + (ready?' ready':'');

    const header = document.createElement('div');
    header.className = 'product-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'product-title-wrap';

    const iconPath = products[item]?.imagePath;
    if (iconPath) {
      const img = document.createElement('img');
      img.className = 'product-icon';
      img.src = 'file://' + iconPath;
      img.onerror = () => img.style.display = 'none';
      titleWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'product-icon-placeholder';
      ph.title = 'click to add image'; ph.textContent = '🖼'; ph.style.fontSize = '16px';
      ph.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); uploadProductImage(n); }; })(item));
      titleWrap.appendChild(ph);
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'product-title'; titleSpan.textContent = item;
    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename-btn'; renameBtn.textContent = 'manage';
    renameBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); openRename(n); }; })(item));
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'rename-btn'; archiveBtn.style.color = 'var(--amber-text)'; archiveBtn.title = 'move to archive'; archiveBtn.textContent = '↓ archive';
    archiveBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); archiveProduct(n); }; })(item));
    const folderBtn = document.createElement('button');
    folderBtn.className = 'rename-btn'; folderBtn.title = 'open product folder'; folderBtn.textContent = '🗂 folder'; folderBtn.style.fontSize = '12px';
    folderBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); openProductFolder(n); }; })(item));
    const slicerBtn = document.createElement('button');
    slicerBtn.className = 'rename-btn'; slicerBtn.title = 'open in slicer'; slicerBtn.textContent = '▶ slicer'; slicerBtn.style.fontSize = '12px';
    slicerBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); openProductInSlicer(n); }; })(item));

    // Upload 3MF button
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'rename-btn'; uploadBtn.title = 'upload 3MF file'; uploadBtn.textContent = '↑ 3MF'; uploadBtn.style.fontSize = '12px';
    uploadBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); uploadProduct3mf(n); }; })(item));

    titleWrap.appendChild(titleSpan); titleWrap.appendChild(renameBtn); titleWrap.appendChild(archiveBtn); titleWrap.appendChild(folderBtn); titleWrap.appendChild(slicerBtn); titleWrap.appendChild(uploadBtn);
    if (appSettings.invPopup !== false) {
      const invBtn = document.createElement('button');
      invBtn.className = 'rename-btn'; invBtn.title = 'add to inventory'; invBtn.textContent = '+ inv';
      invBtn.style.cssText = 'font-size:12px;color:var(--green-dark)';
      invBtn.addEventListener('click', (function(n){ return function(e){ e.stopPropagation(); openQuickAddModal(n); }; })(item));
      titleWrap.appendChild(invBtn);
    }

    // N3D website link button
    if (products[item]?.n3dUrl) {
      const n3dLinkBtn = document.createElement('button');
      n3dLinkBtn.className = 'rename-btn';
      n3dLinkBtn.title = 'view on N3D Melbourne';
      n3dLinkBtn.textContent = '🌐 website';
      n3dLinkBtn.style.cssText = 'font-size:12px;color:#3C3489';
      n3dLinkBtn.addEventListener('click', (function(url){ return function(e){
        e.stopPropagation();
        if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
        else window.open(url, '_blank');
      };})(products[item].n3dUrl));
      titleWrap.appendChild(n3dLinkBtn);
    }

    // Title wrap + badges
    header.appendChild(titleWrap);
    if (productHas3mf(item)) {
      const badge3mf = document.createElement('span');
      const isPreSliced = products[item]?.preSliced;
      badge3mf.className = 'badge-3mf';
      badge3mf.style.cursor = 'pointer';
      if (isPreSliced) {
        badge3mf.style.cssText = 'background:#EAF3DE;color:#27500A;border-color:#97C459;cursor:pointer';
        badge3mf.textContent = '✓ 3MF';
        badge3mf.title = 'Pre-sliced ✓ — click to unmark';
      } else {
        badge3mf.textContent = '3MF';
        badge3mf.title = 'Click to mark as pre-sliced';
      }
      badge3mf.addEventListener('click', (function(n) { return async function(e) {
        e.stopPropagation();
        if (!products[n]) products[n] = { category: '' };
        products[n].preSliced = !products[n].preSliced;
        await persist(); render();
      }; })(item));
      header.appendChild(badge3mf);
    }
    if (products[item]?.shiny) {
      const badgeShiny = document.createElement('span');
      badgeShiny.className = 'badge-shiny';
      badgeShiny.textContent = '✨ shiny';
      header.appendChild(badgeShiny);
    }

    if (ready) {
      const readyBadge = document.createElement('span');
      readyBadge.className = 'ready-badge'; readyBadge.style.cursor = 'pointer';
      readyBadge.title = 'click to mark as done and add to inventory';
      readyBadge.innerHTML = '<span class="ready-dot"></span>ready to build — click when done';
      readyBadge.addEventListener('click', (function(n){ return function(e){
        e.stopPropagation();
        completionProductName = n; completionQty = 1;
        document.getElementById('completion-qty-val').textContent = '1';
        document.getElementById('completion-modal').style.display = '';
      }; })(item));
      header.appendChild(readyBadge);
    } else {
      const progBadge = document.createElement('span');
      progBadge.className = 'in-progress-badge';
      progBadge.textContent = dp + '/' + tp + ' pcs · ' + pct + '%';
      const badgeWrap = document.createElement('div');
      badgeWrap.style.cssText = 'display:flex;gap:5px';
      if (planN) { const b=document.createElement('span'); b.className='badge bpl'; b.textContent=planN; badgeWrap.appendChild(b); }
      if (qN) { const b=document.createElement('span'); b.className='badge bq'; b.textContent=qN; badgeWrap.appendChild(b); }
      if (prN) { const b=document.createElement('span'); b.className='badge bp'; b.textContent=prN; badgeWrap.appendChild(b); }
      if (dN) { const b=document.createElement('span'); b.className='badge bd'; b.textContent=dN; badgeWrap.appendChild(b); }
      header.appendChild(progBadge); header.appendChild(badgeWrap);
    }

    const progWrap = document.createElement('div'); progWrap.className = 'progress-bar-wrap';
    const progFill = document.createElement('div'); progFill.className = 'progress-bar-fill '+(ready?'done':'going'); progFill.style.width = pct+'%';
    progWrap.appendChild(progFill); header.appendChild(progWrap);
    const chevron2 = document.createElement('span'); chevron2.className = 'chevron'+(isOpen2?' open':''); chevron2.textContent = '▶';
    header.appendChild(chevron2);
    header.addEventListener('click', (function(n){ return function(){ toggleProduct(n); }; })(item));
    card.appendChild(header);

    const desc = products[item]?.description||'';
    if (cat || isOpen2 || desc) {
      const sub = document.createElement('div'); sub.className = 'product-subheader';
      if (cat) { const t=document.createElement('span'); t.className='cat-tag'; t.textContent=cat; sub.appendChild(t); }
      if (products[item]?.source) { const t=document.createElement('span'); t.className='cat-tag'; t.textContent=products[item].source; sub.appendChild(t); }
      if (products[item]?.designer) { const t=document.createElement('span'); t.style.cssText='font-size:12px;color:var(--text2)'; t.textContent='by ' + products[item].designer; sub.appendChild(t); }
      if (desc) { const t=document.createElement('span'); t.style.cssText='font-size:12px;color:var(--text2);font-style:italic'; t.textContent=desc; sub.appendChild(t); }
      if (!ready && isOpen2) { const t=document.createElement('span'); t.style.cssText='font-size:11px;color:var(--text2)'; t.textContent=ps.filter(p=>p.status!=='done').length+' part'+(ps.filter(p=>p.status!=='done').length!==1?'s':'')+' left'; sub.appendChild(t); }
      if (ready) { const t=document.createElement('span'); t.style.cssText='font-size:11px;color:var(--green-dark)'; t.textContent='all '+tp+' pieces printed'; sub.appendChild(t); }
      card.appendChild(sub);
    }

    if (isOpen2) {
      const table = document.createElement('div'); table.className = 'parts-table';
      ps.forEach(p => {
        const colours = p.colours&&p.colours.length ? p.colours : (p.colour?[{hex:p.colour,name:p.colourName||'',swatchUrl:p.colourSwatch||''}]:[]);
        const hasSubParts = p.subParts && p.subParts.length > 0;
        const displayPrinted = hasSubParts ? p.subParts.filter(s=>s.status==='done').length : p.printed;
        const displayQty = hasSubParts ? p.subParts.length : p.qty;

        const row = document.createElement('div'); row.className = 'part-row';
        row.innerHTML =
          '<div><div class="part-row-name">' + esc(p.name) + (p.variant?'<span class="part-row-sub"> ('+esc(p.variant)+')</span>':'') + '</div>' + (p.stl?'<div class="part-row-stl">'+esc(p.stl)+'</div>':'') + '</div>' +
          '<div class="colour-cell" style="gap:3px;flex-wrap:wrap">' + colours.filter(c=>c&&c.hex).map(c=>c.swatchUrl?'<img class="swatch" src="'+c.swatchUrl+'" title="'+esc(c.name||'')+'" style="object-fit:cover">':'<span class="swatch" style="background:'+c.hex+'" title="'+esc(c.name||'')+'"></span>').join('') + '<span style="font-size:11px;color:var(--text2)">' + colours.filter(c=>c&&c.hex).map(c=>esc(c.name||'')).filter(Boolean).join(', ') + '</span></div>' +
          '<span class="part-row-qty" style="cursor:pointer;border-bottom:1px dashed var(--border2)" title="click to edit qty" data-partid="' + p.id + '">' + displayPrinted + '/' + displayQty + '</span>' +
          '<span class="sp sp-' + p.status + '" style="cursor:pointer" title="click to change status">' + p.status + '</span>';
        const actions = document.createElement('div'); actions.className = 'part-row-actions';
        if (p.status==='done') { const rb=document.createElement('button'); rb.className='icon-btn'; rb.title='reprint'; rb.textContent='↺'; rb.addEventListener('click',(function(id){return function(){reprint(id);};})(p.id)); actions.appendChild(rb); }
        const spEl = row.querySelector('.sp');
        if (spEl) spEl.addEventListener('click',(function(id){return function(e){e.stopPropagation();openStatusModal(id);};})(p.id));
        const qtyEl = row.querySelector('.part-row-qty');
        if (qtyEl) { qtyEl.addEventListener('click',(function(id,p){return function(e){
          e.stopPropagation();
          const input=document.createElement('input');
          input.type='number'; input.min='1'; input.value=p.qty;
          input.style.cssText='width:50px;font-size:12px;font-family:inherit;background:var(--bg2);border:0.5px solid var(--border2);border-radius:4px;padding:2px 4px;color:var(--text);text-align:center;outline:none';
          qtyEl.replaceWith(input); input.focus(); input.select();
          const finish=async()=>{
            const v=parseInt(input.value)||1;
            const part=parts.find(x=>x.id===id);
            if(part){ part.qty=Math.max(1,v); if(part.printed>part.qty) part.printed=part.qty; await persist(); render(); }
          };
          input.addEventListener('blur',finish);
          input.addEventListener('keydown',e2=>{if(e2.key==='Enter')finish();if(e2.key==='Escape')render();});
        };})(p.id,p)); }
        const addSub=document.createElement('button'); addSub.className='icon-btn'; addSub.title='add sub-part'; addSub.textContent='+';
        addSub.addEventListener('click',(function(id){return function(e){e.stopPropagation();addSubPart(id);};})(p.id));
        const eb=document.createElement('button'); eb.className='icon-btn'; eb.title='edit'; eb.textContent='✎';
        eb.addEventListener('click',(function(id){return function(){openEdit(id);};})(p.id));
        const db=document.createElement('button'); db.className='icon-btn'; db.title='delete'; db.textContent='✕';
        db.addEventListener('click',(function(id){return function(){del(id);};})(p.id));
        actions.appendChild(addSub); actions.appendChild(eb); actions.appendChild(db);
        row.appendChild(actions); table.appendChild(row);

        if (hasSubParts) {
          p.subParts.forEach((sp, si) => {
            const subRow = document.createElement('div'); subRow.className = 'sub-row';
            const spPrinted = sp.printed||0, spQty = sp.qty||1;
            subRow.innerHTML = '<div class="sub-row-name">↳ ' + esc(sp.name) + '</div><span class="part-row-qty" style="font-size:11px">' + spPrinted + '/' + spQty + '</span><span class="sp sp-' + sp.status + '" style="cursor:pointer;font-size:11px" title="click to change">' + sp.status + '</span>';
            const subActions = document.createElement('div'); subActions.style.display='flex'; subActions.style.gap='2px';
            const spM=document.createElement('button'); spM.className='icon-btn'; spM.textContent='−'; spM.style.fontSize='11px';
            spM.addEventListener('click',(function(pid,idx){return function(e){e.stopPropagation();adjustSubPrinted(pid,idx,-1);};})(p.id,si));
            const spP=document.createElement('button'); spP.className='icon-btn'; spP.textContent='+'; spP.style.fontSize='11px';
            spP.addEventListener('click',(function(pid,idx){return function(e){e.stopPropagation();adjustSubPrinted(pid,idx,1);};})(p.id,si));
            const sDel=document.createElement('button'); sDel.className='icon-btn'; sDel.textContent='✕'; sDel.style.fontSize='11px';
            sDel.addEventListener('click',(function(pid,idx){return function(){delSubPart(pid,idx);};})(p.id,si));
            subActions.appendChild(spM); subActions.appendChild(spP); subActions.appendChild(sDel);
            subRow.appendChild(subActions);
            const subSp=subRow.querySelector('.sp');
            if(subSp) subSp.addEventListener('click',(function(pid,idx){return function(e){e.stopPropagation();openSubStatusModal(pid,idx);};})(p.id,si));
            table.appendChild(subRow);
          });
        }
      });
      card.appendChild(table);
    }
    list.appendChild(card);
  });
  wrap.appendChild(list);
  return wrap;
}

function saveCatState() {
  if (window.electronAPI) saveData({ parts, products, inventory, expandedCats: [...catExpanded] });
}

function toggleProduct(item) { if(openProducts.has(item)) openProducts.delete(item); else openProducts.add(item); renderProductView(); }

function openRename(item) {
  renameTarget=item;
  document.getElementById('rename-input').value=item;
  populateCategorySelect('rename-cat', products[item]?.category||'');
  document.getElementById('rename-desc').value=products[item]?.description||'';
  document.getElementById('rename-shiny').checked=!!(products[item]?.shiny);
  document.getElementById('rename-n3durl').value=products[item]?.n3dUrl||'';
  document.getElementById('rename-designer').value=products[item]?.designer||'';
  document.getElementById('rename-source').value=products[item]?.source||'';
  document.getElementById('rename-modal').style.display='';
  setTimeout(()=>document.getElementById('rename-input').focus(),50);
}
function closeRename() { document.getElementById('rename-modal').style.display='none'; renameTarget=null; }

async function deleteProductFromManage() {
  if (!renameTarget) return;
  const name = renameTarget;
  const partCount = parts.filter(p => p.item === name).length;
  if (!confirm('Delete "' + name + '" and all ' + partCount + ' part' + (partCount!==1?'s':'') + '? This cannot be undone.')) return;
  parts = parts.filter(p => p.item !== name);
  delete products[name];
  openProducts.delete(name);
  closeRename();
  await persist(); render();
}
async function saveRename() {
  const newName=document.getElementById('rename-input').value.trim();
  const newCat=document.getElementById('rename-cat').value.trim();
  const newDesc=document.getElementById('rename-desc').value.trim();
  const newShiny=document.getElementById('rename-shiny').checked;
  if(!newName||!renameTarget) return;
  parts.forEach(p=>{ if(p.item===renameTarget) p.item=newName; });
  const oldP=products[renameTarget]||{}; delete products[renameTarget];
  const newN3dUrl=document.getElementById('rename-n3durl').value.trim();
  const newDesigner=document.getElementById('rename-designer').value.trim();
  const newSource=document.getElementById('rename-source').value;
  products[newName]={...oldP, category:newCat, description:newDesc, shiny:newShiny, n3dUrl:newN3dUrl||oldP.n3dUrl||'', designer:newDesigner, source:newSource};
  if(openProducts.has(renameTarget)){ openProducts.delete(renameTarget); openProducts.add(newName); }
  await persist(); closeRename(); render();
}

function renderKanban() {
  const show=activeFilter==='all'?parts:parts.filter(p=>p.status===activeFilter);
  ['queue','printing','done'].forEach(s=>{
    const col=document.getElementById('col-'+s); if(!col) return;
    col.innerHTML='';
    const grp=show.filter(p=>p.status===s);
    document.getElementById('cnt-'+s).textContent=grp.length;
    grp.forEach(p=>col.appendChild(makeCard(p)));
  });
}

function makeCard(p) {
  const d=document.createElement('div');
  d.className='card'; d.draggable=true; d.dataset.id=p.id;
  d.ondragstart=e=>{ dragId=p.id; d.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; };
  d.ondragend=()=>{ d.classList.remove('dragging'); dragId=null; document.querySelectorAll('.drop-zone').forEach(z=>z.classList.remove('drag-over')); };
  const sub=[p.item,p.variant].filter(Boolean).join(' — ');
  const dots=Array.from({length:p.qty},(_,i)=>`<span class="dot${i<p.printed?' done':''}"></span>`).join('');
  d.innerHTML=`
    <div class="card-name">${esc(p.name)}</div>
    ${sub?`<div class="card-sub">${esc(sub)}</div>`:''}
    <div class="card-tags">
      ${(p.colours&&p.colours.length?p.colours:[{hex:p.colour,name:p.colourName,swatchUrl:p.colourSwatch||''}]).filter(c=>c&&c.hex).map(c=>`<span class="colour-tag">${c.swatchUrl?`<img class="swatch" src="${c.swatchUrl}" style="object-fit:cover">`:`<span class="swatch" style="background:${c.hex}"></span>`}${esc(c.name||c.hex)}</span>`).join('')}
      ${p.stl?`<span class="tag-stl">${esc(p.stl)}</span>`:''}
    </div>
    <div class="card-footer">
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="adjustQty(${p.id},-1)">−</button>
        <div><div class="qty-num">${p.printed}/${p.qty}</div><div class="qty-label">printed</div></div>
        <button class="qty-btn" onclick="adjustQty(${p.id},1)">+</button>
      </div>
      <div class="card-actions">
        ${p.status==='done'?`<button class="icon-btn" title="reprint" onclick="reprint(${p.id})">↺</button>`:''}
        <button class="icon-btn" title="edit" onclick="openEdit(${p.id})">✎</button>
        <button class="icon-btn" title="delete" onclick="del(${p.id})">✕</button>
      </div>
    </div>
    ${p.qty>0?`<div class="print-dots">${dots}<span style="margin-left:5px;font-size:11px;color:var(--text2)">${p.printed} of ${p.qty}</span></div>`:''}
    ${p.desc?`<div class="desc-text">${esc(p.desc)}</div>`:''}`;
  return d;
}
