// ── INVENTORY ──
function invOnHand(item) {
  const totalOut = (item.distributions||[]).reduce((a,d)=>a+(d.qty||0),0);
  return Math.max(0,(item.built||0)-totalOut);
}

// Migrate old box/shelf fields to dynamic storage object
function invMigrateStorage(item) {
  if (!item.storage) {
    const locs = getStorageLocations();
    item.storage = {};
    locs.forEach((loc, i) => {
      item.storage[loc] = i === 0 ? (item.box||0) : i === 1 ? (item.shelf||0) : 0;
    });
  }
  // Ensure every current location has an entry
  getStorageLocations().forEach(loc => {
    if (item.storage[loc] === undefined) item.storage[loc] = 0;
  });
}

function invStorageTotal(item) {
  invMigrateStorage(item);
  return getStorageLocations().reduce((a, loc) => a + (item.storage[loc]||0), 0);
}

function invSyncStorage(item) {
  invMigrateStorage(item);
  const onHand = invOnHand(item);
  const total = invStorageTotal(item);
  if (total === onHand) return;
  const locs = getStorageLocations();
  let diff = onHand - total; // positive = add, negative = remove
  for (let i = locs.length - 1; i >= 0 && diff !== 0; i--) {
    const loc = locs[i];
    const cur = item.storage[loc]||0;
    if (diff > 0) {
      item.storage[loc] = cur + diff;
      diff = 0;
    } else {
      const reduce = Math.min(cur, -diff);
      item.storage[loc] = cur - reduce;
      diff += reduce;
    }
  }
}

function addToInventory(productName) {
  const existing = inventory.find(i=>i.name===productName);
  if (existing) {
    existing.built = (existing.built||0) + 1;
    invSyncStorage(existing);
  } else {
    const locs = getStorageLocations();
    const storage = {};
    locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? 1 : 0; });
    inventory.push({ id:'inv_'+Date.now(), name:productName, category:products[productName]?.category||'', built:1, location:'', storage, distributions:[], source:'tracker' });
  }
  persist(); renderInventoryView();
  setView('inventory');
}

async function quickAddToInventory(productName) {
  const existing = inventory.find(i => i.name === productName);
  if (existing) {
    existing.built = (existing.built||0) + 1;
    invSyncStorage(existing);
  } else {
    const locs = getStorageLocations();
    const storage = {};
    locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? 1 : 0; });
    inventory.push({ id:'inv_'+Date.now(), name:productName, category:products[productName]?.category||'', built:1, location:'', storage, distributions:[], source:'tracker' });
  }
  await persist();
  renderStats();
  // Flash brief feedback on the button
  document.querySelectorAll('.product-card').forEach(card => {
    const titleEl = card.querySelector('.product-title');
    if (titleEl && titleEl.textContent === productName) {
      const btn = [...card.querySelectorAll('.rename-btn')].find(b => b.textContent === '+ inv');
      if (btn) {
        btn.textContent = '✓ added!';
        btn.style.color = 'var(--green)';
        setTimeout(() => { btn.textContent = '+ inv'; btn.style.color = 'var(--green-dark)'; }, 1400);
      }
    }
  });
}

