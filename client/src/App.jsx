import { useEffect, useState } from 'react';
import * as api from './services/api';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import AdminShell from './pages/admin/AdminShell';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [adminView, setAdminView] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleForcedLogout = () => {
      setToken(null);
      setUser(null);
      setProjects([]);
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
        const savedProjects = await api.fetchProjects(token);
        setProjects(savedProjects);
        setStatus('ready');
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
    setSelectedProject(null);
    setAdminView(false);
    setError('');
  };

  const reloadProjects = async () => {
    if (!token) return;
    const savedProjects = await api.fetchProjects(token);
    setProjects(savedProjects);
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

  const handleSelectProject = async (projectId) => {
    setError('');
    try {
      const project = await api.getProject(projectId, token);
      setSelectedProject(project);
    } catch (err) {
      setError(err.message);
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

  const handleAskQuestion = async (projectId, question) => {
    setError('');
    try {
      const result = await api.askAI(projectId, question, token);
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

  if (!token) {
    return <Login onLogin={handleLogin} error={error} />;
  }

  if (status === 'loading') {
    return <div className="app-shell"><p>Loading your workshop...</p></div>;
  }

  if (user && !user.subscribed) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>Vehicle Workshop</h1>
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
      <header className="app-header">
        <div>
          <h1>Vehicle Workshop</h1>
          <p>{user?.email}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            onCreateProject={handleCreateProject}
            onCreateProjectManual={handleCreateProjectManual}
            onSelectProject={handleSelectProject}
            onCloseProject={handleCloseProject}
            selectedProject={selectedProject}
            error={error}
          />
        </div>
        <div className="panel-right">
          <ProjectDetail
            project={selectedProject}
            onAsk={handleAskQuestion}
            onConfirmSuggestion={handleConfirmSuggestion}
            onClearHistory={handleClearHistory}
            onUpdateVehicle={handleUpdateVehicle}
            token={token}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
