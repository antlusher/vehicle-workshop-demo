import { useState } from 'react';

const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'Mild Hybrid', 'Plug-in Hybrid', 'LPG', 'Other'];
const BODY_TYPES = ['Hatchback', 'Saloon', 'Estate', 'SUV', 'MPV', 'Van', 'Pickup', 'Coupe', 'Convertible', 'Other'];
const EMPTY_MANUAL = { registration: '', vin: '', make: '', model: '', year: '', engineCode: '', fuelType: '', trim: '', bodyType: '' };

function Projects({ projects, archivedProjects, onCreateProject, onCreateProjectManual, onSelectProject, onCloseProject, onArchiveProject, onRestoreProject, selectedProject, error }) {
  const [identifier, setIdentifier] = useState('');
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState(EMPTY_MANUAL);
  const [showArchived, setShowArchived] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLookupSubmit = async (e) => {
    e.preventDefault();
    const cleaned = identifier.trim().toUpperCase().replace(/\s+/g, '');
    if (cleaned) {
      await onCreateProject(cleaned);
      setIdentifier('');
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!form.registration && !form.vin && !form.make) return;
    await onCreateProjectManual(form);
    setForm(EMPTY_MANUAL);
  };

  const handleArchive = (e, projectId) => {
    e.stopPropagation();
    if (window.confirm('Remove this project from your list? The data and history will be kept and can be restored.')) {
      onArchiveProject(projectId);
    }
  };

  const handleRestore = (e, projectId) => {
    e.stopPropagation();
    onRestoreProject(projectId);
  };

  const displayList = showArchived ? (archivedProjects || []) : projects;

  return (
    <div className="card">
      <h2 className="section-title">Projects</h2>

      {!manual ? (
        <form onSubmit={handleLookupSubmit}>
          <label htmlFor="identifier">Registration or VIN</label>
          <input
            id="identifier"
            name="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter registration or VIN"
          />
          <button type="submit">Create project</button>
          <button type="button" className="secondary" style={{ marginTop: 6, fontSize: '0.8rem' }} onClick={() => setManual(true)}>
            Enter vehicle details manually
          </button>
        </form>
      ) : (
        <form onSubmit={handleManualSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
            <div>
              <label>Registration</label>
              <input value={form.registration} onChange={(e) => set('registration', e.target.value)} placeholder="e.g. AB12 CDE" />
            </div>
            <div>
              <label>VIN</label>
              <input value={form.vin} onChange={(e) => set('vin', e.target.value)} placeholder="17-char VIN" />
            </div>
            <div>
              <label>Make</label>
              <input value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="e.g. Ford" />
            </div>
            <div>
              <label>Model</label>
              <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. Focus" />
            </div>
            <div>
              <label>Year</label>
              <input value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="e.g. 2019" maxLength={4} />
            </div>
            <div>
              <label>Engine code</label>
              <input value={form.engineCode} onChange={(e) => set('engineCode', e.target.value)} placeholder="e.g. R9M" />
            </div>
            <div>
              <label>Fuel type</label>
              <select value={form.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
                <option value="">— Select —</option>
                {FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label>Body type</label>
              <select value={form.bodyType} onChange={(e) => set('bodyType', e.target.value)}>
                <option value="">— Select —</option>
                {BODY_TYPES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Trim / variant</label>
              <input value={form.trim} onChange={(e) => set('trim', e.target.value)} placeholder="e.g. ST-Line, Titanium" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit">Create project</button>
            <button type="button" className="secondary" onClick={() => { setManual(false); setForm(EMPTY_MANUAL); }}>
              Back to lookup
            </button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
            {showArchived ? `${displayList.length} archived` : `${displayList.length} active`}
          </span>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: '0.78rem', padding: '3px 10px' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Show active' : `Archived${(archivedProjects?.length ?? 0) > 0 ? ` (${archivedProjects.length})` : ''}`}
          </button>
        </div>

        {displayList.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>
            {showArchived ? 'No archived projects.' : 'No saved projects yet.'}
          </p>
        ) : (
          displayList.map((project) => (
            <div
              key={project.id}
              className="project-card"
              style={{ borderColor: selectedProject?.id === project.id ? '#2563eb' : '#e5e7eb' }}
            >
              <strong>{project.registration || project.vin || 'Untitled project'}</strong>
              <div className="meta">{project.make || 'Unknown make'} {project.model || ''} {project.year || ''}</div>
              <div className="meta">{project.active ? 'Open' : 'Closed'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {showArchived ? (
                  <button type="button" className="secondary" onClick={(e) => handleRestore(e, project.id)}>Restore</button>
                ) : (
                  <>
                    <button type="button" onClick={() => onSelectProject(project.id)}>Open</button>
                    {!project.closed && <button type="button" className="secondary" onClick={() => onCloseProject(project.id)}>Close</button>}
                    <button type="button" className="secondary" style={{ marginLeft: 'auto', color: '#6b7280' }} onClick={(e) => handleArchive(e, project.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Projects;
