import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getAiRequests, getAiStats, getConversation, estimateCost,
  getLearningStats,
  getKnowledgeBase, createKbEntry, updateKbEntry, deleteKbEntry,
} from '../../services/adminApi';

// ── Shared ────────────────────────────────────────────────────────────────────

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
  'Common Fix': 'Common Fix',
  common_fix: 'Common Fix',
  'DTC Code': 'DTC Code',
  dtc_code: 'DTC Code',
  'Vehicle Note': 'Vehicle Note',
  vehicle_note: 'Vehicle Note',
  'Service Interval': 'Service Interval',
  service_interval: 'Service Interval',
  General: 'General',
  general: 'General',
};

// ── Overview sub-tab ──────────────────────────────────────────────────────────

function Overview({ token }) {
  const [learning, setLearning] = useState(null);
  const [aiStats, setAiStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLearningStats(token), getAiStats(token)])
      .then(([l, s]) => { setLearning(l); setAiStats(s); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const totalKnowledge = (learning?.kb?.total ?? 0) + (learning?.confirmedFixes?.total ?? 0);
  const totalTokens30d = aiStats.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const estCost30d = aiStats.reduce((s, r) => s + parseFloat(estimateCost(r.input_tokens, r.output_tokens)), 0);
  const totalRequests30d = aiStats.reduce((s, r) => s + r.requests, 0);

  return (
    <div>
      <h3 className="admin-section-title" style={{ marginTop: 0 }}>AI usage — last 30 days</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Requests (30d)" value={totalRequests30d} />
        <StatCard label="Tokens (30d)" value={totalTokens30d.toLocaleString()} />
        <StatCard label="Est. cost (30d)" value={`$${estCost30d.toFixed(2)}`} />
        <StatCard label="Avg requests/day" value={aiStats.length ? Math.round(totalRequests30d / aiStats.length) : 0} />
      </div>

      <h3 className="admin-section-title">Knowledge the AI can access</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Total knowledge items" value={totalKnowledge} sub="KB entries + confirmed fixes" />
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
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No confirmed fixes recorded yet. They appear here as technicians confirm repair suggestions in their projects.</p>
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
          <h3 className="admin-section-title">Daily AI activity</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Date</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Avg duration</th><th>Est. cost</th></tr>
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

// ── Request Log sub-tab ───────────────────────────────────────────────────────

function ConversationPanel({ projectId, token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    setLoading(true);
    getConversation(projectId, token).then(setData).finally(() => setLoading(false));
  }, [projectId, token]);

  return (
    <div className="detail-panel" style={{ flex: '0 0 46%' }}>
      <button className="detail-close" onClick={onClose}>✕</button>
      {loading && <p className="admin-loading">Loading...</p>}
      {data && (
        <>
          <div style={{ marginBottom: 16 }}>
            <h3 className="detail-title">{data.project.registration || data.project.vin || 'Project'}</h3>
            <div className="detail-meta">
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{[data.project.make, data.project.model, data.project.year].filter(Boolean).join(' ')}</span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{data.project.user_email}</span>
            </div>
          </div>
          {!data.history.length && <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No messages in this conversation.</p>}
          <div className="convo-feed">
            {data.history.map((entry) => {
              const isUser = entry.role === 'user';
              if (isUser && entry.text.startsWith('Diagnostic answers:')) {
                return <div key={entry.id} className="convo-pill-row"><span className="chat-pill">Diagnostic answers submitted</span></div>;
              }
              const time = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={entry.id} className={`convo-entry convo-entry--${entry.role}`}>
                  <div className={`convo-bubble convo-bubble--${entry.role}`}>
                    {isUser ? <p style={{ margin: 0 }}>{entry.text}</p> : <div className="ai-response convo-ai-prose"><ReactMarkdown>{entry.text}</ReactMarkdown></div>}
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

function RequestLog({ token }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  useEffect(() => {
    getAiRequests(token).then(setRequests).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="admin-loading">Loading...</p>;

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.email?.toLowerCase().includes(q) || r.question_preview?.toLowerCase().includes(q) || r.registration?.toLowerCase().includes(q);
  });

  const totalIn = requests.reduce((s, r) => s + (r.input_tokens || 0), 0);
  const totalOut = requests.reduce((s, r) => s + (r.output_tokens || 0), 0);

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <StatCard label="Total requests" value={requests.length} />
        <StatCard label="Input tokens" value={totalIn.toLocaleString()} />
        <StatCard label="Output tokens" value={totalOut.toLocaleString()} />
        <StatCard label="Estimated cost" value={`$${parseFloat(estimateCost(totalIn, totalOut)).toFixed(2)}`} />
      </div>

      <div className="admin-split">
        <div className={`admin-split-main${selectedProjectId ? ' admin-split-main--narrow' : ''}`}>
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
                <tr><th>Date</th><th>User</th><th>Vehicle</th><th>Question</th><th>In</th><th>Out</th><th>Duration</th><th>Cost</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`admin-table-row${selectedProjectId === r.project_id ? ' admin-table-row--active' : ''}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.email}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.registration || [r.make, r.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="admin-cell-truncate" title={r.question_preview}>{r.question_preview}</td>
                    <td>{(r.input_tokens || 0).toLocaleString()}</td>
                    <td>{(r.output_tokens || 0).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + 's' : '—'}</td>
                    <td>${estimateCost(r.input_tokens || 0, r.output_tokens || 0)}</td>
                    <td>
                      {r.project_id && (
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 12px', whiteSpace: 'nowrap' }}
                          onClick={() => setSelectedProjectId(selectedProjectId === r.project_id ? null : r.project_id)}>
                          {selectedProjectId === r.project_id ? 'Close' : 'View'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No requests found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {selectedProjectId && <ConversationPanel projectId={selectedProjectId} token={token} onClose={() => setSelectedProjectId(null)} />}
      </div>
    </div>
  );
}

// ── Knowledge Base sub-tab ────────────────────────────────────────────────────

const CATEGORIES = ['Common Fix', 'DTC Code', 'Vehicle Note', 'Service Interval', 'General'];
const EMPTY_FORM = { category: 'Common Fix', make: '', model: '', year_from: '', year_to: '', fault_code: '', title: '', content: '', source: '' };

function KbForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) { setError('Title and content are required'); return; }
    setSaving(true); setError('');
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <form className="kb-form" onSubmit={handleSubmit}>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Category</label>
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="kb-form-group">
          <label>DTC / Fault code</label>
          <input value={form.fault_code} onChange={(e) => set('fault_code', e.target.value)} placeholder="e.g. P0300" />
        </div>
        <div className="kb-form-group">
          <label>Source</label>
          <input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="e.g. Manufacturer TSB" />
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Make</label>
          <input value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="e.g. Ford" />
        </div>
        <div className="kb-form-group">
          <label>Model</label>
          <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. Focus" />
        </div>
        <div className="kb-form-group">
          <label>Year from</label>
          <input value={form.year_from} onChange={(e) => set('year_from', e.target.value)} placeholder="e.g. 2015" />
        </div>
        <div className="kb-form-group">
          <label>Year to</label>
          <input value={form.year_to} onChange={(e) => set('year_to', e.target.value)} placeholder="e.g. 2020" />
        </div>
      </div>
      <div className="kb-form-group">
        <label>Title</label>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Short description of the fix or note" required />
      </div>
      <div className="kb-form-group">
        <label>Content</label>
        <textarea rows={5} value={form.content} onChange={(e) => set('content', e.target.value)} placeholder="Full details — diagnostic steps, fix procedure, notes for the AI..." required />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kb-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save entry'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function KnowledgeBaseTab({ token }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = (params = {}) => getKnowledgeBase(token, params).then(setEntries).finally(() => setLoading(false));
  useEffect(() => { load(); }, [token]);

  const handleSearch = () => {
    const params = {};
    if (filterCategory) params.category = filterCategory;
    if (search) params.search = search;
    load(params);
  };

  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <span />
        {!showForm && !editingId && <button onClick={() => setShowForm(true)}>+ Add entry</button>}
      </div>

      {showForm && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">New entry</h3>
          <KbForm onSave={async (form) => { await createKbEntry(form, token); setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {editingEntry && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">Edit entry</h3>
          <KbForm
            initial={{ category: editingEntry.category, make: editingEntry.make || '', model: editingEntry.model || '', year_from: editingEntry.year_from || '', year_to: editingEntry.year_to || '', fault_code: editingEntry.fault_code || '', title: editingEntry.title, content: editingEntry.content, source: editingEntry.source || '' }}
            onSave={async (form) => { await updateKbEntry(editingId, form, token); setEditingId(null); load(); }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <div className="admin-filters">
        <input className="admin-search" placeholder="Search title, content or fault code..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="secondary" onClick={handleSearch}>Filter</button>
        <button className="secondary" onClick={() => { setSearch(''); setFilterCategory(''); load(); }}>Clear</button>
      </div>

      {loading ? <p className="admin-loading">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Category</th><th>Vehicle</th><th>Fault code</th><th>Title</th><th>Source</th><th>Updated</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td><span className="badge badge-blue">{e.category}</span></td>
                  <td>{[e.make, e.model, e.year_from && `${e.year_from}${e.year_to ? '–' + e.year_to : '+'}`].filter(Boolean).join(' ') || <span style={{ color: '#9ca3af' }}>Any</span>}</td>
                  <td>{e.fault_code || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.title}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{e.source || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#9ca3af' }}>{new Date(e.updated_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => { setEditingId(e.id); setShowForm(false); }}>Edit</button>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={async () => { if (!confirm('Delete this entry?')) return; await deleteKbEntry(e.id, token); setEntries((x) => x.filter((i) => i.id !== e.id)); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No entries yet. Add your first knowledge base entry above.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Request Log' },
  { id: 'kb', label: 'Knowledge Base' },
];

export default function AiKnowledge({ token }) {
  const [tab, setTab] = useState('overview');

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>AI &amp; Knowledge</h2>
        <div className="tab-toggle">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview token={token} />}
      {tab === 'requests' && <RequestLog token={token} />}
      {tab === 'kb' && <KnowledgeBaseTab token={token} />}
    </div>
  );
}
