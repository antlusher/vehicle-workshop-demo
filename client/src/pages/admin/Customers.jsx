import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, getCustomerVehicles, linkVehicle, unlinkVehicle } from '../../services/customerApi';

function CustomerDetail({ customer, token, onClose }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reg, setReg] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  const loadVehicles = () =>
    getCustomerVehicles(customer.id, token).then(setVehicles).finally(() => setLoading(false));

  useEffect(() => { loadVehicles(); }, [customer.id]);

  const handleLink = async (e) => {
    e.preventDefault();
    if (!reg.trim()) return;
    setLinking(true); setError('');
    try {
      await linkVehicle(customer.id, reg.trim(), token);
      setReg('');
      loadVehicles();
    } catch (err) { setError(err.message); }
    finally { setLinking(false); }
  };

  const handleUnlink = async (vehicleId) => {
    if (!confirm('Remove this vehicle from the customer?')) return;
    await unlinkVehicle(customer.id, vehicleId, token);
    setVehicles((vs) => vs.filter((v) => v.id !== vehicleId));
  };

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>✕</button>
      <h3 className="detail-title">{customer.email}</h3>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 20 }}>
        Customer since {new Date(customer.createdAt).toLocaleDateString()}
      </p>

      <h4 className="detail-section">Linked vehicles</h4>
      {loading ? <p className="admin-loading">Loading…</p> : (
        <>
          {vehicles.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No vehicles linked yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {vehicles.map((v) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.875rem' }}>{v.registration || '—'}</strong>
                    <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6b7280' }}>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
                  </div>
                  <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 10px', background: '#fee2e2', color: '#b91c1c' }}
                    onClick={() => handleUnlink(v.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <h4 className="detail-section">Link a vehicle</h4>
          <form onSubmit={handleLink} style={{ display: 'flex', gap: 8 }}>
            <input
              value={reg} onChange={(e) => setReg(e.target.value)}
              placeholder="Enter registration (e.g. AB12CDE)"
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.875rem' }}
            />
            <button type="submit" disabled={linking} style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
              {linking ? 'Linking…' : 'Link vehicle'}
            </button>
          </form>
          {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 6 }}>
            The vehicle must have been looked up or created in Ask Bob first.
          </p>
        </>
      )}
    </div>
  );
}

export default function Customers({ token }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => getCustomers(token).then(setCustomers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setCreating(true); setCreateError('');
    try {
      const c = await createCustomer(form, token);
      setCustomers((cs) => [c, ...cs]);
      setForm({ email: '', password: '' });
      setShowCreate(false);
    } catch (err) { setCreateError(err.message); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Customers</h2>
        <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? 'Cancel' : '+ New customer'}</button>
      </div>

      {showCreate && (
        <div className="kb-form-wrap" style={{ marginBottom: 20 }}>
          <h3 className="admin-section-title" style={{ marginTop: 0 }}>Create customer account</h3>
          <form onSubmit={handleCreate}>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="customer@example.com" required />
              </div>
              <div className="kb-form-group">
                <label>Password</label>
                <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Temporary password" required />
              </div>
            </div>
            {createError && <p className="error">{createError}</p>}
            <div className="kb-form-actions">
              <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-split">
        <div className={`admin-split-main${selected ? ' admin-split-main--narrow' : ''}`}>
          {loading ? <p className="admin-loading">Loading…</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Email</th><th>Vehicles</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className={`admin-table-row${selected?.id === c.id ? ' admin-table-row--active' : ''}`}>
                      <td>{c.email}</td>
                      <td>{c.vehicleCount}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#9ca3af' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 12px' }}
                          onClick={() => setSelected(selected?.id === c.id ? null : c)}>
                          {selected?.id === c.id ? 'Close' : 'Manage'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!customers.length && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No customer accounts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected && <CustomerDetail customer={selected} token={token} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
