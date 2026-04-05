import { useApp } from '../context/AppContext';

export default function Stats() {
  const { parts, products, inventory, isReady } = useApp();
  const items = [...new Set(parts.map(p => p.item).filter(Boolean))].filter(i => !products[i]?.archived);
  const readyN = items.filter(i => isReady(i)).length;
  const tp = parts.reduce((a, p) => a + p.printed, 0);
  const tn = parts.reduce((a, p) => a + p.qty, 0);
  const onHand = inventory.reduce((a, item) => {
    const totalOut = (item.distributions || []).reduce((s, d) => s + (d.qty || 0), 0);
    return a + Math.max(0, (item.built || 0) - totalOut);
  }, 0);

  return (
    <div className="stats">
      <div className="stat"><div className="stat-label">Active Products</div><div className="stat-val">{items.length}</div></div>
      <div className="stat"><div className="stat-label">Parts Tracked</div><div className="stat-val">{parts.length}</div></div>
      <div className="stat"><div className="stat-label">Pieces Printed</div><div className="stat-val">{tp}/{tn}</div></div>
      <div className="stat"><div className="stat-label">Ready to Build</div><div className="stat-val" style={{ color: 'var(--green)' }}>{readyN}</div></div>
      <div className="stat"><div className="stat-label">On Hand</div><div className="stat-val" style={{ color: 'var(--green)' }}>{onHand}</div></div>
    </div>
  );
}
