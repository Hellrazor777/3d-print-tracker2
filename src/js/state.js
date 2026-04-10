// ── Storage: use Electron file API, fall back to localStorage ──
const isElectron = !!window.electronAPI;

async function loadData() {
  if (isElectron) return await window.electronAPI.loadData();
  try { return JSON.parse(localStorage.getItem('3dp_data')); } catch(e) { return null; }
}
async function saveData(data) {
  if (isElectron) {
    // Merge with the full saved payload so fields not managed by the vanilla JS
    // layer (e.g. filaments) are never silently dropped from disk.
    const existing = await window.electronAPI.loadData().catch(() => null) || {};
    return await window.electronAPI.saveData({ ...existing, ...data });
  }
  try {
    const existing = JSON.parse(localStorage.getItem('3dp_data') || '{}');
    localStorage.setItem('3dp_data', JSON.stringify({ ...existing, ...data }));
  } catch { localStorage.setItem('3dp_data', JSON.stringify(data)); }
}
async function loadSettings() {
  if (isElectron) return await window.electronAPI.loadSettings();
  try { return JSON.parse(localStorage.getItem('3dp_settings')); } catch(e) { return null; }
}
async function saveSettings(s) {
  if (isElectron) return await window.electronAPI.saveSettings(s);
  localStorage.setItem('3dp_settings', JSON.stringify(s));
}

// ── State ──
let parts = [], products = {}, inventory = [], nextId = 1;
let editId = null, renameTarget = null, activeFilter = 'all', dragId = null, currentView = 'product';
let openProducts = new Set();
let pendingRows = [], conflictQueue = [], conflictDecisions = {}, selectedConflictOpt = 'add';
let invExpanded = new Set();
let invSectionCollapsed = new Set();
let invLogQty = {}, invLogDest = {};
let catExpanded = new Set();
let sliceFilter = 'all'; // 'all' | 'sliced' | 'unsliced'
let appSettings = { threeMfFolder: '', slicer: 'bambu', bambuPath: '', orcaPath: '', theme: 'auto' };

async function init() {
  const saved = await loadData();
  if (saved) {
    parts = saved.parts || [];
    products = saved.products || {};
    inventory = saved.inventory || [];
    nextId = parts.length ? Math.max(...parts.map(p=>p.id)) + 1 : 1;
    const savedCats = saved.expandedCats || [];
    savedCats.forEach(c => catExpanded.add(c));
  } else {
    // default sample data
    parts = [
      {id:1,name:'Base plate',item:'Robot Arm',variant:'',desc:'Main structural base',colour:'#4a90d9',colourName:'Blue',stl:'base_plate_v2.stl',qty:1,printed:1,status:'done',reprints:0},
      {id:2,name:'Servo horn',item:'Robot Arm',variant:'x4 set',desc:'Attaches servo to linkage',colour:'#ffffff',colourName:'White',stl:'servo_horn.stl',qty:4,printed:4,status:'done',reprints:1},
      {id:3,name:'Elbow joint',item:'Robot Arm',variant:'',desc:'Pivot between arm segments',colour:'#4a90d9',colourName:'Blue',stl:'elbow_v3.stl',qty:1,printed:0,status:'printing',reprints:0},
      {id:4,name:'Gripper finger',item:'Robot Arm',variant:'left',desc:'Flexible gripper jaw',colour:'#e63946',colourName:'Red',stl:'finger_left.stl',qty:1,printed:0,status:'queue',reprints:0},
      {id:5,name:'Gripper finger',item:'Robot Arm',variant:'right',desc:'Mirror of left finger',colour:'#e63946',colourName:'Red',stl:'finger_right.stl',qty:1,printed:0,status:'queue',reprints:0},
      {id:6,name:'Bottom shell',item:'Pi 5 Case',variant:'',desc:'Houses Pi board and IO',colour:'#2d2d2d',colourName:'Galaxy Black',stl:'pi5_base.stl',qty:1,printed:1,status:'done',reprints:0},
      {id:7,name:'Lid',item:'Pi 5 Case',variant:'with vent',desc:'Top cover with ventilation',colour:'#2d2d2d',colourName:'Galaxy Black',stl:'pi5_lid_vent.stl',qty:1,printed:1,status:'done',reprints:0},
    ];
    products = {'Robot Arm':{category:'Robotics'},'Pi 5 Case':{category:'Home'}};
    nextId = 8;
  }
  getItems().forEach(i => openProducts.add(i));
  // Load settings (works in both Electron and web via localStorage fallback)
  const s = await loadSettings();
  if (s) appSettings = { ...appSettings, ...s };
  applyTheme(appSettings.theme || 'auto');
  render();
  // Check Bambu Studio version after UI is ready
  if (window.electronAPI) setTimeout(() => checkBambuVersion().catch(() => {}), 1500);
}

async function persist() {
  await saveData({ parts, products, inventory, expandedCats: [...catExpanded] });
}
