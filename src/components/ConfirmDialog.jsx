import { useState } from 'react';

/**
 * Inline confirm dialog — replaces native window.confirm().
 *
 * Usage:
 *   const [confirmState, setConfirmState] = useState(null);
 *   // trigger: setConfirmState({ message: 'Are you sure?', onConfirm: () => doThing(), danger: true });
 *   // render: {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
 */
export function ConfirmDialog({ message, confirmLabel = 'confirm', cancelLabel = 'cancel', danger = false, onConfirm, onCancel }) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
        <p style={{ marginBottom: '1.25rem', lineHeight: 1.5, fontSize: 14 }}>{message}</p>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline numeric prompt — replaces native window.prompt() for number inputs.
 *
 * Usage:
 *   const [numericState, setNumericState] = useState(null);
 *   // trigger: setNumericState({ label: 'Set count:', initial: 5, onConfirm: v => doThing(v) });
 *   // render: {numericState && <NumericPrompt {...numericState} onCancel={() => setNumericState(null)} />}
 */
export function NumericPrompt({ label, initial = 0, onConfirm, onCancel }) {
  const [val, setVal] = useState(String(initial));

  const commit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) onConfirm(n);
    else onCancel();
  };

  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" style={{ width: 280 }} onClick={e => e.stopPropagation()}>
        <div className="field" style={{ marginBottom: '1rem' }}>
          <label>{label}</label>
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
            autoFocus
            style={{ marginTop: 6 }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>cancel</button>
          <button className="btn btn-primary" onClick={commit}>set</button>
        </div>
      </div>
    </div>
  );
}
