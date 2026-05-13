import { useState } from 'react';
import Dashboard from './Dashboard';
import Users from './Users';
import Projects from './Projects';
import AiKnowledge from './AiKnowledge';
import VehicleRegistry from './VehicleRegistry';
import Customers from './Customers';
import WorkshopSettings from './WorkshopSettings';
import Inventory from './Inventory';

// manager: all nav | admin: no Users/Workshop | tech: not in AdminShell
const ALL_NAV = [
  { id: 'dashboard',  label: 'Dashboard',        roles: ['manager', 'admin'] },
  { id: 'projects',   label: 'Projects',          roles: ['manager', 'admin'] },
  { id: 'customers',  label: 'Customers',         roles: ['manager', 'admin'] },
  { id: 'ai',         label: 'AI & Knowledge',    roles: ['manager', 'admin'] },
  { id: 'registry',   label: 'Vehicle Registry',  roles: ['manager', 'admin'] },
  { id: 'inventory',  label: 'Inventory',         roles: ['manager', 'admin'] },
  { id: 'staff',      label: 'Staff',             roles: ['manager'] },
  { id: 'workshop',   label: 'Workshop',          roles: ['manager'] },
];

export default function AdminShell({ token, userEmail, userRole = 'admin', onExit }) {
  const role = userRole;
  const nav = ALL_NAV.filter((n) => n.roles.includes(role));
  const [page, setPage] = useState(nav[0]?.id || 'dashboard');

  // If current page is not accessible for this role, reset
  const activePage = nav.find((n) => n.id === page) ? page : nav[0]?.id;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <span className="admin-brand">Ask Bob</span>
          <span className="admin-brand-sub">{role === 'manager' ? 'Manager' : 'Admin'}</span>
        </div>
        <nav className="admin-nav">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`admin-nav-btn${activePage === n.id ? ' active' : ''}`}
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
        {activePage === 'dashboard' && <Dashboard token={token} />}
        {activePage === 'staff' && <Users token={token} currentUserEmail={userEmail} />}
        {activePage === 'projects' && <Projects token={token} />}
        {activePage === 'ai' && <AiKnowledge token={token} />}
        {activePage === 'registry' && <VehicleRegistry token={token} />}
        {activePage === 'customers' && <Customers token={token} />}
        {activePage === 'workshop' && <WorkshopSettings token={token} userRole={role} />}
        {activePage === 'inventory' && <Inventory token={token} />}
      </main>
    </div>
  );
}
