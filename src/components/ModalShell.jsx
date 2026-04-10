import { useEffect } from 'react';

/**
 * Shared modal wrapper. Provides:
 *   - Dark overlay that closes the modal on click
 *   - Escape key closes the modal
 *   - Inner card blocks click propagation to the overlay
 *
 * Usage:
 *   <ModalShell onClose={closeModal} width={320}>
 *     <h3>Title</h3>
 *     ...content...
 *     <div className="modal-footer">...</div>
 *   </ModalShell>
 */
export default function ModalShell({ onClose, children, width, style = {}, className = '' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className={`modal${className ? ' ' + className : ''}`}
        style={{ ...(width ? { width } : {}), ...style }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
