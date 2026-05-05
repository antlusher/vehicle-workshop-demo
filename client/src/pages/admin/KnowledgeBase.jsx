import { useEffect, useState } from 'react';
import { getKnowledgeBase, createKbEntry, updateKbEntry, deleteKbEntry } from '../../services/adminApi';

const CATEGORIES = ['Common Fix', 'DTC Code', 'Vehicle Note', 'Service Interval', 'General'];

const EMPTY_FORM = {
  category: 'Common Fix', make: '', model: '', year_from: '', year_to: '',
  fault_code: '', title: '', content: '', source: '',
};

function KbForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
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
        <textarea
          rows={5}
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          placeholder="Full details — diagnostic steps, fix procedure, notes for the AI..."
          required
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kb-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save entry'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function KnowledgeBase({ token }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = (params = {}) =>
    getKnowledgeBase(token, params).then(setEntries).finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const handleSearch = () => {
    const params = {};
    if (filterCategory) params.category = filterCategory;
    if (search) params.search = search;
    load(params);
  };

  const handleCreate = async (form) => {
    await createKbEntry(form, token);
    setShowForm(false);
    load();
  };

  const handleUpdate = async (form) => {
    await updateKbEntry(editingId, form, token);
    setEditingId(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    await deleteKbEntry(id, token);
    setEntries((e) => e.filter((x) => x.id !== id));
  };

  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Knowledge Base</h2>
        {!showForm && !editingId && (
          <button onClick={() => setShowForm(true)}>+ Add entry</button>
        )}
      </div>

      {showForm && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">New entry</h3>
          <KbForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {editingEntry && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">Edit entry</h3>
          <KbForm
            initial={{
              category: editingEntry.category,
              make: editingEntry.make || '',
              model: editingEntry.model || '',
              year_from: editingEntry.year_from || '',
              year_to: editingEntry.year_to || '',
              fault_code: editingEntry.fault_code || '',
              title: editingEntry.title,
              content: editingEntry.content,
              source: editingEntry.source || '',
            }}
            onSave={handleUpdate}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <div className="admin-filters">
        <input
          className="admin-search"
          placeholder="Search title, content or fault code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
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
              <tr>
                <th>Category</th>
                <th>Vehicle</th>
                <th>Fault code</th>
                <th>Title</th>
                <th>Source</th>
                <th>Updated</th>
                <th></th>
              </tr>
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
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={() => handleDelete(e.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No entries yet. Add your first knowledge base entry above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
