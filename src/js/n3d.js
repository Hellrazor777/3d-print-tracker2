// ── N3D INTEGRATION ──
let n3dApiKey = '';
let n3dPage = 1;
let n3dTotalPages = 1;
const n3dSelected = new Map();
let n3dSearchTimer = null;

function openN3D() {
  n3dSelected.clear();
  const saved = localStorage.getItem('n3d_key');
  if (saved) { n3dApiKey = saved; document.getElementById('n3d-key-input').value = saved; }
  document.getElementById('n3d-modal').style.display = '';
  if (n3dApiKey) n3dLoadPage(1);
}
function closeN3D() { document.getElementById('n3d-modal').style.display = 'none'; }

async function n3dFetch(path, method, body) {
  if (!window.electronAPI) return { ok: false, error: 'N3D import requires the desktop app.' };
  return await window.electronAPI.n3dRequest(path, method||'GET', body||null, n3dApiKey);
}

async function n3dConnect() {
  const key = document.getElementById('n3d-key-input').value.trim();
  if (!key) return;
  n3dApiKey = key;
  n3dShowStatus('connecting...', 'info');
  const res = await n3dFetch('/version');
  if (!res.ok) { n3dShowStatus('could not connect: ' + res.error, 'err'); n3dApiKey = ''; return; }
  localStorage.setItem('n3d_key', key);
  n3dShowStatus('', '');
  document.getElementById('n3d-browser').style.display = '';
  n3dLoadPage(1);
}

function n3dShowStatus(msg, type) {
  const el = document.getElementById('n3d-status');
  if (!msg) { el.style.display = 'none'; return; }
  el.className = 'import-status ' + type;
  el.textContent = msg; el.style.display = '';
}

function n3dDebounce() {
  clearTimeout(n3dSearchTimer);
  n3dSearchTimer = setTimeout(() => n3dLoadPage(1), 400);
}

async function n3dLoadPage(page) {
  if (page < 1 || page > n3dTotalPages) return;
  n3dPage = page;
  const q = document.getElementById('n3d-search').value.trim();
  const cat = document.getElementById('n3d-cat').value;
  const profile = document.getElementById('n3d-profile').value;
  // v1.1.0: include=details gets full filament/profile data in one request, no batch needed on import
  let path = `/designs?page=${page}&limit=100&profile=${profile}&include=details&locale=AU`;
  if (q) path += `&query=${encodeURIComponent(q)}`;
  if (cat) path += `&category=${cat}`;
  document.getElementById('n3d-grid').innerHTML = '<div style="grid-column:1/-1;padding:2rem;text-align:center;font-size:13px;color:var(--text2)">loading...</div>';
  const res = await n3dFetch(path);
  if (!res.ok) { n3dShowStatus('error: ' + res.error, 'err'); document.getElementById('n3d-grid').innerHTML = ''; return; }
  n3dTotalPages = res.data.pagination.total_pages;
  n3dRenderGrid(res.data.data, res.data.pagination);
}

const n3dDesignCache = new Map();

function n3dSelectAll() {
  const cards = document.querySelectorAll('#n3d-grid [data-slug]');
  const allSel = [...cards].every(c => n3dSelected.has(c.dataset.slug));
  if (allSel) {
    cards.forEach(c => n3dSelected.delete(c.dataset.slug));
  } else {
    cards.forEach(c => {
      const slug = c.dataset.slug;
      if (!n3dSelected.has(slug)) n3dSelected.set(slug, n3dDesignCache.get(slug));
    });
  }
  cards.forEach(c => {
    const slug = c.dataset.slug;
    const sel = n3dSelected.has(slug);
    c.style.border = sel ? '2px solid #378add' : '0.5px solid var(--border2)';
    const titleEl = c.querySelector('.n3d-card-title');
    const checkEl = c.querySelector('.n3d-card-check');
    if (titleEl) titleEl.style.color = sel ? 'var(--info-text)' : 'var(--text)';
    if (checkEl) checkEl.style.display = sel ? 'flex' : 'none';
  });
  n3dUpdateBar();
}

