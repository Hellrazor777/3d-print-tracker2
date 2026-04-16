import React from 'react';
import { useApp } from './context/AppContext';
import TopBar from './components/TopBar';
import Stats from './components/Stats';
import ProductView from './views/ProductView';
import ArchiveView from './views/ArchiveView';
import ColourView from './views/ColourView';
import InventoryView from './views/InventoryView';
import PrintersView from './views/PrintersView';
import PrintQueueView from './views/PrintQueueView';
import PartModal from './modals/PartModal';
import AddProductModal from './modals/AddProductModal';
import ManageProductModal from './modals/ManageProductModal';
import SettingsModal from './modals/SettingsModal';
import StatusModal from './modals/StatusModal';
import QuickAddModal from './modals/QuickAddModal';
import CompletionModal from './modals/CompletionModal';
import SubpartModal from './modals/SubpartModal';
import N3DModal from './modals/N3DModal';
import ImportModal from './modals/ImportModal';
import ConflictModal from './modals/ConflictModal';
import AddInventoryModal from './modals/AddInventoryModal';
import RenameCatModal from './modals/RenameCatModal';
import FilamentLibraryModal from './modals/FilamentLibraryModal';
import PartsBoxCheckModal from './modals/PartsBoxCheckModal';

// Detect if this window was opened as a pop-out for a specific view
const popoutView = new URLSearchParams(window.location.search).get('popout');

export default function App() {
  const { currentView, loaded, modal, undoStack, undo } = useApp();

  if (!loaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)', fontSize: 14 }}>loading…</div>;
  }

  // Pop-out mode: full-window view with just a slim title bar, no nav or stats
  if (popoutView === 'printers') {
    return (
      <>
        <div className="titlebar" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="titlebar-title">Printers</span>
          <button
            onClick={() => window.electronAPI?.openMainWindow()}
            title="Open main window"
            style={{ marginLeft: 'auto', marginRight: 8, fontSize: 11, padding: '2px 10px', borderRadius: 'var(--radius, 6px)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
          >⌂ Main window</button>
        </div>
        <div className="main">
          <PrintersView />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="titlebar"><span className="titlebar-title">3D Print Tracker</span></div>
      <div className="main">
        <TopBar />
        <Stats />
        {currentView === 'product' && <ProductView />}
        {currentView === 'archive' && <ArchiveView />}
        {currentView === 'colours' && <ColourView />}
        {currentView === 'inventory' && <InventoryView />}
        {currentView === 'printers' && <PrintersView />}
        {currentView === 'queue'    && <PrintQueueView />}
      </div>

      {/* Modals */}
      {modal?.type === 'part' && <PartModal />}
      {modal?.type === 'add-product' && <AddProductModal />}
      {modal?.type === 'manage-product' && <ManageProductModal />}
      {modal?.type === 'settings' && <SettingsModal />}
      {modal?.type === 'status' && <StatusModal />}
      {modal?.type === 'quick-add' && <QuickAddModal />}
      {modal?.type === 'completion' && <CompletionModal />}
      {modal?.type === 'subpart' && <SubpartModal />}
      {modal?.type === 'n3d' && <N3DModal />}
      {modal?.type === 'import' && <ImportModal />}
      {modal?.type === 'conflict' && <ConflictModal />}
      {modal?.type === 'add-inventory' && <AddInventoryModal />}
      {modal?.type === 'rename-cat' && <RenameCatModal />}
      {modal?.type === 'filament-library' && <FilamentLibraryModal />}
      {modal?.type === 'parts-box-check' && <PartsBoxCheckModal />}

      <BackToTop />
      {undoStack.length > 0 && (
        <button
          onClick={undo}
          style={{ position: 'fixed', bottom: 64, right: 16, zIndex: 9000, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,.15)', fontFamily: 'inherit' }}
          title={`Undo: ${undoStack[undoStack.length - 1]?.label}`}
        >
          ↩ Undo {undoStack[undoStack.length - 1]?.label}
        </button>
      )}
    </>
  );
}

function BackToTop() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return (
    <button
      id="back-to-top"
      className={visible ? 'visible' : ''}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
    >↑</button>
  );
}

