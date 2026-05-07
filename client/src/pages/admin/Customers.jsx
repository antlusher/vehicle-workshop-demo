import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, getCustomerVehicles, linkVehicle, unlinkVehicle } from '../../services/customerApi';

const EMPTY_DETAILS = { name: '', phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '', email: '' };

function CustomerDetail({ customer, token, onClose, onUpdated }) {
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [reg, setReg] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');

  const [details, setDetails] = useState({
    name: customer.name || '', phone: customer.phone || '', email: customer.email || '',
    addressLine1: customer.addressLine1 || '', addressLine2: customer.addressLine2 || '',
    city: customer.city || '', postcode: customer.postcode || '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  const loadVehicles = () =>
    getCustomerVehicles(customer.id, token).then(setVehicles).finally(() => setLoadingVehicles(false));

  useEffect(() => { loadVehicles(); }, [customer.id]);

  const handleLink = async (e) => {
    e.preventDefault();
    if (!reg.trim()) return;
    setLinking(true); setLinkError('');
    try {
      await linkVehicle(customer.id, reg.trim(), token);
      setReg('');
      loadVehicles();
    } catch (err) { setLinkError(err.message); }
    finally { setLinking(false); }
  };

  const handleUnlink = async (vehicleId) => {
    if (!confirm('Remove this vehicle from the customer?')) return;
    await unlinkVehicle(customer.id, vehicleId, token);
    setVehicles((vs) => vs.filter((v) => v.id !== vehicleId));
  };

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveError(''); setSavedOk(false);
    try {
      const updated = await updateCustomer(customer.id, details, token);
      onUpdated(updated);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  };

  const field = (key) => ({
    value: details[key],
    onChange: (e) => setDetails((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>✕</button>
      <h3 className="detail-title">{customer.name || customer.email}</h3>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 20 }}>
        Customer since {new Date(customer.createdAt).toLocaleDateString()}
      </p>

      <h4 className="detail-section">Personal details</h4>
      <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="kb-form-row">
          <div className="kb-form-group">
            <label>Full name</label>
            <input placeholder="Jane Smith" {...field('name')} />
          </div>
          <div className="kb-form-group">
            <label>Phone</label>
            <input type="tel" placeholder="07700 900000" {...field('phone')} />
          </div>
        </div>
        <div className="kb-form-group">
          <label>Email</label>
          <input type="email" {...field('email')} />
        </div>
        <div className="kb-form-group">
          <label>Address line 1</label>
          <input placeholder="123 High Street" {...field('addressLine1')} />
        </div>
        <div className="kb-form-group">
          <label>Address line 2</label>
          <input placeholder="Apartment, suite, etc." {...field('addressLine2')} />
        </div>
        <div className="kb-form-row">
          <div className="kb-form-group">
            <label>Town / City</label>
            <input placeholder="London" {...field('city')} />
          </div>
          <div className="kb-form-group">
            <label>Postcode</label>
            <input placeholder="SW1A 1AA" {...field('postcode')} />
          </div>
        </div>
        {saveError && <p className="error" style={{ margin: 0 }}>{saveError}</p>}
        <button type="submit" disabled={saving} style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}>
          {saving ? 'Saving…' : savedOk ? 'Saved ✓' : 'Save details'}
        </button>
      </form>

      <h4 className="detail-section" style={{ marginTop: 24 }}>Linked vehicles</h4>
      {loadingVehicles ? <p className="admin-loading">Loading…</p> : (
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
          {linkError && <p className="error" style={{ marginTop: 8 }}>{linkError}</p>}
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
  const [form, setForm] = useState({ email: '', password: '', ...EMPTY_DETAILS });
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
      setForm({ email: '', password: '', ...EMPTY_DETAILS });
      setShowCreate(false);
    } catch (err) { setCreateError(err.message); }
    finally { setCreating(false); }
  };

  const handleUpdated = (updated) => {
    setCustomers((cs) => cs.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
    setSelected((prev) => prev ? { ...prev, ...updated } : prev);
  };

  const f = (key) => ({ value: form[key], onChange: (e) => setForm((s) => ({ ...s, [key]: e.target.value })) });

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Customers</h2>
        <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? 'Cancel' : '+ New customer'}</button>
      </div>

      {showCreate && (
        <div className="kb-form-wrap" style={{ marginBottom: 20 }}>
          <h3 className="admin-section-title" style={{ marginTop: 0 }}>Create customer account</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Full name</label>
                <input placeholder="Jane Smith" {...f('name')} />
              </div>
              <div className="kb-form-group">
                <label>Phone</label>
                <input type="tel" placeholder="07700 900000" {...f('phone')} />
              </div>
            </div>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Email <span style={{ color: '#b91c1c' }}>*</span></label>
                <input type="email" required {...f('email')} placeholder="customer@example.com" />
              </div>
              <div className="kb-form-group">
                <label>Password <span style={{ color: '#b91c1c' }}>*</span></label>
                <input type="password" required {...f('password')} placeholder="Temporary password" />
              </div>
            </div>
            <div className="kb-form-group">
              <label>Address line 1</label>
              <input placeholder="123 High Street" {...f('addressLine1')} />
            </div>
            <div className="kb-form-group">
              <label>Address line 2</label>
              <input placeholder="Apartment, suite, etc." {...f('addressLine2')} />
            </div>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Town / City</label>
                <input placeholder="London" {...f('city')} />
              </div>
              <div className="kb-form-group">
                <label>Postcode</label>
                <input placeholder="SW1A 1AA" {...f('postcode')} />
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
                  <tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicles</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className={`admin-table-row${selected?.id === c.id ? ' admin-table-row--active' : ''}`}>
                      <td>{c.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                      <td>{c.email}</td>
                      <td style={{ color: c.phone ? '#1e293b' : '#9ca3af' }}>{c.phone || '—'}</td>
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
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No customer accounts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected && (
          <CustomerDetail
            customer={selected} token={token}
            onClose={() => setSelected(null)}
            onUpdated={handleUpdated}
          />
        )}
      </div>
    </div>
  );
}
