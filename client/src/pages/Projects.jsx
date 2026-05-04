import { useState } from 'react';

function Projects({ projects, onCreateProject, onSelectProject, onCloseProject, selectedProject, error }) {
  const [identifier, setIdentifier] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (identifier.trim()) {
      await onCreateProject(identifier.trim());
      setIdentifier('');
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Projects</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="identifier">Registration or VIN</label>
        <input
          id="identifier"
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Enter registration or VIN"
        />
        <button type="submit">Create project</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 16 }}>
        {projects.length === 0 ? (
          <p>No saved projects yet.</p>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="project-card" style={{ borderColor: selectedProject?.id === project.id ? '#2563eb' : '#e5e7eb' }}>
              <strong>{project.registration || project.vin || 'Untitled project'}</strong>
              <div className="meta">{project.make || 'Unknown make'} {project.model || ''} {project.year || ''}</div>
              <div className="meta">{project.active ? 'Open' : 'Closed'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" onClick={() => onSelectProject(project.id)}>Open</button>
                {!project.closed && <button type="button" className="secondary" onClick={() => onCloseProject(project.id)}>Close</button>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Projects;
