async function adjustQty(id,delta) {
  const p=parts.find(x=>x.id===id); if(!p) return;
  p.printed=delta>0?Math.min(p.printed+1,p.qty):Math.max(p.printed-1,0);
  if(p.printed===p.qty&&delta>0) p.status='done';
  await persist(); render();
}
async function reprint(id) {
  const p=parts.find(x=>x.id===id); if(!p) return;
  parts.push({...p,id:nextId++,printed:0,status:'queue',reprints:0});
  p.reprints=(p.reprints||0)+1; await persist(); render();
}
async function del(id) { parts=parts.filter(p=>p.id!==id); await persist(); render(); }

function openAdd() {
  editId=null;
  document.getElementById('modal-title').textContent='add part';
  ['name','item','variant','desc','stl'].forEach(f=>document.getElementById('f-'+f).value='');
  document.getElementById('f-qty').value=1;
  document.getElementById('f-status').value='queue';
  resetColourRows([{hex:'#4a90d9',name:''}]);
  document.getElementById('modal').style.display='';
}
function openEdit(id) {
  editId=id; const p=parts.find(x=>x.id===id);
  document.getElementById('modal-title').textContent='edit part';
  document.getElementById('f-name').value=p.name||'';
  document.getElementById('f-item').value=p.item||'';
  document.getElementById('f-variant').value=p.variant||'';
  document.getElementById('f-qty').value=p.qty||1;
  document.getElementById('f-status').value=p.status;
  const cols = p.colours&&p.colours.length ? p.colours : (p.colour ? [{hex:p.colour,name:p.colourName||''}] : [{hex:'#4a90d9',name:''}]);
  resetColourRows(cols);
  document.getElementById('modal').style.display='';
}
function closeModal() { document.getElementById('modal').style.display='none'; }
async function saveCard() {
  const name=document.getElementById('f-name').value.trim(); if(!name){ document.getElementById('f-name').focus(); return; }
  const qty=parseInt(document.getElementById('f-qty').value)||1;
  const item=document.getElementById('f-item').value.trim();
  const colours=getColourRows();
  const data={name,item,variant:document.getElementById('f-variant').value.trim(),desc:'',colours,colour:colours[0]?.hex||'#888888',colourName:colours[0]?.name||'',stl:'',qty,status:document.getElementById('f-status').value};
  if(item&&!products[item]){ products[item]={category:''}; autoCreateProductFolder(item); }
  if(editId){ const p=parts.find(x=>x.id===editId); Object.assign(p,data); p.printed=Math.min(p.printed,p.qty); }
  else { data.id=nextId++; data.printed=0; data.reprints=0; parts.push(data); }
  await persist(); closeModal(); render();
}

function onDragOver(e,status) { e.preventDefault(); document.getElementById('col-'+status).classList.add('drag-over'); }
async function onDrop(e,status) {
  e.preventDefault(); document.getElementById('col-'+status).classList.remove('drag-over');
  if(dragId!=null){ const p=parts.find(x=>x.id===dragId); if(p){ p.status=status; await persist(); render(); } }
}

// ── STATUS MODAL ──
let statusModalPartId = null;
let completionProductName = null;
let completionQty = 1;

function openStatusModal(partId) {
  const p = parts.find(x => x.id === partId);
  if (!p) return;
  statusModalPartId = partId;
  document.getElementById('status-modal-title').textContent = 'change status — ' + p.name;
  const body = document.getElementById('status-modal-body');
  body.innerHTML = '';

  const options = ['planning','queue','printing','done'].filter(s => s !== p.status);

  if (p.status === 'done') {
    const label = document.createElement('p');
    label.style.cssText = 'font-size:13px;color:var(--text2);margin-bottom:1rem;line-height:1.5';
    label.textContent = 'This part is marked done. Reset it to:';
    body.appendChild(label);
  }

  options.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (s==='done'?' btn-success':'');
    btn.style.cssText = 'width:100%;margin-bottom:8px;padding:12px;font-size:15px;text-align:left';
    btn.textContent = s === 'done' ? '✓ done' : s;
    btn.addEventListener('click', () => { setPartStatus(partId, s); closeStatusModal(); });
    body.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.style.cssText = 'width:100%;margin-top:4px;padding:8px;color:var(--text2)';
  cancelBtn.textContent = 'cancel';
  cancelBtn.addEventListener('click', closeStatusModal);
  body.appendChild(cancelBtn);
  document.getElementById('status-modal').style.display = '';
}

function closeStatusModal() {
  document.getElementById('status-modal').style.display = 'none';
  statusModalPartId = null;
}

async function setPartStatus(partId, newStatus) {
  const p = parts.find(x => x.id === partId);
  if (!p) return;
  const wasAlreadyDone = p.status === 'done';

  if (newStatus === 'done') {
    p.printed = p.qty;
    if (p.subParts && p.subParts.length) p.subParts.forEach(s => s.status = 'done');
  } else if (wasAlreadyDone) {
    p.printed = 0;
    if (p.subParts && p.subParts.length) p.subParts.forEach(s => s.status = newStatus);
    if (products[p.item]?.archived) { products[p.item].archived = false; openProducts.add(p.item); }
  }

  p.status = newStatus;

  await persist();
  render();
}

