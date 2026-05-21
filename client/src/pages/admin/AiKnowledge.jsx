import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  getAiRequests, getAiStats, getConversation, estimateCost,
  getLearningStats,
  getKnowledgeBase, createKbEntry, updateKbEntry, deleteKbEntry,
  parsePdf, importPdfChunks, scrapeUrl,
  trainingChat, extractKnowledge,
} from '../../services/adminApi';
import { getEngines, getTransmissions } from '../../services/registryApi';

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
const EMPTY_FORM = { category: 'Common Fix', make: '', model: '', year_from: '', year_to: '', fault_code: '', title: '', content: '', source: '', engine_id: '', transmission_id: '' };

function KbForm({ initial, engines, transmissions, onSave, onCancel }) {
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

  const scopeHint = form.engine_id
    ? `Scoped to engine — applies to all vehicles with this engine regardless of make/model`
    : form.make
    ? `Scoped to ${[form.make, form.model].filter(Boolean).join(' ')}`
    : 'Universal — applies to all vehicles';

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
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Engine (cross-make scope)</label>
          <select value={form.engine_id} onChange={(e) => set('engine_id', e.target.value)}>
            <option value="">— Not engine-specific —</option>
            {(engines || []).map((e) => <option key={e.id} value={e.id}>{e.code}{e.name ? ` — ${e.name}` : ''}</option>)}
          </select>
        </div>
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Transmission (cross-make scope)</label>
          <select value={form.transmission_id} onChange={(e) => set('transmission_id', e.target.value)}>
            <option value="">— Not transmission-specific —</option>
            {(transmissions || []).map((t) => <option key={t.id} value={t.id}>{t.code}{t.name ? ` — ${t.name}` : ''}</option>)}
          </select>
        </div>
      </div>

      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Make <span style={{ color: '#9ca3af', fontWeight: 400 }}>(leave blank for engine-scoped or universal)</span></label>
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

      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#6b7280' }}>Scope: {scopeHint}</p>

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

// ── Import tab (PDF + URL) ────────────────────────────────────────────────────

function ImportTab({ token }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('pdf'); // 'pdf' | 'url'
  const [urlInput, setUrlInput] = useState('');
  const [chunks, setChunks] = useState([]);
  const [engines, setEngines] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const [globalScope, setGlobalScope] = useState({ category: 'General', make: '', model: '', engine_id: '', transmission_id: '', source: '' });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(null);
  const setG = (k, v) => setGlobalScope((s) => ({ ...s, [k]: v }));
  const setChunk = (i, k, v) => setChunks((cs) => cs.map((c, idx) => idx === i ? { ...c, [k]: v } : c));

  useEffect(() => {
    Promise.all([getEngines(token), getTransmissions(token)])
      .then(([e, t]) => { setEngines(e); setTransmissions(t); });
  }, [token]);

  const resetChunks = () => { setChunks([]); setImported(null); setError(''); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetChunks(); setLoading(true);
    try {
      const { chunks: parsed } = await parsePdf(file, token);
      setChunks(parsed.map((c) => ({ ...c, included: true })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleScrape = async () => {
    if (!urlInput.trim()) return;
    resetChunks(); setLoading(true);
    try {
      const { chunks: extracted, pageTitle, url } = await scrapeUrl(urlInput.trim(), token);
      if (!extracted?.length) { setError('No knowledge entries could be extracted from this page.'); return; }
      setChunks(extracted.map((c) => ({ ...c, included: true })));
      setG('source', pageTitle || url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyGlobalScope = () => {
    setChunks((cs) => cs.map((c) => ({
      ...c,
      category: globalScope.category || c.category,
      make: globalScope.make !== undefined ? globalScope.make : c.make,
      model: globalScope.model !== undefined ? globalScope.model : c.model,
      engine_id: globalScope.engine_id !== undefined ? globalScope.engine_id : c.engine_id,
      transmission_id: globalScope.transmission_id !== undefined ? globalScope.transmission_id : c.transmission_id,
      source: globalScope.source || c.source,
    })));
  };

  const handleImport = async () => {
    const selected = chunks.filter((c) => c.included);
    if (!selected.length) { setError('No entries selected'); return; }
    setImporting(true); setError('');
    try {
      const { imported: count } = await importPdfChunks(selected, token);
      setImported(count);
      setChunks([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = chunks.filter((c) => c.included).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
        {[['pdf', 'PDF document'], ['url', 'Web page / URL']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setMode(id); resetChunks(); }}
            style={{ padding: '8px 20px', fontSize: '0.88rem', background: mode === id ? '#1e40af' : 'white', color: mode === id ? 'white' : '#374151', border: 'none', borderRight: id === 'pdf' ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', fontWeight: mode === id ? 600 : 400 }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'pdf' && (
        <div>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 16 }}>
            Upload a PDF repair manual, technical service bulletin, or parts catalogue. Text is extracted and structured by AI before you review and save.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <button onClick={() => fileRef.current?.click()} disabled={loading}>{loading ? 'Parsing…' : 'Choose PDF…'}</button>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
            {chunks.length > 0 && <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{chunks.length} sections extracted</span>}
          </div>
        </div>
      )}

      {mode === 'url' && (
        <div>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 16 }}>
            Paste a URL from a Dayco or Gates bulletin, parts manufacturer procedure, engine code database, or any public automotive article. The page is fetched server-side, text extracted, and structured by AI for review.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <input
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
              type="url"
              placeholder="https://www.daycoaftermkt.com/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
              disabled={loading}
            />
            <button onClick={handleScrape} disabled={loading || !urlInput.trim()}>
              {loading ? 'Fetching…' : 'Fetch & extract'}
            </button>
          </div>
          {chunks.length > 0 && <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{chunks.length} entries extracted</span>}
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      {imported !== null && <p style={{ color: '#16a34a', marginTop: 8, marginBottom: 0 }}>✓ {imported} entries imported to knowledge base.</p>}

      {chunks.length > 0 && (
        <>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '20px 0' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#374151' }}>Apply scope to all entries</h4>
            <div className="kb-form-row" style={{ marginBottom: 8 }}>
              <div className="kb-form-group">
                <label>Category</label>
                <select value={globalScope.category} onChange={(e) => setG('category', e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="kb-form-group">
                <label>Source / document name</label>
                <input value={globalScope.source} onChange={(e) => setG('source', e.target.value)} placeholder="e.g. Dayco EcoBlue Bulletin, Gates TSB-2024" />
              </div>
              <div className="kb-form-group">
                <label>Engine (cross-make)</label>
                <select value={globalScope.engine_id} onChange={(e) => setG('engine_id', e.target.value)}>
                  <option value="">— None —</option>
                  {engines.map((e) => <option key={e.id} value={e.id}>{e.code}{e.name ? ` — ${e.name}` : ''}</option>)}
                </select>
              </div>
              <div className="kb-form-group">
                <label>Make</label>
                <input value={globalScope.make} onChange={(e) => setG('make', e.target.value)} placeholder="e.g. Ford" />
              </div>
              <div className="kb-form-group">
                <label>Model</label>
                <input value={globalScope.model} onChange={(e) => setG('model', e.target.value)} placeholder="e.g. Transit" />
              </div>
            </div>
            <button className="secondary" onClick={applyGlobalScope}>Apply to all entries</button>
          </div>

          <div className="admin-toolbar" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{selectedCount} of {chunks.length} selected</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="secondary" style={{ fontSize: '0.8rem' }} onClick={() => setChunks((cs) => cs.map((c) => ({ ...c, included: true })))}>Select all</button>
              <button className="secondary" style={{ fontSize: '0.8rem' }} onClick={() => setChunks((cs) => cs.map((c) => ({ ...c, included: false })))}>Deselect all</button>
              <button onClick={handleImport} disabled={importing || !selectedCount}>
                {importing ? 'Importing…' : `Import ${selectedCount} entr${selectedCount !== 1 ? 'ies' : 'y'}`}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chunks.map((chunk, i) => (
              <div key={i} style={{ border: '1px solid', borderColor: chunk.included ? '#bfdbfe' : '#e5e7eb', borderRadius: 8, padding: 14, background: chunk.included ? '#eff6ff' : '#fafafa', opacity: chunk.included ? 1 : 0.6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <input type="checkbox" checked={chunk.included} onChange={(e) => setChunk(i, 'included', e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <input
                    style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', background: 'white' }}
                    value={chunk.title}
                    onChange={(e) => setChunk(i, 'title', e.target.value)}
                  />
                  <select style={{ fontSize: '0.8rem', padding: '4px 6px' }} value={chunk.category} onChange={(e) => setChunk(i, 'category', e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <textarea
                  rows={4}
                  style={{ width: '100%', fontSize: '0.82rem', border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 8px', background: 'white', boxSizing: 'border-box', resize: 'vertical' }}
                  value={chunk.content}
                  onChange={(e) => setChunk(i, 'content', e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KnowledgeBaseTab({ token }) {
  const [entries, setEntries] = useState([]);
  const [engines, setEngines] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = (params = {}) => getKnowledgeBase(token, params).then(setEntries).finally(() => setLoading(false));
  useEffect(() => {
    Promise.all([getKnowledgeBase(token), getEngines(token), getTransmissions(token)])
      .then(([kb, e, t]) => { setEntries(kb); setEngines(e); setTransmissions(t); })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSearch = () => {
    const params = {};
    if (filterCategory) params.category = filterCategory;
    if (search) params.search = search;
    load(params);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;
  const modalOpen = showForm || !!editingEntry;
  const closeModal = () => { setShowForm(false); setEditingId(null); };

  return (
    <div>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <span />
        <button onClick={() => { setShowForm(true); setEditingId(null); }}>+ Add entry</button>
      </div>

      {modalOpen && (
        <div className="preview-overlay" onClick={closeModal}>
          <div className="preview-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>{editingEntry ? 'Edit entry' : 'New entry'}</h3>
              <button className="preview-close" onClick={closeModal}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
              {showForm && (
                <KbForm engines={engines} transmissions={transmissions}
                  onSave={async (form) => { await createKbEntry(form, token); closeModal(); load(); }}
                  onCancel={closeModal} />
              )}
              {editingEntry && (
                <KbForm
                  engines={engines} transmissions={transmissions}
                  initial={{ category: editingEntry.category, make: editingEntry.make || '', model: editingEntry.model || '', year_from: editingEntry.year_from || '', year_to: editingEntry.year_to || '', fault_code: editingEntry.fault_code || '', title: editingEntry.title, content: editingEntry.content, source: editingEntry.source || '', engine_id: editingEntry.engine_id || '', transmission_id: editingEntry.transmission_id || '' }}
                  onSave={async (form) => { await updateKbEntry(editingId, form, token); closeModal(); load(); }}
                  onCancel={closeModal}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete entry"
        message="Delete this knowledge base entry? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await deleteKbEntry(confirmDeleteId, token); setEntries((x) => x.filter((i) => i.id !== confirmDeleteId)); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />

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
              <tr><th>Category</th><th>Scope</th><th>Fault code</th><th>Title</th><th>Source</th><th>Updated</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const engineLabel = e.engine_id ? engines.find((eng) => eng.id === e.engine_id)?.code : null;
                const txLabel = e.transmission_id ? transmissions.find((t) => t.id === e.transmission_id)?.code : null;
                const scopeLabel = engineLabel
                  ? <span className="badge badge-blue">{engineLabel} engine</span>
                  : txLabel
                  ? <span className="badge badge-blue">{txLabel} tx</span>
                  : [e.make, e.model, e.year_from && `${e.year_from}${e.year_to ? '–' + e.year_to : '+'}`].filter(Boolean).join(' ') || <span style={{ color: '#9ca3af' }}>Universal</span>;
                return (
                <tr key={e.id} style={e.is_global ? { background: 'rgba(99,102,241,0.05)' } : {}}>
                  <td>
                    <span className="badge badge-blue">{e.category}</span>
                    {e.is_global && <span className="badge" style={{ marginLeft: 4, background: '#4f46e5', color: '#fff', fontSize: '0.7rem' }}>Global Brain</span>}
                  </td>
                  <td>{scopeLabel}</td>
                  <td>{e.fault_code || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.title}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{e.source || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#9ca3af' }}>{new Date(e.updated_at).toLocaleDateString()}</td>
                  <td>
                    {!e.is_global && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => { setEditingId(e.id); setShowForm(false); }}>Edit</button>
                        <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={() => setConfirmDeleteId(e.id)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
              })}
              {!entries.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No entries yet. Add your first knowledge base entry above.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Training Chat sub-tab ─────────────────────────────────────────────────────

function TrainingChat({ token }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedText, setFeedText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState([]);
  const [extractError, setExtractError] = useState('');
  const [kbDraft, setKbDraft] = useState(null);
  const [engines, setEngines] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    Promise.all([getEngines(token), getTransmissions(token)])
      .then(([e, t]) => { setEngines(e); setTransmissions(t); });
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    const nextHistory = [...history, { role: 'user', text: q }];
    setHistory(nextHistory);
    setLoading(true);
    try {
      const { answer } = await trainingChat(q, history, token);
      setHistory([...nextHistory, { role: 'ai', text: answer }]);
    } catch (err) {
      setHistory([...nextHistory, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!feedText.trim() || extracting) return;
    setExtracting(true);
    setExtracted([]);
    setExtractError('');
    try {
      const { entries } = await extractKnowledge(feedText, token);
      setExtracted(entries);
      if (!entries.length) setExtractError('No knowledge entries could be extracted from that text.');
    } catch (err) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const openDraft = (entry) => setKbDraft({
    title: entry.title || '',
    content: entry.content || '',
    category: entry.category || 'General',
    make: entry.make || '',
    model: entry.model || '',
    year_from: entry.year_from || '',
    year_to: entry.year_to || '',
    fault_code: entry.fault_code || '',
    source: entry.source || 'Technician Experience',
    engine_id: '',
    transmission_id: '',
  });

  const openDraftFromResponse = (text) => openDraft({
    title: text.replace(/[#*`]/g, '').split('\n').find((l) => l.trim()) || 'Training chat response',
    content: text,
    category: 'General',
    source: 'Bob Training Chat',
  });

  return (
    <div className="training-layout">
      <div className="training-chat-panel">
        <div className="training-chat-feed">
          {history.length === 0 && !loading && (
            <p className="training-empty">Ask Bob anything — faults, procedures, diagnostic approaches — or share knowledge from your own experience.</p>
          )}
          {history.map((h, i) => (
            <div key={i} className={`convo-entry convo-entry--${h.role === 'user' ? 'user' : 'assistant'}`}>
              <div className={`convo-bubble convo-bubble--${h.role === 'user' ? 'user' : 'assistant'}`}>
                {h.role === 'user' ? (
                  <p style={{ margin: 0 }}>{h.text}</p>
                ) : (
                  <div className="ai-response convo-ai-prose">
                    <ReactMarkdown>{h.text}</ReactMarkdown>
                    <button
                      className="secondary"
                      style={{ fontSize: '0.75rem', marginTop: 10, padding: '4px 12px' }}
                      onClick={() => openDraftFromResponse(h.text)}
                    >
                      Save to knowledge base
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="convo-entry convo-entry--assistant">
              <div className="convo-bubble convo-bubble--assistant training-thinking">Bob is thinking...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="training-chat-bar">
          <input
            className="admin-search"
            style={{ flex: 1, margin: 0 }}
            placeholder="Ask Bob or share your experience..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={loading}
          />
          <button onClick={handleSend} disabled={!input.trim() || loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>

      <div className="training-feed-panel">
        <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>Feed Knowledge</h4>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px', lineHeight: 1.5 }}>
          Paste a fault description, confirmed fix, or procedure from your own experience. Bob will extract and structure it into knowledge base entries.
        </p>
        <textarea
          className="training-feed-input"
          rows={7}
          placeholder="e.g. On the PSA DV5 1.5 BlueHDi, timing chain stretch is common after 80k miles. Symptoms include P0017, rattling on cold start. The chain tensioner fails first — replace the full kit including tensioner, guides and chain. Always check camshaft wear pattern..."
          value={feedText}
          onChange={(e) => setFeedText(e.target.value)}
        />
        <button
          style={{ width: '100%', marginTop: 10 }}
          disabled={!feedText.trim() || extracting}
          onClick={handleExtract}
        >
          {extracting ? 'Processing...' : 'Extract knowledge entries'}
        </button>

        {extractError && <p className="error" style={{ marginTop: 10 }}>{extractError}</p>}

        {extracted.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 10px', fontWeight: 500 }}>
              {extracted.length} entr{extracted.length > 1 ? 'ies' : 'y'} extracted — review before saving:
            </p>
            {extracted.map((entry, i) => (
              <div key={i} className="training-entry-card">
                <div className="training-entry-title">{entry.title}</div>
                <div className="training-entry-meta">
                  <span className="badge badge-blue">{entry.category}</span>
                  {entry.make && <span>{entry.make} {entry.model}</span>}
                  {entry.fault_code && <span>{entry.fault_code}</span>}
                  {entry.year_from && <span>{entry.year_from}{entry.year_to ? `–${entry.year_to}` : '+'}</span>}
                </div>
                <p className="training-entry-preview">{entry.content.slice(0, 140)}{entry.content.length > 140 ? '…' : ''}</p>
                <button style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => openDraft(entry)}>
                  Review &amp; save
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {kbDraft && (
        <div className="training-modal-backdrop" onClick={() => setKbDraft(null)}>
          <div className="training-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Save to Knowledge Base</h3>
            <KbForm
              initial={kbDraft}
              engines={engines}
              transmissions={transmissions}
              onSave={async (form) => { await createKbEntry(form, token); setKbDraft(null); }}
              onCancel={() => setKbDraft(null)}
            />
          </div>
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
  { id: 'pdf', label: 'Import' },
  { id: 'training', label: 'Training Chat' },
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
      {tab === 'pdf' && <ImportTab token={token} />}
      {tab === 'training' && <TrainingChat token={token} />}
    </div>
  );
}
