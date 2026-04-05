// ── 3MF FILE HANDLING ──

// Returns true = proceed, false = go back
async function checkBambuVersion() {
  if (!window.electronAPI || !window.electronAPI.getBambuVersion) return true;
  if ((appSettings.slicer || 'bambu') !== 'bambu') return true;
  const exePath = appSettings.bambuPath || 'C:\\Program Files\\Bambu Studio\\bambu-studio.exe';
  const current = await window.electronAPI.getBambuVersion(exePath);
  if (!current) return true; // can't detect — don't block
  const approved = appSettings.approvedBambuVersion;
  if (!approved) {
    // First run — silently approve current version
    appSettings.approvedBambuVersion = current;
    if (window.electronAPI.saveSettings) await window.electronAPI.saveSettings(appSettings);
    return true;
  }
  if (current === approved) return true; // same version, all good
  // Different (newer) version detected — ask user
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML =
      '<div style="background:var(--bg);border:0.5px solid var(--border2);border-radius:var(--radius-lg);padding:1.5rem;width:360px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          '<span style="font-size:22px">⚠️</span>' +
          '<h3 style="font-size:15px;font-weight:600;color:var(--text)">Bambu Studio update detected</h3>' +
        '</div>' +
        '<p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:6px">' +
          '<strong style="color:var(--text)">' + esc(current) + '</strong> is installed, which is newer than the approved version <strong style="color:var(--text)">' + esc(approved) + '</strong>.' +
        '</p>' +
        '<p style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:1.25rem">' +
          'Newer versions may have compatibility issues with command line operations.' +
        '</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<button id="bv-allow-perm" class="btn btn-primary" style="width:100%;font-size:13px;padding:9px">Allow permanently</button>' +
          '<button id="bv-allow-once" class="btn" style="width:100%;font-size:13px;padding:9px">Allow this time</button>' +
          '<button id="bv-go-back" class="btn" style="width:100%;font-size:13px;padding:9px;color:var(--red-text);border-color:var(--red-text)">Go Back</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#bv-allow-perm').addEventListener('click', async () => {
      appSettings.approvedBambuVersion = current;
      if (window.electronAPI.saveSettings) await window.electronAPI.saveSettings(appSettings);
      overlay.remove(); resolve(true);
    });
    overlay.querySelector('#bv-allow-once').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#bv-go-back').addEventListener('click', () => { overlay.remove(); resolve(false); });
  });
}
async function uploadProduct3mf(productName) {
  if (!window.electronAPI) return;
  if (!appSettings.threeMfFolder) { alert('Please set your 3MF folder in Settings first.'); openSettings(); return; }
  const result = await window.electronAPI.upload3mf(productName, appSettings.threeMfFolder);
  if (!result || result.error) { if (result?.error) alert('Upload failed: ' + result.error); return; }
  if (!products[productName]) products[productName] = { category: '' };
  if (!products[productName].threeMfFiles) products[productName].threeMfFiles = [];
  if (!products[productName].threeMfFiles.includes(result.fileName)) {
    products[productName].threeMfFiles.push(result.fileName);
  }

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:200';
  const inner = document.createElement('div');
  inner.style.cssText = 'background:var(--bg);border:0.5px solid var(--border2);border-radius:var(--radius-lg);padding:1.5rem;width:320px;max-width:95vw';
  inner.innerHTML =
    '<h3 style="font-size:16px;font-weight:600;margin-bottom:8px;color:var(--text)">3MF uploaded</h3>' +
    '<p style="font-size:13px;color:var(--text2);margin-bottom:1rem;line-height:1.5"><strong style="color:var(--text)">' + result.fileName + '</strong> has been saved to the product folder.</p>' +
    '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg2);border-radius:var(--radius);border:0.5px solid var(--border2);cursor:pointer" id="presliced-toggle">' +
      '<div id="presliced-check" style="width:20px;height:20px;border-radius:4px;border:2px solid var(--border2);background:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"></div>' +
      '<div><div style="font-size:13px;font-weight:500;color:var(--text)">pre-sliced and ready to print</div><div style="font-size:11px;color:var(--text2);margin-top:2px">tick if this file is ready to send to the printer</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:1rem;justify-content:flex-end">' +
      '<button class="btn btn-primary" id="presliced-save" style="flex:1">save</button>' +
    '</div>';
  modal.appendChild(inner);
  document.body.appendChild(modal);

  let isPresliced = false;
  document.getElementById('presliced-toggle').addEventListener('click', () => {
    isPresliced = !isPresliced;
    const chk = document.getElementById('presliced-check');
    chk.style.background = isPresliced ? 'var(--green)' : 'transparent';
    chk.style.borderColor = isPresliced ? 'var(--green)' : 'var(--border2)';
    chk.textContent = isPresliced ? '✓' : '';
    chk.style.color = 'white';
  });
  document.getElementById('presliced-save').addEventListener('click', async () => {
    products[productName].preSliced = isPresliced;
    modal.remove();
    await persist(); render();
  });
}

async function autoCreateProductFolder(productName) {
  if (!window.electronAPI || !appSettings.threeMfFolder || !productName) return;
  try { await window.electronAPI.createProductFolder(productName, appSettings.threeMfFolder); }
  catch(e) {}
}

function productHas3mf(productName) {
  return !!(products[productName]?.threeMfFiles && products[productName].threeMfFiles.length);
}

async function openProductFolder(productName) {
  if (!window.electronAPI) return;
  if (!appSettings.threeMfFolder) { alert('Please set your 3MF folder in Settings first.'); openSettings(); return; }
  const folder = await window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder);
  if (folder) await window.electronAPI.openFolder(folder);
}

async function openProductInSlicer(productName) {
  if (!window.electronAPI) return;
  if (!appSettings.threeMfFolder) { alert('Please set your 3MF folder in Settings first.'); openSettings(); return; }
  const proceed = await checkBambuVersion();
  if (!proceed) return;
  const folder = await window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder);
  if (!folder) return;
  const result = await window.electronAPI.openInSlicer(folder, appSettings.slicer || 'bambu');
  if (result && !result.ok) alert('Could not open slicer: ' + (result.error || 'unknown error'));
}

async function ensureProductFolder(productName) {
  if (!window.electronAPI || !appSettings.threeMfFolder) return;
  await window.electronAPI.getProductFolder(productName, appSettings.threeMfFolder);
  try { await window.electronAPI.openFolder('__create__' + productName + '__' + appSettings.threeMfFolder); } catch(e) {}
}
