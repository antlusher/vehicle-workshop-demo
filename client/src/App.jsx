import { useEffect, useState } from 'react';
import * as api from './services/api';
import { exitActAs } from './services/sysadminApi';
import Login from './pages/Login';
import AdminShell from './pages/admin/AdminShell';
import SysAdminShell from './pages/SysAdminShell';
import CustomerPortal from './pages/CustomerPortal';
import CustomerLogin from './pages/CustomerLogin';
import QuoteAcceptPage from './pages/QuoteAcceptPage';
import WorkshopShell from './pages/WorkshopShell';
import { ToastProvider } from './context/ToastContext';
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
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return;
      const overlays = document.querySelectorAll('.preview-overlay');
      if (overlays.length) overlays[overlays.length - 1].click();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

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

  // Magic link auto-login: ?magic=TOKEN&project=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic = params.get('magic');
    const projectId = params.get('project');
    if (!magic) return;

    // Clear the URL immediately so refresh doesn't re-use the token
    window.history.replaceState({}, '', '/portal');

    fetch('/api/customer/magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magic }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('portalProjectId', projectId || '');
          setToken(data.token);
          setUser({ email: data.email, role: data.role });
          setStatus('ready');
        }
      })
      .catch(() => {});
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

        api.getWorkshopSettings(token)
          .then((s) => setAiEnabled(s.aiEnabled !== false))
          .catch(() => {});

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

  const [actorState, setActorState] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  const handleExitActor = async () => {
    if (actorState?.token) {
      try { await exitActAs(actorState.token, token); } catch (_) {}
    }
    setActorState(null);
  };

  const isCustomerSubdomain =
    window.location.hostname.startsWith('customer.') ||
    (import.meta.env.DEV && new URLSearchParams(window.location.search).has('cp'));
  const urlParams = new URLSearchParams(window.location.search);
  const activateToken = urlParams.get('activate');
  const quoteToken = urlParams.get('quote');

  // Public quote accept page — anyone with the link can view/accept, no auth needed
  if (quoteToken) {
    return <QuoteAcceptPage quoteToken={quoteToken} />;
  }

  const handleCustomerLoginSuccess = (data) => {
    localStorage.setItem('token', data.token);
    // Clear activate param from URL without reload
    window.history.replaceState({}, '', '/');
    setToken(data.token);
    setUser({ email: data.email, role: data.role, name: data.name });
    setStatus('ready');
  };

  if (!token) {
    if (isCustomerSubdomain || activateToken) {
      return (
        <CustomerLogin
          activateToken={activateToken}
          onSuccess={handleCustomerLoginSuccess}
        />
      );
    }
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

  if (user && !user.subscribed && user.role !== 'customer') {
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

  if (user?.role === 'sysadmin') {
    if (actorState) {
      return (
        <>
          <div className="actor-banner">
            Acting as <strong>{actorState.workshopName}</strong>
            <button onClick={handleExitActor}>Exit</button>
          </div>
          <AdminShell
            token={actorState.token}
            userEmail={user.email}
            userRole="owner"
            onExit={handleExitActor}
          />
        </>
      );
    }
    return <SysAdminShell token={token} userEmail={user.email} onLogout={handleLogout} onActAs={setActorState} />;
  }

  const isWorkshopStaff = ['owner', 'admin', 'tech'].includes(user?.role);
  const canEnterAdmin = ['owner', 'admin'].includes(user?.role);

  if (adminView && canEnterAdmin) {
    return (
      <AdminShell
        token={token}
        userEmail={user.email}
        userRole={user.role}
        onExit={() => setAdminView(false)}
      />
    );
  }

  return (
    <WorkshopShell
      token={token}
      user={user}
      projects={projects}
      archivedProjects={archivedProjects}
      selectedProject={selectedProject}
      projectLoading={projectLoading}
      aiEnabled={aiEnabled}
      error={error}
      canEnterAdmin={canEnterAdmin}
      onCreateProject={handleCreateProject}
      onCreateProjectManual={handleCreateProjectManual}
      onSelectProject={handleSelectProject}
      onCloseProject={handleCloseProject}
      onReopenProject={handleReopenProject}
      onArchiveProject={handleArchiveProject}
      onRestoreProject={handleRestoreProject}
      onAskQuestion={handleAskQuestion}
      onConfirmSuggestion={handleConfirmSuggestion}
      onClearHistory={handleClearHistory}
      onUpdateVehicle={handleUpdateVehicle}
      onRefreshProject={handleSelectProject}
      onProjectCreated={reloadProjects}
      onEnterAdmin={() => setAdminView(true)}
      onLogout={handleLogout}
    />
  );
}

export default function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
