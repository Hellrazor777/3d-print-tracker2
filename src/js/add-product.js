// ── ADD PRODUCT ──
let apImagePath = null;

function openAddProduct() {
  apImagePath = null;
  document.getElementById('ap-name').value = '';
  populateCategorySelect('ap-cat', '');
  document.getElementById('ap-img-preview').style.display = 'none';
  document.getElementById('add-product-modal').style.display = '';
  setTimeout(() => document.getElementById('ap-name').focus(), 50);
}
function closeAddProduct() { document.getElementById('add-product-modal').style.display = 'none'; }

async function apUploadImage() {
  if (!window.electronAPI) return;
  const name = document.getElementById('ap-name').value.trim();
  if (!name && !appSettings.threeMfFolder) {
    const result = await window.electronAPI.uploadImage('', 'cover');
    if (result && result.ok) { apImagePath = result.destPath; showApPreview(result.destPath); }
    return;
  }
  const folder = appSettings.threeMfFolder ? await window.electronAPI.getProductFolder(name || 'temp', appSettings.threeMfFolder) : '';
  const result = await window.electronAPI.uploadImage(folder || '.', 'cover');
  if (result && result.ok) { apImagePath = result.destPath; showApPreview(result.destPath); }
}

function showApPreview(imgPath) {
  document.getElementById('ap-img-el').src = 'file://' + imgPath;
  document.getElementById('ap-img-preview').style.display = '';
}

async function saveAddProduct() {
  const name = document.getElementById('ap-name').value.trim();
  if (!name) { document.getElementById('ap-name').focus(); return; }
  const cat = document.getElementById('ap-cat').value.trim();
  const apDesc = (document.getElementById('ap-desc').value||'').trim();
  const apShiny = document.getElementById('ap-shiny').checked;
  const apDesigner = (document.getElementById('ap-designer').value||'').trim();
  const apSource = document.getElementById('ap-source').value;
  if (!products[name]) products[name] = { category: cat, description: apDesc, shiny: apShiny, designer: apDesigner, source: apSource };
  else { products[name].category = cat; products[name].description = apDesc; products[name].shiny = apShiny; products[name].designer = apDesigner; products[name].source = apSource; }
  if (apImagePath) products[name].imagePath = apImagePath;
  openProducts.add(name);
  autoCreateProductFolder(name);
  await persist();
  closeAddProduct();
  setView('product');
  render();
}

async function uploadProductImage(productName) {
  if (!window.electronAPI) return;
  const folder = appSettings.threeMfFolder
    ? await window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder)
    : null;
  const result = await window.electronAPI.uploadImage(folder || '.', 'cover');
  if (result && result.ok) {
    if (!products[productName]) products[productName] = { category: '' };
    products[productName].imagePath = result.destPath;
    await persist(); render();
  }
}