async function openSubStatusModal(partId, subIdx) {
  const p = parts.find(x => x.id === partId);
  if (!p || !p.subParts || !p.subParts[subIdx]) return;
  const sp = p.subParts[subIdx];

  const opts = ['queue','printing','done'].filter(s => s !== sp.status);
  const modal = document.getElementById('status-modal');
  document.getElementById('status-modal-title').textContent = 'change status — ' + sp.name;
  const body = document.getElementById('status-modal-body');
  body.innerHTML = '';
  opts.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (s==='done'?' btn-success':'');
    btn.style.cssText = 'width:100%;margin-bottom:8px;padding:12px;font-size:15px;text-align:left';
    btn.textContent = s;
    btn.addEventListener('click', async () => {
      sp.status = s;
      if (s === 'done') {
        if (p.subParts.every(x => x.status === 'done')) {
          p.status = 'done'; p.printed = p.qty;
        }
      } else {
        if (p.status === 'done') { p.status = 'printing'; p.printed = p.subParts.filter(x=>x.status==='done').length; }
        if (products[p.item]?.archived) { products[p.item].archived = false; openProducts.add(p.item); }
      }
      closeStatusModal();
      await persist(); render();
    });
    body.appendChild(btn);
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.style.cssText = 'width:100%;margin-top:4px;padding:8px;color:var(--text2)';
  cancelBtn.textContent = 'cancel';
  cancelBtn.addEventListener('click', closeStatusModal);
  body.appendChild(cancelBtn);
  modal.style.display = '';
}

let subPartTargetId = null;

function addSubPart(partId) {
  subPartTargetId = partId;
  document.getElementById('subpart-name-input').value = '';
  document.getElementById('subpart-modal').style.display = '';
  setTimeout(() => document.getElementById('subpart-name-input').focus(), 50);
}

function closeSubpartModal() {
  document.getElementById('subpart-modal').style.display = 'none';
  subPartTargetId = null;
}

async function saveSubPart() {
  const name = document.getElementById('subpart-name-input').value.trim();
  if (!name || !subPartTargetId) return;
  const p = parts.find(x => x.id === subPartTargetId);
  if (!p) return;
  if (!p.subParts) p.subParts = [];
  const spQty = parseInt(document.getElementById('subpart-qty-input').value)||1;
  p.subParts.push({ name, qty: spQty, printed: 0, status: 'queue' });
  if (p.status === 'done') { p.status = 'queue'; p.printed = 0; }
  closeSubpartModal();
  await persist(); render();
}

async function delSubPart(partId, subIdx) {
  const p = parts.find(x => x.id === partId);
  if (!p || !p.subParts) return;
  p.subParts.splice(subIdx, 1);
  if (p.subParts.length === 0) p.subParts = [];
  await persist(); render();
}

function adjustCompletionQty(delta) {
  completionQty = Math.max(1, completionQty + delta);
  document.getElementById('completion-qty-val').textContent = completionQty;
}

function closeCompletionModal() {
  document.getElementById('completion-modal').style.display = 'none';
  completionProductName = null;
}

async function confirmCompletion() {
  if (!completionProductName) return;
  const existing = inventory.find(i => i.name === completionProductName);
  if (existing) {
    existing.built = (existing.built||0) + completionQty;
  } else {
    inventory.push({
      id: 'inv_' + Date.now(),
      name: completionProductName,
      category: products[completionProductName]?.category || '',
      built: completionQty,
      location: '',
      box: 0,
      shelf: completionQty,
      distributions: [],
      source: 'tracker'
    });
  }
  if (!products[completionProductName]) products[completionProductName] = {category:''};
  products[completionProductName].archived = true;
  await persist();
  closeCompletionModal();
  setView('inventory');
  render();
}

// ── QUICK ADD TO INVENTORY ──
let quickAddProductName = null;
let quickAddQty = 1;
let quickAddLocations = {};

function openQuickAddModal(productName) {
  quickAddProductName = productName;
  quickAddQty = 1;
  // Default: put all qty in last storage location
  const locs = getStorageLocations();
  quickAddLocations = {};
  locs.forEach(loc => { quickAddLocations[loc] = 0; });
  if (locs.length) quickAddLocations[locs[locs.length - 1]] = 1;

  const nameEl = document.getElementById('quick-add-product-name');
  if (nameEl) nameEl.textContent = productName;
  document.getElementById('quick-add-qty-val').textContent = '1';
  const locsContainer = document.getElementById('quick-add-locations');
  if (appSettings.invPopup !== false) {
    if (locsContainer) locsContainer.style.display = '';
    renderQuickAddLocations();
  } else {
    if (locsContainer) { locsContainer.innerHTML = ''; locsContainer.style.display = 'none'; }
  }
  document.getElementById('quick-add-modal').style.display = '';
}

