import { useEffect, useState } from 'react';
import { getDashboard, getAiStats, estimateCost } from '../../services/adminApi';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [aiStats, setAiStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboard(token), getAiStats(token)])
      .then(([s, ai]) => { setStats(s); setAiStats(ai); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const totalTokens30d = aiStats.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
  const estCost30d = aiStats.reduce((sum, r) => sum + parseFloat(estimateCost(r.input_tokens, r.output_tokens)), 0);

  return (
    <div>
      <h2 className="admin-page-title">Dashboard</h2>

      <div className="stat-grid">
        <StatCard label="Total users" value={stats.users.total} sub={`${stats.users.subscribed} subscribed`} />
        <StatCard label="Currently logged in" value={stats.users.active_now} />
        <StatCard label="New users (7d)" value={stats.users.new_this_week} />
        <StatCard label="Total projects" value={stats.projects.total} sub={`${stats.projects.closed} closed`} />
        <StatCard label="New projects (7d)" value={stats.projects.new_this_week} />
        <StatCard label="AI requests (7d)" value={stats.aiRequests.this_week} sub={`${stats.aiRequests.total} total`} />
        <StatCard label="Tokens (30d)" value={totalTokens30d.toLocaleString()} sub={`~$${estCost30d.toFixed(2)} est.`} />
      </div>

      {aiStats.length > 0 && (
        <>
          <h3 className="admin-section-title">AI Activity — last 30 days</h3>
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
                {aiStats.map((row) => (
                  <tr key={row.day}>
                    <td>{new Date(row.day).toLocaleDateString()}</td>
                    <td>{row.requests}</td>
                    <td>{row.input_tokens.toLocaleString()}</td>
                    <td>{row.output_tokens.toLocaleString()}</td>
                    <td>{(row.avg_duration_ms / 1000).toFixed(1)}s</td>
                    <td>${estimateCost(row.input_tokens, row.output_tokens)}</td>
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
