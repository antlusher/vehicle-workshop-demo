import { useState } from 'react';
import Dashboard from './Dashboard';
import Users from './Users';
import Projects from './Projects';
import AiKnowledge from './AiKnowledge';
import VehicleRegistry from './VehicleRegistry';
import Customers from './Customers';
import WorkshopSettings from './WorkshopSettings';
import Inventory from './Inventory';
import Invoices from './Invoices';

// owner: all nav | admin: no Staff/Workshop | tech: not in AdminShell
const ALL_NAV = [
  { id: 'dashboard', label: 'Dashboard', roles: ['owner', 'admin'] },
  { id: 'work',      label: 'Work',      roles: ['owner', 'admin'] },
  { id: 'ai',        label: 'AI & Knowledge', roles: ['owner', 'admin'] },
  { id: 'registry',  label: 'Vehicle Registry', roles: ['owner', 'admin'] },
  { id: 'inventory', label: 'Inventory', roles: ['owner', 'admin'] },
  { id: 'staff',     label: 'Staff',     roles: ['owner'] },
  { id: 'workshop',  label: 'Workshop',  roles: ['owner'] },
];

const WORK_TABS = [
  { id: 'projects',   label: 'Projects' },
  { id: 'invoices',   label: 'Invoices' },
  { id: 'customers',  label: 'Customers' },
];

function WorkSection({ token }) {
  const [tab, setTab] = useState('projects');
  return (
    <div className="work-section">
      <div className="work-tabs">
        {WORK_TABS.map((t) => (
          <button
            key={t.id}
            className={`work-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="work-tab-content">
        {tab === 'projects'  && <Projects  token={token} />}
        {tab === 'invoices'  && <Invoices  token={token} />}
        {tab === 'customers' && <Customers token={token} />}
      </div>
    </div>
  );
}

export default function AdminShell({ token, userEmail, userRole = 'admin', onExit }) {
  const role = userRole;
  const nav = ALL_NAV.filter((n) => n.roles.includes(role));
  const [page, setPage] = useState(nav[0]?.id || 'dashboard');

  const activePage = nav.find((n) => n.id === page) ? page : nav[0]?.id;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <span className="admin-brand">Ask Bob</span>
          <span className="admin-brand-sub">{role === 'owner' ? 'Owner' : 'Admin'}</span>
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
        {activePage === 'dashboard' && <Dashboard  token={token} />}
        {activePage === 'work'      && <WorkSection token={token} />}
        {activePage === 'ai'        && <AiKnowledge token={token} />}
        {activePage === 'registry'  && <VehicleRegistry token={token} />}
        {activePage === 'staff'     && <Users token={token} currentUserEmail={userEmail} />}
        {activePage === 'customers' && <Customers token={token} />}
        {activePage === 'workshop'  && <WorkshopSettings token={token} userRole={role} />}
        {activePage === 'inventory' && <Inventory token={token} />}
      </main>
    </div>
  );
}
