import { useEffect, useState } from 'react';
import * as api from './services/api';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import AdminShell from './pages/admin/AdminShell';
import CustomerPortal from './pages/CustomerPortal';
import AdminAgent from './pages/AdminAgent';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [adminView, setAdminView] = useState(false);
  const [projects, setProjects] = useState([]);
  const [archivedProjects, setArchivedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleForcedLogout = () => {
      setToken(null);
      setUser(null);
      setProjects([]);
      setArchivedProjects([]);
      setSelectedProject(null);
      setError('Your session has expired. Please log in again.');
      setStatus('idle');
    };
    window.addEventListener('auth:logout', handleForcedLogout);
    return () => window.removeEventListener('auth:logout', handleForcedLogout);
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }

    async function load() {
      setStatus('loading');
      try {
        const userData = await api.getProfile(token);
        setUser(userData);
        const [savedProjects, savedArchived] = await Promise.all([
          api.fetchProjects(token),
          api.getProjects(token, { archived: true }),
        ]);
        setProjects(savedProjects);
        setArchivedProjects(savedArchived);
        setStatus('ready');

        // Pre-generate specs in the background for any active project that's missing them
        savedProjects
          .filter((p) => !p.specs && p.make && p.model)
          .forEach((p) => api.fetchProjectSpecs(p.id, token)
            .then((specs) => setProjects((prev) =>
              prev.map((x) => x.id === p.id ? { ...x, specs } : x)
            ))
            .catch(() => {})
          );
      } catch (err) {
        setError(err.message);
        setToken(null);
        localStorage.removeItem('token');
        setStatus('idle');
      }
    }

    load();
  }, [token]);

  const handleLogin = (authData) => {
    localStorage.setItem('token', authData.token);
    setToken(authData.token);
    setUser({ email: authData.email, role: authData.role, subscribed: authData.subscribed, demoMode: authData.demoMode });
    setStatus('ready');
  };

  const handleLogout = async () => {
    if (token) {
      try { await api.logout(token); } catch (_) {}
    }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setProjects([]);
    setArchivedProjects([]);
    setSelectedProject(null);
    setAdminView(false);
    setError('');
  };

  const reloadProjects = async () => {
    if (!token) return;
    const [savedProjects, savedArchived] = await Promise.all([
      api.fetchProjects(token),
      api.getProjects(token, { archived: true }),
    ]);
    setProjects(savedProjects);
    setArchivedProjects(savedArchived);
  };

  const handleCreateProject = async (identifier) => {
    setError('');
    try {
      const project = await api.createProject(identifier, token);
      setProjects((current) => [project, ...current]);
      setSelectedProject(project);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateProjectManual = async (manualData) => {
    setError('');
    try {
      const project = await api.createProjectManual(manualData, token);
      setProjects((current) => [project, ...current]);
      setSelectedProject(project);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateVehicle = async (projectId, data) => {
    const updated = await api.updateProjectVehicle(projectId, data, token);
    setSelectedProject(updated);
    setProjects((current) => current.map((p) => p.id === projectId ? { ...p, ...updated } : p));
  };

  const [projectLoading, setProjectLoading] = useState(false);

  const handleSelectProject = async (projectId) => {
    setError('');
    setProjectLoading(true);
    try {
      const project = await api.getProject(projectId, token);
      setSelectedProject(project);
      setProjects((current) => current.map((p) =>
        p.id === projectId
          ? { ...p, make: project.make, model: project.model, year: project.year, fuel_type: project.fuel_type }
          : p
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setProjectLoading(false);
    }
  };

  const handleCloseProject = async (projectId) => {
    setError('');
    try {
      await api.closeProject(projectId, token);
      await reloadProjects();
      setSelectedProject(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReopenProject = async (projectId) => {
    setError('');
    try {
      await api.reopenProject(projectId, token);
      await reloadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAskQuestion = async (projectId, question, chatMode) => {
    setError('');
    try {
      const result = await api.askAI(projectId, question, token, chatMode);
      setSelectedProject(result.project);
      await reloadProjects();
      return result.answer;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleConfirmSuggestion = async (projectId, historyId, text) => {
    const result = await api.confirmSuggestion(projectId, historyId, text, token);
    setSelectedProject((prev) => {
      if (!prev || prev.id !== projectId) return prev;
      const already = prev.confirmedFixes?.some((f) => f.text === text);
      if (already) return prev;
      return {
        ...prev,
        confirmedFixes: [...(prev.confirmedFixes || []), { id: result.id, text, createdAt: new Date().toISOString() }],
      };
    });
  };

  const handleArchiveProject = async (projectId) => {
    setError('');
    try {
      await api.archiveProject(projectId, token);
      const archived = projects.find((p) => p.id === projectId);
      setProjects((current) => current.filter((p) => p.id !== projectId));
      if (archived) setArchivedProjects((current) => [archived, ...current]);
      if (selectedProject?.id === projectId) setSelectedProject(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRestoreProject = async (projectId) => {
    setError('');
    try {
      await api.restoreProject(projectId, token);
      const restored = archivedProjects.find((p) => p.id === projectId);
      setArchivedProjects((current) => current.filter((p) => p.id !== projectId));
      if (restored) setProjects((current) => [restored, ...current]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClearHistory = async (projectId) => {
    await api.clearProjectHistory(projectId, token);
    const updated = await api.getProject(projectId, token);
    setSelectedProject(updated);
  };

  const handleSubscribe = async () => {
    setError('');
    try {
      const updated = await api.subscribe(token);
      setUser(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  const [showAssistant, setShowAssistant] = useState(false);

  if (!token) {
    return <Login onLogin={handleLogin} error={error} />;
  }

  if (status === 'loading') {
    return (
      <div className="app-loading-overlay">
        <div className="app-loading-inner">
          <div className="app-loading-logo">Ask Bob</div>
          <div className="app-loading-spinner" />
          <p className="app-loading-text">Loading your workshop…</p>
        </div>
      </div>
    );
  }

  if (user && !user.subscribed) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>Ask Bob</h1>
          <button onClick={handleLogout}>Logout</button>
        </header>
        <section className="card">
          <h2>Subscription required</h2>
          <p>Only subscribed users can access project data and AI guidance.</p>
          <button onClick={handleSubscribe}>Activate subscription</button>
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    );
  }

  if (user?.role === 'customer') {
    return <CustomerPortal user={user} token={token} onLogout={handleLogout} />;
  }

  if (adminView && user?.role === 'admin') {
    return (
      <AdminShell
        token={token}
        userEmail={user.email}
        onExit={() => setAdminView(false)}
      />
    );
  }

  return (
    <div className="app-shell">
      {showAssistant && (
        <AdminAgent
          token={token}
          onClose={() => setShowAssistant(false)}
          onProjectCreated={reloadProjects}
        />
      )}
      <header className="app-header">
        <div>
          <h1>Ask Bob</h1>
          <p>{user?.email}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="secondary" onClick={() => setShowAssistant(true)} style={{ fontSize: '0.85rem' }}>
            Assistant
          </button>
          {user?.role === 'admin' && (
            <button className="secondary" onClick={() => setAdminView(true)} style={{ fontSize: '0.85rem' }}>
              Admin
            </button>
          )}
          <button className="secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      {user?.demoMode && (
        <div className="demo-banner">
          Demo mode active: AI responses are fallback guidance until the API key is configured.
        </div>
      )}
      <main className="app-grid">
        <div className="panel panel-left">
          <Projects
            projects={projects}
            archivedProjects={archivedProjects}
            onCreateProject={handleCreateProject}
            onCreateProjectManual={handleCreateProjectManual}
            onSelectProject={handleSelectProject}
            onCloseProject={handleCloseProject}
            onReopenProject={handleReopenProject}
            onArchiveProject={handleArchiveProject}
            onRestoreProject={handleRestoreProject}
            selectedProject={selectedProject}
            error={error}
          />
        </div>
        <div className="panel-right">
          <ProjectDetail
            project={selectedProject}
            projectLoading={projectLoading}
            onAsk={handleAskQuestion}
            onConfirmSuggestion={handleConfirmSuggestion}
            onClearHistory={handleClearHistory}
            onUpdateVehicle={handleUpdateVehicle}
            onRefreshProject={handleSelectProject}
            token={token}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
