import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// ── Storage helpers (Electron IPC or localStorage fallback) ──
const isElectron = !!window.electronAPI;

// Convert a local file path to a localfile:// URL served by Electron's custom
// protocol handler. Returns null in web mode (no local file access).
export function localFileUrl(filePath) {
  if (!filePath) return null;
  if (!isElectron) return null;
  if (filePath.startsWith('localfile://')) return filePath;
  let p = filePath.startsWith('file://') ? filePath.slice(7) : filePath;
  p = p.replace(/\\/g, '/');
  if (p.startsWith('//')) p = p.slice(1);
  return 'localfile:///' + p;
}

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';

async function loadData() {
  if (isElectron) return await window.electronAPI.loadData();
  try {
    const r = await fetch(`${API_BASE}/api/data`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function saveData(data) {
  if (isElectron) return await window.electronAPI.saveData(data);
  try {
    const r = await fetch(`${API_BASE}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) console.error('[saveData] API error:', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.error('[saveData] Network error:', e.message);
  }
}
async function loadSettings() {
  if (isElectron) return await window.electronAPI.loadSettings();
  try {
    const r = await fetch(`${API_BASE}/api/settings`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function saveSettingsStorage(s) {
  if (isElectron) return await window.electronAPI.saveSettings(s);
  await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  }).catch(() => {});
}

const SAMPLE_PARTS = [
  { id:1, name:'Base plate', item:'Robot Arm', variant:'', desc:'Main structural base', colours:[{hex:'#4a90d9',name:'Blue'}], colour:'#4a90d9', colourName:'Blue', stl:'base_plate_v2.stl', qty:1, printed:1, status:'done', reprints:0 },
  { id:2, name:'Servo horn', item:'Robot Arm', variant:'x4 set', desc:'Attaches servo to linkage', colours:[{hex:'#ffffff',name:'White'}], colour:'#ffffff', colourName:'White', stl:'servo_horn.stl', qty:4, printed:4, status:'done', reprints:1 },
  { id:3, name:'Elbow joint', item:'Robot Arm', variant:'', desc:'Pivot between arm segments', colours:[{hex:'#4a90d9',name:'Blue'}], colour:'#4a90d9', colourName:'Blue', stl:'elbow_v3.stl', qty:1, printed:0, status:'printing', reprints:0 },
  { id:4, name:'Gripper finger', item:'Robot Arm', variant:'left', desc:'Flexible gripper jaw', colours:[{hex:'#e63946',name:'Red'}], colour:'#e63946', colourName:'Red', stl:'finger_left.stl', qty:1, printed:0, status:'queue', reprints:0 },
  { id:5, name:'Gripper finger', item:'Robot Arm', variant:'right', desc:'Mirror of left finger', colours:[{hex:'#e63946',name:'Red'}], colour:'#e63946', colourName:'Red', stl:'finger_right.stl', qty:1, printed:0, status:'queue', reprints:0 },
  { id:6, name:'Bottom shell', item:'Pi 5 Case', variant:'', desc:'Houses Pi board and IO', colours:[{hex:'#2d2d2d',name:'Galaxy Black'}], colour:'#2d2d2d', colourName:'Galaxy Black', stl:'pi5_base.stl', qty:1, printed:1, status:'done', reprints:0 },
  { id:7, name:'Lid', item:'Pi 5 Case', variant:'with vent', desc:'Top cover with ventilation', colours:[{hex:'#2d2d2d',name:'Galaxy Black'}], colour:'#2d2d2d', colourName:'Galaxy Black', stl:'pi5_lid_vent.stl', qty:1, printed:1, status:'done', reprints:0 },
];
const SAMPLE_PRODUCTS = { 'Robot Arm': { category: 'Robotics' }, 'Pi 5 Case': { category: 'Home' } };

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [parts, setParts] = useState([]);
  const [products, setProducts] = useState({});
  const [inventory, setInventory] = useState([]);
  const [filaments, setFilaments] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [appSettings, setAppSettings] = useState({
    threeMfFolder: '', slicer: 'bambu', bambuPath: '', orcaPath: '',
    theme: 'auto', invPopup: true, n3dApiKey: '',
    bambuAuth: null, printers: [],
  });
  const [printerStatus, setPrinterStatus] = useState({});   // serial/id → state
  const [bambuConn, setBambuConn] = useState({ connected: false, connecting: false });
  // ── Undo stack (circular buffer, max 10) ──
  const [undoStack, setUndoStack] = useState([]); // array of { label, fn }
  const pushUndo = useCallback((label, fn) => {
    setUndoStack(s => [...s.slice(-9), { label, fn }]);
  }, []);
  const undo = useCallback(() => {
    setUndoStack(s => {
      if (!s.length) return s;
      const top = s[s.length - 1];
      top.fn();
      return s.slice(0, -1);
    });
  }, []);
  const [currentView, setCurrentView] = useState('product');
  const [lastMovedProduct, setLastMovedProduct] = useState(null); // product name that just changed section
  const [sliceFilter, setSliceFilter] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [openProducts, setOpenProducts] = useState(new Set());
  const [catExpanded, setCatExpanded] = useState(new Set());
  const [colourExpanded, setColourExpanded] = useState(new Set());
  const [invExpanded, setInvExpanded] = useState(new Set());
  const [invSectionCollapsed, setInvSectionCollapsed] = useState(new Set());
  const [invLogQty, setInvLogQty] = useState({});
  const [invLogDest, setInvLogDest] = useState({});
  const [localIP, setLocalIP] = useState('');
  const [modal, setModal] = useState(null); // { type, ...data }
  const [loaded, setLoaded] = useState(false);

  // Refs for latest state (used in persist callbacks to avoid stale closures)
  const partsRef = useRef(parts);
  const productsRef = useRef(products);
  const inventoryRef = useRef(inventory);
  const catExpandedRef = useRef(catExpanded);
  const filamentsRef = useRef(filaments);
  useEffect(() => { partsRef.current = parts; }, [parts]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { catExpandedRef.current = catExpanded; }, [catExpanded]);
  useEffect(() => { filamentsRef.current = filaments; }, [filaments]);
  const nextIdRef = useRef(nextId);
  useEffect(() => { nextIdRef.current = nextId; }, [nextId]);

  // ── Theme ──
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') { root.setAttribute('data-theme', 'dark'); root.style.colorScheme = 'dark'; }
    else if (theme === 'light') { root.setAttribute('data-theme', 'light'); root.style.colorScheme = 'light'; }
    else { root.removeAttribute('data-theme'); root.style.colorScheme = 'auto'; }
  }

  // ── Init ──
  useEffect(() => {
    async function init() {
      const saved = await loadData();
      let initParts, initProducts, initInventory, initNextId;
      if (saved) {
        initParts = saved.parts || [];
        initProducts = saved.products || {};
        initInventory = saved.inventory || [];
        initNextId = initParts.length ? Math.max(...initParts.map(p => p.id)) + 1 : 1;
        if (saved.expandedCats) setCatExpanded(new Set(saved.expandedCats));
      } else {
        initParts = SAMPLE_PARTS;
        initProducts = SAMPLE_PRODUCTS;
        initInventory = [];
        initNextId = 8;
      }
      setParts(initParts);
      setProducts(initProducts);
      setInventory(initInventory);
      setFilaments(saved?.filaments || []);
      setNextId(initNextId);
      // Open all products by default
      const items = [...new Set(initParts.map(p => p.item).filter(Boolean))];
      setOpenProducts(new Set(items));

      const s = await loadSettings();
      if (s) {
        setAppSettings(prev => ({ ...prev, ...s }));
        applyTheme(s.theme || 'auto');
      }
      setLoaded(true);
    }
    init();

    // Listen for mobile inventory updates
    let cleanupInventoryListener = null;
    if (window.electronAPI?.onInventoryUpdated) {
      const onInventoryUpdated = async () => {
        const saved = await loadData();
        if (saved) {
          setParts(saved.parts || []);
          setProducts(saved.products || {});
          setInventory(saved.inventory || []);
        }
      };
      cleanupInventoryListener = window.electronAPI.onInventoryUpdated(onInventoryUpdated);
    }

    // Listen for printer status updates from main process (Electron) or SSE (web)
    let cleanupPrinterUpdate = null;
    let cleanupBambuConn = null;
    let cleanupBambuToken = null;
    let sseSource = null;

    if (window.electronAPI?.onPrinterUpdate) {
      cleanupPrinterUpdate = window.electronAPI.onPrinterUpdate((_, { serial, id, state }) => {
        const key = serial || id;
        if (key) setPrinterStatus(prev => ({ ...prev, [key]: state }));
      });
      cleanupBambuConn = window.electronAPI.onBambuConn((_, status) => {
        setBambuConn(status || { connected: false });
      });
      cleanupBambuToken = window.electronAPI.onBambuTokenRefreshed((_, { auth }) => {
        let next;
        setAppSettings(prev => { next = { ...prev, bambuAuth: { ...prev.bambuAuth, ...auth } }; return next; });
        if (next) saveSettingsStorage(next);
      });
    } else {
      // Web mode: use SSE to keep printerStatus and bambuConn in sync with the server
      sseSource = new EventSource(`${API_BASE}/api/printers/events`);
      sseSource.addEventListener('printer-update', e => {
        try {
          const { serial, state } = JSON.parse(e.data);
          if (serial) setPrinterStatus(prev => ({ ...prev, [serial]: state }));
        } catch {}
      });
      sseSource.addEventListener('bambu-conn', e => {
        try { setBambuConn(JSON.parse(e.data) || { connected: false }); } catch {}
      });
      sseSource.addEventListener('devices', e => {
        // devices list update — PrintersView handles its own copy; nothing needed here
      });
    }

    return () => {
      if (typeof cleanupInventoryListener === 'function') cleanupInventoryListener();
      if (typeof cleanupPrinterUpdate === 'function') cleanupPrinterUpdate();
      if (typeof cleanupBambuConn === 'function') cleanupBambuConn();
      if (typeof cleanupBambuToken === 'function') cleanupBambuToken();
      if (sseSource) sseSource.close();
    };
  }, []);

  // ── Central persistence — fires after every committed state change ──
  useEffect(() => {
    if (!loaded) return;
    saveData({ parts, products, inventory, filaments, expandedCats: [...catExpanded] });
  }, [parts, products, inventory, filaments, catExpanded, loaded]);

  // ── Settings helpers ──
  const getCategoryOrder = useCallback(() => {
    const allProd = productsRef.current;
    const settings = appSettings;
    const allCats = [...new Set([
      ...Object.values(allProd).map(p => p.category).filter(Boolean),
      ...(settings.extraCategories || []),
    ])];
    const ordered = settings.categoryOrder || [];
    const unordered = allCats.filter(c => !ordered.includes(c));
    return [...ordered.filter(c => allCats.includes(c)), ...unordered];
  }, [appSettings]);

  const getStorageLocations = useCallback(() => {
    return (appSettings.storageLocations?.length) ? appSettings.storageLocations : ['Box', 'Shelf'];
  }, [appSettings]);

  const getOutgoingDests = useCallback(() => {
    return (appSettings.outgoingDests?.length) ? appSettings.outgoingDests : ['store', 'markets', 'website'];
  }, [appSettings]);

  // ── Part helpers ──
  const getItems = useCallback((p = partsRef.current) => {
    return [...new Set(p.map(x => x.item).filter(Boolean))];
  }, []);

  const isReady = useCallback((item) => {
    const ps = partsRef.current.filter(p => p.item === item);
    return ps.length > 0 && ps.every(p => p.status === 'done');
  }, []);

  const productHas3mf = useCallback((item) => {
    return !!(productsRef.current[item]?.threeMfFiles?.length || productsRef.current[item]?.threeMfFolder);
  }, []);

  // ── View & UI ──
  const setView = useCallback((v) => setCurrentView(v), []);

  const toggleProduct = useCallback((item) => {
    setOpenProducts(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  }, []);

  const toggleCat = useCallback((title, defaultOpen = false) => {
    setCatExpanded(prev => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
        next.add('__closed__' + title);
      } else {
        next.add(title);
        next.delete('__closed__' + title);
      }
      return next;
    });
  }, []);

  const toggleColour = useCallback((key) => {
    setColourExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleInvCard = useCallback((id) => {
    setInvExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleInvSection = useCallback((key) => {
    setInvSectionCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Modal ──
  const openModal = useCallback((type, data = {}) => setModal({ type, ...data }), []);
  const closeModal = useCallback(() => setModal(null), []);

  // ── Part CRUD ──
  const adjustQty = useCallback((id, delta) => {
    setParts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const printed = delta > 0 ? Math.min(p.printed + 1, p.qty) : Math.max(p.printed - 1, 0);
      const status = printed === p.qty && delta > 0 ? 'done' : p.status;
      return { ...p, printed, status };
    }));
  }, []);

  const reprint = useCallback((id) => {
    const p = partsRef.current.find(x => x.id === id);
    if (!p) return;
    const reprintedP = { ...p, reprints: (p.reprints || 0) + 1 };
    const newEntry = { ...p, id: nextIdRef.current, printed: 0, status: 'queue', reprints: 0 };
    setParts(prev => prev.map(x => x.id === id ? reprintedP : x).concat(newEntry));
    setNextId(n => n + 1);
  }, []);

  const deletePart = useCallback((id) => {
    const deleted = partsRef.current.find(p => p.id === id);
    if (deleted) pushUndo(`restore "${deleted.name}"`, () => setParts(prev => [...prev, deleted]));
    setParts(prev => prev.filter(p => p.id !== id));
  }, [pushUndo]);

  const saveCard = useCallback((formData, editId) => {
    const { name, item, variant, colours, qty, status } = formData;
    const colour = colours[0]?.hex || '#888888';
    const colourName = colours[0]?.name || '';
    const isNew = !editId;
    setParts(prev => {
      if (editId) {
        return prev.map(p => {
          if (p.id !== editId) return p;
          return { ...p, name, item, variant, colours, colour, colourName, qty, status, printed: Math.min(p.printed, qty) };
        });
      }
      return [...prev, { id: nextIdRef.current, name, item, variant, colours, colour, colourName, qty, status, printed: 0, reprints: 0, desc: '' }];
    });
    if (isNew) setNextId(n => n + 1);
    setProducts(prev => {
      const next = { ...prev };
      if (item && !next[item]) {
        next[item] = { category: '' };
        if (window.electronAPI?.createProductFolder && appSettings.threeMfFolder) {
          window.electronAPI.createProductFolder(item, appSettings.threeMfFolder).catch(() => {});
        }
      }
      return next;
    });
    closeModal();
  }, [appSettings.threeMfFolder, closeModal]);

  const setPartStatus = useCallback(async (partId, newStatus) => {
    // Record the product this part belongs to so ProductView can scroll to it after re-render
    const movedPart = partsRef.current.find(p => p.id === partId);
    if (movedPart?.item) setLastMovedProduct(movedPart.item);

    let newParts, newProducts;
    setParts(prev => {
      newParts = prev.map(p => {
        if (p.id !== partId) return p;
        const wasAlreadyDone = p.status === 'done';
        let printed = p.printed;
        let subParts = p.subParts ? [...p.subParts] : undefined;
        if (newStatus === 'done') {
          printed = p.qty;
          if (subParts) subParts = subParts.map(s => ({ ...s, status: 'done' }));
        } else if (wasAlreadyDone) {
          printed = 0;
          if (subParts) subParts = subParts.map(s => ({ ...s, status: newStatus }));
        }
        return { ...p, status: newStatus, printed, subParts };
      });
      return newParts;
    });
    // If unarchiving (setting non-done on a part from archived product), unarchive
    if (newStatus !== 'done') {
      const part = partsRef.current.find(p => p.id === partId);
      if (part && productsRef.current[part.item]?.archived) {
        setProducts(prev => {
          newProducts = { ...prev, [part.item]: { ...prev[part.item], archived: false } };
          return newProducts;
        });
        setOpenProducts(prev => { const next = new Set(prev); next.add(part.item); return next; });
      }
    }
  }, []);

  const setSubPartStatus = useCallback((partId, subIdx, newStatus) => {
    setParts(prev => prev.map(p => {
      if (p.id !== partId) return p;
      const subParts = p.subParts ? [...p.subParts] : [];
      subParts[subIdx] = { ...subParts[subIdx], status: newStatus };
      let { printed, status } = p;
      if (newStatus === 'done') {
        if (subParts.every(s => s.status === 'done')) { status = 'done'; printed = p.qty; }
      } else {
        if (p.status === 'done') { status = 'printing'; printed = subParts.filter(s => s.status === 'done').length; }
      }
      return { ...p, subParts, status, printed };
    }));
  }, []);

  const adjustSubPrinted = useCallback((partId, subIdx, delta) => {
    setParts(prev => prev.map(p => {
      if (p.id !== partId) return p;
      const subParts = [...(p.subParts || [])];
      const sp = { ...subParts[subIdx] };
      sp.printed = Math.max(0, Math.min(sp.qty || 1, (sp.printed || 0) + delta));
      if (sp.printed >= (sp.qty || 1)) sp.status = 'done';
      else if (sp.status === 'done') sp.status = 'printing';
      subParts[subIdx] = sp;
      let { status, printed } = p;
      if (subParts.every(s => s.status === 'done')) { status = 'done'; printed = p.qty; }
      else if (p.status === 'done') { status = 'printing'; }
      return { ...p, subParts, status, printed };
    }));
  }, []);

  const addSubPart = useCallback((partId, name, qty) => {
    setParts(prev => prev.map(p => {
      if (p.id !== partId) return p;
      const subParts = [...(p.subParts || []), { name, qty, printed: 0, status: 'queue' }];
      const status = p.status === 'done' ? 'queue' : p.status;
      const printed = p.status === 'done' ? 0 : p.printed;
      return { ...p, subParts, status, printed };
    }));
  }, []);

  const deleteSubPart = useCallback((partId, subIdx) => {
    setParts(prev => prev.map(p => {
      if (p.id !== partId) return p;
      return { ...p, subParts: (p.subParts || []).filter((_, i) => i !== subIdx) };
    }));
  }, []);

  // ── Product CRUD ──
  const saveManageProduct = useCallback(({ oldName, newName, category, description, shiny, n3dUrl, designer, source, imagePath, partsBoxEnabled, partsBox }) => {
    setParts(prev => prev.map(p => p.item === oldName ? { ...p, item: newName } : p));
    setProducts(prev => {
      const oldMeta = prev[oldName] || {};
      const next = { ...prev };
      delete next[oldName];
      next[newName] = { ...oldMeta, category, description, shiny, n3dUrl: n3dUrl || oldMeta.n3dUrl || '', designer, source, imagePath: imagePath !== undefined ? imagePath : (oldMeta.imagePath || ''), partsBoxEnabled: !!partsBoxEnabled, partsBox: partsBoxEnabled ? (partsBox || '') : '' };
      return next;
    });
    setOpenProducts(prev => {
      const next = new Set(prev);
      if (next.has(oldName)) { next.delete(oldName); next.add(newName); }
      return next;
    });
    closeModal();
  }, [closeModal]);

  const deleteProductPermanently = useCallback((name) => {
    const savedParts = partsRef.current.filter(p => p.item === name);
    const savedProduct = productsRef.current[name];
    pushUndo(`restore "${name}"`, () => {
      setParts(prev => [...prev, ...savedParts]);
      setProducts(prev => ({ ...prev, [name]: savedProduct }));
    });
    setParts(prev => prev.filter(p => p.item !== name));
    setProducts(prev => { const next = { ...prev }; delete next[name]; return next; });
    closeModal();
  }, [closeModal, pushUndo]);

  const archiveProduct = useCallback((name) => {
    pushUndo(`unarchive "${name}"`, () => setProducts(prev => ({ ...prev, [name]: { ...(prev[name] || {}), archived: false } })));
    setProducts(prev => ({ ...prev, [name]: { ...(prev[name] || {}), archived: true } }));
  }, [pushUndo]);

  const unarchiveProduct = useCallback((name) => {
    setProducts(prev => ({ ...prev, [name]: { ...(prev[name] || {}), archived: false } }));
  }, []);

  const restartProduct = useCallback((name) => {
    setParts(prev => prev.map(p => {
      if (p.item !== name) return p;
      const subParts = p.subParts ? p.subParts.map(s => ({ ...s, status: 'queue', printed: 0 })) : p.subParts;
      return { ...p, status: 'queue', printed: 0, reprints: 0, subParts };
    }));
    setProducts(prev => ({ ...prev, [name]: { ...(prev[name] || {}), archived: false } }));
    setCurrentView('product');
  }, []);

  const saveAddProduct = useCallback(({ name, category, description, shiny, designer, source, imagePath }) => {
    setProducts(prev => ({ ...prev, [name]: { category: category || '', description: description || '', shiny: !!shiny, designer: designer || '', source: source || '', imagePath: imagePath || '' } }));
    setOpenProducts(prev => { const next = new Set(prev); next.add(name); return next; });
    closeModal();
  }, [closeModal]);

  const togglePreSliced = useCallback((name) => {
    setProducts(prev => ({ ...prev, [name]: { ...(prev[name] || {}), preSliced: !(prev[name]?.preSliced) } }));
  }, []);

  // ── Inventory ──
  const invOnHand = useCallback((item) => {
    const totalOut = (item.distributions || []).reduce((a, d) => a + (d.qty || 0), 0);
    return Math.max(0, (item.built || 0) - totalOut);
  }, []);

  // Adjusts storage so its total matches invOnHand(item). Difference goes into the last location.
  const syncStorageLocs = useCallback((item, locs) => {
    if (!locs.length) return item.storage || {};
    const onHand = invOnHand(item);
    const storage = { ...(item.storage || {}) };
    locs.forEach(l => { if (storage[l] === undefined) storage[l] = 0; });
    const total = locs.reduce((a, l) => a + (storage[l] || 0), 0);
    if (total === onHand) return storage;
    if (locs.length === 1) { storage[locs[0]] = onHand; return storage; }
    let remaining = onHand;
    locs.slice(0, -1).forEach(l => {
      storage[l] = Math.min(storage[l] || 0, remaining);
      remaining -= storage[l];
    });
    storage[locs[locs.length - 1]] = Math.max(0, remaining);
    return storage;
  }, [invOnHand]);

  const invMigrateStorage = useCallback((item, locs) => {
    if (!item.storage) {
      item.storage = {};
      locs.forEach((loc, i) => { item.storage[loc] = i === 0 ? (item.box || 0) : i === 1 ? (item.shelf || 0) : 0; });
    }
    locs.forEach(loc => { if (item.storage[loc] === undefined) item.storage[loc] = 0; });
    return item;
  }, []);

  const confirmCompletion = useCallback(async (productName, qty) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = [...prev];
      const existing = newInventory.find(i => i.name === productName);
      if (existing) {
        existing.built = (existing.built || 0) + qty;
        existing.storage = syncStorageLocs(existing, locs);
      } else {
        const storage = {};
        locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? qty : 0; });
        newInventory.push({ id: 'inv_' + Date.now(), name: productName, category: productsRef.current[productName]?.category || '', built: qty, location: '', storage, distributions: [], source: 'tracker' });
      }
      return newInventory;
    });
    setProducts(prev => ({ ...prev, [productName]: { ...(prev[productName] || {}), archived: true } }));
    closeModal();
  }, [closeModal, getStorageLocations, syncStorageLocs]);

  const confirmQuickAdd = useCallback((productName, qty, locations) => {
    setInventory(prev => {
      const next = [...prev];
      const existing = next.find(i => i.name === productName);
      const locs = Object.keys(locations);
      if (existing) {
        existing.built = (existing.built || 0) + qty;
        if (!existing.storage) existing.storage = {};
        locs.forEach(loc => { existing.storage[loc] = (existing.storage[loc] || 0) + (locations[loc] || 0); });
      } else {
        const storage = {};
        locs.forEach(loc => { storage[loc] = locations[loc] || 0; });
        next.push({ id: 'inv_' + Date.now(), name: productName, category: productsRef.current[productName]?.category || '', built: qty, location: '', storage, distributions: [], source: 'tracker' });
      }
      return next;
    });
    closeModal();
  }, [closeModal]);

  const invAdjustBuilt = useCallback((id, delta) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, built: Math.max(0, (item.built || 0) + delta) };
      updated.storage = syncStorageLocs(updated, locs);
      return updated;
    }));
  }, [getStorageLocations, syncStorageLocs]);

  const invSetBuilt = useCallback((id, val) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, built: Math.max(0, val) };
      updated.storage = syncStorageLocs(updated, locs);
      return updated;
    }));
  }, [getStorageLocations, syncStorageLocs]);

  const invAdjustLocation = useCallback((id, loc, delta) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const storage = { ...item.storage };
      const onHand = invOnHand(item);
      storage[loc] = Math.max(0, Math.min(onHand, (storage[loc] || 0) + delta));
      const others = locs.filter(l => l !== loc);
      const remaining = Math.max(0, onHand - storage[loc]);
      if (others.length === 1) storage[others[0]] = remaining;
      return { ...item, storage };
    }));
  }, [getStorageLocations, invOnHand]);

  const invSetLocation = useCallback((id, loc, val) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const onHand = invOnHand(item);
      const storage = { ...item.storage };
      storage[loc] = Math.max(0, Math.min(onHand, val));
      const others = locs.filter(l => l !== loc);
      const remaining = Math.max(0, onHand - storage[loc]);
      if (others.length === 1) storage[others[0]] = remaining;
      return { ...item, storage };
    }));
  }, [getStorageLocations, invOnHand]);

  const invSetLabel = useCallback((id, label) => {
    setInventory(prev => prev.map(item => item.id !== id ? item : { ...item, location: label }));
  }, []);

  const invLogDist = useCallback((id, dest, qty, note) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const storage = { ...item.storage };
      let remaining = qty;
      locs.forEach(loc => {
        if (remaining <= 0) return;
        const cur = storage[loc] || 0;
        const take = Math.min(cur, remaining);
        storage[loc] = cur - take;
        remaining -= take;
      });
      const distributions = [...(item.distributions || []), { dest, qty, note, date: new Date().toISOString() }];
      return { ...item, storage, distributions };
    }));
  }, [getStorageLocations]);

  const removeDistribution = useCallback((id, idx) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      if (item.id !== id) return item;
      const distributions = (item.distributions || []).filter((_, i) => i !== idx);
      const updated = { ...item, distributions };
      updated.storage = syncStorageLocs(updated, locs);
      return updated;
    }));
  }, [getStorageLocations, syncStorageLocs]);

  const invDeleteItem = useCallback((id) => {
    const deleted = inventory.find(i => i.id === id);
    if (deleted) pushUndo(`restore "${deleted.name}"`, () => setInventory(prev => [...prev, deleted]));
    setInventory(prev => prev.filter(i => i.id !== id));
    setInvExpanded(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, [inventory, pushUndo]);

  const addInventoryManual = useCallback((name, qty, cat) => {
    const locs = getStorageLocations();
    const storage = {};
    locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? qty : 0; });
    setInventory(prev => [...prev, { id: 'inv_' + Date.now(), name, category: cat, built: qty, location: '', storage, distributions: [], source: 'manual' }]);
    closeModal();
  }, [getStorageLocations, closeModal]);

  // ── Settings ──
  const saveAppSettings = useCallback(async (newSettings) => {
    setAppSettings(newSettings);
    applyTheme(newSettings.theme || 'auto');
    await saveSettingsStorage(newSettings);
  }, []);

  // ── Printer helpers ──
  const saveBambuAuth = useCallback(async (auth) => {
    let next;
    setAppSettings(prev => { next = { ...prev, bambuAuth: auth }; return next; });
    if (next) await saveSettingsStorage(next);
  }, []);

  const saveSnapmakerPrinters = useCallback(async (printers) => {
    let next;
    setAppSettings(prev => { next = { ...prev, printers }; return next; });
    if (next) await saveSettingsStorage(next);
  }, []);

  const addCategory = useCallback(async (name) => {
    const newSettings = {
      ...appSettings,
      extraCategories: [...(appSettings.extraCategories || []), name].filter((v, i, a) => a.indexOf(v) === i),
      categoryOrder: [...(appSettings.categoryOrder || getCategoryOrder()), name].filter((v, i, a) => a.indexOf(v) === i),
    };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getCategoryOrder]);

  const removeCategory = useCallback(async (name) => {
    let newProducts;
    setProducts(prev => {
      newProducts = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.category === name ? { ...v, category: '' } : v]));
      return newProducts;
    });
    const newSettings = {
      ...appSettings,
      extraCategories: (appSettings.extraCategories || []).filter(c => c !== name),
      categoryOrder: (appSettings.categoryOrder || []).filter(c => c !== name),
    };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings]);

  const renameCategory = useCallback(async (oldName, newName) => {
    setProducts(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.category === oldName ? { ...v, category: newName } : v])));
    const newSettings = {
      ...appSettings,
      extraCategories: (appSettings.extraCategories || []).map(c => c === oldName ? newName : c),
      categoryOrder: (appSettings.categoryOrder || []).map(c => c === oldName ? newName : c),
    };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings]);

  const moveCategoryOrder = useCallback(async (name, dir) => {
    const order = getCategoryOrder();
    const idx = order.indexOf(name);
    if (idx === -1) return;
    const newOrder = [...order];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const newSettings = { ...appSettings, categoryOrder: newOrder };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getCategoryOrder]);

  const addStorageLocation = useCallback(async (name) => {
    const locs = getStorageLocations();
    if (locs.includes(name)) return;
    setInventory(prev => prev.map(item => {
      const storage = { ...item.storage };
      if (storage[name] === undefined) storage[name] = 0;
      return { ...item, storage };
    }));
    const newSettings = { ...appSettings, storageLocations: [...locs, name] };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getStorageLocations]);

  const removeStorageLocation = useCallback(async (name) => {
    const locs = getStorageLocations();
    setInventory(prev => prev.map(item => {
      const storage = { ...item.storage };
      delete storage[name];
      return { ...item, storage };
    }));
    const newSettings = { ...appSettings, storageLocations: locs.filter(l => l !== name) };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getStorageLocations]);

  const renameStorageLocation = useCallback(async (oldName, newName) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        const storage = { ...item.storage };
        if (storage[oldName] !== undefined) { storage[newName] = storage[oldName]; delete storage[oldName]; }
        return { ...item, storage };
      });
      return newInventory;
    });
    const newSettings = { ...appSettings, storageLocations: locs.map(l => l === oldName ? newName : l) };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getStorageLocations]);

  const moveStorageLocation = useCallback(async (name, dir) => {
    const locs = getStorageLocations();
    const idx = locs.indexOf(name);
    if (idx === -1) return;
    const newLocs = [...locs];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newLocs.length) return;
    [newLocs[idx], newLocs[swapIdx]] = [newLocs[swapIdx], newLocs[idx]];
    const newSettings = { ...appSettings, storageLocations: newLocs };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getStorageLocations]);

  const addOutgoingDest = useCallback(async (name) => {
    const dests = getOutgoingDests();
    if (dests.includes(name)) return;
    const newSettings = { ...appSettings, outgoingDests: [...dests, name] };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getOutgoingDests]);

  const removeOutgoingDest = useCallback(async (name) => {
    const newSettings = { ...appSettings, outgoingDests: getOutgoingDests().filter(d => d !== name) };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getOutgoingDests]);

  const renameOutgoingDest = useCallback(async (idx, newName) => {
    const dests = [...getOutgoingDests()];
    dests[idx] = newName;
    const newSettings = { ...appSettings, outgoingDests: dests };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getOutgoingDests]);

  const moveOutgoingDest = useCallback(async (idx, dir) => {
    const dests = [...getOutgoingDests()];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= dests.length) return;
    [dests[idx], dests[swapIdx]] = [dests[swapIdx], dests[idx]];
    const newSettings = { ...appSettings, outgoingDests: dests };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
  }, [appSettings, getOutgoingDests]);

  // ── Electron-only file ops ──
  const uploadProductImage = useCallback(async (item) => {
    if (!window.electronAPI) return;
    let dest;
    if (productsRef.current[item]?.imagePath) {
      dest = productsRef.current[item].imagePath.replace(/[^/\\]*$/, '');
    } else if (appSettings.threeMfFolder) {
      dest = await window.electronAPI.getProductFolder(item, appSettings.threeMfFolder) || appSettings.threeMfFolder;
    } else {
      dest = '';
    }
    const result = await window.electronAPI.uploadImage(dest, item + '_cover');
    const path = result?.destPath || result?.path;
    if (path) {
      setProducts(prev => ({ ...prev, [item]: { ...prev[item], imagePath: path } }));
    }
  }, [appSettings.threeMfFolder]);

  const openProductFolder = useCallback(async (item) => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.getProductFolder(item, appSettings.threeMfFolder);
    if (folder) window.electronAPI.openFolder(folder);
  }, [appSettings.threeMfFolder]);

  const openProductInSlicer = useCallback(async (item) => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.getProductFolder(item, appSettings.threeMfFolder);
    if (folder) window.electronAPI.openInSlicer(folder, appSettings.slicer);
  }, [appSettings.threeMfFolder, appSettings.slicer]);

  const uploadProduct3mf = useCallback(async (item) => {
    if (!window.electronAPI) return 0;
    const result = await window.electronAPI.upload3mf(item, appSettings.threeMfFolder);
    if (result?.error) return 0;
    if (result?.destPath && result.fileName) {
      setProducts(prev => {
        const prevFiles = prev[item]?.threeMfFiles || [];
        const normalized = prevFiles.map(f => (typeof f === 'string' ? f : f?.fileName)).filter(Boolean);
        const nextFiles = normalized.includes(result.fileName) ? normalized : [...normalized, result.fileName];
        return { ...prev, [item]: { ...(prev[item] || {}), threeMfFiles: nextFiles } };
      });
      return 1;
    }
    return 0;
  }, [appSettings.threeMfFolder]);

  // Merge downloaded 3MF filenames into a product's threeMfFiles list (used after N3D download)
  const addProduct3mfFiles = useCallback((item, fileNames) => {
    if (!fileNames?.length) return;
    setProducts(prev => {
      const prevFiles = prev[item]?.threeMfFiles || [];
      const nextFiles = [...new Set([...prevFiles, ...fileNames])];
      return { ...prev, [item]: { ...(prev[item] || {}), threeMfFiles: nextFiles } };
    });
  }, []);

  // Set product image path (used after N3D image download, or any programmatic image update)
  const setProductImagePath = useCallback((item, imagePath) => {
    setProducts(prev => ({ ...prev, [item]: { ...prev[item], imagePath } }));
  }, []);

  // ── Filament library CRUD ──
  const saveFilaments = useCallback((newFilaments) => {
    setFilaments(newFilaments);
  }, []);

  const addFilament = useCallback((f) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setFilaments(prev => [...prev, { ...f, id }]);
  }, []);

  const updateFilament = useCallback((id, updates) => {
    setFilaments(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
  }, []);

  const deleteFilament = useCallback((id) => {
    const deleted = filaments.find(x => x.id === id);
    if (deleted) pushUndo(`restore filament "${deleted.name || deleted.brand}"`, () => setFilaments(prev => [...prev, deleted]));
    setFilaments(prev => prev.filter(x => x.id !== id));
  }, [filaments, pushUndo]);

  const openExternalUrl = useCallback((url) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  }, []);

  const fetchLocalIP = useCallback(async () => {
    if (window.electronAPI?.getLocalIP) {
      const ip = await window.electronAPI.getLocalIP();
      setLocalIP(ip);
    }
  }, []);

  // ── Import data (from CSV import flow) ──
  const importData = useCallback((newParts, newProducts) => {
    setParts(prev => [...prev, ...newParts]);
    setProducts(prev => ({ ...prev, ...newProducts }));
  }, []);

  // ── Update part qty inline (QtyCell) ──
  const updatePartQty = useCallback((id, qty) => {
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, qty, printed: Math.min(p.printed, qty) }));
  }, []);

  // ── Export CSV ──
  const exportData = useCallback(async () => {
    // RFC 4180: wrap every field in double-quotes, escape internal " as ""
    const csvField = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const COLS = ['product', 'part_name', 'variant', 'colour_name', 'colour_hex', 'stl', 'qty', 'category', 'description'];
    const rows = [COLS.map(csvField).join(',')];
    partsRef.current.forEach(p => {
      const cat = productsRef.current[p.item]?.category || '';
      const colours = p.colours?.length ? p.colours : (p.colour ? [{ hex: p.colour, name: p.colourName || '' }] : []);
      const colourNames = colours.map(c => c.name || '').join('|');
      const colourHexes = colours.map(c => c.hex || '').join('|');
      rows.push([p.item, p.name, p.variant, colourNames, colourHexes, p.stl, p.qty, cat, p.desc]
        .map(csvField).join(','));
    });
    const content = rows.join('\n');
    if (isElectron) {
      await window.electronAPI.saveCsvDialog(content);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(content);
      a.download = '3d-print-export.csv';
      a.click();
    }
  }, []);

  const value = {
    // State
    parts, products, inventory, filaments, nextId, appSettings, isElectron,
    currentView, sliceFilter, setSliceFilter, productSearch, setProductSearch,
    openProducts, catExpanded, colourExpanded, invExpanded, invSectionCollapsed,
    invLogQty, setInvLogQty, invLogDest, setInvLogDest, localIP, modal, loaded,
    printerStatus, bambuConn, lastMovedProduct, setLastMovedProduct,
    undoStack, undo,
    // Helpers
    getCategoryOrder, getStorageLocations, getOutgoingDests, getItems, isReady, productHas3mf, invOnHand, invMigrateStorage,
    // UI
    setView, toggleProduct, toggleCat, toggleColour, toggleInvCard, toggleInvSection, openModal, closeModal,
    // Parts
    adjustQty, reprint, deletePart, saveCard, setPartStatus, setSubPartStatus, adjustSubPrinted, addSubPart, deleteSubPart,
    // Products
    saveManageProduct, deleteProductPermanently, archiveProduct, unarchiveProduct, restartProduct, saveAddProduct, togglePreSliced,
    // Inventory
    confirmCompletion, confirmQuickAdd, invAdjustBuilt, invSetBuilt, invAdjustLocation, invSetLocation, invSetLabel, invLogDist, removeDistribution, invDeleteItem, addInventoryManual, fetchLocalIP,
    // Settings
    saveAppSettings, addCategory, removeCategory, renameCategory, moveCategoryOrder,
    addStorageLocation, removeStorageLocation, renameStorageLocation, moveStorageLocation,
    addOutgoingDest, removeOutgoingDest, renameOutgoingDest, moveOutgoingDest,
    // Electron file ops
    uploadProductImage, openProductFolder, openProductInSlicer, uploadProduct3mf, addProduct3mfFiles, openExternalUrl, setProductImagePath,
    // Import / Export
    importData, exportData, updatePartQty,
    // Filament library
    saveFilaments, addFilament, updateFilament, deleteFilament,
    // Printers
    saveBambuAuth, saveSnapmakerPrinters,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
