import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog, NumericPrompt } from '../components/ConfirmDialog';

function esc(s) { return String(s || ''); }

/** `hostWithPort` from get-local-ip IPC is IPv4:port (see src/main/ipc/data.js). */
function parsePhoneEndpoint(hostWithPort) {
  if (!hostWithPort || typeof hostWithPort !== 'string') return { host: '', port: '', displayUrl: '', isLocalhost: false };
  const last = hostWithPort.lastIndexOf(':');
  if (last <= 0) {
    return {
      host: hostWithPort,
      port: '',
      displayUrl: `http://${hostWithPort}`,
      isLocalhost: hostWithPort.toLowerCase() === 'localhost',
    };
  }
  const host = hostWithPort.slice(0, last);
  const port = hostWithPort.slice(last + 1);
  const displayUrl = `http://${host}:${port}`;
  const isLocalhost = host.toLowerCase() === 'localhost' || host === '127.0.0.1';
  return { host, port, displayUrl, isLocalhost };
}

function PhoneInventoryUrl({ raw }) {
  const { displayUrl, host, port, isLocalhost } = parsePhoneEndpoint(raw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>Open on your phone (same Wi‑Fi as this PC)</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', padding: '8px 12px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)' }}>
        <div><strong>{displayUrl}</strong></div>
        {host && port && (
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9 }}>
            host <code style={{ fontSize: 11 }}>{esc(host)}</code>
            {' · '}
            port <code style={{ fontSize: 11 }}>{esc(port)}</code>
          </div>
        )}
        {isLocalhost && (
          <div style={{ fontSize: 11, marginTop: 6, color: 'var(--amber-text)' }}>
            Use your PC’s LAN address, not localhost, if the phone is another device.
          </div>
        )}
      </div>
    </div>
  );
}

