import { useState, useEffect } from 'react';

const BASE = '/api';

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

function Section({ title, children }) {
  return (
    <div className="ws-section">
      <h3 className="ws-section-title">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="ws-field">
      <label className="ws-label">{label}{hint && <span className="ws-hint"> — {hint}</span>}</label>
      {children}
    </div>
  );
}

function SaveBar({ saving, saved, error, onSave }) {
  return (
    <div className="ws-save-bar">
      {error && <span className="error" style={{ fontSize: '0.85rem' }}>{error}</span>}
      {saved && <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>Saved</span>}
      <button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}

// ── Workshop Details ──────────────────────────────────────────────────────────

function DetailsTab({ token }) {
  const [form, setForm] = useState({ workshopName: '', addressLine1: '', addressLine2: '', city: '', postcode: '', phone: '', email: '', paymentNotes: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token)
      .then((s) => setForm({
        workshopName: s.workshopName || '',
        addressLine1: s.addressLine1 || '',
        addressLine2: s.addressLine2 || '',
        city: s.city || '',
        postcode: s.postcode || '',
        phone: s.phone || '',
        email: s.email || '',
        paymentNotes: s.paymentNotes || '',
      }))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiFetch('/quotes/settings', { method: 'PATCH', body: form }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="Workshop details">
        <Field label="Workshop name">
          <input value={form.workshopName} onChange={(e) => set('workshopName', e.target.value)} placeholder="e.g. Ace Motors Ltd" />
        </Field>
        <Field label="Address line 1">
          <input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} placeholder="Street / unit" />
        </Field>
        <Field label="Address line 2">
          <input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} placeholder="Optional" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
          <Field label="City / Town">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Birmingham" />
          </Field>
          <Field label="Postcode">
            <input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} placeholder="B1 1AA" />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0121 000 0000" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="info@workshop.co.uk" />
          </Field>
        </div>
      </Section>

      <Section title="Payment & invoicing">
        <Field label="Payment notes" hint="shown on quotes/invoices — e.g. bank details, Stripe link, terms">
          <textarea rows={4} value={form.paymentNotes} onChange={(e) => set('paymentNotes', e.target.value)}
            placeholder="e.g. Bank transfer: Sort 12-34-56 Acc 12345678&#10;Payment due within 30 days of invoice" />
        </Field>
      </Section>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </>
  );
}

// ── Rates ─────────────────────────────────────────────────────────────────────

function RatesTab({ token }) {
  const [form, setForm] = useState({ labourRatePerHour: '', defaultMarkupPct: '', vatRate: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token)
      .then((s) => setForm({
        labourRatePerHour: String(s.labourRatePerHour ?? 75),
        defaultMarkupPct: String(s.defaultMarkupPct ?? 30),
        vatRate: String(s.vatRate ?? 20),
      }))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiFetch('/quotes/settings', {
        method: 'PATCH',
        body: {
          labourRatePerHour: parseFloat(form.labourRatePerHour) || null,
          defaultMarkupPct: parseFloat(form.defaultMarkupPct) || null,
          vatRate: parseFloat(form.vatRate) || null,
        },
      }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="Labour & parts rates">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Field label="Labour rate" hint="£/hr">
            <input type="number" min="0" step="0.50" value={form.labourRatePerHour} onChange={(e) => set('labourRatePerHour', e.target.value)} />
          </Field>
          <Field label="Default parts markup" hint="%">
            <input type="number" min="0" step="1" value={form.defaultMarkupPct} onChange={(e) => set('defaultMarkupPct', e.target.value)} />
          </Field>
          <Field label="VAT rate" hint="%">
            <input type="number" min="0" step="0.5" value={form.vatRate} onChange={(e) => set('vatRate', e.target.value)} />
          </Field>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '8px 0 0' }}>
          These defaults apply to all new quotes. Individual lines can be adjusted per quote.
        </p>
      </Section>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </>
  );
}

// ── Technicians ───────────────────────────────────────────────────────────────

