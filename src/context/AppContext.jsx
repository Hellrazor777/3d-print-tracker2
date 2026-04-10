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

async function loadData() {
  if (isElectron) return await window.electronAPI.loadData();
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function saveData(data) {
  if (isElectron) return await window.electronAPI.saveData(data);
  await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
async function loadSettings() {
  if (isElectron) return await window.electronAPI.loadSettings();
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function saveSettingsStorage(s) {
  if (isElectron) return await window.electronAPI.saveSettings(s);
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
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
  const nextIdRef = useRef(nextId);
  const appSettingsRef = useRef(appSettings);
  useEffect(() => { partsRef.current = parts; }, [parts]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { catExpandedRef.current = catExpanded; }, [catExpanded]);
  useEffect(() => { filamentsRef.current = filaments; }, [filaments]);
  useEffect(() => { nextIdRef.current = nextId; }, [nextId]);
  useEffect(() => { appSettingsRef.current = appSettings; }, [appSettings]);

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

    // Listen for printer status updates from main process
    let cleanupPrinterUpdate = null;
    let cleanupBambuConn = null;
    let cleanupBambuToken = null;
    if (window.electronAPI?.onPrinterUpdate) {
      cleanupPrinterUpdate = window.electronAPI.onPrinterUpdate((_, { serial, id, state }) => {
        const key = serial || id;
        if (key) setPrinterStatus(prev => ({ ...prev, [key]: state }));
      });
      cleanupBambuConn = window.electronAPI.onBambuConn((_, status) => {
        setBambuConn(status || { connected: false });
      });
      cleanupBambuToken = window.electronAPI.onBambuTokenRefreshed((_, { auth }) => {
        const next = { ...appSettingsRef.current, bambuAuth: { ...appSettingsRef.current.bambuAuth, ...auth } };
        setAppSettings(next);
        saveSettingsStorage(next).catch(() => {});
      });
    }

    return () => {
      if (typeof cleanupInventoryListener === 'function') cleanupInventoryListener();
      if (typeof cleanupPrinterUpdate === 'function') cleanupPrinterUpdate();
      if (typeof cleanupBambuConn === 'function') cleanupBambuConn();
      if (typeof cleanupBambuToken === 'function') cleanupBambuToken();
    };
  }, []);

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
  const adjustQty = useCallback(async (id, delta) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => {
        if (p.id !== id) return p;
        const printed = delta > 0 ? Math.min(p.printed + 1, p.qty) : Math.max(p.printed - 1, 0);
        const status = printed === p.qty && delta > 0 ? 'done' : p.status;
        return { ...p, printed, status };
      });
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const reprint = useCallback(async (id) => {
    const newId = nextIdRef.current;
    setNextId(n => n + 1);
    let newParts;
    setParts(prev => {
      const p = prev.find(x => x.id === id);
      if (!p) return prev;
      const reprintedP = { ...p, reprints: (p.reprints || 0) + 1 };
      const newEntry = { ...p, id: newId, printed: 0, status: 'queue', reprints: 0 };
      newParts = prev.map(x => x.id === id ? reprintedP : x).concat(newEntry);
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const deletePart = useCallback(async (id) => {
    let newParts;
    setParts(prev => { newParts = prev.filter(p => p.id !== id); return newParts; });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const saveCard = useCallback(async (formData, editId) => {
    const { name, item, variant, colours, qty, status } = formData;
    const colour = colours[0]?.hex || '#888888';
    const colourName = colours[0]?.name || '';
    const newId = editId ? null : nextIdRef.current;
    if (!editId) setNextId(n => n + 1);
    let newParts, newProducts;
    setParts(prev => {
      if (editId) {
        newParts = prev.map(p => {
          if (p.id !== editId) return p;
          return { ...p, name, item, variant, colours, colour, colourName, qty, status, printed: Math.min(p.printed, qty) };
        });
      } else {
        const newPart = { id: newId, name, item, variant, colours, colour, colourName, qty, status, printed: 0, reprints: 0, desc: '' };
        newParts = [...prev, newPart];
      }
      return newParts;
    });
    setProducts(prev => {
      newProducts = { ...prev };
      if (item && !newProducts[item]) {
        newProducts[item] = { category: '' };
        if (window.electronAPI?.createProductFolder && appSettings.threeMfFolder) {
          window.electronAPI.createProductFolder(item, appSettings.threeMfFolder).catch(() => {});
        }
      }
      return newProducts;
    });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
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
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, []);

  const setSubPartStatus = useCallback(async (partId, subIdx, newStatus) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => {
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
      });
      return newParts;
    });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, []);

  const adjustSubPrinted = useCallback(async (partId, subIdx, delta) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => {
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
      });
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const addSubPart = useCallback(async (partId, name, qty) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => {
        if (p.id !== partId) return p;
        const subParts = [...(p.subParts || []), { id: Date.now(), name, qty, printed: 0, status: 'queue' }];
        const status = p.status === 'done' ? 'queue' : p.status;
        const printed = p.status === 'done' ? 0 : p.printed;
        return { ...p, subParts, status, printed };
      });
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const deleteSubPart = useCallback(async (partId, subIdx) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => {
        if (p.id !== partId) return p;
        const subParts = (p.subParts || []).filter((_, i) => i !== subIdx);
        return { ...p, subParts };
      });
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  // ── Product CRUD ──
  const saveManageProduct = useCallback(async ({ oldName, newName, category, description, shiny, n3dUrl, designer, source, imagePath, partsBoxEnabled, partsBox }) => {
    let newParts, newProducts;
    setParts(prev => {
      newParts = prev.map(p => p.item === oldName ? { ...p, item: newName } : p);
      return newParts;
    });
    setProducts(prev => {
      const oldMeta = prev[oldName] || {};
      newProducts = { ...prev };
      delete newProducts[oldName];
      newProducts[newName] = { ...oldMeta, category, description, shiny, n3dUrl: n3dUrl || oldMeta.n3dUrl || '', designer, source, imagePath: imagePath !== undefined ? imagePath : (oldMeta.imagePath || ''), partsBoxEnabled: !!partsBoxEnabled, partsBox: partsBoxEnabled ? (partsBox || '') : '' };
      return newProducts;
    });
    setOpenProducts(prev => {
      const next = new Set(prev);
      if (next.has(oldName)) { next.delete(oldName); next.add(newName); }
      return next;
    });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
    closeModal();
  }, [closeModal]);

  const deleteProductPermanently = useCallback(async (name) => {
    let newParts, newProducts;
    setParts(prev => { newParts = prev.filter(p => p.item !== name); return newParts; });
    setProducts(prev => { newProducts = { ...prev }; delete newProducts[name]; return newProducts; });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
    closeModal();
  }, [closeModal]);

  const archiveProduct = useCallback(async (name) => {
    let newProducts;
    setProducts(prev => {
      newProducts = { ...prev, [name]: { ...(prev[name] || {}), archived: true } };
      return newProducts;
    });
    await saveData({ parts: partsRef.current, products: newProducts, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const unarchiveProduct = useCallback(async (name) => {
    let newProducts;
    setProducts(prev => {
      newProducts = { ...prev, [name]: { ...(prev[name] || {}), archived: false } };
      return newProducts;
    });
    await saveData({ parts: partsRef.current, products: newProducts, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const restartProduct = useCallback(async (name) => {
    let newParts, newProducts;
    setParts(prev => {
      newParts = prev.map(p => {
        if (p.item !== name) return p;
        const subParts = p.subParts ? p.subParts.map(s => ({ ...s, status: 'queue', printed: 0 })) : p.subParts;
        return { ...p, status: 'queue', printed: 0, reprints: 0, subParts };
      });
      return newParts;
    });
    setProducts(prev => {
      newProducts = { ...prev, [name]: { ...(prev[name] || {}), archived: false } };
      return newProducts;
    });
    setCurrentView('product');
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, []);

  const saveAddProduct = useCallback(async ({ name, category, description, shiny, designer, source, imagePath }) => {
    let newProducts;
    setProducts(prev => {
      newProducts = { ...prev, [name]: { category: category || '', description: description || '', shiny: !!shiny, designer: designer || '', source: source || '', imagePath: imagePath || '' } };
      return newProducts;
    });
    setOpenProducts(prev => { const next = new Set(prev); next.add(name); return next; });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
    closeModal();
  }, [closeModal]);

  const togglePreSliced = useCallback(async (name) => {
    let newProducts;
    setProducts(prev => {
      newProducts = { ...prev, [name]: { ...(prev[name] || {}), preSliced: !(prev[name]?.preSliced) } };
      return newProducts;
    });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
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
    let newProducts;
    setProducts(prev => {
      newProducts = { ...prev, [productName]: { ...(prev[productName] || {}), archived: true } };
      return newProducts;
    });
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
    closeModal();
  }, [closeModal, getStorageLocations, syncStorageLocs]);

  const confirmQuickAdd = useCallback(async (productName, qty, locations) => {
    let newInventory;
    setInventory(prev => {
      newInventory = [...prev];
      const existing = newInventory.find(i => i.name === productName);
      const locs = Object.keys(locations);
      if (existing) {
        existing.built = (existing.built || 0) + qty;
        if (!existing.storage) existing.storage = {};
        locs.forEach(loc => { existing.storage[loc] = (existing.storage[loc] || 0) + (locations[loc] || 0); });
      } else {
        const storage = {};
        locs.forEach(loc => { storage[loc] = locations[loc] || 0; });
        newInventory.push({ id: 'inv_' + Date.now(), name: productName, category: productsRef.current[productName]?.category || '', built: qty, location: '', storage, distributions: [], source: 'tracker' });
      }
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    closeModal();
  }, [closeModal]);

  const invAdjustBuilt = useCallback(async (id, delta) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, built: Math.max(0, (item.built || 0) + delta) };
        updated.storage = syncStorageLocs(updated, locs);
        return updated;
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations, syncStorageLocs]);

  const invSetBuilt = useCallback(async (id, val) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, built: Math.max(0, val) };
        updated.storage = syncStorageLocs(updated, locs);
        return updated;
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations, syncStorageLocs]);

  const invAdjustLocation = useCallback(async (id, loc, delta) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        if (item.id !== id) return item;
        const storage = { ...item.storage };
        const onHand = invOnHand(item);
        storage[loc] = Math.max(0, Math.min(onHand, (storage[loc] || 0) + delta));
        const others = locs.filter(l => l !== loc);
        const remaining = Math.max(0, onHand - storage[loc]);
        if (others.length === 1) storage[others[0]] = remaining;
        return { ...item, storage };
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations, invOnHand]);

  const invSetLocation = useCallback(async (id, loc, val) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        if (item.id !== id) return item;
        const onHand = invOnHand(item);
        const storage = { ...item.storage };
        storage[loc] = Math.max(0, Math.min(onHand, val));
        const others = locs.filter(l => l !== loc);
        const remaining = Math.max(0, onHand - storage[loc]);
        if (others.length === 1) storage[others[0]] = remaining;
        return { ...item, storage };
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations, invOnHand]);

  const invSetLabel = useCallback(async (id, label) => {
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => item.id !== id ? item : { ...item, location: label });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const invLogDist = useCallback(async (id, dest, qty, note) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
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
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations]);

  const removeDistribution = useCallback(async (id, idx) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        if (item.id !== id) return item;
        const distributions = (item.distributions || []).filter((_, i) => i !== idx);
        const updated = { ...item, distributions };
        updated.storage = syncStorageLocs(updated, locs);
        return updated;
      });
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, [getStorageLocations, syncStorageLocs]);

  const invDeleteItem = useCallback(async (id) => {
    let newInventory;
    setInventory(prev => { newInventory = prev.filter(i => i.id !== id); return newInventory; });
    setInvExpanded(prev => { const next = new Set(prev); next.delete(id); return next; });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  const addInventoryManual = useCallback(async (name, qty, cat) => {
    const locs = getStorageLocations();
    const storage = {};
    locs.forEach((loc, i) => { storage[loc] = i === locs.length - 1 ? qty : 0; });
    let newInventory;
    setInventory(prev => {
      newInventory = [...prev, { id: 'inv_' + Date.now(), name, category: cat, built: qty, location: '', storage, distributions: [], source: 'manual' }];
      return newInventory;
    });
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: newInventory, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
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
    const next = { ...appSettingsRef.current, bambuAuth: auth };
    setAppSettings(next);
    await saveSettingsStorage(next);
  }, []);

  const saveSnapmakerPrinters = useCallback(async (printers) => {
    const next = { ...appSettingsRef.current, printers };
    setAppSettings(next);
    await saveSettingsStorage(next);
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
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, [appSettings]);

  const renameCategory = useCallback(async (oldName, newName) => {
    let newProducts;
    setProducts(prev => {
      newProducts = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.category === oldName ? { ...v, category: newName } : v]));
      return newProducts;
    });
    const newSettings = {
      ...appSettings,
      extraCategories: (appSettings.extraCategories || []).map(c => c === oldName ? newName : c),
      categoryOrder: (appSettings.categoryOrder || []).map(c => c === oldName ? newName : c),
    };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
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
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        const storage = { ...item.storage };
        if (storage[name] === undefined) storage[name] = 0;
        return { ...item, storage };
      });
      return newInventory;
    });
    const newSettings = { ...appSettings, storageLocations: [...locs, name] };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, [appSettings, getStorageLocations]);

  const removeStorageLocation = useCallback(async (name) => {
    const locs = getStorageLocations();
    let newInventory;
    setInventory(prev => {
      newInventory = prev.map(item => {
        const storage = { ...item.storage };
        delete storage[name];
        return { ...item, storage };
      });
      return newInventory;
    });
    const newSettings = { ...appSettings, storageLocations: locs.filter(l => l !== name) };
    setAppSettings(newSettings);
    await saveSettingsStorage(newSettings);
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
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
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
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
      setTimeout(async () => {
        await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
      }, 0);
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
      setTimeout(async () => {
        await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
      }, 0);
      return 1;
    }
    return 0;
  }, [appSettings.threeMfFolder]);

  // Set product image path (used after N3D image download, or any programmatic image update)
  const setProductImagePath = useCallback(async (item, imagePath) => {
    setProducts(prev => ({ ...prev, [item]: { ...prev[item], imagePath } }));
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, []);

  // ── Filament library CRUD ──
  const saveFilaments = useCallback(async (newFilaments) => {
    setFilaments(newFilaments);
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: newFilaments, expandedCats: [...catExpandedRef.current] });
  }, []);

  const addFilament = useCallback(async (f) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newF = [...filamentsRef.current, { ...f, id }];
    setFilaments(newF);
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: newF, expandedCats: [...catExpandedRef.current] });
  }, []);

  const updateFilament = useCallback(async (id, updates) => {
    const newF = filamentsRef.current.map(x => x.id === id ? { ...x, ...updates } : x);
    setFilaments(newF);
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: newF, expandedCats: [...catExpandedRef.current] });
  }, []);

  const deleteFilament = useCallback(async (id) => {
    const newF = filamentsRef.current.filter(x => x.id !== id);
    setFilaments(newF);
    await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: newF, expandedCats: [...catExpandedRef.current] });
  }, []);

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
  const importData = useCallback(async (newParts, newProducts) => {
    let finalParts, finalProducts;
    setParts(prev => { finalParts = [...prev, ...newParts]; return finalParts; });
    setProducts(prev => { finalProducts = { ...prev, ...newProducts }; return finalProducts; });
    const maxId = finalParts.length ? Math.max(...finalParts.map(p => p.id || 0)) : 0;
    setNextId(Math.max(nextIdRef.current, maxId + 1));
    setTimeout(async () => {
      await saveData({ parts: partsRef.current, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
    }, 0);
  }, []);

  // ── Update part qty inline (QtyCell) ──
  const updatePartQty = useCallback(async (id, qty) => {
    let newParts;
    setParts(prev => {
      newParts = prev.map(p => p.id !== id ? p : { ...p, qty, printed: Math.min(p.printed, qty) });
      return newParts;
    });
    await saveData({ parts: newParts, products: productsRef.current, inventory: inventoryRef.current, filaments: filamentsRef.current, expandedCats: [...catExpandedRef.current] });
  }, []);

  // ── Export CSV ──
  const exportData = useCallback(async () => {
    const COLS = ['product', 'part_name', 'variant', 'colour_name', 'colour_hex', 'stl', 'qty', 'category', 'description'];
    const rows = [COLS.join(',')];
    partsRef.current.forEach(p => {
      const cat = productsRef.current[p.item]?.category || '';
      const colours = p.colours?.length ? p.colours : (p.colour ? [{ hex: p.colour, name: p.colourName || '' }] : []);
      const colourNames = colours.map(c => c.name || '').join('|');
      const colourHexes = colours.map(c => c.hex || '').join('|');
      rows.push([p.item, p.name, p.variant, colourNames, colourHexes, p.stl, p.qty, cat, p.desc]
        .map(v => String(v || '').replace(/,/g, ';')).join(','));
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
    uploadProductImage, openProductFolder, openProductInSlicer, uploadProduct3mf, openExternalUrl, setProductImagePath,
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
