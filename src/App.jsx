import React from 'react';
import { useApp } from './context/AppContext';
import TopBar from './components/TopBar';
import Stats from './components/Stats';
import ProductView from './views/ProductView';
import ArchiveView from './views/ArchiveView';
import ColourView from './views/ColourView';
import InventoryView from './views/InventoryView';
import PrintersView from './views/PrintersView';
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

export default function App() {
  const { currentView, loaded, modal } = useApp();

  if (!loaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)', fontSize: 14 }}>loading…</div>;
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

