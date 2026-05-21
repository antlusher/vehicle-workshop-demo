import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerVehicles, linkVehicle, unlinkVehicle } from '../../services/customerApi';
import { getCustomerStats, setCustomerPassword } from '../../services/adminApi';
import ConfirmDialog from '../../components/ConfirmDialog';

const EMPTY_DETAILS = { name: '', phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '', email: '' };

function fmt(v) { return v == null ? '—' : `£${parseFloat(v).toFixed(2)}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

function StatCard({ label, value, sub }) {
  return (
    <div className="cust-stat-card">
      <div className="cust-stat-value">{value}</div>
      <div className="cust-stat-label">{label}</div>
      {sub && <div className="cust-stat-sub">{sub}</div>}
    </div>
  );
}

function ActivityTab({ customerId, token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    getCustomerStats(customerId, token)
      .then(setStats)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <p className="admin-loading">Loading…</p>;
  if (err) return <p className="error">{err}</p>;
  if (!stats) return null;

  const quoteStatusBadge = (s) => {
    const map = { approved: { bg: '#dcfce7', color: '#166534' }, sent: { bg: '#dbeafe', color: '#1d4ed8' } };
    const style = map[s] || { bg: '#f3f4f6', color: '#374151' };
    return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: style.bg, color: style.color, textTransform: 'capitalize' }}>{s}</span>;
  };

  return (
    <div>
      <div className="cust-stat-grid">
        <StatCard label="Total spend" value={fmt(stats.totalSpend)} sub={`${stats.approvedQuoteCount} approved quote${stats.approvedQuoteCount !== 1 ? 's' : ''}`} />
        <StatCard label="Jobs" value={stats.jobCount} />
        <StatCard label="Last portal access" value={stats.lastPortalAccess ? fmtDate(stats.lastPortalAccess) : 'Never'} sub={stats.lastPortalAccess ? new Date(stats.lastPortalAccess).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null} />
        <StatCard label="Customer since" value={fmtDate(stats.createdAt)} />
      </div>

      <h4 className="detail-section" style={{ marginTop: 20 }}>Job history</h4>
      {stats.jobs.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No jobs yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Reg</th>
                <th>Report total</th>
                <th>Quote</th>
                <th>Quote total</th>
              </tr>
            </thead>
            <tbody>
              {stats.jobs.map((j) => (
                <tr key={j.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#6b7280' }}>{fmtDate(j.openedAt)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{j.vehicle || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600 }}>{j.registration || '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{j.reportTotal != null ? fmt(j.reportTotal) : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{j.quoteStatus ? quoteStatusBadge(j.quoteStatus) : <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>}</td>
                  <td style={{ fontSize: '0.85rem', fontWeight: j.quoteStatus === 'approved' ? 600 : 400 }}>
                    {j.quoteTotal != null ? fmt(j.quoteTotal) : <span style={{ color: '#9ca3af' }}>—</span>}
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

function VehiclesTab({ customer, token }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reg, setReg] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');

  const loadVehicles = () =>
    getCustomerVehicles(customer.id, token).then(setVehicles).finally(() => setLoading(false));

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

  const [unlinkTarget, setUnlinkTarget] = useState(null);

  const handleUnlink = async () => {
    await unlinkVehicle(customer.id, unlinkTarget, token);
    setVehicles((vs) => vs.filter((v) => v.id !== unlinkTarget));
    setUnlinkTarget(null);
  };

  if (loading) return <p className="admin-loading">Loading…</p>;

  return (
    <>
      {vehicles.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No vehicles linked yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {vehicles.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{v.registration || '—'}</strong>
                <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6b7280' }}>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
              </div>
              <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 10px', background: '#fee2e2', color: '#b91c1c' }}
                onClick={() => setUnlinkTarget(v.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <h4 className="detail-section">Link a vehicle</h4>
      <form onSubmit={handleLink} style={{ display: 'flex', gap: 8 }}>
        <input
          value={reg} onChange={(e) => setReg(e.target.value)}
          placeholder="Registration (e.g. AB12CDE)"
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
      <ConfirmDialog
        open={!!unlinkTarget}
        title="Remove vehicle"
        message="Remove this vehicle from the customer? The vehicle record itself will not be deleted."
        confirmLabel="Remove"
        danger
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkTarget(null)}
      />
    </>
  );
}

function DetailsTab({ customer, token, onUpdated }) {
  const [details, setDetails] = useState({
    name: customer.name || '', phone: customer.phone || '', email: customer.email || '',
    addressLine1: customer.addressLine1 || '', addressLine2: customer.addressLine2 || '',
    city: customer.city || '', postcode: customer.postcode || '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  const handleSave = async (e) => {
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
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
  );
}

function CustomerDetail({ customer, token, onClose, onUpdated, onDeleted }) {
  const [tab, setTab] = useState('activity');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const TABS = [{ id: 'activity', label: 'Activity' }, { id: 'details', label: 'Details' }, { id: 'vehicles', label: 'Vehicles' }];

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPwSaving(true); setPwError(''); setPwDone(false);
    try {
      await setCustomerPassword(customer.id, newPassword, token);
      setPwDone(true);
      setNewPassword('');
      setTimeout(() => { setPwDone(false); setShowPwForm(false); }, 1500);
    } catch (err) { setPwError(err.message); }
    finally { setPwSaving(false); }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteCustomer(customer.id, token);
      onDeleted(customer.id);
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="detail-title" style={{ margin: 0 }}>{customer.name || customer.email}</h3>
        <button className="preview-close" onClick={onClose}>✕</button>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 14 }}>{customer.email}</p>

      <div className="cust-detail-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`cust-detail-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'activity' && <ActivityTab customerId={customer.id} token={token} />}
        {tab === 'details' && <DetailsTab customer={customer} token={token} onUpdated={onUpdated} />}
        {tab === 'vehicles' && <VehiclesTab customer={customer} token={token} />}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="secondary"
            style={{ fontSize: '0.8rem' }}
            onClick={() => { setShowPwForm((v) => !v); setPwError(''); setNewPassword(''); setPwDone(false); }}
          >
            Set password
          </button>
          <button
            className="secondary"
            style={{ fontSize: '0.8rem', background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete customer'}
          </button>
        </div>
        {showPwForm && (
          <form onSubmit={handleSetPassword} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              style={{ flex: 1, minWidth: 180, fontSize: '0.85rem' }}
            />
            <button type="submit" disabled={pwSaving} style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {pwSaving ? 'Saving…' : pwDone ? 'Done ✓' : 'Confirm'}
            </button>
            {pwError && <p className="error" style={{ width: '100%', margin: 0, fontSize: '0.8rem' }}>{pwError}</p>}
          </form>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete customer"
        message={`Delete ${customer.name || customer.email}? This cannot be undone. Their vehicles and job history will remain but the customer record will be removed.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function Customers({ token }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', ...EMPTY_DETAILS });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => getCustomers(token).then(setCustomers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email) return;
    setCreating(true); setCreateError('');
    try {
      const c = await createCustomer(form, token);
      setCustomers((cs) => [c, ...cs]);
      setForm({ email: '', ...EMPTY_DETAILS });
      setShowCreate(false);
    } catch (err) { setCreateError(err.message); }
    finally { setCreating(false); }
  };

  const handleUpdated = (updated) => {
    setCustomers((cs) => cs.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
    setSelected((prev) => prev ? { ...prev, ...updated } : prev);
  };

  const handleDeleted = (id) => {
    setCustomers((cs) => cs.filter((c) => c.id !== id));
    setSelected(null);
  };

  const f = (key) => ({ value: form[key], onChange: (e) => setForm((s) => ({ ...s, [key]: e.target.value })) });

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Customers</h2>
        <button onClick={() => setShowCreate(true)}>+ New customer</button>
      </div>

      {showCreate && (
        <div className="preview-overlay" onClick={() => setShowCreate(false)}>
          <div className="preview-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>New customer</h3>
              <button className="preview-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
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
                <div className="kb-form-group">
                  <label>Email <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input type="email" required {...f('email')} placeholder="customer@example.com" />
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '4px 0 0' }}>An activation email will be sent automatically.</p>
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
                  <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div>
        <div>
          {loading ? <p className="admin-loading">Loading…</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Vehicles</th><th>Total spend</th><th>Last portal access</th><th>Since</th><th></th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className={`admin-table-row${selected?.id === c.id ? ' admin-table-row--active' : ''}`}>
                      <td>{c.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                      <td style={{ fontSize: '0.82rem', color: '#374151' }}>{c.email}</td>
                      <td style={{ textAlign: 'center' }}>{c.vehicleCount}</td>
                      <td style={{ fontWeight: c.totalSpend > 0 ? 600 : 400, color: c.totalSpend > 0 ? '#1e293b' : '#9ca3af' }}>
                        {c.totalSpend > 0 ? `£${c.totalSpend.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: c.lastPortalAccess ? '#374151' : '#9ca3af', whiteSpace: 'nowrap' }}>
                        {c.lastPortalAccess ? fmtDate(c.lastPortalAccess) : 'Never'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#9ca3af' }}>{fmtDate(c.createdAt)}</td>
                      <td>
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 12px' }}
                          onClick={() => setSelected(selected?.id === c.id ? null : c)}>
                          {selected?.id === c.id ? 'Close' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!customers.length && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No customer accounts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="preview-overlay" onClick={() => setSelected(null)}>
          <div className="preview-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-body" style={{ padding: 0 }}>
              <CustomerDetail
                customer={selected} token={token}
                onClose={() => setSelected(null)}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