export default function InventoryView() {
  const { inventory, invExpanded, toggleInvCard, openModal, fetchLocalIP, localIP } = useApp();
  const [search,  setSearch]  = useState('');
  const [invSort, setInvSort] = useState('az');
  const [fetchingIP, setFetchingIP] = useState(false);
  const handleFetchIP = async () => { setFetchingIP(true); try { await fetchLocalIP(); } finally { setFetchingIP(false); } };

  const needle = search.trim().toLowerCase();
  const filtered = inventory.filter(item =>
    !needle ||
    (item.name || '').toLowerCase().includes(needle) ||
    (item.category || '').toLowerCase().includes(needle) ||
    (item.location || '').toLowerCase().includes(needle)
  );

  const natCmp = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...filtered].sort((a, b) => {
    if (invSort === 'za')       return (b.name || '').localeCompare(a.name || '');
    if (invSort === 'num-asc')  return natCmp(a, b);
    if (invSort === 'num-desc') return natCmp(b, a);
    return (a.name || '').localeCompare(b.name || ''); // az default
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{filtered.length}{filtered.length !== inventory.length ? ` of ${inventory.length}` : ''} product{inventory.length !== 1 ? 's' : ''} in inventory</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {localIP
            ? <PhoneInventoryUrl raw={localIP} />
            : <button className="btn" onClick={handleFetchIP} disabled={fetchingIP}>{fetchingIP ? 'detecting…' : 'Show phone URL'}</button>
          }
          <button className="btn btn-primary" onClick={() => openModal('add-inventory')}>+ Add Product</button>
        </div>
      </div>

      {/* Search + sort bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search inventory…"
          style={{ flex: 1, fontSize: 13, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }}
        />
        <select
          value={invSort} onChange={e => setInvSort(e.target.value)}
          style={{ fontSize: 12, padding: '6px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="num-asc">Number ↑</option>
          <option value="num-desc">Number ↓</option>
        </select>
      </div>

      {!inventory.length && (
        <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>no inventory yet — mark a product ready to build and hit "+ inventory", or add one manually.</p>
      )}
      {inventory.length > 0 && sorted.length === 0 && (
        <p style={{ color: 'var(--text2)', fontSize: 13, padding: '1rem 0' }}>no results for "{search}"</p>
      )}

      <div className="product-list">
        {sorted.map(item => (
          <InvCard key={item.id} item={item} isOpen={invExpanded.has(item.id)} toggleInvCard={toggleInvCard} />
        ))}
      </div>
    </div>
  );
}

function InvCard({ item, isOpen, toggleInvCard }) {
  const { getStorageLocations, invOnHand } = useApp();
  const locs = getStorageLocations();
  const onHand = invOnHand(item);
  const byDest = {};
  (item.distributions || []).forEach(d => { byDest[d.dest] = (byDest[d.dest] || 0) + (d.qty || 0); });
  const storage = item.storage || {};

  return (
    <div className="product-card">
      <div className="product-header" style={{ cursor: 'pointer' }} onClick={() => toggleInvCard(item.id)}>
        <div className="product-title-wrap">
          <span className="product-title">{esc(item.name)}</span>
          {item.category && <span className="cat-tag">{esc(item.category)}</span>}
          {item.location && <span className="cat-tag">{esc(item.location)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>built: {item.built || 0}</span>
          {Object.entries(byDest).map(([d, n]) => (
            <span key={d} className="badge" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>{esc(d)} {n}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginRight: 10 }}>
          {locs.map(loc => (
            <div key={loc} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{esc(loc)}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{storage[loc] || 0}</div>
            </div>
          ))}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>on hand</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: onHand > 0 ? 'var(--green)' : 'var(--text2)' }}>{onHand}</div>
          </div>
        </div>
        <span className={`chevron${isOpen ? ' open' : ''}`}>▶</span>
      </div>
      {isOpen && <InvDetail item={item} />}
    </div>
  );
}

function InvDetail({ item }) {
  const { getStorageLocations, getOutgoingDests, invOnHand, invAdjustBuilt, invSetBuilt, invAdjustLocation, invSetLocation, invSetLabel, invLogDist, removeDistribution, invDeleteItem, invSectionCollapsed, toggleInvSection } = useApp();
  const locs = getStorageLocations();
  const dests = getOutgoingDests();
  const onHand = invOnHand(item);
  const totalOut = (item.distributions || []).reduce((a, d) => a + (d.qty || 0), 0);
  const storage = item.storage || {};
  const [selectedDest, setSelectedDest] = useState(dests[0] || 'store');
  const [logQty, setLogQty] = useState(1);
  const [logNote, setLogNote] = useState('');
  const [labelMode, setLabelMode] = useState(false);
  const [labelVal, setLabelVal] = useState(item.location || '');
  const [confirmState, setConfirmState] = useState(null);
  const [numericState, setNumericState] = useState(null);

  const storageKey = item.id + '-storage';
  const outgoingKey = item.id + '-outgoing';
  const storageOpen = !invSectionCollapsed.has(storageKey);
  const outgoingOpen = !invSectionCollapsed.has(outgoingKey);

  const handleLog = async () => {
    if (logQty > onHand) { alert(`Not enough stock — you only have ${onHand} on hand.`); return; }
    await invLogDist(item.id, selectedDest, logQty, logNote);
    setLogNote('');
    setLogQty(1);
  };

  return (
    <div className="parts-table" style={{ padding: '14px 16px' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        <div className="stat"><div className="stat-label">built</div><div className="stat-val">{item.built || 0}</div></div>
        <div className="stat"><div className="stat-label">distributed</div><div className="stat-val">{totalOut}</div></div>
        <div className="stat"><div className="stat-label">on hand</div><div className="stat-val" style={{ color: 'var(--green)' }}>{onHand}</div></div>
      </div>

      {/* Location split */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleInvSection(storageKey)}>
        <span>location split</span>
        <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform .15s', transform: `rotate(${storageOpen ? 90 : 0}deg)` }}>▶</span>
      </div>
      {storageOpen && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>{locs.join(' + ')} = {onHand} on hand</div>
          {locs.map(loc => (
            <div key={loc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{esc(loc)}</div>
              <div style={{ display: 'flex' }}>
                <button className="qty-btn" onClick={() => invAdjustLocation(item.id, loc, -1)}>−</button>
                <div style={{ minWidth: 50, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setNumericState({ label: `Set ${loc} count:`, initial: storage[loc] || 0, onConfirm: v => { setNumericState(null); invSetLocation(item.id, loc, v); } })}>{storage[loc] || 0}</div>
                <button className="qty-btn" onClick={() => invAdjustLocation(item.id, loc, 1)}>+</button>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid var(--border)', margin: '8px 0 0' }}></div>
        </div>
      )}
      <div style={{ marginBottom: 16 }}></div>

      {/* Built count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>built count</div>
        <div style={{ display: 'flex' }}>
          <button className="qty-btn" onClick={() => invAdjustBuilt(item.id, -1)}>−</button>
          <div style={{ minWidth: 50, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setNumericState({ label: 'Set built count:', initial: item.built || 0, onConfirm: v => { setNumericState(null); invSetBuilt(item.id, v); } })}>
            {item.built || 0}
          </div>
          <button className="qty-btn" onClick={() => invAdjustBuilt(item.id, 1)}>+</button>
        </div>
      </div>

      {/* Log outgoing */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleInvSection(outgoingKey)}>
        <span>log outgoing</span>
        <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform .15s', transform: `rotate(${outgoingOpen ? 90 : 0}deg)` }}>▶</span>
      </div>
      {outgoingOpen && (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {dests.map(d => (
              <button key={d} className={`btn${selectedDest === d ? ' btn-primary' : ''}`} style={{ flex: 1, fontSize: 12, padding: '6px 4px', minWidth: 60 }} onClick={() => setSelectedDest(d)}>{esc(d)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex' }}>
              <button className="qty-btn" onClick={() => setLogQty(q => Math.max(1, q - 1))}>−</button>
              <div style={{ minWidth: 50, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '0.5px solid var(--border2)', borderBottom: '0.5px solid var(--border2)', fontSize: 16, fontWeight: 600 }}>{logQty}</div>
              <button className="qty-btn" onClick={() => setLogQty(q => q + 1)}>+</button>
            </div>
            <input value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="note (optional)" style={{ flex: 1, fontSize: 13, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }} />
            <button className="btn btn-success" style={{ whiteSpace: 'nowrap' }} onClick={handleLog}>log {logQty}</button>
          </div>
        </div>
      )}

      {/* History */}
      {item.distributions?.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, marginTop: 4 }}>history</div>
          {[...item.distributions].reverse().map((d, ri) => {
            const realIdx = item.distributions.length - 1 - ri;
            return (
              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span className="sp sp-queue" style={{ fontSize: 11 }}>{esc(d.dest)}</span>
                <span style={{ color: 'var(--text2)', flex: 1 }}>{esc(d.note || '')}</span>
                <span style={{ fontWeight: 500 }}>-{d.qty}</span>
                <button className="icon-btn" onClick={() => removeDistribution(item.id, realIdx)}>✕</button>
              </div>
            );
          })}
        </>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {labelMode ? (
          <>
            <input value={labelVal} onChange={e => setLabelVal(e.target.value)} placeholder="e.g. shelf A, box 3" autoFocus style={{ flex: 1, fontSize: 13, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter') { invSetLabel(item.id, labelVal); setLabelMode(false); } }} />
            <button className="btn btn-primary" onClick={() => { invSetLabel(item.id, labelVal); setLabelMode(false); }}>save</button>
            <button className="btn" onClick={() => setLabelMode(false)}>cancel</button>
          </>
        ) : (
          <>
            <button className="btn" style={{ flex: 1, fontSize: 12 }} onClick={() => setLabelMode(true)}>set label</button>
            <button className="btn" style={{ fontSize: 12, color: 'var(--red-text)', borderColor: 'var(--red-text)' }} onClick={() => setConfirmState({ message: 'Remove this item from inventory?', confirmLabel: 'delete', danger: true, onConfirm: () => { setConfirmState(null); invDeleteItem(item.id); } })}>delete</button>
          </>
        )}
      </div>
      {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
      {numericState && <NumericPrompt {...numericState} onCancel={() => setNumericState(null)} />}
    </div>
  );
}