function renderInventoryView() {
  const container = document.getElementById('view-inventory');
  if (!container) return;

  const localIP = container.dataset.ip || '';
  const topHtml = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
    '<div style="font-size:13px;color:var(--text2)">' + inventory.length + ' product' + (inventory.length!==1?'s':'') + ' in inventory</div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    (localIP ? '<span style="font-size:12px;color:var(--text2);background:var(--bg2);padding:4px 10px;border-radius:var(--radius);border:0.5px solid var(--border)">phone: <strong>http://' + localIP + '</strong></span>' : '<button class="btn" onclick="showLocalIP()">show phone URL</button>') +
    '<button class="btn btn-primary" onclick="openAddInventory()">+ Add Product</button>' +
    '</div></div>';

  if (!inventory.length) {
    container.innerHTML = topHtml + '<p style="color:var(--text2);font-size:13px;padding:1rem 0">no inventory yet — mark a product ready to build and hit "+ inventory", or add one manually.</p>';
    return;
  }

  container.innerHTML = topHtml + '<div class="product-list" id="inv-list"></div>';

  const list = document.getElementById('inv-list');
  inventory.forEach(item => {
    invMigrateStorage(item);
    const onHand = invOnHand(item);
    const totalOut = (item.distributions||[]).reduce((a,d)=>a+(d.qty||0),0);
    const byDest = {};
    (item.distributions||[]).forEach(d=>{ byDest[d.dest] = (byDest[d.dest]||0) + (d.qty||0); });
    const isOpen = invExpanded.has(item.id);

    const card = document.createElement('div');
    card.className = 'product-card';

    const header = document.createElement('div');
    header.className = 'product-header';
    header.innerHTML =
      '<div class="product-title-wrap"><span class="product-title">' + esc(item.name) + '</span>' +
        (item.category ? '<span class="cat-tag">' + esc(item.category) + '</span>' : '') +
        (item.location ? '<span class="cat-tag">' + esc(item.location) + '</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-right:8px">' +
        '<span style="font-size:11px;color:var(--text2)">built: ' + (item.built||0) + '</span>' +
        Object.entries(byDest).map(([d,n]) => '<span class="badge" style="background:var(--bg2);color:var(--text2)">' + esc(d) + ' ' + n + '</span>').join('') +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-right:10px">' +
        getStorageLocations().map(loc =>
          '<div style="text-align:center"><div style="font-size:11px;color:var(--text2)">' + esc(loc) + '</div><div style="font-size:16px;font-weight:600">' + (item.storage[loc]||0) + '</div></div>'
        ).join('') +
        '<div style="text-align:center"><div style="font-size:11px;color:var(--text2)">on hand</div><div style="font-size:20px;font-weight:600;color:' + (onHand>0?'var(--green)':'var(--text2)') + '">' + onHand + '</div></div>' +
      '</div>' +
      '<span class="chevron' + (isOpen?' open':'') + '">▶</span>';

    header.addEventListener('click', (function(id){ return function(){ toggleInvCard(id); }; })(item.id));
    card.appendChild(header);

    if (isOpen) {
      const detail = document.createElement('div');
      detail.className = 'parts-table';
      detail.style.padding = '14px 16px';
      buildInvDetail(detail, item);
      card.appendChild(detail);
    }

    list.appendChild(card);
  });
  container.dataset.ip = localIP;
}

function makeEditableNum(initialVal, onSave) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;min-width:50px;height:32px;cursor:pointer;border-top:0.5px solid var(--border2);border-bottom:0.5px solid var(--border2);position:relative';
  const display = document.createElement('span');
  display.className = 'editable-num';
  display.style.cssText = 'font-size:16px;font-weight:600;padding:0 4px';
  display.textContent = initialVal;
  display.title = 'click to edit';
  display.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'num-input';
    input.value = display.textContent;
    input.style.cssText = 'width:56px;font-size:15px;font-weight:600;text-align:center;background:var(--bg2);border:0.5px solid var(--border2);border-radius:4px;padding:2px;color:var(--text);font-family:inherit;outline:none';
    wrap.replaceChild(input, display);
    input.focus(); input.select();
    const finish = async () => {
      const v = parseInt(input.value);
      display.textContent = isNaN(v) ? display.textContent : Math.max(0,v);
      wrap.replaceChild(display, input);
      if (!isNaN(v)) await onSave(Math.max(0,v));
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if(e.key==='Enter') finish(); if(e.key==='Escape'){ wrap.replaceChild(display,input); } });
  });
  wrap.appendChild(display);
  return wrap;
}

