import { useState, useEffect } from 'react';
import { getSysStats, getWorkshops, createWorkshop, updateWorkshop, getWorkshopUsers, createWorkshopUser } from '../services/sysadminApi';

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
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'manager' });
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
      setNewUser({ email: '', password: '', name: '', role: 'manager' });
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
                {PLANS.map((p) => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
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
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                        <td style={{ fontSize: '0.82rem' }}>{u.email}</td>
                        <td><span className={`sys-role-badge sys-role-badge--${u.role}`}>{u.role}</span></td>
                        <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{fmtDate(u.last_login)}</td>
                      </tr>
                    ))}
                    {!users.length && <tr><td colSpan={4} style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>No staff yet.</td></tr>}
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
                    <option value="manager">Manager</option>
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
  const [form, setForm] = useState({ name: '', slug: '', plan: 'professional', managerEmail: '', managerPassword: '', managerName: '' });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const load = () => getWorkshops(token).then(setWorkshops).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const ws = await createWorkshop({ name: form.name, slug: form.slug || undefined, plan: form.plan }, token);
      if (form.managerEmail && form.managerPassword) {
        await createWorkshopUser(ws.id, {
          email: form.managerEmail,
          password: form.managerPassword,
          name: form.managerName || undefined,
          role: 'manager',
        }, token);
      }
      setWorkshops((prev) => [ws, ...prev]);
      setForm({ name: '', slug: '', plan: 'professional', managerEmail: '', managerPassword: '', managerName: '' });
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
            <h4 className="admin-section-title" style={{ marginTop: 8, marginBottom: 4 }}>Initial manager account</h4>
            <div className="kb-form-row">
              <div className="kb-form-group">
                <label>Manager name</label>
                <input placeholder="Jane Smith" {...ff('managerName')} />
              </div>
              <div className="kb-form-group">
                <label>Manager email</label>
                <input type="email" placeholder="jane@acmeauto.co.uk" {...ff('managerEmail')} />
              </div>
            </div>
            <div className="kb-form-group">
              <label>Temporary password</label>
              <input type="password" placeholder="They can change this on first login" {...ff('managerPassword')} />
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
  { id: 'overview', label: 'Overview' },
  { id: 'workshops', label: 'Workshops' },
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
      </main>
    </div>
  );
}
