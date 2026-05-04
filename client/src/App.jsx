import { useEffect, useState } from 'react';
import * as api from './services/api';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

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

  const handleConfirmResponse = async (historyId) => {
    await api.confirmAIResponse(historyId, token);
    if (selectedProject) {
      const updated = await api.getProject(selectedProject.id, token);
      setSelectedProject(updated);
    }
  };

  const handleConfirmSuggestion = async (projectId, historyId, text) => {
    await api.confirmSuggestion(projectId, historyId, text, token);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Vehicle Workshop</h1>
          <p>{user?.email}</p>
        </div>
        <button className="secondary" onClick={handleLogout}>Logout</button>
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
            onSelectProject={handleSelectProject}
            onCloseProject={handleCloseProject}
            selectedProject={selectedProject}
            error={error}
          />
        </div>
        <div className="panel panel-right">
          <ProjectDetail
            project={selectedProject}
            onAsk={handleAskQuestion}
            onConfirm={handleConfirmResponse}
            onConfirmSuggestion={handleConfirmSuggestion}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