function buildInvDetail(container, item) {
  invMigrateStorage(item);
  const dest = invLogDest[item.id] || getOutgoingDests()[0] || 'store';
  const qty = invLogQty[item.id] || 1;
  const onHand = invOnHand(item);
  const totalOut = (item.distributions||[]).reduce((a,d)=>a+(d.qty||0),0);

  const stats = document.createElement('div');
  stats.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px';
  stats.innerHTML =
    '<div class="stat"><div class="stat-label">built</div><div class="stat-val">' + (item.built||0) + '</div></div>' +
    '<div class="stat"><div class="stat-label">distributed</div><div class="stat-val">' + totalOut + '</div></div>' +
    '<div class="stat"><div class="stat-label">on hand</div><div class="stat-val" style="color:var(--green)">' + onHand + '</div></div>';
  container.appendChild(stats);

  invSyncStorage(item);
  const locs = getStorageLocations();

  const storageKey = item.id + '-storage';
  const storageOpen = !invSectionCollapsed.has(storageKey);

  const bsLabel = document.createElement('div');
  bsLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none';
  bsLabel.innerHTML = '<span>location split</span><span style="font-size:10px;display:inline-block;transition:transform .15s;transform:rotate(' + (storageOpen ? '90' : '0') + 'deg)">▶</span>';
  bsLabel.addEventListener('click', (function(key) { return function() {
    if (invSectionCollapsed.has(key)) invSectionCollapsed.delete(key);
    else invSectionCollapsed.add(key);
    renderInventoryView();
  }; })(storageKey));
  container.appendChild(bsLabel);

  const bsContent = document.createElement('div');
  bsContent.style.display = storageOpen ? '' : 'none';

  const bsNote = document.createElement('div');
  bsNote.style.cssText = 'font-size:11px;color:var(--text2);margin-bottom:10px';
  bsNote.textContent = locs.join(' + ') + ' = ' + invOnHand(item) + ' on hand — adjusting one updates the others';
  bsContent.appendChild(bsNote);

  locs.forEach(loc => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:13px;font-weight:500';
    lbl.textContent = loc;
    const ctrl = document.createElement('div');
    ctrl.style.display = 'flex';
    const mBtn = document.createElement('button'); mBtn.className='qty-btn'; mBtn.textContent='−';
    mBtn.addEventListener('click', (function(id,l){ return function(){ invAdjustLocation(id,l,-1); }; })(item.id, loc));
    const val = makeEditableNum(item.storage[loc]||0, (function(l){ return async (v) => {
      const oh = invOnHand(item);
      item.storage[l] = Math.max(0, Math.min(oh, v));
      // Distribute remainder across other locations
      const others = locs.filter(x => x !== l);
      const remaining = Math.max(0, oh - item.storage[l]);
      const otherTotal = others.reduce((a, x) => a + (item.storage[x]||0), 0);
      if (otherTotal !== remaining) {
        if (others.length === 1) {
          item.storage[others[0]] = remaining;
          const el = document.getElementById('inv-loc-' + CSS.escape(others[0]) + '-' + item.id);
          if (el) el.textContent = remaining;
        } else {
          invSyncStorage(item);
        }
      }
      await persist();
    };})(loc));
    val.id = 'inv-loc-' + CSS.escape(loc) + '-' + item.id;
    const pBtn = document.createElement('button'); pBtn.className='qty-btn'; pBtn.textContent='+';
    pBtn.addEventListener('click', (function(id,l){ return function(){ invAdjustLocation(id,l,1); }; })(item.id, loc));
    ctrl.appendChild(mBtn); ctrl.appendChild(val); ctrl.appendChild(pBtn);
    row.appendChild(lbl); row.appendChild(ctrl);
    bsContent.appendChild(row);
  });

  const bsDivider = document.createElement('div');
  bsDivider.style.cssText = 'border-top:0.5px solid var(--border);margin:8px 0 0';
  bsContent.appendChild(bsDivider);
  container.appendChild(bsContent);

  const bsGap = document.createElement('div');
  bsGap.style.marginBottom = '16px';
  container.appendChild(bsGap);

  const builtRow = document.createElement('div');
  builtRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
  builtRow.innerHTML = '<div style="font-size:13px;font-weight:500">built count</div>';
  const builtCtrl = document.createElement('div');
  builtCtrl.style.cssText = 'display:flex;align-items:center';
  const minusBtn = document.createElement('button');
  minusBtn.className = 'qty-btn'; minusBtn.textContent = '−';
  minusBtn.addEventListener('click', (function(id){ return function(){ invAdjustBuilt(id,-1); }; })(item.id));
  const builtVal = makeEditableNum(item.built||0, async (v) => {
    item.built = Math.max(0, v);
    invSyncStorage(item);
    await persist(); renderInventoryView();
  });
  const plusBtn = document.createElement('button');
  plusBtn.className = 'qty-btn'; plusBtn.textContent = '+';
  plusBtn.addEventListener('click', (function(id){ return function(){ invAdjustBuilt(id,1); }; })(item.id));
  builtCtrl.appendChild(minusBtn); builtCtrl.appendChild(builtVal); builtCtrl.appendChild(plusBtn);
  builtRow.appendChild(builtCtrl);
  container.appendChild(builtRow);

  const outgoingKey = item.id + '-outgoing';
  const outgoingOpen = !invSectionCollapsed.has(outgoingKey);

  const destLabel = document.createElement('div');
  destLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none';
  destLabel.innerHTML = '<span>log outgoing</span><span style="font-size:10px;display:inline-block;transition:transform .15s;transform:rotate(' + (outgoingOpen ? '90' : '0') + 'deg)">▶</span>';
  destLabel.addEventListener('click', (function(key) { return function() {
    if (invSectionCollapsed.has(key)) invSectionCollapsed.delete(key);
    else invSectionCollapsed.add(key);
    renderInventoryView();
  }; })(outgoingKey));
  container.appendChild(destLabel);

  const outgoingContent = document.createElement('div');
  outgoingContent.style.display = outgoingOpen ? '' : 'none';

  const destBtns = document.createElement('div');
  destBtns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px';
  getOutgoingDests().forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (dest===d?' btn-primary':'');
    btn.style.cssText = 'flex:1;font-size:12px;padding:6px 4px;min-width:60px';
    btn.textContent = d;
    btn.addEventListener('click', (function(id,dd){ return function(){ invSetDest(id,dd); }; })(item.id, d));
    destBtns.appendChild(btn);
  });
  outgoingContent.appendChild(destBtns);

  const logRow = document.createElement('div');
  logRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px';
  const qtyCtrl = document.createElement('div');
  qtyCtrl.style.display = 'flex';
  const qMinus = document.createElement('button'); qMinus.className='qty-btn'; qMinus.textContent='−';
  qMinus.addEventListener('click', (function(id){ return function(){ invAdjustLogQty(id,-1); }; })(item.id));
  const qVal = makeEditableNum(qty, (function(id){ return (v) => {
    invLogQty[id] = Math.max(1, v);
    const el = document.getElementById('inv-log-qty-'+id);
    if (el && el.dataset) el.dataset.val = invLogQty[id];
  };})(item.id));
  qVal.id = 'inv-log-qty-' + item.id;
  const qPlus = document.createElement('button'); qPlus.className='qty-btn'; qPlus.textContent='+';
  qPlus.addEventListener('click', (function(id){ return function(){ invAdjustLogQty(id,1); }; })(item.id));
  qtyCtrl.appendChild(qMinus); qtyCtrl.appendChild(qVal); qtyCtrl.appendChild(qPlus);
  const noteInput = document.createElement('input');
  noteInput.id = 'inv-log-note-' + item.id;
  noteInput.placeholder = 'note (optional)';
  noteInput.style.cssText = 'flex:1;font-size:13px;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius);padding:6px 10px;color:var(--text);font-family:inherit;outline:none';
  const logBtn = document.createElement('button');
  logBtn.className = 'btn btn-success'; logBtn.style.whiteSpace='nowrap';
  logBtn.textContent = 'log ' + qty;
  logBtn.addEventListener('click', (function(id){ return function(){ invLogDist(id); }; })(item.id));
  logRow.appendChild(qtyCtrl); logRow.appendChild(noteInput); logRow.appendChild(logBtn);
  outgoingContent.appendChild(logRow);
  container.appendChild(outgoingContent);

  if (item.distributions && item.distributions.length) {
    const histLabel = document.createElement('div');
    histLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;margin-top:4px';
    histLabel.textContent = 'history';
    container.appendChild(histLabel);
    [...item.distributions].reverse().forEach((d, ri) => {
      const realIdx = item.distributions.length - 1 - ri;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px';
      const destPill = document.createElement('span');
      const _dests = getOutgoingDests();
      const _pillCls = ['queue','printing','done','planning'];
      destPill.className = 'sp sp-' + (_pillCls[_dests.indexOf(d.dest) % _pillCls.length] || 'queue');
      destPill.style.fontSize = '11px';
      destPill.textContent = d.dest;
      const note = document.createElement('span');
      note.style.cssText = 'color:var(--text2);flex:1';
      note.textContent = d.note||'';
      const qtySpan = document.createElement('span');
      qtySpan.style.fontWeight = '500';
      qtySpan.textContent = '-' + d.qty;
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn'; delBtn.textContent = '✕';
      delBtn.addEventListener('click', (function(id,idx){ return function(){ removeDistribution(id,idx); }; })(item.id, realIdx));
      row.appendChild(destPill); row.appendChild(note); row.appendChild(qtySpan); row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:14px';
  const locBtn = document.createElement('button');
  locBtn.className='btn'; locBtn.style.cssText='flex:1;font-size:12px';
  locBtn.textContent = 'set label';
  locBtn.addEventListener('click', (function(id){ return function(){ invSetLocation(id); }; })(item.id));
  const delBtn = document.createElement('button');
  delBtn.className='btn'; delBtn.style.cssText='font-size:12px;color:var(--red-text);border-color:var(--red-text)';
  delBtn.textContent='delete';
  delBtn.addEventListener('click', (function(id){ return function(){ invDelete(id); }; })(item.id));
  actions.appendChild(locBtn); actions.appendChild(delBtn);
  container.appendChild(actions);
}

async function invAdjustBuilt(id, delta) {
  const item = inventory.find(i=>i.id===id); if(!item) return;
  item.built = Math.max(0,(item.built||0)+delta);
  invSyncStorage(item);
  await persist(); renderInventoryView();
}

async function invAdjustLocation(id, loc, delta) {
  const item = inventory.find(i=>i.id===id); if(!item) return;
  invMigrateStorage(item);
  const onHand = invOnHand(item);
  const locs = getStorageLocations();
  item.storage[loc] = Math.max(0, Math.min(onHand, (item.storage[loc]||0) + delta));
  // Update remaining across other locations
  const others = locs.filter(x => x !== loc);
  const remaining = Math.max(0, onHand - item.storage[loc]);
  if (others.length === 1) {
    item.storage[others[0]] = remaining;
  } else {
    invSyncStorage(item);
  }
  const locEl = document.getElementById('inv-loc-' + CSS.escape(loc) + '-' + id);
  if (locEl) locEl.textContent = item.storage[loc];
  others.forEach(o => {
    const el = document.getElementById('inv-loc-' + CSS.escape(o) + '-' + id);
    if (el) el.textContent = item.storage[o]||0;
  });
  await persist();
}

function toggleInvCard(id) {
  if (invExpanded.has(id)) invExpanded.delete(id);
  else invExpanded.add(id);
  renderInventoryView();
}

function invSetDest(id, dest) { invLogDest[id]=dest; renderInventoryView(); }

function invAdjustLogQty(id, delta) {
  invLogQty[id] = Math.max(1,(invLogQty[id]||1)+delta);
  const el = document.getElementById('inv-log-qty-'+id);
  if (el) el.textContent = invLogQty[id];
}

async function invLogDist(id) {
  const item = inventory.find(i=>i.id===id); if(!item) return;
  invMigrateStorage(item);
  const dest = invLogDest[id] || getOutgoingDests()[0] || 'store';
  const qty = invLogQty[id]||1;
  const note = (document.getElementById('inv-log-note-'+id)||{}).value||'';
  const onHand = invOnHand(item);

  if (qty > onHand) {
    alert('Not enough stock — you only have ' + onHand + ' on hand.');
    return;
  }

  // Warn if first location doesn't cover the full quantity
  const locs = getStorageLocations();
  const firstQty = locs.length > 0 ? (item.storage[locs[0]]||0) : 0;
  if (locs.length > 1 && qty > firstQty) {
    const fromOthers = qty - firstQty;
    if (!confirm('Only ' + firstQty + ' in ' + locs[0] + '. This will also take ' + fromOthers + ' from other locations. Continue?')) return;
  }

  // Deduct from locations sequentially
  let remaining = qty;
  locs.forEach(loc => {
    if (remaining <= 0) return;
    const cur = item.storage[loc]||0;
    const take = Math.min(cur, remaining);
    item.storage[loc] = cur - take;
    remaining -= take;
  });

  if(!item.distributions) item.distributions=[];
  item.distributions.push({dest,qty,note,date:new Date().toISOString()});
  await persist(); renderInventoryView();
}

async function removeDistribution(id, idx) {
  const item = inventory.find(i=>i.id===id); if(!item) return;
  item.distributions.splice(idx,1);
  await persist(); renderInventoryView();
}

async function invSetLocation(id) {
  const item = inventory.find(i=>i.id===id); if(!item) return;
  const loc = window.electronAPI ? await new Promise(resolve => {
    const cur = item.location||'';
    const input = document.createElement('input');
    input.value = cur;
    input.placeholder = 'e.g. shelf A, box 3';
    input.style.cssText = 'font-size:13px;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius);padding:6px 10px;color:var(--text);font-family:inherit;outline:none;width:200px;margin-right:8px';
    const ok = document.createElement('button');
    ok.className='btn btn-primary'; ok.style.cssText='font-size:12px;padding:4px 10px';
    ok.textContent='save';
    const wrap = document.createElement('div');
    wrap.style.cssText='display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--bg2);border-top:0.5px solid var(--border)';
    wrap.appendChild(input); wrap.appendChild(ok);
    const card = document.querySelector('[data-invid="'+id+'"]');
    const target = card ? card.querySelector('.parts-table') : null;
    if (target) target.insertBefore(wrap, target.firstChild);
    else document.body.appendChild(wrap);
    ok.addEventListener('click', () => { wrap.remove(); resolve(input.value.trim()); });
    input.addEventListener('keydown', e => { if(e.key==='Enter'){ wrap.remove(); resolve(input.value.trim()); } });
    setTimeout(() => input.focus(), 50);
  }) : null;
  if (loc === null) return;
  item.location = loc;
  await persist(); renderInventoryView();
}

async function invDelete(id) {
  if (!confirm('Remove this item from inventory?')) return;
  inventory = inventory.filter(i=>i.id!==id);
  invExpanded.delete(id);
  await persist(); renderInventoryView();
}

function openAddInventory() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:200';
  modal.innerHTML = '<div style="background:var(--bg);border:0.5px solid var(--border2);border-radius:var(--radius-lg);padding:1.5rem;width:320px;max-width:95vw"><h3 style="font-size:16px;font-weight:600;margin-bottom:1rem;color:var(--text)">add to inventory</h3><div class=\"field\"><label>product name *</label><input id=\"inv-add-name\" placeholder=\"e.g. Pikachu V3\"/></div><div class=\"field\"><label>quantity on hand</label><input id=\"inv-add-qty\" type=\"number\" min=\"0\" value=\"1\"/></div><div class=\"field\"><label>category</label><input id=\"inv-add-cat\" placeholder=\"e.g. character\"/></div><div class=\"modal-footer\"><button class=\"btn\" id=\"inv-add-cancel\">cancel</button><button class=\"btn btn-primary\" id=\"inv-add-save\">add</button></div></div>';
  document.body.appendChild(modal);
  setTimeout(()=>document.getElementById('inv-add-name').focus(),50);
  document.getElementById('inv-add-cancel').addEventListener('click',()=>modal.remove());
  document.getElementById('inv-add-save').addEventListener('click', async ()=>{
    const name=(document.getElementById('inv-add-name').value||'').trim();
    if(!name){document.getElementById('inv-add-name').focus();return;}
    const qty=parseInt(document.getElementById('inv-add-qty').value)||0;
    const cat=(document.getElementById('inv-add-cat').value||'').trim();
    const locs = getStorageLocations();
    const storage = {};
    locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? qty : 0; });
    inventory.push({id:'inv_'+Date.now(),name,category:cat,built:qty,location:'',storage,distributions:[],source:'manual'});
    modal.remove(); await persist(); renderInventoryView();
  });
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function showLocalIP() {
  if (window.electronAPI && window.electronAPI.getLocalIP) {
    const ip = await window.electronAPI.getLocalIP();
    const container = document.getElementById('view-inventory');
    if (container) { container.dataset.ip = ip; renderInventoryView(); }
  }
}

if (window.electronAPI && window.electronAPI.onInventoryUpdated) {
  window.electronAPI.onInventoryUpdated(async () => {
    const saved = await loadData();
    if (saved) {
      inventory = saved.inventory || [];
      parts = saved.parts || [];
      products = saved.products || {};
    }
    render();
  });
}