function renderQuickAddLocations() {
  const container = document.getElementById('quick-add-locations');
  if (!container) return;
  const locs = getStorageLocations();
  container.innerHTML = '';
  if (!locs.length) return;
  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px';
  heading.textContent = 'storage split';
  container.appendChild(heading);
  locs.forEach((loc, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:14px;font-weight:500;text-transform:capitalize;flex:1;color:var(--text)';
    lbl.textContent = loc;
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex;align-items:center;gap:0';
    const btnStyle = 'width:48px;height:48px;border:0.5px solid var(--border2);background:var(--bg2);cursor:pointer;font-size:22px;font-weight:300;color:var(--text);display:flex;align-items:center;justify-content:center;font-family:inherit';
    const minusBtn = document.createElement('button');
    minusBtn.style.cssText = btnStyle + ';border-radius:var(--radius) 0 0 var(--radius)';
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', (function(l, i){ return function() {
      quickAddLocations[l] = Math.max(0, (quickAddLocations[l]||0) - 1);
      document.getElementById('qal-' + i).textContent = quickAddLocations[l];
    }; })(loc, idx));
    const valEl = document.createElement('div');
    valEl.id = 'qal-' + idx;
    valEl.style.cssText = 'width:56px;height:48px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;border-top:0.5px solid var(--border2);border-bottom:0.5px solid var(--border2);color:var(--text);background:var(--bg)';
    valEl.textContent = quickAddLocations[loc] || 0;
    const plusBtn = document.createElement('button');
    plusBtn.style.cssText = btnStyle + ';border-radius:0 var(--radius) var(--radius) 0';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', (function(l, i){ return function() {
      quickAddLocations[l] = (quickAddLocations[l]||0) + 1;
      document.getElementById('qal-' + i).textContent = quickAddLocations[l];
    }; })(loc, idx));
    ctrl.appendChild(minusBtn); ctrl.appendChild(valEl); ctrl.appendChild(plusBtn);
    row.appendChild(lbl); row.appendChild(ctrl);
    container.appendChild(row);
  });
}

function adjustQuickAddQty(delta) {
  quickAddQty = Math.max(1, quickAddQty + delta);
  document.getElementById('quick-add-qty-val').textContent = quickAddQty;
  // Auto-fill last location with remainder
  const locs = getStorageLocations();
  if (!locs.length) return;
  const lastLoc = locs[locs.length - 1];
  const lastIdx = locs.length - 1;
  const otherTotal = locs.slice(0, -1).reduce((a, l) => a + (quickAddLocations[l]||0), 0);
  quickAddLocations[lastLoc] = Math.max(0, quickAddQty - otherTotal);
  const el = document.getElementById('qal-' + lastIdx);
  if (el) el.textContent = quickAddLocations[lastLoc];
}

function closeQuickAddModal() {
  document.getElementById('quick-add-modal').style.display = 'none';
  quickAddProductName = null;
}

async function confirmQuickAdd() {
  if (!quickAddProductName) return;
  const name = quickAddProductName;
  const locs = getStorageLocations();
  const existing = inventory.find(i => i.name === name);
  if (existing) {
    existing.built = (existing.built||0) + quickAddQty;
    if (!existing.storage) existing.storage = {};
    locs.forEach(loc => { existing.storage[loc] = (existing.storage[loc]||0) + (quickAddLocations[loc]||0); });
  } else {
    const storage = {};
    locs.forEach(loc => { storage[loc] = quickAddLocations[loc]||0; });
    inventory.push({ id:'inv_'+Date.now(), name, category:products[name]?.category||'', built:quickAddQty, location:'', storage, distributions:[], source:'tracker' });
  }
  await persist();
  closeQuickAddModal();
  renderStats();
  // Flash the button
  document.querySelectorAll('.product-card').forEach(card => {
    const titleEl = card.querySelector('.product-title');
    if (titleEl && titleEl.textContent === name) {
      const btn = [...card.querySelectorAll('.rename-btn')].find(b => b.textContent === '+ inv');
      if (btn) {
        btn.textContent = '✓ added!';
        btn.style.color = 'var(--green)';
        setTimeout(() => { btn.textContent = '+ inv'; btn.style.color = 'var(--green-dark)'; }, 1400);
      }
    }
  });
}

async function adjustSubPrinted(partId, subIdx, delta) {
  const p = parts.find(x => x.id === partId);
  if (!p || !p.subParts || !p.subParts[subIdx]) return;
  const sp = p.subParts[subIdx];
  sp.printed = Math.max(0, Math.min(sp.qty||1, (sp.printed||0) + delta));
  if (sp.printed >= (sp.qty||1)) {
    sp.status = 'done';
    if (p.subParts.every(x => x.status === 'done')) {
      p.status = 'done'; p.printed = p.qty;
    }
  } else if (sp.status === 'done') {
    sp.status = 'printing';
    if (p.status === 'done') { p.status = 'printing'; }
  }
  await persist(); render();
}
