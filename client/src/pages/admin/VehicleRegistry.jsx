import { useEffect, useState } from 'react';
import {
  getEngines, createEngine, updateEngine, deleteEngine,
  getTransmissions, createTransmission, updateTransmission, deleteTransmission,
  getVehicleTypes, createVehicleType, updateVehicleType, deleteVehicleType,
} from '../../services/registryApi';

// ── Shared helpers ────────────────────────────────────────────────────────────

function KnownMakesInput({ value, onChange }) {
  const [raw, setRaw] = useState((value || []).join(', '));
  return (
    <input
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean));
      }}
      placeholder="e.g. Renault, Nissan, Fiat, Mercedes"
    />
  );
}

// ── Engines ───────────────────────────────────────────────────────────────────

const EMPTY_ENGINE = { code: '', name: '', fuel_type: '', displacement: '', aspiration: '', known_makes: [], notes: '' };
const ASPIRATION_OPTIONS = ['', 'Naturally aspirated', 'Turbocharged', 'Supercharged', 'Twin-turbo', 'Mild hybrid', 'Hybrid'];

function EngineForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_ENGINE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code.trim()) { setError('Engine code is required'); return; }
    setSaving(true); setError('');
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <form className="kb-form" onSubmit={handleSubmit}>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Engine code *</label>
          <input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. R9M" required />
        </div>
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Name / description</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 1.6 dCi Energy" />
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Fuel type</label>
          <select value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
            <option value="">—</option>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Hybrid</option>
            <option>Electric</option>
            <option>LPG</option>
          </select>
        </div>
        <div className="kb-form-group">
          <label>Displacement</label>
          <input value={form.displacement} onChange={(e) => set('displacement', e.target.value)} placeholder="e.g. 1598cc" />
        </div>
        <div className="kb-form-group">
          <label>Aspiration</label>
          <select value={form.aspiration} onChange={(e) => set('aspiration', e.target.value)}>
            {ASPIRATION_OPTIONS.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        </div>
      </div>
      <div className="kb-form-group">
        <label>Known vehicle makes (comma-separated)</label>
        <KnownMakesInput value={form.known_makes} onChange={(v) => set('known_makes', v)} />
      </div>
      <div className="kb-form-group">
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Known issues, oil spec, quirks..." />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kb-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save engine'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EnginesTab({ token }) {
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = () => getEngines(token).then(setEngines).finally(() => setLoading(false));
  useEffect(() => { load(); }, [token]);

  const editingEntry = editingId ? engines.find((e) => e.id === editingId) : null;

  return (
    <div>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          Engine records are shared across makes. A fix confirmed on any vehicle with this engine surfaces for all others.
        </p>
        {!showForm && !editingId && <button onClick={() => setShowForm(true)}>+ Add engine</button>}
      </div>

      {showForm && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">New engine</h3>
          <EngineForm onSave={async (form) => { await createEngine(form, token); setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {editingEntry && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">Edit engine</h3>
          <EngineForm
            initial={{ ...editingEntry, known_makes: editingEntry.known_makes || [] }}
            onSave={async (form) => { await updateEngine(editingId, form, token); setEditingId(null); load(); }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {loading ? <p className="admin-loading">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Fuel</th><th>Displacement</th><th>Aspiration</th><th>Found in</th><th></th></tr>
            </thead>
            <tbody>
              {engines.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.code}</strong></td>
                  <td>{e.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.fuel_type || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.displacement || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{e.aspiration || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={{ fontSize: '0.85rem', color: '#6b7280' }}>{(e.known_makes || []).join(', ') || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => { setEditingId(e.id); setShowForm(false); }}>Edit</button>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={async () => { if (!confirm(`Delete engine ${e.code}?`)) return; await deleteEngine(e.id, token); load(); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!engines.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No engines registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Transmissions ─────────────────────────────────────────────────────────────

const EMPTY_TX = { code: '', name: '', type: '', speeds: '', known_makes: [], notes: '' };
const TX_TYPES = ['', 'Manual', 'Automatic', 'CVT', 'DCT', 'AMT', 'PDK', 'DSG'];

function TransmissionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_TX);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code.trim()) { setError('Transmission code is required'); return; }
    setSaving(true); setError('');
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <form className="kb-form" onSubmit={handleSubmit}>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Transmission code *</label>
          <input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. PK6" required />
        </div>
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Name / description</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 6-speed manual" />
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {TX_TYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
          </select>
        </div>
        <div className="kb-form-group">
          <label>Speeds</label>
          <input type="number" min="1" max="12" value={form.speeds} onChange={(e) => set('speeds', e.target.value)} placeholder="e.g. 6" />
        </div>
      </div>
      <div className="kb-form-group">
        <label>Known vehicle makes (comma-separated)</label>
        <KnownMakesInput value={form.known_makes} onChange={(v) => set('known_makes', v)} />
      </div>
      <div className="kb-form-group">
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Known issues, fluid spec, quirks..." />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kb-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save transmission'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function TransmissionsTab({ token }) {
  const [transmissions, setTransmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = () => getTransmissions(token).then(setTransmissions).finally(() => setLoading(false));
  useEffect(() => { load(); }, [token]);

  const editingEntry = editingId ? transmissions.find((t) => t.id === editingId) : null;

  return (
    <div>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          Transmission records enable cross-make knowledge sharing for gearbox faults.
        </p>
        {!showForm && !editingId && <button onClick={() => setShowForm(true)}>+ Add transmission</button>}
      </div>

      {showForm && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">New transmission</h3>
          <TransmissionForm onSave={async (form) => { await createTransmission(form, token); setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {editingEntry && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">Edit transmission</h3>
          <TransmissionForm
            initial={{ ...editingEntry, known_makes: editingEntry.known_makes || [] }}
            onSave={async (form) => { await updateTransmission(editingId, form, token); setEditingId(null); load(); }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {loading ? <p className="admin-loading">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Type</th><th>Speeds</th><th>Found in</th><th></th></tr>
            </thead>
            <tbody>
              {transmissions.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.code}</strong></td>
                  <td>{t.name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{t.type || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{t.speeds || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={{ fontSize: '0.85rem', color: '#6b7280' }}>{(t.known_makes || []).join(', ') || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => { setEditingId(t.id); setShowForm(false); }}>Edit</button>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={async () => { if (!confirm(`Delete transmission ${t.code}?`)) return; await deleteTransmission(t.id, token); load(); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!transmissions.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No transmissions registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vehicle Types ─────────────────────────────────────────────────────────────

const EMPTY_VT = {
  make: '', model: '', year_from: '', year_to: '', body_type: '', fuel_type: '',
  engine_id: '', engine_code: '', transmission_id: '', transmission_code: '', notes: '',
};

function VehicleTypeForm({ initial, engines, transmissions, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_VT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleEngineSelect = (id) => {
    const engine = engines.find((e) => e.id === id);
    set('engine_id', id);
    if (engine) set('engine_code', engine.code);
  };

  const handleTxSelect = (id) => {
    const tx = transmissions.find((t) => t.id === id);
    set('transmission_id', id);
    if (tx) set('transmission_code', tx.code);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.make.trim() || !form.model.trim()) { setError('Make and model are required'); return; }
    setSaving(true); setError('');
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <form className="kb-form" onSubmit={handleSubmit}>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Make *</label>
          <input value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="e.g. Renault" required />
        </div>
        <div className="kb-form-group">
          <label>Model *</label>
          <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. Trafic" required />
        </div>
        <div className="kb-form-group">
          <label>Year from</label>
          <input value={form.year_from} onChange={(e) => set('year_from', e.target.value)} placeholder="e.g. 2014" />
        </div>
        <div className="kb-form-group">
          <label>Year to</label>
          <input value={form.year_to} onChange={(e) => set('year_to', e.target.value)} placeholder="e.g. 2021" />
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group">
          <label>Body type</label>
          <input value={form.body_type} onChange={(e) => set('body_type', e.target.value)} placeholder="e.g. Van" />
        </div>
        <div className="kb-form-group">
          <label>Fuel type</label>
          <select value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
            <option value="">—</option>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Hybrid</option>
            <option>Electric</option>
            <option>LPG</option>
          </select>
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Engine</label>
          <select value={form.engine_id} onChange={(e) => handleEngineSelect(e.target.value)}>
            <option value="">— Select engine —</option>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>{e.code}{e.name ? ` — ${e.name}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="kb-form-group">
          <label>Engine code (manual)</label>
          <input value={form.engine_code} onChange={(e) => set('engine_code', e.target.value)} placeholder="Auto-filled from engine" />
        </div>
      </div>
      <div className="kb-form-row">
        <div className="kb-form-group" style={{ flex: 2 }}>
          <label>Transmission</label>
          <select value={form.transmission_id} onChange={(e) => handleTxSelect(e.target.value)}>
            <option value="">— Select transmission —</option>
            {transmissions.map((t) => (
              <option key={t.id} value={t.id}>{t.code}{t.name ? ` — ${t.name}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="kb-form-group">
          <label>Transmission code (manual)</label>
          <input value={form.transmission_code} onChange={(e) => set('transmission_code', e.target.value)} placeholder="Auto-filled from transmission" />
        </div>
      </div>
      <div className="kb-form-group">
        <label>Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional variant notes..." />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="kb-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save vehicle type'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function VehicleTypesTab({ token }) {
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [engines, setEngines] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const load = () =>
    Promise.all([getVehicleTypes(token), getEngines(token), getTransmissions(token)])
      .then(([vt, e, t]) => { setVehicleTypes(vt); setEngines(e); setTransmissions(t); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const editingEntry = editingId ? vehicleTypes.find((v) => v.id === editingId) : null;

  const filtered = vehicleTypes.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.make?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) || v.engine_code?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="admin-toolbar" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          Link make/model variants to their engine and transmission. Projects assigned to a vehicle type inherit cross-make knowledge.
        </p>
        {!showForm && !editingId && <button onClick={() => setShowForm(true)}>+ Add vehicle type</button>}
      </div>

      {showForm && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">New vehicle type</h3>
          <VehicleTypeForm
            engines={engines} transmissions={transmissions}
            onSave={async (form) => { await createVehicleType(form, token); setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {editingEntry && (
        <div className="kb-form-wrap">
          <h3 className="admin-section-title">Edit vehicle type</h3>
          <VehicleTypeForm
            initial={editingEntry}
            engines={engines} transmissions={transmissions}
            onSave={async (form) => { await updateVehicleType(editingId, form, token); setEditingId(null); load(); }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input className="admin-search" placeholder="Filter by make, model or engine code..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      </div>

      {loading ? <p className="admin-loading">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Make</th><th>Model</th><th>Years</th><th>Body</th><th>Fuel</th><th>Engine</th><th>Transmission</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>{v.make}</td>
                  <td>{v.model}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    {v.year_from || '?'}{v.year_to ? ` – ${v.year_to}` : '+'}
                  </td>
                  <td>{v.body_type || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>{v.fuel_type || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td>
                    {v.engine_code
                      ? <span className="badge badge-blue">{v.engine_code}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td>
                    {v.transmission_code
                      ? <span className="badge badge-blue">{v.transmission_code}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => { setEditingId(v.id); setShowForm(false); }}>Edit</button>
                      <button className="secondary" style={{ fontSize: '0.75rem', padding: '3px 10px', background: '#fee2e2', color: '#b91c1c' }} onClick={async () => { if (!confirm(`Delete ${v.make} ${v.model}?`)) return; await deleteVehicleType(v.id, token); load(); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No vehicle types registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'engines', label: 'Engines' },
  { id: 'transmissions', label: 'Transmissions' },
  { id: 'vehicle-types', label: 'Vehicle Types' },
];

export default function VehicleRegistry({ token }) {
  const [tab, setTab] = useState('engines');

  return (
    <div>
      <div className="admin-toolbar">
        <h2 className="admin-page-title" style={{ margin: 0 }}>Vehicle Registry</h2>
        <div className="tab-toggle">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'engines' && <EnginesTab token={token} />}
      {tab === 'transmissions' && <TransmissionsTab token={token} />}
      {tab === 'vehicle-types' && <VehicleTypesTab token={token} />}
    </div>
  );
}
