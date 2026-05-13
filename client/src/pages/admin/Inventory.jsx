import { useState, useEffect, useCallback } from 'react';

const BASE = '/api/parts';

async function apiFetch(path, opts = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const CATEGORIES = ['', 'filters', 'brakes', 'engine', 'ignition', 'timing', 'sensors', 'fluids', 'cooling', 'labour'];

function StockBadge({ available }) {
  if (available == null) return null;
  if (available <= 0) return <span className="inv-badge inv-badge--out">Out of stock</span>;
  if (available <= 2)  return <span className="inv-badge inv-badge--low">Low: {available}</span>;
  return <span className="inv-badge inv-badge--ok">{available}</span>;
}

function AdjustModal({ part, token, onUpdated, onClose }) {
  const [delta, setDelta]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const d = parseInt(delta);
    if (isNaN(d) || d === 0) { setError('Enter a non-zero number'); return; }
    setBusy(true);
    try {
      const updated = await apiFetch(`/${part.id}/adjust`, { method: 'POST', body: { delta: d } }, token);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Adjust stock — {part.partNumber}</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: '#374151' }}>
            {part.brand} {part.title}<br />
            Current stock: <strong>{part.stockQty}</strong> &nbsp;·&nbsp; Reserved: <strong>{part.reservedQty ?? 0}</strong>
          </p>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Adjustment (+ to add, − to remove)
              <input
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="e.g. 10 or -2"
                autoFocus
                style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
              />
            </label>
            {error && <p style={{ color: '#dc2626', margin: 0, fontSize: '0.82rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Apply'}</button>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EditModal({ part, token, onUpdated, onClose }) {
  const [form, setForm] = useState({
    title: part.title || '',
    brand: part.brand || '',
    partNumber: part.partNumber || '',
    category: part.category || '',
    costPrice: part.costPrice != null ? String(part.costPrice) : '',
    listPrice: part.listPrice != null ? String(part.listPrice) : '',
    stockQty: part.stockQty != null ? String(part.stockQty) : '0',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await apiFetch(`/${part.id}`, {
        method: 'PATCH',
        body: {
          title: form.title || null,
          brand: form.brand || null,
          partNumber: form.partNumber || null,
          category: form.category || null,
          costPrice: form.costPrice !== '' ? parseFloat(form.costPrice) : null,
          listPrice: form.listPrice !== '' ? parseFloat(form.listPrice) : null,
          stockQty: form.stockQty !== '' ? parseInt(form.stockQty) : null,
        },
      }, token);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (label, key, type = 'text') => (
    <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
      {label}
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
      />
    </label>
  );

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Edit part</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {field('Title', 'title')}
            {field('Brand', 'brand')}
            {field('Part number', 'partNumber')}
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
              >
                {CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {field('Cost price (£)', 'costPrice', 'number')}
              {field('List price (£)', 'listPrice', 'number')}
              {field('Stock qty', 'stockQty', 'number')}
            </div>
            {error && <p style={{ color: '#dc2626', margin: 0, fontSize: '0.82rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Inventory({ token }) {
  const [parts, setParts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [editing, setEditing]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (category) params.set('category', category);
      const data = await apiFetch(`/?${params}`, {}, token);
      setParts(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, search, category]);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = (updated) => {
    setParts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
  };

  const outOfStock  = parts.filter((p) => (p.availableQty ?? 0) <= 0).length;
  const lowStock    = parts.filter((p) => (p.availableQty ?? 0) > 0 && (p.availableQty ?? 0) <= 2).length;

  return (
    <div className="inv-shell">
      {adjusting && <AdjustModal part={adjusting} token={token} onUpdated={handleUpdated} onClose={() => setAdjusting(null)} />}
      {editing   && <EditModal   part={editing}   token={token} onUpdated={handleUpdated} onClose={() => setEditing(null)} />}

      <div className="inv-header">
        <h2 className="inv-title">Inventory</h2>
        <div className="inv-summary">
          {outOfStock > 0 && <span className="inv-badge inv-badge--out">{outOfStock} out of stock</span>}
          {lowStock   > 0 && <span className="inv-badge inv-badge--low">{lowStock} low stock</span>}
          <span className="inv-badge inv-badge--total">{parts.length} parts</span>
        </div>
      </div>

      <div className="inv-filters">
        <input
          className="inv-search"
          placeholder="Search parts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="inv-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="specs-loading">Loading inventory…</p>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Part #</th>
                <th>Brand</th>
                <th>Title</th>
                <th>Category</th>
                <th className="inv-num">Cost</th>
                <th className="inv-num">Stock</th>
                <th className="inv-num">Reserved</th>
                <th className="inv-num">Available</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: '24px' }}>No parts found</td></tr>
              )}
              {parts.map((p) => (
                <tr key={p.id} className={(p.availableQty ?? 0) <= 0 ? 'inv-row--out' : (p.availableQty ?? 0) <= 2 ? 'inv-row--low' : ''}>
                  <td className="inv-mono">{p.partNumber || '—'}</td>
                  <td>{p.brand || '—'}</td>
                  <td>{p.title}</td>
                  <td><span className="inv-cat">{p.category || '—'}</span></td>
                  <td className="inv-num">£{p.costPrice?.toFixed(2) ?? '—'}</td>
                  <td className="inv-num inv-stock">{p.stockQty ?? 0}</td>
                  <td className="inv-num inv-reserved">{p.reservedQty ?? 0}</td>
                  <td className="inv-num"><StockBadge available={p.availableQty} /></td>
                  <td className="inv-actions">
                    <button type="button" className="secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => setAdjusting(p)}>Adjust</button>
                    <button type="button" className="secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => setEditing(p)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
