import { useApp } from '../context/AppContext';

export default function Stats() {
  const { parts, products, inventory, isReady, printerStatus } = useApp();
  const items = [...new Set(parts.map(p => p.item).filter(Boolean))].filter(i => !products[i]?.archived);
  const readyN = items.filter(i => isReady(i)).length;
  const tp = parts.reduce((a, p) => a + p.printed, 0);
  const tn = parts.reduce((a, p) => a + p.qty, 0);
  const onHand = inventory.reduce((a, item) => {
    const totalOut = (item.distributions || []).reduce((s, d) => s + (d.qty || 0), 0);
    return a + Math.max(0, (item.built || 0) - totalOut);
  }, 0);

  const printerStates = Object.values(printerStatus || {});
  const printing = printerStates.filter(s => (s?.gcode_state || s?.status) === 'RUNNING').length;
  // Count as idle: IDLE, FINISH, or PREPARE — all mean connected but not currently printing
  const idle = printerStates.filter(s => {
    const gs = s?.gcode_state || s?.status || '';
    return gs === 'IDLE' || gs === 'FINISH' || gs === 'PREPARE';
  }).length;

  return (
    <div className="stats">
      <div className="stat"><div className="stat-label">Active Products</div><div className="stat-val">{items.length}</div></div>
      <div className="stat"><div className="stat-label">Parts Tracked</div><div className="stat-val">{parts.length}</div></div>
      <div className="stat"><div className="stat-label">Pieces Printed</div><div className="stat-val">{tp}/{tn}</div></div>
      <div className="stat"><div className="stat-label">Ready to Build</div><div className="stat-val" style={{ color: 'var(--green)' }}>{readyN}</div></div>
      <div className="stat"><div className="stat-label">On Hand</div><div className="stat-val" style={{ color: 'var(--green)' }}>{onHand}</div></div>
      <div className="stat"><div className="stat-label">Printers Printing</div><div className="stat-val" style={{ color: printing > 0 ? 'var(--green)' : undefined }}>{printing}</div></div>
      <div className="stat"><div className="stat-label">Printers Idle</div><div className="stat-val">{idle}</div></div>
    </div>
  );
}
