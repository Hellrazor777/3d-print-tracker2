function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function syncColourPick(v) { if (/^#[0-9a-f]{6}$/i.test(v)) document.getElementById('f-colour-pick').value = v; }

function resetColourRows(cols) {
  const wrap = document.getElementById('colour-rows');
  wrap.innerHTML = '';
  (cols.length ? cols : [{hex:'#4a90d9',name:''}]).forEach(c => addColourRow(c));
}
function addColourRow(c) {
  const wrap = document.getElementById('colour-rows');
  const hex = (c&&c.hex) ? c.hex : '#4a90d9';
  const name = (c&&c.name) ? c.name : '';
  const row = document.createElement('div');
  row.className = 'colour-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
  row.innerHTML = `<input type="color" value="${hex}" style="width:36px;height:36px;padding:2px;border-radius:6px;border:0.5px solid var(--border2);cursor:pointer;background:var(--bg2);flex-shrink:0" oninput="this.nextElementSibling.value=this.value"/>
    <input type="text" value="${esc(name)}" placeholder="e.g. Galaxy Black, Sakura Pink" style="flex:1;font-size:13px;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius);padding:6px 10px;color:var(--text);font-family:inherit;outline:none" oninput="if(/^#[0-9a-f]{6}$/i.test(this.value))this.previousElementSibling.value=this.value"/>
    <button type="button" onclick="if(document.getElementById('colour-rows').children.length>1)this.parentElement.remove()" style="background:transparent;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;font-size:15px;color:var(--text3);font-family:inherit" title="remove">&#x2715;</button>`;
  wrap.appendChild(row);
}
function getColourRows() {
  return [...document.getElementById('colour-rows').children].map(row => {
    const inputs = row.querySelectorAll('input');
    return { hex: inputs[0].value, name: inputs[1].value.trim() };
  }).filter(c => c.hex);
}
function getItems() { return [...new Set(parts.map(p=>p.item).filter(Boolean))]; }
function getCategories() { return [...new Set(Object.values(products).map(p=>p.category).filter(Boolean))]; }
function isReady(item) { const ps=parts.filter(p=>p.item===item); return ps.length>0&&ps.every(p=>p.status==='done'); }
