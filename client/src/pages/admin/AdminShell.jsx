import { useState } from 'react';
import Dashboard from './Dashboard';
import Users from './Users';
import AiKnowledge from './AiKnowledge';
import VehicleRegistry from './VehicleRegistry';
import WorkshopSettings from './WorkshopSettings';
import Inventory from './Inventory';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

// owner: all nav | admin: no Staff/Workshop | tech: not in AdminShell
const ALL_NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardRoundedIcon,    roles: ['owner', 'admin'] },
  { id: 'ai',        label: 'AI',        Icon: AutoAwesomeRoundedIcon,   roles: ['owner', 'admin'] },
  { id: 'registry',  label: 'Vehicles',  Icon: DirectionsCarRoundedIcon, roles: ['owner', 'admin'] },
  { id: 'inventory', label: 'Inventory', Icon: Inventory2RoundedIcon,    roles: ['owner', 'admin'] },
  { id: 'staff',     label: 'Staff',     Icon: GroupRoundedIcon,         roles: ['owner'] },
  { id: 'workshop',  label: 'Settings',  Icon: TuneRoundedIcon,          roles: ['owner'] },
];

function NavRail({ nav, activePage, onPage, userEmail, onExit }) {
  return (
    <nav className="app-nav-rail">
      <div className="nav-rail-brand">Ask<br />Bob</div>

      <div className="nav-rail-items">
        {nav.map(({ id, label, Icon }) => (
          <button key={id} type="button"
            className={`nav-rail-item${activePage === id ? ' active' : ''}`}
            onClick={() => onPage(id)}>
            <div className="nav-rail-pill">
              <Icon style={{ fontSize: 22 }} />
            </div>
            <span className="nav-rail-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="nav-rail-footer">
        {userEmail && <div className="nav-rail-email">{userEmail}</div>}
        <button type="button" className="nav-rail-item" onClick={onExit}>
          <div className="nav-rail-pill">
            <ArrowBackRoundedIcon style={{ fontSize: 20 }} />
          </div>
          <span className="nav-rail-label">Back</span>
        </button>
      </div>
    </nav>
  );
}

export default function AdminShell({ token, userEmail, userRole = 'admin', onExit }) {
  const role = userRole;
  const nav = ALL_NAV.filter((n) => n.roles.includes(role));
  const [page, setPage] = useState(nav[0]?.id || 'dashboard');

  const activePage = nav.find((n) => n.id === page) ? page : nav[0]?.id;

  return (
    <div className="main-shell">
      <NavRail nav={nav} activePage={activePage} onPage={setPage} userEmail={userEmail} onExit={onExit} />
      <main className="admin-content">
        {activePage === 'dashboard' && <Dashboard        token={token} />}
        {activePage === 'ai'        && <AiKnowledge      token={token} />}
        {activePage === 'registry'  && <VehicleRegistry  token={token} />}
        {activePage === 'staff'     && <Users            token={token} currentUserEmail={userEmail} />}
        {activePage === 'workshop'  && <WorkshopSettings token={token} userRole={role} />}
        {activePage === 'inventory' && <Inventory        token={token} />}
      </main>
    </div>
  );
}
