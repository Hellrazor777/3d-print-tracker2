import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { currentView, setView, openModal, isElectron } = useApp();

  return (
    <div className="topbar">
      <h1>3D Print Tracker</h1>
      <div className="view-toggle">
        <button id="vb-product"   className={`view-btn${currentView === 'product'   ? ' active' : ''}`} onClick={() => setView('product')}>Products</button>
        <button id="vb-archive"   className={`view-btn${currentView === 'archive'   ? ' active' : ''}`} onClick={() => setView('archive')}>Archive</button>
        <button id="vb-colours"   className={`view-btn${currentView === 'colours'   ? ' active' : ''}`} onClick={() => setView('colours')}>Colour</button>
        <button id="vb-inventory" className={`view-btn${currentView === 'inventory' ? ' active' : ''}`} onClick={() => setView('inventory')}>Inventory</button>
        <button id="vb-printers"   className={`view-btn${currentView === 'printers'  ? ' active' : ''}`} onClick={() => setView('printers')}>Printers</button>
        <button id="vb-queue"     className={`view-btn${currentView === 'queue'     ? ' active' : ''}`} onClick={() => setView('queue')}>Print Queue</button>
        {isElectron && (
          <button
            className="view-btn popout-btn"
            onClick={() => window.electronAPI.openPrintersPopout()}
            title="Open Printers in a separate window"
            style={{ padding: '0 7px', fontSize: 13 }}
          >⧉</button>
        )}
      </div>
      <button className="btn" onClick={() => openModal('settings')} title="settings">⚙ Settings</button>
      <button className="btn btn-n3d" onClick={() => openModal('n3d')}>N3D Browse</button>
      <button className="btn" onClick={() => openModal('add-product')}>+ Add Product</button>
    </div>
  );
}
