import { useEffect, useState } from 'react';
import { getUsers, getUser, updateUser } from '../../services/adminApi';

function Badge({ value, trueLabel = 'Yes', falseLabel = 'No', trueClass = 'badge-green', falseClass = 'badge-grey' }) {
  return <span className={`badge ${value ? trueClass : falseClass}`}>{value ? trueLabel : falseLabel}</span>;
}

function RoleBadge({ role }) {
  const cls = role === 'admin' ? 'badge-blue' : 'badge-grey';
  return <span className={`badge ${cls}`}>{role}</span>;
}

function UserDetailPanel({ userId, token, onClose, onUpdated }) {
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUser(userId, token).then(setUser);
  }, [userId, token]);

  const toggle = async (field, value) => {
    setSaving(true);
    try {
      await updateUser(userId, { [field]: value }, token);
      setUser((u) => ({ ...u, [field]: value }));
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  if (!user) return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>✕</button>
      <p className="admin-loading">Loading...</p>
    </div>
  );

  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>✕</button>
      <h3 className="detail-title">{user.email}</h3>

      <div className="detail-meta">
        <RoleBadge role={user.role} />
        <Badge value={user.subscribed} trueLabel="Subscribed" falseLabel="Unsubscribed" trueClass="badge-green" />
        <span className="detail-date">Joined {new Date(user.created_at).toLocaleDateString()}</span>
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

export default function Users({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = () => getUsers(token).then(setUsers).finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const filtered = users.filter((u) =>
    !search || u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <p className="admin-loading">Loading...</p>;

  return (
    <div className="admin-split">
      <div className={`admin-split-main${selectedId ? ' admin-split-main--narrow' : ''}`}>
        <div className="admin-toolbar">
          <h2 className="admin-page-title" style={{ margin: 0 }}>Users</h2>
          <input
            className="admin-search"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
                  <td>{u.email}</td>
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
      </div>

      {selectedId && (
        <UserDetailPanel
          userId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
