// ── ARCHIVE ──
async function archiveProduct(item) {
  if (!confirm('Archive "' + item + '"? It will be moved to the Archive tab and hidden from Products.')) return;
  if (!products[item]) products[item] = {category:''};
  products[item].archived = true;
  await persist(); render();
}

async function unarchiveProduct(item) {
  if (products[item]) products[item].archived = false;
  await persist(); render();
}

async function restartProduct(item) {
  if (!confirm('Restart "' + item + '" from scratch? All part statuses and print counts will be reset to queue. Your inventory history is kept.')) return;
  parts.filter(p => p.item === item).forEach(p => {
    p.status = 'queue';
    p.printed = 0;
    p.reprints = 0;
    if (p.subParts && p.subParts.length) {
      p.subParts.forEach(sp => { sp.status = 'queue'; sp.printed = 0; });
    }
  });
  if (products[item]) products[item].archived = false;
  await persist();
  setView('product');
  render();
}

function renderArchiveView() {
  const container = document.getElementById('view-archive');
  const archived = getItems().filter(i => products[i]?.archived);
  if (!archived.length) {
    container.innerHTML = '<p style="color:var(--text2);font-size:13px;padding:1rem 0">no archived products yet.</p>';
    return;
  }
  container.innerHTML = '<div style="margin-bottom:12px;font-size:13px;color:var(--text2)">' + archived.length + ' archived product' + (archived.length!==1?'s':'') + '</div><div class="product-list" id="archive-list"></div>';
  const list = document.getElementById('archive-list');

  archived.forEach(item => {
    const ps = parts.filter(p => p.item===item);
    const tp = ps.reduce((a,p)=>a+p.qty,0), dp = ps.reduce((a,p)=>a+p.printed,0);
    const cat = products[item]?.category||'';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.opacity = '.8';

    const header = document.createElement('div');
    header.className = 'product-header';
    header.style.cursor = 'default';
    header.innerHTML =
      '<div class="product-title-wrap">' +
        '<span class="product-title" style="color:var(--text2)">' + esc(item) + '</span>' +
        (cat ? '<span class="cat-tag" style="margin-left:4px">' + esc(cat) + '</span>' : '') +
      '</div>' +
      '<span style="font-size:11px;color:var(--text2);margin-right:8px">' + dp + '/' + tp + ' pcs</span>' +
      '<span class="ready-badge" style="margin-right:8px">&#10003; complete</span>';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn';
    restoreBtn.style.cssText = 'font-size:12px;padding:4px 12px';
    restoreBtn.textContent = '↑ restore';
    restoreBtn.addEventListener('click', (function(n){ return function(){ unarchiveProduct(n); }; })(item));

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn btn-primary';
    restartBtn.style.cssText = 'font-size:12px;padding:4px 12px;margin-left:4px';
    restartBtn.textContent = '⟳ restart';
    restartBtn.addEventListener('click', (function(n){ return function(){ restartProduct(n); }; })(item));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn';
    deleteBtn.style.cssText = 'font-size:12px;padding:4px 12px;margin-left:4px;color:var(--red-text);border-color:var(--red-text)';
    deleteBtn.textContent = 'delete';
    deleteBtn.addEventListener('click', (function(n){ return function(){ deleteProduct(n); }; })(item));

    header.appendChild(restoreBtn);
    header.appendChild(restartBtn);
    header.appendChild(deleteBtn);
    card.appendChild(header);
    list.appendChild(card);
  });
}

async function deleteProduct(item) {
  if (!confirm('Permanently delete "' + item + '" and all its parts? This cannot be undone.')) return;
  parts = parts.filter(p => p.item !== item);
  delete products[item];
  await persist(); render();
}