function TechnicianRow({ tech, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: tech.name, role: tech.role || '', email: tech.email || '', phone: tech.phone || '', hourlyRate: tech.hourlyRate != null ? String(tech.hourlyRate) : '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tech.id, { name: form.name, role: form.role || null, email: form.email || null, phone: form.phone || null, hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null });
      setEditing(false);
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <tr>
        <td><input value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: '100%' }} /></td>
        <td><input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Senior Tech" style={{ width: '100%' }} /></td>
        <td><input value={form.email} onChange={(e) => set('email', e.target.value)} style={{ width: '100%' }} /></td>
        <td><input value={form.phone} onChange={(e) => set('phone', e.target.value)} style={{ width: '100%' }} /></td>
        <td><input type="number" value={form.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} style={{ width: 80 }} /></td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button style={{ fontSize: '0.78rem', padding: '3px 10px', marginRight: 6 }} onClick={handleSave} disabled={saving}>{saving ? '…' : 'Save'}</button>
          <button className="secondary" style={{ fontSize: '0.78rem', padding: '3px 10px' }} onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{tech.name}</td>
      <td style={{ color: '#6b7280' }}>{tech.role || '—'}</td>
      <td style={{ color: '#6b7280' }}>{tech.email || '—'}</td>
      <td style={{ color: '#6b7280' }}>{tech.phone || '—'}</td>
      <td>{tech.hourlyRate != null ? `£${tech.hourlyRate}/hr` : '—'}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="secondary" style={{ fontSize: '0.78rem', padding: '3px 10px', marginRight: 6 }} onClick={() => setEditing(true)}>Edit</button>
        <button className="secondary" style={{ fontSize: '0.78rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={() => onDelete(tech.id)}>Remove</button>
      </td>
    </tr>
  );
}

