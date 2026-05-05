import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { getProjects, getConversation } from '../../services/adminApi';

function Badge({ value, trueLabel = 'Yes', falseLabel = 'No', trueClass = 'badge-green', falseClass = 'badge-grey' }) {
  return <span className={`badge ${value ? trueClass : falseClass}`}>{value ? trueLabel : falseLabel}</span>;
}

function ConversationPanel({ projectId, token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    setLoading(true);
    getConversation(projectId, token)
      .then(setData)
      .finally(() => setLoading(false));
  }, [projectId, token]);

  return (
    <div className="detail-panel" style={{ flex: '0 0 46%' }}>
      <button className="detail-close" onClick={onClose}>✕</button>

      {loading && <p className="admin-loading">Loading...</p>}

      {data && (
        <>
          <div style={{ marginBottom: 16 }}>
            <h3 className="detail-title">
              {data.project.registration || data.project.vin || 'Project'}
            </h3>
            <div className="detail-meta">
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {[data.project.make, data.project.model, data.project.year].filter(Boolean).join(' ')}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{data.project.user_email}</span>
            </div>
          </div>

          {!data.history.length && (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No messages in this conversation.</p>
          )}

          <div className="convo-feed">
            {data.history.map((entry) => {
              const isUser = entry.role === 'user';
              const isComposed = isUser && entry.text.startsWith('Diagnostic answers:');
              const time = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              if (isComposed) {
                return (
                  <div key={entry.id} className="convo-pill-row">
                    <span className="chat-pill">Diagnostic answers submitted</span>
                  </div>
                );
              }

              return (
                <div key={entry.id} className={`convo-entry convo-entry--${entry.role}`}>
                  <div className={`convo-bubble convo-bubble--${entry.role}`}>
                    {isUser ? (
                      <p style={{ margin: 0 }}>{entry.text}</p>
                    ) : (
                      <div className="ai-response convo-ai-prose">
                        <ReactMarkdown>{entry.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <small className="chat-time">{time}</small>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Projects({ token }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    getProjects(token).then(setProjects).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.registration?.toLowerCase().includes(q) ||
      p.make?.toLowerCase().includes(q) ||
      p.model?.toLowerCase().includes(q) ||
      p.user_email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-split">
      <div className={`admin-split-main${selectedId ? ' admin-split-main--narrow' : ''}`}>
        <div className="admin-toolbar">
          <h2 className="admin-page-title" style={{ margin: 0 }}>Projects</h2>
          <input
            className="admin-search"
            placeholder="Search by reg, vehicle or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Vehicle</th>
                <th>User</th>
                <th>Status</th>
                <th>Messages</th>
                <th>AI requests</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`admin-table-row${selectedId === p.id ? ' admin-table-row--active' : ''}`}
                >
                  <td><strong>{p.registration || p.vin || '—'}</strong></td>
                  <td>{[p.make, p.model, p.year].filter(Boolean).join(' ') || '—'}</td>
                  <td>{p.user_email}</td>
                  <td><Badge value={!p.closed} trueLabel="Open" falseLabel="Closed" trueClass="badge-green" falseClass="badge-grey" /></td>
                  <td>{p.message_count}</td>
                  <td>{p.ai_request_count}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    {p.message_count > 0 && (
                      <button
                        className="secondary"
                        style={{ fontSize: '0.75rem', padding: '3px 12px', whiteSpace: 'nowrap' }}
                        onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                      >
                        {selectedId === p.id ? 'Close' : 'View'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No projects found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <ConversationPanel
          projectId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
