import { useState } from 'react';
import Dashboard from './Dashboard';
import Users from './Users';
import AiRequests from './AiRequests';
import KnowledgeBase from './KnowledgeBase';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Users' },
  { id: 'ai', label: 'AI Requests' },
  { id: 'kb', label: 'Knowledge Base' },
];

export default function AdminShell({ token, userEmail, onExit }) {
  const [page, setPage] = useState('dashboard');

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <span className="admin-brand">Vehicle Workshop</span>
          <span className="admin-brand-sub">Admin</span>
        </div>
        <nav className="admin-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`admin-nav-btn${page === n.id ? ' active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="admin-header-right">
          <span className="admin-user">{userEmail}</span>
          <button className="secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={onExit}>
            Back to app
          </button>
        </div>
      </header>

      <main className="admin-content">
        {page === 'dashboard' && <Dashboard token={token} />}
        {page === 'users' && <Users token={token} />}
        {page === 'ai' && <AiRequests token={token} />}
        {page === 'kb' && <KnowledgeBase token={token} />}
      </main>
    </div>
  );
}
