function setView(v) {
  currentView=v;
  document.getElementById('view-product').style.display=v==='product'?'':'none';
  document.getElementById('product-filter-bar').style.display=v==='product'?'flex':'none';
  document.getElementById('view-archive').style.display=v==='archive'?'':'none';
  document.getElementById('view-colours').style.display=v==='colours'?'':'none';
  document.getElementById('view-inventory').style.display=v==='inventory'?'':'none';
  document.getElementById('vb-product').classList.toggle('active',v==='product');
  document.getElementById('vb-archive').classList.toggle('active',v==='archive');
  document.getElementById('vb-colours').classList.toggle('active',v==='colours');
  document.getElementById('vb-inventory').classList.toggle('active',v==='inventory');
  render();
}
function setFilter(f,el) { activeFilter=f; document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active')); el.classList.add('active'); render(); }
function render() { updateDatalist(); renderStats(); if(currentView==='product') renderProductView(); else if(currentView==='archive') renderArchiveView(); else if(currentView==='colours') renderColourView(); else renderInventoryView(); }

function updateDatalist() {
  const dl=document.getElementById('item-list'); if(dl){ dl.innerHTML=''; getItems().forEach(it=>{ const o=document.createElement('option');o.value=it;dl.appendChild(o); }); }
}

function renderStats() {
  const items=getItems().filter(i=>!products[i]?.archived), readyN=items.filter(i=>isReady(i)).length;
  const tp=parts.reduce((a,p)=>a+p.printed,0), tn=parts.reduce((a,p)=>a+p.qty,0);
  const archivedN = Object.values(products).filter(p=>p.archived).length;
  const onHand=inventory.reduce((a,item)=>{
    const totalOut=(item.distributions||[]).reduce((s,d)=>s+(d.qty||0),0);
    return a+Math.max(0,(item.built||0)-totalOut);
  },0);
  document.getElementById('stats').innerHTML=`
    <div class="stat"><div class="stat-label">Active Products</div><div class="stat-val">${items.length}</div></div>
    <div class="stat"><div class="stat-label">Parts Tracked</div><div class="stat-val">${parts.length}</div></div>
    <div class="stat"><div class="stat-label">Pieces Printed</div><div class="stat-val">${tp}/${tn}</div></div>
    <div class="stat"><div class="stat-label">Ready to Build</div><div class="stat-val" style="color:var(--green)">${readyN}</div></div>
    <div class="stat"><div class="stat-label">On Hand</div><div class="stat-val" style="color:var(--green)">${onHand}</div></div>`;
}
