import { useState } from 'react';
import Projects from './Projects';
import ProjectDetail from './ProjectDetail';
import Invoices from './admin/Invoices';
import Customers from './admin/Customers';
import AdminAgent from './AdminAgent';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import HandymanRoundedIcon from '@mui/icons-material/HandymanRounded';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';

const NAV_ITEMS = [
  { id: 'work',      label: 'Work',      Icon: HandymanRoundedIcon },
  { id: 'invoices',  label: 'Invoices',  Icon: ReceiptLongRoundedIcon },
  { id: 'customers', label: 'Customers', Icon: PeopleRoundedIcon },
];

function QuickAddBadge({ onClick }) {
  return (
    <button
      type="button"
      className="nav-quick-add-badge"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <AddRoundedIcon style={{ fontSize: 11 }} />
    </button>
  );
}

function NavRail({ section, onSection, userEmail, canEnterAdmin, aiEnabled, quickAdd, onProjects, onAdmin, onAssistant, onLogout }) {
  return (
    <nav className="app-nav-rail">
      <div className="nav-rail-brand">Ask<br />Bob</div>

      <div className="nav-rail-items">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = section === id;
          return (
            <div key={id} className="nav-item-wrapper">
              <button type="button"
                className={`nav-rail-item${active ? ' active' : ''}`}
                onClick={() => onSection(id)}>
                <div className="nav-rail-pill">
                  <Icon style={{ fontSize: 22 }} />
                </div>
                <span className="nav-rail-label">{label}</span>
              </button>
              {quickAdd?.[id] && <QuickAddBadge onClick={quickAdd[id]} />}
            </div>
          );
        })}

        <div className="nav-item-wrapper">
          <button type="button" className="nav-rail-item" onClick={onProjects}>
            <div className="nav-rail-pill">
              <DirectionsCarRoundedIcon style={{ fontSize: 22 }} />
            </div>
            <span className="nav-rail-label">Projects</span>
          </button>
          {quickAdd?.projects && <QuickAddBadge onClick={quickAdd.projects} />}
        </div>

        {aiEnabled && (
          <button type="button" className="nav-rail-item" onClick={onAssistant}>
            <div className="nav-rail-pill">
              <SmartToyRoundedIcon style={{ fontSize: 22 }} />
            </div>
            <span className="nav-rail-label">Assistant</span>
          </button>
        )}

        {canEnterAdmin && (
          <button type="button" className="nav-rail-item" onClick={onAdmin}>
            <div className="nav-rail-pill">
              <AdminPanelSettingsRoundedIcon style={{ fontSize: 22 }} />
            </div>
            <span className="nav-rail-label">Admin</span>
          </button>
        )}
      </div>

      <div className="nav-rail-footer">
        {userEmail && (
          <div className="nav-rail-email">{userEmail}</div>
        )}
        <button type="button" className="nav-rail-item" onClick={onLogout}>
          <div className="nav-rail-pill">
            <LogoutRoundedIcon style={{ fontSize: 20 }} />
          </div>
          <span className="nav-rail-label">Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default function WorkshopShell({
  token, user, projects, archivedProjects, selectedProject, projectLoading,
  aiEnabled, error, canEnterAdmin,
  onCreateProject, onCreateProjectManual, onSelectProject,
  onCloseProject, onReopenProject, onArchiveProject, onRestoreProject,
  onAskQuestion, onConfirmSuggestion, onClearHistory, onUpdateVehicle, onRefreshProject,
  onProjectCreated, onEnterAdmin, onLogout,
}) {
  const [section, setSection] = useState('work');
  const [showAssistant, setShowAssistant] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [openCreateCustomer, setOpenCreateCustomer] = useState(false);

  const handleSelectProject = (id) => {
    onSelectProject(id);
    setShowProjects(false);
    setSection('work');
  };

  const quickAdd = {
    projects:  () => setShowProjects(true),
    invoices:  () => setSection('invoices'),
    customers: () => { setSection('customers'); setOpenCreateCustomer(true); },
  };

  return (
    <div className="main-shell">
      {showAssistant && (
        <AdminAgent
          token={token}
          onClose={() => setShowAssistant(false)}
          onProjectCreated={onProjectCreated}
        />
      )}

      {showProjects && (
        <div className="preview-overlay" onClick={() => setShowProjects(false)}>
          <div className="preview-modal" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>Projects</h3>
              <button className="preview-close" onClick={() => setShowProjects(false)}>✕</button>
            </div>
            <div className="preview-modal-body" style={{ padding: '16px 24px 24px' }}>
              <Projects
                projects={projects}
                archivedProjects={archivedProjects}
                onCreateProject={onCreateProject}
                onCreateProjectManual={onCreateProjectManual}
                onSelectProject={handleSelectProject}
                onCloseProject={onCloseProject}
                onReopenProject={onReopenProject}
                onArchiveProject={onArchiveProject}
                onRestoreProject={onRestoreProject}
                selectedProject={selectedProject}
                error={error}
              />
            </div>
          </div>
        </div>
      )}

      <NavRail
        section={section}
        onSection={setSection}
        userEmail={user?.email}
        canEnterAdmin={canEnterAdmin}
        aiEnabled={aiEnabled}
        quickAdd={quickAdd}
        onProjects={() => setShowProjects(true)}
        onAdmin={onEnterAdmin}
        onAssistant={() => setShowAssistant(true)}
        onLogout={onLogout}
      />

      <div className="main-content">
        {user?.demoMode && (
          <div className="demo-banner">
            Demo mode active: AI responses are fallback guidance until the API key is configured.
          </div>
        )}

        {section === 'work' && (
          <div className="panel-right" style={{ height: 'calc(100vh - 56px)' }}>
            <ProjectDetail
              project={selectedProject}
              projectLoading={projectLoading}
              onAsk={onAskQuestion}
              onConfirmSuggestion={onConfirmSuggestion}
              onClearHistory={onClearHistory}
              onUpdateVehicle={onUpdateVehicle}
              onRefreshProject={onRefreshProject}
              token={token}
              aiEnabled={aiEnabled}
            />
          </div>
        )}

        {section === 'invoices' && <Invoices token={token} />}
        {section === 'customers' && (
          <Customers
            token={token}
            openCreate={openCreateCustomer}
            onOpenCreateHandled={() => setOpenCreateCustomer(false)}
          />
        )}
      </div>
    </div>
  );
}
