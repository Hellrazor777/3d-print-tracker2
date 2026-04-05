// ── THEME ──
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  } else {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'auto';
  }
  appSettings.theme = theme;
}

async function setTheme(theme) {
  applyTheme(theme);
  ['auto','light','dark'].forEach(t => {
    const btn = document.getElementById('theme-' + t);
    if (btn) btn.classList.toggle('active', t === theme);
  });
  await saveSettings(appSettings);
}

// ── COLLAPSIBLE SECTIONS ──
const _ssecCollapsed = new Set(JSON.parse(localStorage.getItem('ssec-collapsed') || '[]'));

function toggleSettingsSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (_ssecCollapsed.has(id)) {
    _ssecCollapsed.delete(id);
    el.classList.remove('collapsed');
    el.classList.add('open');
  } else {
    _ssecCollapsed.add(id);
    el.classList.add('collapsed');
    el.classList.remove('open');
  }
  localStorage.setItem('ssec-collapsed', JSON.stringify([..._ssecCollapsed]));
}

function initSettingsSections() {
  ['ssec-appearance','ssec-categories','ssec-inventory','ssec-3mf','ssec-slicer'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (_ssecCollapsed.has(id)) {
      el.classList.add('collapsed');
    } else {
      el.classList.add('open');
    }
  });
}

// ── CATEGORY ORDER HELPER ──
function getCategoryOrder() {
  const allCats = [...new Set([
    ...Object.values(products).map(p => p.category).filter(Boolean),
    ...(appSettings.extraCategories || [])
  ])];
  const ordered = appSettings.categoryOrder || [];
  const unordered = allCats.filter(c => !ordered.includes(c));
  return [...ordered.filter(c => allCats.includes(c)), ...unordered];
}

// ── CATEGORY SELECT HELPER ──
function populateCategorySelect(selectId, currentVal) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cats = getCategoryOrder();
  sel.innerHTML = '<option value="">— no category —</option>';
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === currentVal) o.selected = true;
    sel.appendChild(o);
  });
}

// ── CATEGORY MANAGER ──
let _renameCatTarget = null;

function renderCategoryManager() {
  const wrap = document.getElementById('category-manager');
  if (!wrap) return;
  const cats = getCategoryOrder();
  if (!cats.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">No categories yet</div>'; return; }
  wrap.innerHTML = '';
  cats.forEach((cat, idx) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    const name = document.createElement('span');
    name.className = 'cat-row-name';
    name.textContent = cat;
    const upBtn = document.createElement('button');
    upBtn.className = 'btn cat-row-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', async () => {
      const order = getCategoryOrder();
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
      appSettings.categoryOrder = order;
      await saveSettings(appSettings);
      renderCategoryManager();
      renderProductView();
    });
    const downBtn = document.createElement('button');
    downBtn.className = 'btn cat-row-btn';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = idx === cats.length - 1;
    downBtn.addEventListener('click', async () => {
      const order = getCategoryOrder();
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
      appSettings.categoryOrder = order;
      await saveSettings(appSettings);
      renderCategoryManager();
      renderProductView();
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn cat-row-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => openRenameCat(cat));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn cat-row-btn cat-row-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove category';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Remove category "' + cat + '" from all products?')) return;
      Object.keys(products).forEach(k => { if (products[k].category === cat) products[k].category = ''; });
      if (appSettings.extraCategories) appSettings.extraCategories = appSettings.extraCategories.filter(c => c !== cat);
      if (appSettings.categoryOrder) appSettings.categoryOrder = appSettings.categoryOrder.filter(c => c !== cat);
      await saveSettings(appSettings);
      await persist(); renderCategoryManager(); renderProductView();
    });
    row.appendChild(name); row.appendChild(upBtn); row.appendChild(downBtn); row.appendChild(renameBtn); row.appendChild(delBtn);
    wrap.appendChild(row);
  });
}

