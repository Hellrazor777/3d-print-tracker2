// ── IMPORT ──
const TEMPLATE_COLS=['product','part_name','variant','colour_name','colour_hex','stl','qty','category','description'];

async function doImport() {
  pendingRows=[]; conflictQueue=[]; conflictDecisions={};
  document.getElementById('import-status').innerHTML='';
  document.getElementById('preview-wrap').style.display='none';
  document.getElementById('import-confirm-btn').style.display='none';

  let text;
  if (isElectron) {
    text = await window.electronAPI.openCsvDialog();
    if (!text) return;
  } else {
    const input = document.createElement('input'); input.type='file'; input.accept='.csv';
    text = await new Promise(res => { input.onchange=e=>{ const r=new FileReader(); r.onload=ev=>res(ev.target.result); r.readAsText(e.target.files[0]); }; input.click(); });
  }
  parseCSV(text);
  document.getElementById('import-modal').style.display='';
}

async function doExport() {
  const rows=[TEMPLATE_COLS.join(',')];
  parts.forEach(p=>{
    const cat=products[p.item]?.category||'';
    const colours = p.colours&&p.colours.length ? p.colours : (p.colour?[{hex:p.colour,name:p.colourName||''}]:[]);
    const colourNames = colours.map(c=>c.name||'').join('|');
    const colourHexes = colours.map(c=>c.hex||'').join('|');
    rows.push([p.item,p.name,p.variant,colourNames,colourHexes,p.stl,p.qty,cat,p.desc].map(v=>String(v||'').replace(/,/g,';')).join(','));
  });
  const content=rows.join('\n');
  if (isElectron) {
    await window.electronAPI.saveCsvDialog(content);
  } else {
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(content); a.download='3d-print-export.csv'; a.click();
  }
}

function parseCSV(text) {
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2){ showImportStatus('need at least a header row and one data row.','err'); return; }
  const header=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
  const idx=k=>header.indexOf(k);
  const missing=['product','part_name'].filter(k=>idx(k)===-1);
  if(missing.length){ showImportStatus(`missing required columns: ${missing.join(', ')}.`,'err'); return; }
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(',');
    const get=k=>idx(k)>-1?(cols[idx(k)]||'').trim():'';
    const product=get('product'),part_name=get('part_name');
    if(!product||!part_name) continue;
    rows.push({product,part_name,variant:get('variant'),colour_name:get('colour_name'),colour_hex:get('colour_hex')||'#888888',stl:get('stl'),qty:Math.max(1,parseInt(get('qty'))||1),category:get('category'),description:get('description')});
  }
  if(!rows.length){ showImportStatus('no valid rows found.','err'); return; }
  pendingRows=rows;
  const uniqueProducts=[...new Set(rows.map(r=>r.product))];
  const existing=getItems();
  conflictQueue=uniqueProducts.filter(p=>existing.includes(p));
  conflictDecisions={};
  const total=rows.length, prods=uniqueProducts.length, conflicts=conflictQueue.length;
  showImportStatus(`${total} part${total!==1?'s':''} across ${prods} product${prods!==1?'s':''}${conflicts?` · ${conflicts} conflict${conflicts!==1?'s':''} to resolve`:''}. ready to import.`,'ok');
  const cols=['product','part_name','colour_name','stl','qty'];
  const head='<tr>'+cols.map(c=>`<th>${c.replace('_',' ')}</th>`).join('')+'</tr>';
  const body=rows.slice(0,5).map(r=>'<tr>'+cols.map(c=>`<td>${esc(String(r[c]||''))}</td>`).join('')+'</tr>').join('');
  document.getElementById('preview-table').innerHTML=head+body;
  document.getElementById('preview-label').textContent=`preview — first ${Math.min(rows.length,5)} of ${rows.length} row${rows.length!==1?'s':''}`;
  document.getElementById('preview-wrap').style.display='';
  document.getElementById('import-confirm-btn').style.display='';
}

function showImportStatus(msg,type) {
  const el=document.getElementById('import-status');
  el.className='import-status '+(type==='err'?'err':'ok');
  el.textContent=msg;
}
function closeImportModal() { document.getElementById('import-modal').style.display='none'; }

function startConflictFlow() {
  closeImportModal();
  if(conflictQueue.length===0){ applyImport(); return; }
  showNextConflict();
}

function showNextConflict() {
  if(conflictQueue.length===0){ applyImport(); return; }
  const productName=conflictQueue[0];
  const current=Object.keys(conflictDecisions).length+1;
  const incoming=pendingRows.filter(r=>r.product===productName).length;
  const existing=parts.filter(p=>p.item===productName).length;
  document.getElementById('conflict-step').innerHTML=`conflict ${current} of ${Object.keys(conflictDecisions).length+conflictQueue.length} — <strong>${productName}</strong>`;
  document.getElementById('conflict-name').textContent=productName;
  document.getElementById('conflict-desc').innerHTML=`This product already has <strong>${existing}</strong> part${existing!==1?'s':''} tracked. Your CSV adds <strong>${incoming}</strong> more. What would you like to do?`;
  selectedConflictOpt='add';
  document.getElementById('copt-add').classList.add('selected');
  document.getElementById('copt-new').classList.remove('selected');
  document.getElementById('conflict-modal').style.display='';
}

function selectConflictOpt(opt) {
  selectedConflictOpt=opt;
  document.getElementById('copt-add').classList.toggle('selected',opt==='add');
  document.getElementById('copt-new').classList.toggle('selected',opt==='new');
}

function resolveConflict() {
  const productName=conflictQueue.shift();
  conflictDecisions[productName]=selectedConflictOpt;
  document.getElementById('conflict-modal').style.display='none';
  if(conflictQueue.length>0) showNextConflict(); else applyImport();
}

async function applyImport() {
  document.getElementById('conflict-modal').style.display='none';
  const existingItems=getItems(), newProductSuffixes={};
  pendingRows.forEach(r=>{
    let productName=r.product;
    if(existingItems.includes(productName)){
      const decision=conflictDecisions[productName]||'add';
      if(decision==='new'){
        if(!newProductSuffixes[productName]){
          let s=2, c=`${productName} (${s})`;
          while(existingItems.includes(c)||Object.values(newProductSuffixes).includes(c)){ s++; c=`${productName} (${s})`; }
          newProductSuffixes[productName]=c;
        }
        productName=newProductSuffixes[productName];
      }
    }
    if(!products[productName]){ products[productName]={category:r.category||''}; autoCreateProductFolder(productName); }
    else if(r.category&&!products[productName].category) products[productName].category=r.category;
    parts.push({id:nextId++,name:r.part_name,item:productName,variant:r.variant,desc:r.description,colour:r.colour_hex,colourName:r.colour_name,stl:r.stl,qty:r.qty,printed:0,status:'queue',reprints:0});
    openProducts.add(productName);
  });
  await persist(); render();
}
