import { useEffect, useState } from 'react';
import { getDashboard, getAiStats, getLearningStats, estimateCost } from '../../services/adminApi';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CATEGORY_LABELS = {
  common_fix: 'Common Fix',
  dtc_code: 'DTC Code',
  vehicle_note: 'Vehicle Note',
  service_interval: 'Service Interval',
  general: 'General',
};

export default function Dashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [aiStats, setAiStats] = useState([]);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboard(token), getAiStats(token), getLearningStats(token)])
      .then(([s, ai, l]) => { setStats(s); setAiStats(ai); setLearning(l); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const totalTokens30d = aiStats.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
  const estCost30d = aiStats.reduce((sum, r) => sum + parseFloat(estimateCost(r.input_tokens, r.output_tokens)), 0);
  const totalKnowledge = (learning?.kb?.total ?? 0) + (learning?.confirmedFixes?.total ?? 0);

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

      <h3 className="admin-section-title">AI Learning &amp; Knowledge</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Total knowledge items" value={totalKnowledge} sub="KB + confirmed fixes" />
        <StatCard label="Knowledge base entries" value={learning?.kb?.total ?? 0} sub={learning?.kb?.added_this_week ? `+${learning.kb.added_this_week} this week` : null} />
        <StatCard label="Confirmed technician fixes" value={learning?.confirmedFixes?.total ?? 0} />
        <StatCard label="Vehicles with confirmed fixes" value={learning?.confirmedFixes?.unique_vehicles ?? 0} />
      </div>

      <div className="admin-split" style={{ gap: 24, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <h4 className="detail-section" style={{ marginTop: 0 }}>Knowledge base by category</h4>
          {learning?.kb?.byCategory?.length > 0 ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Category</th><th>Entries</th></tr></thead>
                <tbody>
                  {learning.kb.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{CATEGORY_LABELS[row.category] || row.category}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No knowledge base entries yet.</p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h4 className="detail-section" style={{ marginTop: 0 }}>Top confirmed fixes</h4>
          {learning?.topFixes?.length > 0 ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Vehicle</th><th>Fix</th><th>Confirmed</th></tr></thead>
                <tbody>
                  {learning.topFixes.map((fix, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{[fix.make, fix.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="admin-cell-truncate" title={fix.text}>{fix.text}</td>
                      <td>{fix.count}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No confirmed fixes recorded yet.</p>
          )}
        </div>

        {learning?.recentKb?.length > 0 && (
          <div style={{ flex: 1 }}>
            <h4 className="detail-section" style={{ marginTop: 0 }}>Recent KB additions</h4>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Title</th><th>Category</th><th>Added</th></tr></thead>
                <tbody>
                  {learning.recentKb.map((entry, i) => (
                    <tr key={i}>
                      <td className="admin-cell-truncate" title={entry.title}>{entry.title}</td>
                      <td>{CATEGORY_LABELS[entry.category] || entry.category}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
