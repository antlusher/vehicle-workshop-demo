import { useState, useEffect } from 'react';
import {
  getSysStats, getWorkshops, createWorkshop, updateWorkshop,
  getSysAdmins, createSysAdmin, deleteSysAdmin,
  getWorkshopUsers, createWorkshopUser, updateWorkshopUser, deleteWorkshopUser,
  getBrainEntries, createBrainEntry, updateBrainEntry, deleteBrainEntry,
} from '../services/sysadminApi';

const PLANS = ['starter', 'professional', 'enterprise'];
const AI_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, low cost)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (most capable)' },
];

function fmt(n) { return (n || 0).toLocaleString(); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

// ── Overview stats ────────────────────────────────────────────────────────────
function OverviewPage({ token }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { getSysStats(token).then(setStats).catch(() => {}); }, []);
  if (!stats) return <p className="admin-loading">Loading…</p>;
  return (
    <div>
      <h2 className="admin-page-title">System Overview</h2>
      <div className="sys-stat-grid">
        <div className="sys-stat-card">
          <div className="sys-stat-value">{fmt(stats.workshops.total)}</div>
          <div className="sys-stat-label">Workshops</div>
          <div className="sys-stat-sub">{fmt(stats.workshops.active)} active</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-value">{fmt(stats.users.staff)}</div>
          <div className="sys-stat-label">Workshop staff</div>
          <div className="sys-stat-sub">{fmt(stats.users.customers)} customers</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-value">{fmt(stats.projects.total)}</div>
          <div className="sys-stat-label">Projects</div>
          <div className="sys-stat-sub">{fmt(stats.projects.this_week)} this week</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-value">{fmt(stats.ai.tokens_30d)}</div>
          <div className="sys-stat-label">AI tokens (30 days)</div>
          <div className="sys-stat-sub">{fmt(stats.ai.requests)} total requests</div>
        </div>
        <div className="sys-stat-card">
          <div className="sys-stat-value">{fmt(stats.brain?.total)}</div>
          <div className="sys-stat-label">Global brain entries</div>
          <div className="sys-stat-sub">Shared across all workshops</div>
        </div>
      </div>
    </div>
  );
}

// ── Knowledge Brain page ─────────────────────────────────────────────────────
const BRAIN_CATEGORIES = ['Common Fix', 'DTC Code', 'Vehicle Note', 'Service Interval', 'General', 'procedure'];

function BrainEntryForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    category: initial.category || 'Common Fix',
    make: initial.make || '', model: initial.model || '',
    year_from: initial.year_from || '', year_to: initial.year_to || '',
    fault_code: initial.fault_code || '', title: initial.title || '',
    content: initial.content || '', source: initial.source || 'global_brain',
  });
  const [saving, setSaving] = useState(false);
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((s) => ({ ...s, [k]: e.target.value })) });

  return (
    <div className="kb-form-wrap" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kb-form-row">
          <div className="kb-form-group">
            <label>Category</label>
            <select {...f('category')}>{BRAIN_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="kb-form-group">
            <label>Fault code</label>
            <input {...f('fault_code')} placeholder="P0300" />
          </div>
        </div>
        <div className="kb-form-row">
          <div className="kb-form-group"><label>Make</label><input {...f('make')} placeholder="Ford" /></div>
          <div className="kb-form-group"><label>Model</label><input {...f('model')} placeholder="Focus" /></div>
          <div className="kb-form-group"><label>Year from</label><input {...f('year_from')} placeholder="2015" /></div>
          <div className="kb-form-group"><label>Year to</label><input {...f('year_to')} placeholder="2020" /></div>
        </div>
        <div className="kb-form-group">
          <label>Title <span style={{ color: '#b91c1c' }}>*</span></label>
          <input required {...f('title')} placeholder="EGR valve clogging causing rough idle" />
        </div>
        <div className="kb-form-group">
          <label>Content <span style={{ color: '#b91c1c' }}>*</span></label>
          <textarea rows={5} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', resize: 'vertical' }}
            value={form.content} onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))} />
        </div>
        <div className="kb-form-actions">
          <button disabled={saving} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }}>
            {saving ? 'Saving…' : 'Save entry'}
          </button>
          <button className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BrainPage({ token }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = (params = {}) => getBrainEntries(token, params).then(setEntries).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Knowledge Brain</h2>
        {!showForm && !editingId && <button onClick={() => setShowForm(true)}>+ Add entry</button>}
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 20 }}>
        Global knowledge shared across all workshops during AI diagnosis. The AI automatically draws from these entries alongside each workshop's own knowledge base.
      </p>

      {showForm && (
        <BrainEntryForm
          onSave={async (form) => { await createBrainEntry(form, token); setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingEntry && (
        <BrainEntryForm
          initial={editingEntry}
          onSave={async (form) => { await updateBrainEntry(editingId, form, token); setEditingId(null); load(); }}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0' }}
          placeholder="Search title, content, fault code…" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load({ search, category: filterCat })} />
        <select style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0' }}
          value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {BRAIN_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="secondary" onClick={() => load({ search, category: filterCat })}>Filter</button>
        <button className="secondary" onClick={() => { setSearch(''); setFilterCat(''); load(); }}>Clear</button>
      </div>

      {loading ? <p className="admin-loading">Loading…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Category</th><th>Scope</th><th>Fault code</th><th>Title</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td><span className="badge badge-blue">{e.category}</span></td>
                  <td style={{ fontSize: '0.82rem' }}>{[e.make, e.model, e.year_from && `${e.year_from}${e.year_to ? '–'+e.year_to : '+'}`].filter(Boolean).join(' ') || <span style={{ color: '#9ca3af' }}>Universal</span>}</td>
                  <td>{e.fault_code || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.title}</td>
                  <td style={{ fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(e.updated_at)}</td>
                  <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                    <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => { setEditingId(e.id); setShowForm(false); }}>Edit</button>
                    <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 8px', color: '#dc2626', borderColor: '#dc2626' }}
                      onClick={async () => { if (!window.confirm('Delete this global entry?')) return; await deleteBrainEntry(e.id, token); setEntries((x) => x.filter((i) => i.id !== e.id)); }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No global brain entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sysadmins page ───────────────────────────────────────────────────────────
function SysAdminsPage({ token, currentUserEmail }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = () => getSysAdmins(token).then(setAdmins).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true); setErr('');
    try {
      const u = await createSysAdmin(form, token);
      setAdmins((prev) => [...prev, u]);
      setForm({ email: '', password: '', name: '' });
    } catch (e) { setErr(e.message); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await deleteSysAdmin(id, token);
      setAdmins((prev) => prev.filter((a) => a.id !== id));
    } catch (e) { setErr(e.message); }
    finally { setDeleting(null); }
  };

  return (
    <div>
      <h2 className="admin-page-title">System Administrators</h2>
      <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
        {loading ? <p className="admin-loading">Loading…</p> : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Last login</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td>{a.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={{ fontSize: '0.82rem' }}>{a.email}</td>
                  <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{fmtDate(a.created_at)}</td>
                  <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{fmtDate(a.last_login)}</td>
                  <td>
                    {a.email !== currentUserEmail && (
                      <button
                        className="secondary"
                        style={{ fontSize: '0.75rem', padding: '3px 10px', color: '#dc2626', borderColor: '#dc2626' }}
                        disabled={deleting === a.id}
                        onClick={() => { if (window.confirm(`Remove sysadmin ${a.email}?`)) handleDelete(a.id); }}
                      >
                        {deleting === a.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!admins.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No sysadmins found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {err && <p className="error" style={{ marginBottom: 12 }}>{err}</p>}

      <h3 className="admin-section-title">Add sysadmin</h3>
      <div className="kb-form-wrap">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="kb-form-row">
            <div className="kb-form-group">
              <label>Name</label>
              <input placeholder="Jane Smith" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="kb-form-group">
              <label>Email <span style={{ color: '#b91c1c' }}>*</span></label>
              <input type="email" required value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            </div>
          </div>
          <div className="kb-form-group">
            <label>Password <span style={{ color: '#b91c1c' }}>*</span></label>
            <input type="password" required value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} />
          </div>
          <div className="kb-form-actions">
            <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create sysadmin'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Staff row with inline role edit + delete ─────────────────────────────────
function StaffRow({ user, workshopId, token, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveRole = async () => {
    setSaving(true);
    try {
      const updated = await updateWorkshopUser(workshopId, user.id, { role }, token);
      onUpdated(updated);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove ${user.email} from this workshop?`)) return;
    setDeleting(true);
    try {
      await deleteWorkshopUser(workshopId, user.id, token);
      onDeleted(user.id);
    } finally { setDeleting(false); }
  };

  return (
    <tr>
      <td>{user.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
      <td style={{ fontSize: '0.82rem' }}>{user.email}</td>
      <td>
        {editing ? (
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: '0.8rem', padding: '2px 6px' }}>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="tech">Tech</option>
          </select>
        ) : (
          <span className={`sys-role-badge sys-role-badge--${user.role}`}>{user.role}</span>
        )}
      </td>
      <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{fmtDate(user.last_login)}</td>
      <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
        {editing ? (
          <>
            <button style={{ fontSize: '0.72rem', padding: '2px 8px' }} disabled={saving} onClick={handleSaveRole}>
              {saving ? '…' : 'Save'}
            </button>
            <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => { setEditing(false); setRole(user.role); }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="secondary" style={{ fontSize: '0.72rem', padding: '2px 8px', color: '#dc2626', borderColor: '#dc2626' }}
              disabled={deleting} onClick={handleDelete}>
              {deleting ? '…' : 'Remove'}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

// ── Workshop detail panel ─────────────────────────────────────────────────────
function WorkshopDetail({ workshop, token, onClose, onUpdated }) {
  const [tab, setTab] = useState('config');
  const [form, setForm] = useState({
    name: workshop.name || '',
    slug: workshop.slug || '',
    plan: workshop.plan || 'professional',
    aiModel: workshop.ai_model || 'claude-haiku-4-5-20251001',
    aiMonthlyTokenLimit: workshop.ai_monthly_token_limit || 100000,
    active: workshop.active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'owner' });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  useEffect(() => {
    if (tab === 'staff') {
      setLoadingUsers(true);
      getWorkshopUsers(workshop.id, token).then(setUsers).finally(() => setLoadingUsers(false));
    }
  }, [tab, workshop.id]);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      const updated = await updateWorkshop(workshop.id, form, token);
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const u = await createWorkshopUser(workshop.id, newUser, token);
      setUsers((prev) => [...prev, u]);
      setNewUser({ email: '', password: '', name: '', role: 'owner' });
    } catch (err) { setCreateErr(err.message); }
    finally { setCreating(false); }
  };

  const f = (key) => ({ value: form[key], onChange: (e) => setForm((s) => ({ ...s, [key]: e.target.value })) });

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>✕</button>
      <h3 className="detail-title">{workshop.name}</h3>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 14 }}>
        ID: <code style={{ fontSize: '0.72rem' }}>{workshop.id}</code>
      </p>

      <div className="cust-detail-tabs">
        {[{id:'config',label:'Config'},{id:'ai',label:'AI & Plan'},{id:'staff',label:'Staff'}].map((t) => (
          <button key={t.id} className={`cust-detail-tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kb-form-group">
              <label>Workshop name</label>
              <input {...f('name')} placeholder="Acme Auto" />
            </div>
            <div className="kb-form-group">
              <label>Slug <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>(URL identifier)</span></label>
              <input {...f('slug')} placeholder="acme-auto" />
            </div>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Status</label>
                <select value={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Suspended</option>
                </select>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save config'}
            </button>
          </div>
        )}

        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kb-form-group">
              <label>Plan</label>
              <select {...f('plan')}>
                {PLANS.map((p) => {
                  const seats = { starter: 3, professional: 10, enterprise: 0 }[p];
                  const label = `${p.charAt(0).toUpperCase()+p.slice(1)} — ${seats === 0 ? 'Unlimited' : seats} seats`;
                  return <option key={p} value={p}>{label}</option>;
                })}
              </select>
            </div>
            <div className="kb-form-group">
              <label>AI model</label>
              <select {...f('aiModel')}>
                {AI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="kb-form-group">
              <label>Monthly token limit</label>
              <input type="number" min="0" step="10000"
                value={form.aiMonthlyTokenLimit}
                onChange={(e) => setForm((s) => ({ ...s, aiMonthlyTokenLimit: parseInt(e.target.value) || 0 }))}
              />
              <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '4px 0 0' }}>0 = unlimited</p>
            </div>
            <button onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save AI config'}
            </button>
          </div>
        )}

        {tab === 'staff' && (
          <div>
            {loadingUsers ? <p className="admin-loading">Loading…</p> : (
              <div className="admin-table-wrap" style={{ marginBottom: 20 }}>
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <StaffRow
                        key={u.id}
                        user={u}
                        workshopId={workshop.id}
                        token={token}
                        onUpdated={(updated) => setUsers((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
                        onDeleted={(id) => setUsers((prev) => prev.filter((x) => x.id !== id))}
                      />
                    ))}
                    {!users.length && <tr><td colSpan={5} style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>No staff yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <h4 className="detail-section">Add staff account</h4>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="kb-form-row">
                <div className="kb-form-group">
                  <label>Name</label>
                  <input value={newUser.name} onChange={(e) => setNewUser((s) => ({ ...s, name: e.target.value }))} placeholder="Jane Smith" />
                </div>
                <div className="kb-form-group">
                  <label>Role</label>
                  <select value={newUser.role} onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value }))}>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="tech">Tech</option>
                  </select>
                </div>
              </div>
              <div className="kb-form-group">
                <label>Email</label>
                <input type="email" required value={newUser.email} onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))} />
              </div>
              <div className="kb-form-group">
                <label>Temporary password</label>
                <input type="password" required value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} />
              </div>
              {createErr && <p className="error" style={{ margin: 0 }}>{createErr}</p>}
              <button type="submit" disabled={creating} style={{ alignSelf: 'flex-start' }}>
                {creating ? 'Creating…' : 'Create account'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workshops list page ───────────────────────────────────────────────────────
function WorkshopsPage({ token }) {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const PLAN_SEATS = { starter: 3, professional: 10, enterprise: 'Unlimited' };
  const [form, setForm] = useState({ name: '', slug: '', plan: 'professional', ownerEmail: '', ownerPassword: '', ownerName: '' });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const load = () => getWorkshops(token).then(setWorkshops).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const ws = await createWorkshop({ name: form.name, slug: form.slug || undefined, plan: form.plan }, token);
      if (form.ownerEmail && form.ownerPassword) {
        await createWorkshopUser(ws.id, {
          email: form.ownerEmail,
          password: form.ownerPassword,
          name: form.ownerName || undefined,
          role: 'owner',
        }, token);
      }
      setWorkshops((prev) => [ws, ...prev]);
      setForm({ name: '', slug: '', plan: 'professional', ownerEmail: '', ownerPassword: '', ownerName: '' });
      setShowCreate(false);
      setShowCreate(false);
    } catch (err) { setCreateErr(err.message); }
    finally { setCreating(false); }
  };

  const ff = (key) => ({ value: form[key], onChange: (e) => setForm((s) => ({ ...s, [key]: e.target.value })) });

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Workshops</h2>
        <button onClick={() => setShowCreate((s) => !s)}>{showCreate ? 'Cancel' : '+ New workshop'}</button>
      </div>

      {showCreate && (
        <div className="kb-form-wrap" style={{ marginBottom: 20 }}>
          <h3 className="admin-section-title" style={{ marginTop: 0 }}>Onboard new workshop</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Workshop name <span style={{ color: '#b91c1c' }}>*</span></label>
                <input required placeholder="Acme Auto" {...ff('name')} />
              </div>
              <div className="kb-form-group">
                <label>Plan</label>
                <select {...ff('plan')}>
                  {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="kb-form-group">
              <label>Slug <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>(optional, auto-generated if blank)</span></label>
              <input placeholder="acme-auto" {...ff('slug')} />
            </div>
            <h4 className="admin-section-title" style={{ marginTop: 8, marginBottom: 4 }}>Initial owner account</h4>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Manager name</label>
                <input placeholder="Jane Smith" {...ff('ownerName')} />
              </div>
              <div className="kb-form-group">
                <label>Manager email</label>
                <input type="email" placeholder="jane@acmeauto.co.uk" {...ff('ownerEmail')} />
              </div>
            </div>
            <div className="kb-form-group">
              <label>Temporary password</label>
              <input type="password" placeholder="They can change this on first login" {...ff('ownerPassword')} />
            </div>
            {createErr && <p className="error">{createErr}</p>}
            <div className="kb-form-actions">
              <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create workshop'}</button>
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
                  <tr><th>Name</th><th>Plan</th><th>Staff</th><th>Projects</th><th>Customers</th><th>Status</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {workshops.map((w) => (
                    <tr key={w.id} className={`admin-table-row${selected?.id===w.id?' admin-table-row--active':''}`}>
                      <td style={{ fontWeight: 600 }}>{w.name}</td>
                      <td><span className={`sys-plan-badge sys-plan-badge--${w.plan}`}>{w.plan}</span></td>
                      <td style={{ textAlign: 'center' }}>{w.staff_count || 0}</td>
                      <td style={{ textAlign: 'center' }}>{w.project_count || 0}</td>
                      <td style={{ textAlign: 'center' }}>{w.customer_count || 0}</td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: w.active ? '#16a34a' : '#dc2626' }}>
                          {w.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(w.created_at)}</td>
                      <td>
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 12px' }}
                          onClick={() => setSelected(selected?.id===w.id ? null : w)}>
                          {selected?.id===w.id ? 'Close' : 'Manage'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!workshops.length && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No workshops yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected && (
          <WorkshopDetail
            workshop={selected} token={token}
            onClose={() => setSelected(null)}
            onUpdated={(updated) => {
              setWorkshops((ws) => ws.map((w) => w.id === updated.id ? { ...w, ...updated } : w));
              setSelected((s) => ({ ...s, ...updated }));
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',   label: 'Overview' },
  { id: 'workshops',  label: 'Workshops' },
  { id: 'brain',      label: 'Knowledge Brain' },
  { id: 'sysadmins', label: 'Sysadmins' },
];

export default function SysAdminShell({ token, userEmail, onLogout }) {
  const [page, setPage] = useState('overview');

  return (
    <div className="sys-shell">
      <header className="sys-header">
        <div className="sys-header-left">
          <span className="sys-brand">Ask Bob</span>
          <span className="sys-brand-sub">System Admin</span>
        </div>
        <nav className="sys-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`sys-nav-btn${page===n.id?' active':''}`} onClick={() => setPage(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sys-header-right">
          <span className="sys-user">{userEmail}</span>
          <button className="secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main className="sys-content">
        {page === 'overview'   && <OverviewPage token={token} />}
        {page === 'workshops'  && <WorkshopsPage token={token} />}
        {page === 'brain'      && <BrainPage token={token} />}
        {page === 'sysadmins' && <SysAdminsPage token={token} currentUserEmail={userEmail} />}
      </main>
    </div>
  );
}