function openRenameCat(cat) {
  _renameCatTarget = cat;
  const input = document.getElementById('rename-cat-input');
  input.value = cat;
  document.getElementById('rename-cat-modal').style.display = '';
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeRenameCat() {
  document.getElementById('rename-cat-modal').style.display = 'none';
  _renameCatTarget = null;
}

async function confirmRenameCat() {
  const newCat = (document.getElementById('rename-cat-input').value || '').trim();
  if (!newCat || newCat === _renameCatTarget) { closeRenameCat(); return; }
  const old = _renameCatTarget;
  Object.keys(products).forEach(k => { if (products[k].category === old) products[k].category = newCat; });
  if (appSettings.extraCategories) {
    const idx = appSettings.extraCategories.indexOf(old);
    if (idx !== -1) appSettings.extraCategories[idx] = newCat;
  }
  if (appSettings.categoryOrder) {
    const idx = appSettings.categoryOrder.indexOf(old);
    if (idx !== -1) appSettings.categoryOrder[idx] = newCat;
  }
  await saveSettings(appSettings);
  await persist();
  closeRenameCat();
  renderCategoryManager(); renderProductView();
}

async function addCategory() {
  const input = document.getElementById('new-cat-input');
  const name = (input.value || '').trim();
  if (!name) return;
  input.value = '';
  if (!appSettings.extraCategories) appSettings.extraCategories = [];
  if (!appSettings.extraCategories.includes(name)) appSettings.extraCategories.push(name);
  if (!appSettings.categoryOrder) appSettings.categoryOrder = getCategoryOrder();
  if (!appSettings.categoryOrder.includes(name)) appSettings.categoryOrder.push(name);
  await saveSettings(appSettings);
  renderCategoryManager();
}

// ── INVENTORY SETTINGS ──
function getStorageLocations() {
  return (appSettings.storageLocations && appSettings.storageLocations.length)
    ? appSettings.storageLocations
    : ['Box', 'Shelf'];
}

function renderStorageLocationManager() {
  const wrap = document.getElementById('storage-loc-manager');
  if (!wrap) return;
  const locs = getStorageLocations();
  wrap.innerHTML = '';
  locs.forEach((loc, idx) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    const name = document.createElement('span');
    name.className = 'cat-row-name';
    name.textContent = loc;
    const upBtn = document.createElement('button');
    upBtn.className = 'btn cat-row-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', async () => {
      if (!appSettings.storageLocations) appSettings.storageLocations = [...locs];
      [appSettings.storageLocations[idx-1], appSettings.storageLocations[idx]] = [appSettings.storageLocations[idx], appSettings.storageLocations[idx-1]];
      await saveSettings(appSettings);
      renderStorageLocationManager();
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn cat-row-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      _renameDestTarget = { name: loc, idx, mode: 'storage' };
      const input = document.getElementById('rename-cat-input');
      input.value = loc;
      document.querySelector('#rename-cat-modal h3').textContent = 'Rename Location';
      document.getElementById('rename-cat-modal').dataset.mode = 'storage';
      document.getElementById('rename-cat-modal').style.display = '';
      setTimeout(() => { input.focus(); input.select(); }, 50);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn cat-row-btn cat-row-del';
    delBtn.textContent = '✕';
    delBtn.disabled = locs.length <= 1;
    delBtn.title = locs.length <= 1 ? 'Must have at least one location' : 'Remove location';
    delBtn.addEventListener('click', async () => {
      const stockCount = inventory.reduce((a, item) => a + ((item.storage && item.storage[loc])||0), 0);
      const msg = stockCount > 0
        ? 'Remove "' + loc + '"? ' + stockCount + ' items currently stored here will be untracked.'
        : 'Remove location "' + loc + '"?';
      if (!confirm(msg)) return;
      if (!appSettings.storageLocations) appSettings.storageLocations = [...locs];
      appSettings.storageLocations = appSettings.storageLocations.filter(l => l !== loc);
      inventory.forEach(item => { if (item.storage) delete item.storage[loc]; });
      await saveSettings(appSettings);
      await persist();
      renderStorageLocationManager();
      renderInventoryView();
    });
    row.appendChild(name); row.appendChild(upBtn); row.appendChild(renameBtn); row.appendChild(delBtn);
    wrap.appendChild(row);
  });
}

async function addStorageLocation() {
  const input = document.getElementById('new-storage-loc-input');
  const name = (input.value || '').trim();
  if (!name) return;
  input.value = '';
  if (!appSettings.storageLocations) appSettings.storageLocations = [...getStorageLocations()];
  if (!appSettings.storageLocations.includes(name)) appSettings.storageLocations.push(name);
  // Add the new location with 0 qty on all existing inventory items
  inventory.forEach(item => {
    if (!item.storage) item.storage = {};
    if (item.storage[name] === undefined) item.storage[name] = 0;
  });
  await saveSettings(appSettings);
  await persist();
  renderStorageLocationManager();
  renderInventoryView();
}

function getOutgoingDests() {
  return (appSettings.outgoingDests && appSettings.outgoingDests.length)
    ? appSettings.outgoingDests
    : ['store', 'markets', 'website'];
}

function renderOutgoingDestManager() {
  const wrap = document.getElementById('outgoing-dest-manager');
  if (!wrap) return;
  const dests = getOutgoingDests();
  wrap.innerHTML = '';
  dests.forEach((dest, idx) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    const name = document.createElement('span');
    name.className = 'cat-row-name';
    name.textContent = dest;
    const upBtn = document.createElement('button');
    upBtn.className = 'btn cat-row-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', async () => {
      if (!appSettings.outgoingDests) appSettings.outgoingDests = [...dests];
      [appSettings.outgoingDests[idx-1], appSettings.outgoingDests[idx]] = [appSettings.outgoingDests[idx], appSettings.outgoingDests[idx-1]];
      await saveSettings(appSettings);
      renderOutgoingDestManager();
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn cat-row-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => openRenameOutgoingDest(dest, idx));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn cat-row-btn cat-row-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove destination';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Remove destination "' + dest + '"?')) return;
      if (!appSettings.outgoingDests) appSettings.outgoingDests = [...dests];
      appSettings.outgoingDests.splice(idx, 1);
      await saveSettings(appSettings);
      renderOutgoingDestManager();
    });
    row.appendChild(name); row.appendChild(upBtn); row.appendChild(renameBtn); row.appendChild(delBtn);
    wrap.appendChild(row);
  });
}

