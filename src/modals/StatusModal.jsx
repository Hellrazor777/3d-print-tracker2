import { useApp } from '../context/AppContext';
import ModalShell from '../components/ModalShell';

export default function StatusModal() {
  const { modal, closeModal, parts, setPartStatus, setSubPartStatus } = useApp();
  const { partId, subIdx } = modal || {};
  const part = parts.find(p => p.id === partId);
  if (!part) return null;

  const isSubPart = subIdx !== undefined && subIdx !== null;
  const current = isSubPart ? part.subParts?.[subIdx] : part;
  if (!current) return null;

  const allStatuses = ['planning', 'queue', 'printing', 'done'];
  const subStatuses = ['queue', 'printing', 'done'];
  const options = (isSubPart ? subStatuses : allStatuses).filter(s => s !== current.status);

  const handleSelect = (s) => {
    if (isSubPart) setSubPartStatus(partId, subIdx, s);
    else setPartStatus(partId, s);
    closeModal();
  };

  return (
    <ModalShell onClose={closeModal} width={300}>
          <h3>change status — {current.name}</h3>
          {current.status === 'done' && !isSubPart && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: '1rem', lineHeight: 1.5 }}>This part is marked done. Reset it to:</p>
          )}
          {options.map(s => (
            <button key={s} className={`btn${s === 'done' ? ' btn-success' : ''}`}
              style={{ width: '100%', marginBottom: 8, padding: 12, fontSize: 15, textAlign: 'left' }}
              onClick={() => handleSelect(s)}>
              {s === 'done' ? '✓ done' : s}
            </button>
          ))}
          <button className="btn" style={{ width: '100%', marginTop: 4, padding: 8, color: 'var(--text2)' }} onClick={closeModal}>cancel</button>
    </ModalShell>
  );
}
