import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import {
  getSysStats, getWorkshops, createWorkshop, updateWorkshop,
  getSysAdmins, createSysAdmin, deleteSysAdmin,
  getWorkshopUsers, createWorkshopUser, updateWorkshopUser, deleteWorkshopUser,
  getBrainEntries, createBrainEntry, updateBrainEntry, deleteBrainEntry,
  getWorkshopAnalytics,
  actAs,
  getTraces, getTraceStats, getTrace, evaluateTrace, evaluatePending, getKbQuality,
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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = (params = {}) => getBrainEntries(token, params).then(setEntries).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;
  const modalOpen = showForm || !!editingEntry;
  const closeModal = () => { setShowForm(false); setEditingId(null); };

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Knowledge Brain</h2>
        <button onClick={() => { setShowForm(true); setEditingId(null); }}>+ Add entry</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 20 }}>
        Global knowledge shared across all workshops during AI diagnosis. The AI automatically draws from these entries alongside each workshop's own knowledge base.
      </p>

      {modalOpen && (
        <div className="preview-overlay" onClick={closeModal}>
          <div className="preview-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>{editingEntry ? 'Edit brain entry' : 'New brain entry'}</h3>
              <button className="preview-close" onClick={closeModal}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
              {showForm && (
                <BrainEntryForm
                  onSave={async (form) => { await createBrainEntry(form, token); closeModal(); load(); }}
                  onCancel={closeModal}
                />
              )}
              {editingEntry && (
                <BrainEntryForm
                  initial={editingEntry}
                  onSave={async (form) => { await updateBrainEntry(editingId, form, token); closeModal(); load(); }}
                  onCancel={closeModal}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete brain entry"
        message="Delete this global knowledge entry? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await deleteBrainEntry(confirmDeleteId, token); setEntries((x) => x.filter((i) => i.id !== confirmDeleteId)); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />

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
                      onClick={() => setConfirmDeleteId(e.id)}>
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
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

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
                        onClick={() => setConfirmRemoveId(a.id)}
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

      <ConfirmDialog
        open={!!confirmRemoveId}
        title="Remove sysadmin"
        message={`Remove ${admins.find((a) => a.id === confirmRemoveId)?.email} as a system administrator?`}
        confirmLabel="Remove"
        danger
        onConfirm={() => { handleDelete(confirmRemoveId); setConfirmRemoveId(null); }}
        onCancel={() => setConfirmRemoveId(null)}
      />

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

function fmtRelative(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

function ActivityTab({ workshopId, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getWorkshopAnalytics(workshopId, token).then(setData).finally(() => setLoading(false));
  }, [workshopId]);

  if (loading) return <p className="admin-loading">Loading…</p>;
  if (!data) return <p style={{ color: '#dc2626' }}>Failed to load analytics.</p>;

  const { chatModes, dailyAi, recentLogins, topContributors } = data;
  const totalRequests = chatModes.reduce((s, r) => s + r.requests, 0);
  const totalTokens = chatModes.reduce((s, r) => s + r.tokens, 0);

  const modeLabels = { diagnose: 'Diagnose', howto: 'How-to', workshop: 'Workshop' };
  const modeColors = { diagnose: '#3b82f6', howto: '#10b981', workshop: '#f59e0b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px' }}>AI FEATURE USAGE — LAST 30 DAYS</p>
        {chatModes.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No AI activity yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chatModes.map((r) => {
              const pct = totalRequests > 0 ? Math.round((r.requests / totalRequests) * 100) : 0;
              const color = modeColors[r.chat_mode] || '#6b7280';
              return (
                <div key={r.chat_mode}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600 }}>{modeLabels[r.chat_mode] || r.chat_mode}</span>
                    <span style={{ color: '#94a3b8' }}>{r.requests} requests · {(r.tokens / 1000).toFixed(1)}k tokens</span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
              Total: {totalRequests.toLocaleString()} requests · {(totalTokens / 1000).toFixed(1)}k tokens
            </p>
          </div>
        )}
      </div>

      <div>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px' }}>STAFF · KB CONTRIBUTIONS</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {topContributors.map((u) => (
            <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
              <span>{u.name || u.email} <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>({u.role})</span></span>
              <span style={{ color: u.kb_count > 0 ? '#10b981' : '#6b7280', fontWeight: 600 }}>{u.kb_count} entries</span>
            </div>
          ))}
          {!topContributors.length && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No staff yet.</p>}
        </div>
      </div>

      <div>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px' }}>RECENT LOGINS</p>
        {recentLogins.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No login history.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ fontSize: '0.78rem' }}>
              <thead><tr><th>User</th><th>Role</th><th>When</th><th>IP</th></tr></thead>
              <tbody>
                {recentLogins.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name || l.email}</td>
                    <td><span className={`sys-role-badge sys-role-badge--${l.role}`}>{l.role}</span></td>
                    <td style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtRelative(l.created_at)}</td>
                    <td style={{ color: '#6b7280' }}>{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="detail-title" style={{ margin: 0 }}>{workshop.name}</h3>
        <button className="preview-close" onClick={onClose}>✕</button>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 14 }}>
        ID: <code style={{ fontSize: '0.72rem' }}>{workshop.id}</code>
      </p>

      <div className="cust-detail-tabs">
        {[{id:'config',label:'Config'},{id:'ai',label:'AI & Plan'},{id:'staff',label:'Staff'},{id:'activity',label:'Activity'}].map((t) => (
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

        {tab === 'activity' && (
          <ActivityTab workshopId={workshop.id} token={token} />
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
function WorkshopsPage({ token, onActAs }) {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const PLAN_SEATS = { starter: 3, professional: 10, enterprise: 'Unlimited' };
  const [form, setForm] = useState({ name: '', slug: '', plan: 'professional', ownerEmail: '', ownerPassword: '', ownerName: '' });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [actingAs, setActingAs] = useState(null);

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
        <button onClick={() => setShowCreate(true)}>+ New workshop</button>
      </div>

      {showCreate && (
        <div className="preview-overlay" onClick={() => setShowCreate(false)}>
          <div className="preview-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>Onboard new workshop</h3>
              <button className="preview-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
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
                  <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div>
        {loading ? <p className="admin-loading">Loading…</p> : (() => {
          const maxAi = Math.max(...workshops.map((w) => w.ai_requests_30d || 0), 0);
          const maxKb = Math.max(...workshops.map((w) => w.kb_entries || 0), 0);
          return (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Workshop</th><th>Plan</th><th>Staff</th><th>Projects</th><th>AI 30d</th><th>KB</th><th>Last active</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {workshops.map((w) => {
                  const tags = [];
                  if (maxAi > 0 && w.ai_requests_30d === maxAi) tags.push({ label: 'Most Active', color: '#3b82f6' });
                  if (maxKb > 0 && w.kb_entries === maxKb) tags.push({ label: 'Top Contributor', color: '#10b981' });
                  const lastActivity = w.last_ai_at || w.last_login_at;
                  const recentMs = lastActivity ? Date.now() - new Date(lastActivity).getTime() : null;
                  const isLive = recentMs !== null && recentMs < 60 * 60 * 1000;
                  return (
                  <tr key={w.id} className={`admin-table-row${selected?.id===w.id?' admin-table-row--active':''}`}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{w.name}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                        {isLive && <span style={{ fontSize: '0.65rem', background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>● LIVE</span>}
                        {tags.map((t) => (
                          <span key={t.label} style={{ fontSize: '0.65rem', background: t.color, color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>{t.label}</span>
                        ))}
                      </div>
                    </td>
                    <td><span className={`sys-plan-badge sys-plan-badge--${w.plan}`}>{w.plan}</span></td>
                    <td style={{ textAlign: 'center' }}>{w.staff_count || 0}</td>
                    <td style={{ textAlign: 'center' }}>{w.project_count || 0}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: w.ai_requests_30d > 0 ? '#e2e8f0' : '#6b7280' }}>{(w.ai_requests_30d || 0).toLocaleString()}</span>
                      {w.tokens_30d > 0 && <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{(w.tokens_30d / 1000).toFixed(0)}k tok</div>}
                    </td>
                    <td style={{ textAlign: 'center', color: w.kb_entries > 0 ? '#e2e8f0' : '#6b7280' }}>{w.kb_entries || 0}</td>
                    <td style={{ fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {lastActivity ? fmtRelative(lastActivity) : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: w.active ? '#16a34a' : '#dc2626' }}>
                        {w.active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 12px' }}
                        onClick={() => setSelected(selected?.id===w.id ? null : w)}>
                        {selected?.id===w.id ? 'Close' : 'Manage'}
                      </button>
                      <button
                        className="secondary"
                        style={{ fontSize: '0.75rem', padding: '3px 12px', color: '#7c3aed', borderColor: '#7c3aed' }}
                        disabled={actingAs === w.id}
                        onClick={async () => {
                          setActingAs(w.id);
                          try {
                            const result = await actAs(w.id, token);
                            onActAs({ token: result.token, workshopName: result.workshopName });
                          } catch (e) { alert(e.message); }
                          finally { setActingAs(null); }
                        }}
                      >
                        {actingAs === w.id ? '…' : 'Act as'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {!workshops.length && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No workshops yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          );
        })()}
      </div>

      {selected && (
        <div className="preview-overlay" onClick={() => setSelected(null)}>
          <div className="preview-modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-body" style={{ padding: 0 }}>
              <WorkshopDetail
                workshop={selected} token={token}
                onClose={() => setSelected(null)}
                onUpdated={(updated) => {
                  setWorkshops((ws) => ws.map((w) => w.id === updated.id ? { ...w, ...updated } : w));
                  setSelected((s) => ({ ...s, ...updated }));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RAG Eval ──────────────────────────────────────────────────────────────────
const VERDICT_COLOR = { pass: '#16a34a', partial: '#d97706', fail: '#dc2626' };
const MODE_COLOR = { diagnose: '#3b82f6', howto: '#10b981', workshop: '#f59e0b' };

function ScoreBar({ value, color = '#3b82f6' }) {
  if (value == null) return <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>—</span>;
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

function TraceDetail({ trace, token, onEvaluated }) {
  const [evaluating, setEvaluating] = useState(false);
  const [err, setErr] = useState('');
  const vc = trace.vehicle_context || {};
  const chunks = trace.kb_chunks_retrieved || [];
  const tools = trace.tool_calls || [];

  const handleEvaluate = async () => {
    setEvaluating(true); setErr('');
    try {
      await evaluateTrace(trace.id, token);
      onEvaluated();
    } catch (e) { setErr(e.message); }
    finally { setEvaluating(false); }
  };

  return (
    <div className="rag-detail">
      <div className="rag-detail-meta">
        <span className="rag-mode-badge" style={{ background: MODE_COLOR[trace.chat_mode] || '#6b7280' }}>
          {trace.chat_mode || '—'}
        </span>
        {trace.workshop_name && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{trace.workshop_name}</span>}
        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{fmtDate(trace.created_at)}</span>
        {trace.latency_ms && <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{(trace.latency_ms / 1000).toFixed(1)}s</span>}
        {trace.tokens_used && <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{trace.tokens_used.toLocaleString()} tok</span>}
      </div>

      {(vc.make || vc.model) && (
        <p className="rag-vehicle">
          {[vc.year, vc.make, vc.model, vc.engineCode ? `(${vc.engineCode})` : null].filter(Boolean).join(' ')}
        </p>
      )}

      <div className="rag-section-label">QUESTION</div>
      <p className="rag-question-full">{trace.question}</p>

      <div className="rag-section-label">KB CHUNKS RETRIEVED ({chunks.length})</div>
      {chunks.length === 0
        ? <p className="rag-empty">None — AI used training knowledge only</p>
        : chunks.map((c, i) => (
          <div key={i} className="rag-chunk">
            <div className="rag-chunk-title">{c.title || 'Untitled'} {c.source && <span className="rag-chunk-source">{c.source}</span>}</div>
            <p className="rag-chunk-content">{c.content}</p>
          </div>
        ))
      }

      <div className="rag-section-label">TOOL CALLS ({tools.length})</div>
      {tools.length === 0
        ? <p className="rag-empty">None</p>
        : tools.map((t, i) => (
          <div key={i} className="rag-tool">
            <div className="rag-tool-name">{t.tool}</div>
            <div className="rag-tool-io">
              <div><span className="rag-io-label">IN</span> <code>{JSON.stringify(t.input)}</code></div>
              <div><span className="rag-io-label">OUT</span> <code>{JSON.stringify(t.output).slice(0, 300)}{JSON.stringify(t.output).length > 300 ? '…' : ''}</code></div>
            </div>
          </div>
        ))
      }

      <div className="rag-section-label">RESPONSE</div>
      <pre className="rag-response">{trace.response}</pre>

      <div className="rag-section-label">EVALUATION</div>
      {trace.verdict ? (
        <div className="rag-scores">
          <div className="rag-score-row">
            <span>Faithfulness</span>
            <ScoreBar value={trace.faithfulness} color="#3b82f6" />
          </div>
          <div className="rag-score-row">
            <span>Answer relevancy</span>
            <ScoreBar value={trace.answer_relevancy} color="#10b981" />
          </div>
          <div className="rag-score-row">
            <span>Context precision</span>
            <ScoreBar value={trace.context_precision} color="#f59e0b" />
          </div>
          <div className="rag-score-row">
            <span>Verdict</span>
            <span style={{ fontWeight: 700, color: VERDICT_COLOR[trace.verdict] || '#94a3b8' }}>
              {trace.verdict?.toUpperCase()}
            </span>
          </div>
          {trace.judge_notes && <p className="rag-judge-notes">{trace.judge_notes}</p>}
          <button className="secondary" style={{ fontSize: '0.75rem', marginTop: 8 }} onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? 'Re-evaluating…' : 'Re-evaluate'}
          </button>
        </div>
      ) : (
        <div>
          <p className="rag-empty">Not yet evaluated</p>
          {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
          <button style={{ fontSize: '0.8rem' }} onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? 'Evaluating…' : 'Evaluate with AI judge'}
          </button>
        </div>
      )}
    </div>
  );
}

function RagStatsBar({ stats }) {
  if (!stats) return null;
  const { totals, verdicts } = stats;
  const passCount   = verdicts.find((v) => v.verdict === 'pass')?.count || 0;
  const partialCount = verdicts.find((v) => v.verdict === 'partial')?.count || 0;
  const failCount   = verdicts.find((v) => v.verdict === 'fail')?.count || 0;

  return (
    <div className="rag-stats-bar">
      <div className="rag-stat"><div className="rag-stat-val">{parseInt(totals.total).toLocaleString()}</div><div className="rag-stat-lbl">Total traces</div></div>
      <div className="rag-stat"><div className="rag-stat-val">{parseInt(totals.evaluated).toLocaleString()}</div><div className="rag-stat-lbl">Evaluated</div></div>
      <div className="rag-stat"><div className="rag-stat-val" style={{ color: '#16a34a' }}>{passCount}</div><div className="rag-stat-lbl">Pass</div></div>
      <div className="rag-stat"><div className="rag-stat-val" style={{ color: '#d97706' }}>{partialCount}</div><div className="rag-stat-lbl">Partial</div></div>
      <div className="rag-stat"><div className="rag-stat-val" style={{ color: '#dc2626' }}>{failCount}</div><div className="rag-stat-lbl">Fail</div></div>
      <div className="rag-stat"><div className="rag-stat-val">{totals.avg_faithfulness != null ? Math.round(totals.avg_faithfulness * 100) + '%' : '—'}</div><div className="rag-stat-lbl">Avg faithfulness</div></div>
      <div className="rag-stat"><div className="rag-stat-val">{totals.avg_relevancy != null ? Math.round(totals.avg_relevancy * 100) + '%' : '—'}</div><div className="rag-stat-lbl">Avg relevancy</div></div>
      <div className="rag-stat"><div className="rag-stat-val">{totals.avg_precision != null ? Math.round(totals.avg_precision * 100) + '%' : '—'}</div><div className="rag-stat-lbl">Avg ctx precision</div></div>
    </div>
  );
}

function TracesTab({ token, workshops }) {
  const [traces, setTraces] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedFull, setSelectedFull] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [evaluatingAll, setEvaluatingAll] = useState(false);
  const [filters, setFilters] = useState({ workshop_id: '', chat_mode: '', verdict: '', limit: 50, offset: 0 });

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      const [data, s] = await Promise.all([getTraces(params, token), getTraceStats(token)]);
      setTraces(data.traces);
      setTotal(data.total);
      setStats(s);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleEvaluateAll = async () => {
    setEvaluatingAll(true);
    try { await evaluatePending(20, token); await load(); }
    finally { setEvaluatingAll(false); }
  };

  const f = (key) => (e) => setFilters((s) => ({ ...s, [key]: e.target.value, offset: 0 }));

  return (
    <div className="rag-layout">
      <div className={`rag-list${selected ? ' rag-list--narrow' : ''}`}>
        <RagStatsBar stats={stats} />

        <div className="rag-toolbar">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <select style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '0.8rem' }}
              value={filters.chat_mode} onChange={f('chat_mode')}>
              <option value="">All modes</option>
              <option value="diagnose">Diagnose</option>
              <option value="howto">How-to</option>
              <option value="workshop">Workshop</option>
            </select>
            <select style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '0.8rem' }}
              value={filters.verdict} onChange={f('verdict')}>
              <option value="">All verdicts</option>
              <option value="pass">Pass</option>
              <option value="partial">Partial</option>
              <option value="fail">Fail</option>
            </select>
            <select style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '0.8rem' }}
              value={filters.workshop_id} onChange={f('workshop_id')}>
              <option value="">All workshops</option>
              {(workshops || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }} onClick={() => load()}>Filter</button>
            <button className="secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }}
              onClick={() => { const reset = { workshop_id: '', chat_mode: '', verdict: '', limit: 50, offset: 0 }; setFilters(reset); load(reset); }}>
              Clear
            </button>
          </div>
          <button style={{ fontSize: '0.78rem', padding: '5px 14px' }} onClick={handleEvaluateAll} disabled={evaluatingAll}>
            {evaluatingAll ? 'Evaluating…' : 'Evaluate pending (20)'}
          </button>
        </div>

        {loading ? <p className="admin-loading">Loading…</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table rag-table">
              <thead>
                <tr><th>When</th><th>Workshop</th><th>Mode</th><th>Question</th><th>Chunks</th><th>Verdict</th><th>Faithful</th><th>Relevant</th><th>Ctx prec</th></tr>
              </thead>
              <tbody>
                {traces.map((t) => (
                  <tr key={t.id} className={`admin-table-row${selected?.id === t.id ? ' admin-table-row--active' : ''}`}
                    onClick={() => {
                      if (selected?.id === t.id) { setSelected(null); setSelectedFull(null); return; }
                      setSelected(t); setSelectedFull(null); setLoadingDetail(true);
                      getTrace(t.id, token).then(setSelectedFull).finally(() => setLoadingDetail(false));
                    }} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#9ca3af' }}>{fmtRelative(t.created_at)}</td>
                    <td style={{ fontSize: '0.78rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.workshop_name || <span style={{ color: '#6b7280' }}>—</span>}</td>
                    <td><span className="rag-mode-badge" style={{ background: MODE_COLOR[t.chat_mode] || '#6b7280', fontSize: '0.7rem' }}>{t.chat_mode || '—'}</span></td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.question}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.78rem', color: (t.kb_chunks_retrieved?.length || 0) > 0 ? '#e2e8f0' : '#6b7280' }}>
                      {t.kb_chunks_retrieved?.length || 0}
                    </td>
                    <td>
                      {t.verdict
                        ? <span style={{ fontWeight: 700, fontSize: '0.72rem', color: VERDICT_COLOR[t.verdict] }}>{t.verdict.toUpperCase()}</span>
                        : <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>pending</span>}
                    </td>
                    <td><ScoreBar value={t.faithfulness} color="#3b82f6" /></td>
                    <td><ScoreBar value={t.answer_relevancy} color="#10b981" /></td>
                    <td><ScoreBar value={t.context_precision} color="#f59e0b" /></td>
                  </tr>
                ))}
                {!traces.length && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No traces yet. Traces are captured automatically for every AI query.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {total > filters.limit && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
            <button className="secondary" style={{ fontSize: '0.75rem' }}
              disabled={filters.offset === 0}
              onClick={() => { const f = { ...filters, offset: Math.max(0, filters.offset - filters.limit) }; setFilters(f); load(f); }}>
              Prev
            </button>
            <span>{filters.offset + 1}–{Math.min(filters.offset + filters.limit, total)} of {total}</span>
            <button className="secondary" style={{ fontSize: '0.75rem' }}
              disabled={filters.offset + filters.limit >= total}
              onClick={() => { const f = { ...filters, offset: filters.offset + filters.limit }; setFilters(f); load(f); }}>
              Next
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div className="rag-detail-panel">
          <button className="detail-close" onClick={() => { setSelected(null); setSelectedFull(null); }}>✕</button>
          {loadingDetail
            ? <p className="admin-loading">Loading trace…</p>
            : <TraceDetail trace={selectedFull || selected} token={token} onEvaluated={() => { load(); getTrace(selected.id, token).then(setSelectedFull); }} />
          }
        </div>
      )}
    </div>
  );
}

const ISSUE_LABELS = {
  too_short: 'Too short',
  too_long: 'Too long',
  no_fts_index: 'No FTS index',
  unscoped: 'Unscoped',
  duplicate_title: 'Duplicate title',
};
const ISSUE_COLOR = {
  too_short: '#d97706', too_long: '#d97706', no_fts_index: '#dc2626',
  unscoped: '#7c3aed', duplicate_title: '#6b7280',
};

function KbQualityTab({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterIssue, setFilterIssue] = useState('');

  useEffect(() => {
    getKbQuality(token).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="admin-loading">Scanning knowledge base…</p>;
  if (!data) return null;

  const { summary, flagged, byWorkshop } = data;
  const shown = filterIssue ? flagged.filter((r) => r.issue === filterIssue) : flagged;

  return (
    <div>
      <div className="rag-stats-bar" style={{ marginBottom: 20 }}>
        <div className="rag-stat"><div className="rag-stat-val">{summary.total.toLocaleString()}</div><div className="rag-stat-lbl">Total entries</div></div>
        <div className="rag-stat"><div className="rag-stat-val" style={{ color: '#16a34a' }}>{summary.clean.toLocaleString()}</div><div className="rag-stat-lbl">Clean</div></div>
        <div className="rag-stat"><div className="rag-stat-val" style={{ color: '#dc2626' }}>{summary.issues.toLocaleString()}</div><div className="rag-stat-lbl">Flagged</div></div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 10 }}>BY WORKSHOP</p>
          {byWorkshop.map((w) => (
            <div key={w.workshopId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e293b', fontSize: '0.82rem' }}>
              <span>{w.workshopName}</span>
              <span>{w.total} entries · <span style={{ color: w.issues > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{w.issues} issues</span></span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>FLAGGED ENTRIES</p>
        <select style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: '0.78rem' }}
          value={filterIssue} onChange={(e) => setFilterIssue(e.target.value)}>
          <option value="">All issues</option>
          {Object.entries(ISSUE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Issue</th><th>Workshop</th><th>Title</th><th>Source</th><th>Chars</th><th>Created</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><span style={{ fontWeight: 700, fontSize: '0.72rem', color: ISSUE_COLOR[r.issue] || '#94a3b8' }}>{ISSUE_LABELS[r.issue] || r.issue}</span></td>
                <td style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{r.workshop_name || 'Global'}</td>
                <td style={{ fontSize: '0.82rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>{r.source || '—'}</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'right', color: (r.content_length < 80 || r.content_length > 6000) ? '#d97706' : '#9ca3af' }}>{r.content_length?.toLocaleString()}</td>
                <td style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No flagged entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RagEvalPage({ token, workshops }) {
  const [tab, setTab] = useState('traces');
  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>RAG Evaluation</h2>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
        Every AI query is traced automatically. Use the AI judge to score faithfulness, answer relevancy, and context precision — the same metrics as Ragas.
      </p>
      <div className="cust-detail-tabs" style={{ marginBottom: 20 }}>
        <button className={`cust-detail-tab${tab === 'traces' ? ' active' : ''}`} onClick={() => setTab('traces')}>Traces</button>
        <button className={`cust-detail-tab${tab === 'kb' ? ' active' : ''}`} onClick={() => setTab('kb')}>KB Data Quality</button>
      </div>
      {tab === 'traces' && <TracesTab token={token} workshops={workshops} />}
      {tab === 'kb' && <KbQualityTab token={token} />}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',  label: 'Overview',  Icon: DashboardRoundedIcon },
  { id: 'workshops', label: 'Workshops', Icon: StoreRoundedIcon },
  { id: 'brain',     label: 'Brain',     Icon: PsychologyRoundedIcon },
  { id: 'sysadmins', label: 'Admins',    Icon: AdminPanelSettingsRoundedIcon },
  { id: 'rageval',   label: 'RAG Eval',  Icon: AssessmentRoundedIcon },
];

function NavRail({ page, setPage, userEmail, onLogout }) {
  return (
    <nav className="app-nav-rail">
      <div className="nav-rail-brand">Ask<br />Bob</div>

      <div className="nav-rail-items">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} type="button"
            className={`nav-rail-item${page === id ? ' active' : ''}`}
            onClick={() => setPage(id)}>
            <div className="nav-rail-pill">
              <Icon style={{ fontSize: 22 }} />
            </div>
            <span className="nav-rail-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="nav-rail-footer">
        {userEmail && <div className="nav-rail-email">{userEmail}</div>}
        <button type="button" className="nav-rail-item" onClick={onLogout}>
          <div className="nav-rail-pill">
            <LogoutRoundedIcon style={{ fontSize: 20 }} />
          </div>
          <span className="nav-rail-label">Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default function SysAdminShell({ token, userEmail, onLogout, onActAs }) {
  const [page, setPage] = useState('overview');
  const [workshops, setWorkshops] = useState([]);

  useEffect(() => {
    import('../services/sysadminApi').then(({ getWorkshops }) =>
      getWorkshops(token).then(setWorkshops).catch(() => {})
    );
  }, [token]);

  return (
    <div className="main-shell">
      <NavRail page={page} setPage={setPage} userEmail={userEmail} onLogout={onLogout} />
      <main className="sys-content">
        {page === 'overview'   && <OverviewPage token={token} />}
        {page === 'workshops'  && <WorkshopsPage token={token} onActAs={onActAs} />}
        {page === 'brain'      && <BrainPage token={token} />}
        {page === 'sysadmins' && <SysAdminsPage token={token} currentUserEmail={userEmail} />}
        {page === 'rageval'    && <RagEvalPage token={token} workshops={workshops} />}
      </main>
    </div>
  );
}