async function addOutgoingDest() {
  const input = document.getElementById('new-dest-input');
  const name = (input.value || '').trim();
  if (!name) return;
  input.value = '';
  if (!appSettings.outgoingDests) appSettings.outgoingDests = getOutgoingDests();
  if (!appSettings.outgoingDests.includes(name)) appSettings.outgoingDests.push(name);
  await saveSettings(appSettings);
  renderOutgoingDestManager();
}

let _renameDestTarget = { name: '', idx: -1 };

function openRenameOutgoingDest(name, idx) {
  _renameDestTarget = { name, idx };
  const input = document.getElementById('rename-cat-input');
  input.value = name;
  document.getElementById('rename-cat-modal').style.display = '';
  // Temporarily repurpose the rename modal for destinations
  document.querySelector('#rename-cat-modal h3').textContent = 'Rename Destination';
  document.getElementById('rename-cat-modal').dataset.mode = 'dest';
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// Patch confirmRenameCat to handle category, destination, and storage location renames
const _origConfirmRenameCat = confirmRenameCat;
confirmRenameCat = async function() {
  const modal = document.getElementById('rename-cat-modal');
  const mode = modal ? modal.dataset.mode : '';
  if (mode === 'dest') {
    modal.dataset.mode = '';
    document.querySelector('#rename-cat-modal h3').textContent = 'Rename Category';
    const newName = (document.getElementById('rename-cat-input').value || '').trim();
    if (!newName || newName === _renameDestTarget.name) { closeRenameCat(); return; }
    if (!appSettings.outgoingDests) appSettings.outgoingDests = getOutgoingDests();
    appSettings.outgoingDests[_renameDestTarget.idx] = newName;
    await saveSettings(appSettings);
    closeRenameCat();
    renderOutgoingDestManager();
  } else if (mode === 'storage') {
    modal.dataset.mode = '';
    document.querySelector('#rename-cat-modal h3').textContent = 'Rename Category';
    const newName = (document.getElementById('rename-cat-input').value || '').trim();
    if (!newName || newName === _renameDestTarget.name) { closeRenameCat(); return; }
    const oldName = _renameDestTarget.name;
    if (!appSettings.storageLocations) appSettings.storageLocations = [...getStorageLocations()];
    appSettings.storageLocations[_renameDestTarget.idx] = newName;
    // Rename key on all inventory items
    inventory.forEach(item => {
      if (item.storage && item.storage[oldName] !== undefined) {
        item.storage[newName] = item.storage[oldName];
        delete item.storage[oldName];
      }
    });
    await saveSettings(appSettings);
    await persist();
    closeRenameCat();
    renderStorageLocationManager();
    renderInventoryView();
  } else {
    await _origConfirmRenameCat();
  }
};

// ── SETTINGS ──
async function openSettings() {
  document.getElementById('s-3mf-folder').value = appSettings.threeMfFolder || '';
  document.getElementById('s-slicer').value = appSettings.slicer || 'bambu';
  document.getElementById('s-bambu-path').value = appSettings.bambuPath || '';
  document.getElementById('s-orca-path').value = appSettings.orcaPath || '';
  document.getElementById('s-inv-popup').checked = appSettings.invPopup !== false;
  await setTheme(appSettings.theme || 'auto');
  renderCategoryManager();
  renderStorageLocationManager();
  renderOutgoingDestManager();
  initSettingsSections();
  document.getElementById('settings-modal').style.display = '';
}
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
async function pick3mfFolder() {
  if (!window.electronAPI) return;
  const folder = await window.electronAPI.pick3mfFolder();
  if (folder) document.getElementById('s-3mf-folder').value = folder;
}
async function saveSettingsModal() {
  appSettings.threeMfFolder = document.getElementById('s-3mf-folder').value;
  appSettings.slicer = document.getElementById('s-slicer').value;
  appSettings.bambuPath = document.getElementById('s-bambu-path').value;
  appSettings.orcaPath = document.getElementById('s-orca-path').value;
  appSettings.invPopup = document.getElementById('s-inv-popup').checked;
  await saveSettings(appSettings);
  closeSettings();
  renderInventoryView();
  renderProductView();
}
