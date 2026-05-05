import { useEffect, useState } from 'react';
import { getAiRequests, getAiStats, estimateCost } from '../../services/adminApi';

export default function AiRequests({ token }) {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('log');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([getAiRequests(token), getAiStats(token)])
      .then(([reqs, s]) => { setRequests(reqs); setStats(s); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const totalIn = requests.reduce((s, r) => s + (r.input_tokens || 0), 0);
  const totalOut = requests.reduce((s, r) => s + (r.output_tokens || 0), 0);
  const totalCost = parseFloat(estimateCost(totalIn, totalOut));

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.email?.toLowerCase().includes(q) ||
      r.question_preview?.toLowerCase().includes(q) ||
      r.registration?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>AI Requests</h2>
        <div className="tab-toggle">
          <button className={view === 'log' ? 'active' : ''} onClick={() => setView('log')}>Request log</button>
          <button className={view === 'stats' ? 'active' : ''} onClick={() => setView('stats')}>Daily stats</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value">{requests.length}</div><div className="stat-label">Total requests</div></div>
        <div className="stat-card"><div className="stat-value">{totalIn.toLocaleString()}</div><div className="stat-label">Input tokens</div></div>
        <div className="stat-card"><div className="stat-value">{totalOut.toLocaleString()}</div><div className="stat-label">Output tokens</div></div>
        <div className="stat-card"><div className="stat-value">${totalCost.toFixed(2)}</div><div className="stat-label">Estimated cost</div></div>
      </div>

      {view === 'log' && (
        <>
          <input
            className="admin-search"
            style={{ marginBottom: 12, maxWidth: 360 }}
            placeholder="Filter by user, vehicle or question..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Vehicle</th>
                  <th>Question</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.email}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.registration || [r.make, r.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="admin-cell-truncate" title={r.question_preview}>{r.question_preview}</td>
                    <td>{(r.input_tokens || 0).toLocaleString()}</td>
                    <td>{(r.output_tokens || 0).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + 's' : '—'}</td>
                    <td>${estimateCost(r.input_tokens || 0, r.output_tokens || 0)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No requests found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'stats' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Requests</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Avg duration</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.day}>
                  <td>{new Date(row.day).toLocaleDateString()}</td>
                  <td>{row.requests}</td>
                  <td>{row.input_tokens.toLocaleString()}</td>
                  <td>{row.output_tokens.toLocaleString()}</td>
                  <td>{(row.avg_duration_ms / 1000).toFixed(1)}s</td>
                  <td>${estimateCost(row.input_tokens, row.output_tokens)}</td>
                </tr>
              ))}
              {!stats.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