function n3dRenderGrid(designs, pag) {
  const grid = document.getElementById('n3d-grid');
  if (!designs.length) { grid.innerHTML = '<div style="grid-column:1/-1;padding:2rem;text-align:center;font-size:13px;color:var(--text2)">no designs found</div>'; return; }

  // Cache full detail objects (v1.1.0 include=details gives us everything upfront)
  designs.forEach(d => n3dDesignCache.set(d.slug, d));
  grid.innerHTML = '';

  designs.forEach(d => {
    const sel = n3dSelected.has(d.slug);

    // v1.1.0: use img_swatch if available, fall back to computed colour
    const swatches = (d.filaments||[]).slice(0,6).map(f =>
      f.img_swatch
        ? '<img src="' + f.img_swatch + '" style="width:13px;height:13px;border-radius:50%;display:inline-block;flex-shrink:0;object-fit:cover;border:0.5px solid rgba(0,0,0,.15)" title="' + esc(f.color) + '">'
        : '<span style="width:13px;height:13px;border-radius:50%;background:' + n3dColour(f.color) + ';border:0.5px solid rgba(0,0,0,.2);display:inline-block;flex-shrink:0" title="' + esc(f.color) + '"></span>'
    ).join('');

    // v1.1.0: entitled badge — shows whether user can download this design
    const entitledBadge = d.entitled === false
      ? '<div style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;letter-spacing:.03em">🔒 not owned</div>'
      : d.entitled === true
        ? '<div style="position:absolute;top:6px;right:6px;background:rgba(30,100,20,.75);color:#c8f0a0;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;letter-spacing:.03em">✓ owned</div>'
        : '';

    // Already-in-tracker badge
    const inTracker = typeof products !== 'undefined' && products[d.title];
    const trackerBadge = inTracker
      ? '<div style="position:absolute;bottom:6px;left:6px;background:rgba(20,60,120,.75);color:#aad4f5;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;letter-spacing:.03em">✓ in tracker</div>'
      : '';

    const card = document.createElement('div');
    card.dataset.slug = d.slug;
    card.style.cssText = 'background:var(--bg);border:' + (sel ? '2px solid #378add' : '0.5px solid var(--border2)') + ';border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;transition:border-color .12s;position:relative';
    card.innerHTML =
      '<div style="position:relative">' +
        (d.image_url
          ? '<img src="' + d.image_url + '" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--bg2)" loading="lazy" onerror="this.style.display=\'none\'">'
          : '<div style="width:100%;aspect-ratio:1;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3)">no image</div>') +
        entitledBadge +
        trackerBadge +
      '</div>' +
      '<div style="padding:10px 12px">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">' +
          '<div class="n3d-card-title" style="font-size:13px;font-weight:500;color:' + (sel ? 'var(--info-text)' : 'var(--text)') + ';line-height:1.3">' + esc(d.title) + '</div>' +
          '<div class="n3d-card-check" style="width:16px;height:16px;border-radius:50%;background:var(--info-bg);border:2px solid #378add;display:' + (sel ? 'flex' : 'none') + ';align-items:center;justify-content:center;font-size:10px;color:#0c447c;flex-shrink:0">&#10003;</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:3px">' + (d.print_time||'') + (d.total_weight_grams ? ' &middot; ' + d.total_weight_grams.toFixed(1) + 'g' : '') + '</div>' +
        (swatches ? '<div style="display:flex;gap:3px;margin-top:6px;flex-wrap:wrap">' + swatches + '</div>' : '') +
      '</div>';

    card.addEventListener('click', (function(slug) {
      return function() { n3dToggle(slug); };
    })(d.slug));
    grid.appendChild(card);
  });

  const pagEl = document.getElementById('n3d-pagination');
  if (pag.total_pages > 1) {
    pagEl.style.display = 'flex';
    document.getElementById('n3d-page-info').textContent = 'page ' + pag.page + ' of ' + pag.total_pages + ' · ' + pag.total + ' designs';
    document.getElementById('n3d-prev').disabled = !pag.has_prev;
    document.getElementById('n3d-next').disabled = !pag.has_next;
  } else { pagEl.style.display = 'none'; }
  n3dUpdateBar();
}

function n3dToggle(slug) {
  if (n3dSelected.has(slug)) n3dSelected.delete(slug);
  else n3dSelected.set(slug, n3dDesignCache.get(slug));

  const card = document.querySelector('[data-slug="' + slug + '"]');
  if (card) {
    const sel = n3dSelected.has(slug);
    card.style.border = sel ? '2px solid #378add' : '0.5px solid var(--border2)';
    const title = card.querySelector('.n3d-card-title');
    const check = card.querySelector('.n3d-card-check');
    if (title) title.style.color = sel ? 'var(--info-text)' : 'var(--text)';
    if (check) check.style.display = sel ? 'flex' : 'none';
  }
  n3dUpdateBar();
}

function n3dUpdateBar() {
  const bar = document.getElementById('n3d-sel-bar');
  const n = n3dSelected.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  document.getElementById('n3d-sel-label').textContent = `${n} design${n!==1?'s':''} selected`;
  if (n > 0) populateCategorySelect('n3d-import-cat', document.getElementById('n3d-import-cat').value);
}

