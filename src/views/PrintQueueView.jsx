import { useState } from 'react';
import { useApp } from '../context/AppContext';

const STATUS_LABEL = { queue: 'To Print', printing: 'Printing' };
const STATUS_ORDER = { printing: 0, queue: 1 };

export default function PrintQueueView() {
  const { parts, products } = useApp();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('status'); // status | az | cat

  // Gather all parts that are still to be printed (queue or printing)
  const queueParts = parts.filter(p => p.status === 'queue' || p.status === 'printing');

  // Group by product
  const byProduct = {};
  queueParts.forEach(p => {
    if (!byProduct[p.item]) byProduct[p.item] = [];
    byProduct[p.item].push(p);
  });

  // Filter by search
  const q = search.trim().toLowerCase();
  const productNames = Object.keys(byProduct).filter(name =>
    !q ||
    name.toLowerCase().includes(q) ||
    (products[name]?.category || '').toLowerCase().includes(q) ||
    byProduct[name].some(p => (p.name || '').toLowerCase().includes(q))
  );

  // Sort products
  const sorted = [...productNames].sort((a, b) => {
    if (sort === 'az')  return a.localeCompare(b);
    if (sort === 'za')  return b.localeCompare(a);
    if (sort === 'cat') return (products[a]?.category || '').localeCompare(products[b]?.category || '') || a.localeCompare(b);
    // default: 'status' — products with an actively-printing part first
    const aHasPrinting = byProduct[a].some(p => p.status === 'printing');
    const bHasPrinting = byProduct[b].some(p => p.status === 'printing');
    if (aHasPrinting !== bHasPrinting) return aHasPrinting ? -1 : 1;
    return a.localeCompare(b);
  });

  const totalParts  = queueParts.length;
  const printingNow = queueParts.filter(p => p.status === 'printing').length;

  return (
    <div style={{ padding: '0 0 2rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {totalParts} part{totalParts !== 1 ? 's' : ''} across {sorted.length} product{sorted.length !== 1 ? 's' : ''}
          {printingNow > 0 && <span style={{ color: 'var(--green)', marginLeft: 8 }}>● {printingNow} printing now</span>}
        </span>
        <select
          value={sort} onChange={e => setSort(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', marginLeft: 'auto', cursor: 'pointer' }}
        >
          <option value="status">Printing first</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="cat">By category</option>
        </select>
        <input
          type="search" placeholder="search queue…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', width: 160, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {sorted.length === 0 && (
        <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>
          {q ? `no results for "${search}"` : 'nothing in the print queue — all caught up!'}
        </p>
      )}

      {sorted.map(productName => {
        const cat = products[productName]?.category || '';
        const pParts = [...byProduct[productName]].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (a.name || '').localeCompare(b.name || ''));
        const hasPrinting = pParts.some(p => p.status === 'printing');

        return (
          <div
            key={productName}
            style={{
              background: 'var(--bg2)',
              border: `0.5px solid ${hasPrinting ? 'var(--green)' : 'var(--border2)'}`,
              borderRadius: 'var(--radius)',
              marginBottom: 10,
              overflow: 'hidden',
            }}
          >
            {/* Product header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              borderBottom: '0.5px solid var(--border2)',
              background: hasPrinting ? 'color-mix(in srgb, var(--green) 8%, var(--bg2))' : 'var(--bg2)',
            }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{productName}</span>
              {cat && <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 7px', borderRadius: 99 }}>{cat}</span>}
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{pParts.length} part{pParts.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Parts list */}
            <div>
              {pParts.map(p => {
                const isPrinting = p.status === 'printing';
                const colours = p.colours?.length ? p.colours : (p.colour ? [{ hex: p.colour, name: p.colourName || '' }] : []);
                const remaining = p.qty - p.printed;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 12px',
                      borderBottom: '0.5px solid var(--border2)',
                      fontSize: 12,
                    }}
                  >
                    {/* Status pill */}
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                      padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap',
                      background: isPrinting ? 'var(--green)' : 'var(--bg3)',
                      color: isPrinting ? '#fff' : 'var(--text2)',
                    }}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>

                    {/* Colour swatches */}
                    {colours.length > 0 && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {colours.map((c, i) => (
                          <span key={i} title={c.name} style={{ width: 12, height: 12, borderRadius: '50%', background: c.hex, border: '0.5px solid var(--border2)', display: 'inline-block', flexShrink: 0 }} />
                        ))}
                      </div>
                    )}

                    {/* Part name + variant */}
                    <span style={{ flex: 1, fontWeight: 500 }}>
                      {p.name}{p.variant ? <span style={{ color: 'var(--text2)', fontWeight: 400 }}> — {p.variant}</span> : ''}
                    </span>

                    {/* Qty remaining */}
                    <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {isPrinting
                        ? `${p.printed} / ${p.qty} done`
                        : `qty ${remaining}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