function TechniciansTab({ token }) {
  const [techs, setTechs] = useState([]);
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '', hourlyRate: '' });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => apiFetch('/technicians', {}, token).then(setTechs).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setError('');
    try {
      const t = await apiFetch('/technicians', { method: 'POST', body: { name: form.name, role: form.role || null, email: form.email || null, phone: form.phone || null, hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null } }, token);
      setTechs((prev) => [...prev, t]);
      setForm({ name: '', role: '', email: '', phone: '', hourlyRate: '' });
      setAdding(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleSave = async (id, data) => {
    const t = await apiFetch(`/technicians/${id}`, { method: 'PATCH', body: data }, token);
    setTechs((prev) => prev.map((x) => x.id === id ? t : x));
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this technician?')) return;
    await apiFetch(`/technicians/${id}`, { method: 'DELETE' }, token);
    setTechs((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <Section title="Technicians">
      {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}
      {techs.length > 0 && (
        <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Rate</th><th></th>
              </tr>
            </thead>
            <tbody>
              {techs.map((t) => (
                <TechnicianRow key={t.id} tech={t} onSave={handleSave} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="ws-add-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 120px', gap: 10, marginBottom: 10 }}>
            <Field label="Name"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" /></Field>
            <Field label="Role"><input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Senior Technician" /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Rate (£/hr)"><input type="number" value={form.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={saving || !form.name.trim()}>{saving ? 'Adding…' : 'Add technician'}</button>
            <button className="secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="secondary" onClick={() => setAdding(true)}>+ Add technician</button>
      )}
    </Section>
  );
}

// ── Parts Catalogue ────────────────────────────────────────────────────────────

function PartsCatalogueTab({ token }) {
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const doSearch = async (q) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q || '' });
      const data = await apiFetch(`/parts/search?${params}`, {}, token);
      setParts(data);
    } catch { setParts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { doSearch(''); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    doSearch(search);
  };

  return (
    <Section title="Parts catalogue">
      <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: 12 }}>
        Bob searches this catalogue when building quotes. Parts with real part numbers and cost prices are preferred over estimated prices.
      </p>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, part number, or brand…" style={{ flex: 1 }} />
        <button type="submit" disabled={loading}>Search</button>
        {search && <button type="button" className="secondary" onClick={() => { setSearch(''); doSearch(''); }}>Clear</button>}
      </form>

      {loading && <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>Searching…</p>}

      {!loading && parts.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>No parts found.</p>
      )}

      {!loading && parts.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Part No.</th>
                <th>Brand</th>
                <th>Description</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>List</th>
                <th>In stock</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{p.partNumber || '—'}</td>
                  <td>{p.brand || '—'}</td>
                  <td>{p.title}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.82rem' }}>{p.category || '—'}</td>
                  <td style={{ textAlign: 'right' }}>£{p.costPrice?.toFixed(2) ?? '—'}</td>
                  <td style={{ textAlign: 'right', color: '#6b7280' }}>£{p.listPrice?.toFixed(2) ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{p.inStock ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 10 }}>{parts.length} result{parts.length !== 1 ? 's' : ''}</p>
    </Section>
  );
}

// ── Role Permissions Tab ────────────────────────────────────────────────────────

const FEATURES = [
  { key: 'customers',     label: 'Customer management', desc: 'View and manage customer accounts and vehicles' },
  { key: 'knowledge_base',label: 'AI knowledge base',   desc: 'View and contribute to the AI knowledge base' },
  { key: 'registry',      label: 'Vehicle registry',    desc: 'Look up vehicles and view full registry' },
  { key: 'inventory',     label: 'Parts inventory',     desc: 'View and manage parts stock levels' },
  { key: 'financials',    label: 'Financial data',      desc: 'View quote totals, invoice values and spend' },
];

function PermissionsTab({ token }) {
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    apiFetch('/admin/role-permissions', {}, token)
      .then(setPerms)
      .finally(() => setLoading(false));
  }, []);

  const getVal = (role, feature) => {
    const p = perms.find((p) => p.role === role && p.feature === feature);
    return p ? p.allowed : false;
  };

  const toggle = async (role, feature, allowed) => {
    const key = `${role}:${feature}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const updated = await apiFetch('/admin/role-permissions', {
        method: 'PATCH',
        body: JSON.stringify({ role, feature, allowed }),
      }, token);
      setPerms((prev) => {
        const next = prev.filter((p) => !(p.role === role && p.feature === feature));
        return [...next, updated];
      });
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[key]; return n; });
    }
  };

  if (loading) return <p className="admin-loading">Loading permissions…</p>;

  return (
    <div>
      <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: 20 }}>
        Control which features are accessible to each role in your workshop.
        Managers always have full access.
      </p>
      <div className="perm-grid">
        <div className="perm-header-row">
          <div className="perm-feature-col">Feature</div>
          <div className="perm-role-col">Admin</div>
          <div className="perm-role-col">Tech</div>
        </div>
        {FEATURES.map((f) => (
          <div key={f.key} className="perm-row">
            <div className="perm-feature-col">
              <div className="perm-feature-name">{f.label}</div>
              <div className="perm-feature-desc">{f.desc}</div>
            </div>
            {['admin', 'tech'].map((role) => {
              const allowed = getVal(role, f.key);
              const busy = saving[`${role}:${f.key}`];
              return (
                <div key={role} className="perm-role-col perm-toggle-cell">
                  <button
                    className={`perm-toggle${allowed ? ' perm-toggle--on' : ''}`}
                    disabled={busy}
                    onClick={() => toggle(role, f.key, !allowed)}
                    title={allowed ? 'Click to deny' : 'Click to allow'}
                  >
                    <span className="perm-toggle-knob" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Features Tab ──────────────────────────────────────────────────────────

function AiFeaturesTab({ token }) {
  const [aiEnabled, setAiEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token)
      .then((s) => setAiEnabled(s.aiEnabled !== false))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiFetch('/quotes/settings', { method: 'PATCH', body: { aiEnabled } }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="AI assistant">
        <Field label="Enable AI features" hint="controls whether the AI diagnostic chat and workshop assistant are available">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.9rem' }}>{aiEnabled ? 'AI is enabled' : 'AI is disabled'}</span>
          </label>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '8px 0 0' }}>
            When disabled, the diagnostic chat and assistant are hidden. All other workshop features (projects, quotes, customers) remain fully usable.
          </p>
        </Field>
      </Section>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </>
  );
}

// ── Invoice Template ───────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function InvoiceTemplateTab({ token }) {
  const [form, setForm] = useState({
    invoiceAccentColor: '#1e40af', invoiceVatNumber: '', invoiceFooterText: '',
    invoiceShowBankDetails: false,
    invoiceBankName: '', invoiceAccountName: '', invoiceAccountNumber: '', invoiceSortCode: '',
  });
  const [workshopName, setWorkshopName] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token).then((s) => {
      setWorkshopName(s.workshopName || '');
      setLogoUrl(s.invoiceLogoUrl || null);
      setForm({
        invoiceAccentColor: s.invoiceAccentColor || '#1e40af',
        invoiceVatNumber: s.invoiceVatNumber || '',
        invoiceFooterText: s.invoiceFooterText || '',
        invoiceShowBankDetails: s.invoiceShowBankDetails || false,
        invoiceBankName: s.invoiceBankName || '',
        invoiceAccountName: s.invoiceAccountName || '',
        invoiceAccountNumber: s.invoiceAccountNumber || '',
        invoiceSortCode: s.invoiceSortCode || '',
      });
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${BASE_URL}/api/quotes/settings/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLogoUrl(data.logoUrl);
    } catch (err) { setError(err.message); }
    finally { setLogoUploading(false); e.target.value = ''; }
  };

  const handleRemoveLogo = async () => {
    setError('');
    try {
      await apiFetch('/quotes/settings/logo', { method: 'DELETE' }, token);
      setLogoUrl(null);
    } catch (err) { setError(err.message); }
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiFetch('/quotes/settings', { method: 'PATCH', body: form }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const accent = form.invoiceAccentColor || '#1e40af';
  const logoSrc = logoUrl
    ? (logoUrl.startsWith('logos/') ? `${BASE_URL}/api/media/${logoUrl}` : `${BASE_URL}/uploads/${logoUrl}`)
    : null;

  return (
    <>
      <div className="ws-template-layout">
        {/* Left: form */}
        <div className="ws-template-form">
          <Section title="Logo">
            <Field label="Workshop logo" hint="shown at the top of every invoice and estimate (PNG, JPG or SVG, max 2 MB)">
              {logoSrc && (
                <div className="ws-logo-preview">
                  <img src={logoSrc} alt="Logo preview" />
                  <button className="ws-logo-remove" onClick={handleRemoveLogo}>Remove</button>
                </div>
              )}
              <label className="ws-logo-upload-btn">
                {logoUploading ? 'Uploading…' : logoSrc ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} style={{ display: 'none' }} />
              </label>
            </Field>
          </Section>

          <Section title="Branding">
            <Field label="Accent colour" hint="used for headings, borders and table headers">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={accent} onChange={(e) => set('invoiceAccentColor', e.target.value)}
                  style={{ width: 44, height: 36, padding: 2, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }} />
                <input value={accent} onChange={(e) => set('invoiceAccentColor', e.target.value)}
                  placeholder="#1e40af" style={{ width: 110, fontFamily: 'monospace' }} />
              </div>
            </Field>
            <Field label="VAT registration number" hint="displayed on all invoices">
              <input value={form.invoiceVatNumber} onChange={(e) => set('invoiceVatNumber', e.target.value)} placeholder="GB 123 4567 89" />
            </Field>
          </Section>

          <Section title="Footer">
            <Field label="Footer text" hint="replaces the default footer on every PDF — leave blank for default">
              <textarea rows={2} value={form.invoiceFooterText} onChange={(e) => set('invoiceFooterText', e.target.value)}
                placeholder="Thank you for your business. Payment due within 30 days." />
            </Field>
          </Section>

          <Section title="Bank details">
            <Field label="Show bank details on invoices">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={form.invoiceShowBankDetails}
                  onChange={(e) => set('invoiceShowBankDetails', e.target.checked)}
                  style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: '0.9rem' }}>{form.invoiceShowBankDetails ? 'Shown on invoices' : 'Hidden'}</span>
              </label>
            </Field>
            {form.invoiceShowBankDetails && (
              <>
                <Field label="Bank name">
                  <input value={form.invoiceBankName} onChange={(e) => set('invoiceBankName', e.target.value)} placeholder="e.g. Barclays" />
                </Field>
                <Field label="Account name">
                  <input value={form.invoiceAccountName} onChange={(e) => set('invoiceAccountName', e.target.value)} placeholder="Your Business Ltd" />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Sort code">
                    <input value={form.invoiceSortCode} onChange={(e) => set('invoiceSortCode', e.target.value)} placeholder="12-34-56" />
                  </Field>
                  <Field label="Account number">
                    <input value={form.invoiceAccountNumber} onChange={(e) => set('invoiceAccountNumber', e.target.value)} placeholder="12345678" />
                  </Field>
                </div>
              </>
            )}
          </Section>
        </div>

        {/* Right: live preview */}
        <div className="ws-template-preview">
          <p className="ws-preview-label">Preview</p>
          <div className="ws-preview-card" style={{ '--accent': accent }}>
            <div className="ws-prev-top" style={{ borderBottomColor: accent }}>
              <div>
                {logoSrc && <img src={logoSrc} className="ws-prev-logo" alt="" />}
                <div className="ws-prev-name">{workshopName || 'Your Workshop'}</div>
                {form.invoiceVatNumber && <div className="ws-prev-vat">VAT Reg: {form.invoiceVatNumber}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="ws-prev-doctype" style={{ color: accent }}>Invoice</div>
                <div className="ws-prev-ref">INV-001</div>
                <span className="ws-prev-badge" style={{ background: '#dcfce7', color: '#15803d' }}>approved</span>
              </div>
            </div>
            <div className="ws-prev-table-header" style={{ background: accent + '18', borderBottomColor: accent + '40' }}>
              <span style={{ color: accent }}>Description</span>
              <span style={{ color: accent }}>Total</span>
            </div>
            <div className="ws-prev-row"><span>Oil change service</span><span>£45.00</span></div>
            <div className="ws-prev-row"><span>Brake pads (front)</span><span>£120.00</span></div>
            <div className="ws-prev-total"><span>Total</span><span>£198.00</span></div>
            {form.invoiceShowBankDetails && (form.invoiceBankName || form.invoiceAccountNumber) && (
              <div className="ws-prev-bank">
                <div className="ws-prev-bank-title">Bank details</div>
                {form.invoiceBankName && <div>{form.invoiceBankName}</div>}
                {form.invoiceSortCode && <div>Sort: {form.invoiceSortCode}</div>}
                {form.invoiceAccountNumber && <div>Acc: {form.invoiceAccountNumber}</div>}
              </div>
            )}
            <div className="ws-prev-footer">{form.invoiceFooterText || 'Generated by Your Gofer Workshop Management'}</div>
          </div>
        </div>
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'details',     label: 'Workshop Details' },
  { id: 'rates',       label: 'Rates' },
  { id: 'technicians', label: 'Technicians' },
  { id: 'parts',       label: 'Parts Catalogue' },
  { id: 'permissions', label: 'Role Permissions' },
  { id: 'ai',          label: 'AI Features' },
  { id: 'template',    label: 'Invoice Template' },
];

export default function WorkshopSettings({ token, userRole }) {
  const [tab, setTab] = useState('details');

  return (
    <div className="ws-shell">
      <div className="ws-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`ws-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ws-body">
        {tab === 'details'     && <DetailsTab token={token} />}
        {tab === 'rates'       && <RatesTab token={token} />}
        {tab === 'technicians' && <TechniciansTab token={token} />}
        {tab === 'parts'       && <PartsCatalogueTab token={token} />}
        {tab === 'permissions' && <PermissionsTab token={token} />}
        {tab === 'ai'          && <AiFeaturesTab token={token} />}
        {tab === 'template'    && <InvoiceTemplateTab token={token} />}
      </div>
    </div>
  );
}