async function n3dImportSelected() {
  if (!n3dSelected.size) return;
  const importCat = document.getElementById('n3d-import-cat').value;
  const colourMode = document.getElementById('n3d-colour-mode').value; // 'together' | 'split'

  // v1.1.0: full details already in cache from include=details — no extra fetch needed
  const designs = [...n3dSelected.values()];

  let added = 0;
  designs.forEach(d => {
    const filaments = d.filaments || [];
    const productName = d.title;
    if (!products[productName]) {
      products[productName] = { category: importCat || d.category || '' };
      if (d.slug) products[productName].n3dUrl = 'https://www.n3dmelbourne.com/design/' + d.slug;
      products[productName].designer = 'N3D Melbourne';
      products[productName].source = 'n3d-membership';
      autoCreateProductFolder(productName);
      if (d.image_url && window.electronAPI && appSettings.threeMfFolder) {
        window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder).then(async folder => {
          if (folder) {
            const ext = d.image_url.split('.').pop().split('?')[0] || 'webp';
            const result = await window.electronAPI.downloadImage(d.image_url, folder, 'cover.' + ext);
            if (result && result.ok) { products[productName].imagePath = result.destPath; await persist(); render(); }
          }
        });
      }
    }
    openProducts.add(productName);

    if (filaments.length === 0) {
      // No filament data — single part
      parts.push({ id:nextId++, name:productName, item:productName, variant:'', desc:d.pokemon&&d.pokemon.description||'', colour:'#888888', colourName:'', stl:d.slug+'.3mf', qty:1, printed:0, status:'queue', reprints:0 });
      added++;
    } else if (colourMode === 'together') {
      // One combined part using the primary (first) filament colour
      const primary = filaments[0];
      const colour = n3dColour(primary.color);
      parts.push({ id:nextId++, name:productName, item:productName, variant:'', desc:d.pokemon&&d.pokemon.description||'', colour, colourName:primary.color, colourSwatch:primary.img_swatch||'', stl:d.slug+'.3mf', qty:1, printed:0, status:'queue', reprints:0 });
      added++;
    } else {
      // One part per filament colour
      filaments.forEach(f => {
        const colour = n3dColour(f.color);
        parts.push({ id:nextId++, name:`${d.title} \u2014 ${f.color}`, item:productName, variant:'', desc:'', colour, colourName:f.color, colourSwatch:f.img_swatch||'', stl:d.slug+'.3mf', qty:1, printed:0, status:'queue', reprints:0 });
        added++;
      });
    }
  });

  // Re-derive nextId from the actual parts array so both the vanilla JS layer and
  // any React state that reloads from disk will compute the same safe value.
  nextId = parts.length ? Math.max(...parts.map(p => p.id)) + 1 : 1;
  await persist();
  n3dSelected.clear();
  n3dUpdateBar();
  n3dShowStatus(`${added} part${added!==1?'s':''} added across ${designs.length} design${designs.length!==1?'s':''}!`, 'ok');
  render();
  n3dLoadPage(n3dPage);
}

function n3dColour(name) {
  if (!name) return '#888888';
  const n = name.toLowerCase();
  const map = {
    'black':'#1a1a1a','white':'#f0f0f0','red':'#e63946','blue':'#4a90d9','yellow':'#f4c542',
    'green':'#639922','orange':'#f4833d','purple':'#7c6be0','pink':'#e98bbd','brown':'#8b5e3c',
    'grey':'#888888','gray':'#888888','silver':'#c0c0c0','gold':'#d4af37','cyan':'#22b8cf',
    'teal':'#1d9e75','navy':'#1a3a5c','cream':'#f5f0e8','beige':'#d4b896','coral':'#d85a30',
    'lime':'#7ab83a','sakura':'#f4a7b9','indigo':'#534ab7','violet':'#7f77dd','magenta':'#d4537e',
    // Common filament colours
    'caramel':'#c47c2b','charcoal':'#3d3d3d','desert':'#c2955d','tan':'#c2955d',
    'ivory':'#f0ead6','lilac':'#b39ddb','rose':'#e8758a','mint':'#7dc49a',
    'sky':'#7eb9e0','copper':'#b87333','bronze':'#cd7f32','amber':'#e6a817',
    'olive':'#7a8c2a','slate':'#6d8299','mustard':'#d4a017','terracotta':'#c4622d',
    'sand':'#c8b06a','peach':'#f4a460','lavender':'#9b8ec4','turquoise':'#2ab0b0',
    'maroon':'#7d1a1a','forest':'#2d6a2d','matte':'#888888','pastel':'#b8d4e8',
  };
  for (const [k,v] of Object.entries(map)) { if (n.includes(k)) return v; }
  let h = 0; for (let i=0;i<name.length;i++) h = name.charCodeAt(i)+((h<<5)-h);
  return '#'+((h&0xffffff)|0x404040).toString(16).padStart(6,'0').slice(0,6);
}
