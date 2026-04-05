// ── COLOUR VIEW ──
const colourExpanded = new Set();

function renderColourView() {
  const container = document.getElementById('view-colours');
  if (!container) return;

  const queuedParts = parts.filter(p => p.status === 'queue');

  if (!queuedParts.length) {
    container.innerHTML = '<p style="color:var(--text2);font-size:13px;padding:1rem 0">no parts in queue — add some parts and set their status to queue.</p>';
    return;
  }

  const colourMap = {};
  queuedParts.forEach(p => {
    const colours = p.colours && p.colours.length ? p.colours : (p.colour ? [{hex:p.colour, name:p.colourName||''}] : [{hex:'#888888', name:'unknown'}]);
    colours.forEach(c => {
      const key = (c.name||c.hex||'unknown').toLowerCase().trim();
      if (!colourMap[key]) colourMap[key] = { name: c.name||c.hex||'unknown', hex: c.hex||'#888888', parts: [] };
      colourMap[key].parts.push(p);
    });
  });

  const sorted = Object.values(colourMap).sort((a,b) => b.parts.length - a.parts.length);
  const totalPcsAll = queuedParts.reduce((a,p)=>a+p.qty,0);

  container.innerHTML = '';
  const summary = document.createElement('div');
  summary.style.cssText = 'font-size:13px;color:var(--text2);margin-bottom:14px';
  summary.textContent = sorted.length + ' colour' + (sorted.length!==1?'s':'') + ' · ' + queuedParts.length + ' part' + (queuedParts.length!==1?'s':'') + ' · ' + totalPcsAll + ' pieces in queue';
  container.appendChild(summary);

  sorted.forEach(group => {
    const key = group.name.toLowerCase().trim();
    const isOpen = colourExpanded.has(key);
    const totalPcs = group.parts.reduce((a,p)=>a+p.qty,0);

    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.marginBottom = '10px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;user-select:none';
    hdr.addEventListener('click', () => {
      if (colourExpanded.has(key)) colourExpanded.delete(key); else colourExpanded.add(key);
      renderColourView();
    });

    const swatch = document.createElement('div');
    swatch.style.cssText = 'width:24px;height:24px;border-radius:50%;background:'+group.hex+';border:0.5px solid rgba(0,0,0,.15);flex-shrink:0';

    const nameWrap = document.createElement('div');
    nameWrap.style.flex = '1';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:14px;font-weight:500;color:var(--text)';
    nameEl.textContent = group.name;
    const countEl = document.createElement('div');
    countEl.style.cssText = 'font-size:11px;color:var(--text2);margin-top:2px';
    countEl.textContent = group.parts.length + ' part' + (group.parts.length!==1?'s':'') + ' · ' + totalPcs + ' piece' + (totalPcs!==1?'s':'');
    nameWrap.appendChild(nameEl); nameWrap.appendChild(countEl);

    const chevron = document.createElement('span');
    chevron.className = 'chevron' + (isOpen?' open':'');
    chevron.textContent = '▶'; chevron.style.fontSize = '11px';

    hdr.appendChild(swatch); hdr.appendChild(nameWrap); hdr.appendChild(chevron);
    card.appendChild(hdr);

    if (isOpen) {
      const table = document.createElement('div');
      table.className = 'parts-table';
      group.parts.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:0.5px solid var(--border);font-size:13px';
        row.innerHTML =
          '<div style="flex:1"><div style="font-weight:500;color:var(--text)">' + esc(p.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">' + esc(p.item||'') + (p.variant?' · '+esc(p.variant):'') + '</div></div>' +
          '<span style="font-size:12px;color:var(--text2)">' + p.qty + ' pc'+(p.qty!==1?'s':'')+'</span>' +
          '<span class="sp sp-queue" style="font-size:11px">queue</span>';
        table.appendChild(row);
      });
      card.appendChild(table);
    }

    container.appendChild(card);
  });
}
