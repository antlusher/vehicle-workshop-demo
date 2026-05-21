import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { getUsers, getUser, updateUser, createUser, forceLogout } from '../../services/adminApi';

function Badge({ value, trueLabel = 'Yes', falseLabel = 'No', trueClass = 'badge-green', falseClass = 'badge-grey' }) {
  return <span className={`badge ${value ? trueClass : falseClass}`}>{value ? trueLabel : falseLabel}</span>;
}

function RoleBadge({ role }) {
  const cls = role === 'admin' ? 'badge-blue' : 'badge-grey';
  return <span className={`badge ${cls}`}>{role}</span>;
}

function UserDetailPanel({ userId, token, onClose, onUpdated, currentUserEmail }) {
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getUser(userId, token).then(setUser);
  }, [userId, token]);

  const toggle = async (field, value) => {
    setSaving(true);
    try {
      await updateUser(userId, { [field]: value }, token);
      setUser((u) => ({ ...u, [field]: value }));
      onUpdated();
      toast('User updated');
    } finally {
      setSaving(false);
    }
  };

  const handleForceLogout = async () => {
    setSaving(true);
    try {
      await forceLogout(userId, token);
      setUser((u) => ({ ...u, session_active: false }));
      onUpdated();
      toast('User logged out');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <button className="preview-close" onClick={onClose}>✕</button>
      </div>
      <p className="admin-loading">Loading...</p>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="detail-title" style={{ margin: 0 }}>{user.email}</h3>
        <button className="preview-close" onClick={onClose}>✕</button>
      </div>

      <div className="detail-meta">
        <RoleBadge role={user.role} />
        <Badge value={user.subscribed} trueLabel="Subscribed" falseLabel="Unsubscribed" trueClass="badge-green" />
        <span className="detail-date">Joined {new Date(user.created_at).toLocaleDateString()}</span>
      </div>

      <div className="detail-actions">
        {user.session_active && user.email !== currentUserEmail && (
          <button
            disabled={saving}
            onClick={handleForceLogout}
            style={{ fontSize: '0.8rem', padding: '6px 14px', background: '#dc2626' }}
          >
            Force logout
          </button>
        )}
      </div>

      <div className="detail-actions">
        <button
          className="secondary"
          disabled={saving}
          onClick={() => toggle('subscribed', !user.subscribed)}
          style={{ fontSize: '0.8rem', padding: '6px 14px' }}
        >
          {user.subscribed ? 'Remove subscription' : 'Add subscription'}
        </button>
        {user.role !== 'admin' && (
          <button
            className="secondary"
            disabled={saving}
            onClick={() => toggle('role', 'admin')}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            Make admin
          </button>
        )}
        {user.role === 'admin' && (
          <button
            className="secondary"
            disabled={saving}
            onClick={() => toggle('role', 'tech')}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            Remove admin
          </button>
        )}
      </div>

      <div className="detail-stats-row">
        <div className="detail-stat"><strong>{user.projects?.length ?? 0}</strong><span>Projects</span></div>
        <div className="detail-stat"><strong>{user.aiStats?.total_requests ?? 0}</strong><span>AI requests</span></div>
        <div className="detail-stat"><strong>{((user.aiStats?.total_input_tokens ?? 0) + (user.aiStats?.total_output_tokens ?? 0)).toLocaleString()}</strong><span>Tokens used</span></div>
        <div className="detail-stat"><strong>{user.aiStats?.avg_duration_ms ? (user.aiStats.avg_duration_ms / 1000).toFixed(1) + 's' : '—'}</strong><span>Avg response</span></div>
      </div>

      {user.projects?.length > 0 && (
        <>
          <h4 className="detail-section">Projects</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Registration</th><th>Vehicle</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {user.projects.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.registration || p.vin || '—'}</strong></td>
                    <td>{[p.make, p.model, p.year].filter(Boolean).join(' ') || '—'}</td>
                    <td><Badge value={!p.closed} trueLabel="Open" falseLabel="Closed" trueClass="badge-green" falseClass="badge-grey" /></td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {user.loginHistory?.length > 0 && (
        <>
          <h4 className="detail-section">Recent logins</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Date &amp; time</th><th>IP address</th></tr></thead>
              <tbody>
                {user.loginHistory.map((l, i) => (
                  <tr key={i}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CreateUserForm({ token, onCreated, onCancel }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'tech', subscribed: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Email and password are required'); return; }
    setSaving(true); setError('');
    try {
      await createUser(form, token);
      onCreated();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <form className="kb-form" onSubmit={handleSubmit}>
        <div className="kb-form-row">
          <div className="kb-form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className="kb-form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Temporary password" required />
          </div>
          <div className="kb-form-group">
            <label>Role</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="tech">Tech</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="kb-form-group" style={{ justifyContent: 'flex-end', paddingBottom: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.subscribed}
                onChange={(e) => set('subscribed', e.target.checked)}
                style={{ width: 'auto', marginBottom: 0 }}
              />
              Subscribed
            </label>
          </div>
        </div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        <div className="kb-form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create user'}</button>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function Users({ token, currentUserEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => getUsers(token).then(setUsers).finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const filtered = users.filter((u) => {
    if (u.role === 'customer') return false;
    return !search || u.email.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <p className="admin-loading">Loading...</p>;

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Users</h2>
        <input
          className="admin-search"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => { setShowCreate(true); setSelectedId(null); }} style={{ marginLeft: 'auto' }}>+ Add user</button>
      </div>

      {showCreate && (
        <div className="preview-overlay" onClick={() => setShowCreate(false)}>
          <div className="preview-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>New user</h3>
              <button className="preview-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
              <CreateUserForm
                token={token}
                onCreated={() => { setShowCreate(false); load(); }}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Subscribed</th>
              <th>Last login</th>
              <th>Projects</th>
              <th>AI requests</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr
                key={u.id}
                className={`admin-table-row${selectedId === u.id ? ' admin-table-row--active' : ''}`}
                onClick={() => setSelectedId(u.id === selectedId ? null : u.id)}
              >
                <td>
                  <span className={u.session_active ? 'user-active-pill' : ''}>{u.email}</span>
                </td>
                <td><RoleBadge role={u.role} /></td>
                <td><Badge value={u.subscribed} trueLabel="Yes" falseLabel="No" /></td>
                <td>{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                <td>{u.project_count}</td>
                <td>{u.ai_request_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="preview-overlay" onClick={() => setSelectedId(null)}>
          <div className="preview-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-body" style={{ padding: 0 }}>
              <UserDetailPanel
                userId={selectedId}
                token={token}
                onClose={() => setSelectedId(null)}
                onUpdated={load}
                currentUserEmail={currentUserEmail}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
