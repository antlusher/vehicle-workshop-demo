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

function NavRail({ section, onSection, userEmail, canEnterAdmin, aiEnabled, onProjects, onAdmin, onAssistant, onLogout }) {
  return (
    <nav className="app-nav-rail">
      <div className="nav-rail-brand">Ask<br />Bob</div>

      <div className="nav-rail-items">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = section === id;
          return (
            <button key={id} type="button"
              className={`nav-rail-item${active ? ' active' : ''}`}
              onClick={() => onSection(id)}>
              <div className="nav-rail-pill">
                <Icon style={{ fontSize: 22 }} />
              </div>
              <span className="nav-rail-label">{label}</span>
            </button>
          );
        })}

        <button type="button" className="nav-rail-item" onClick={onProjects}>
          <div className="nav-rail-pill">
            <DirectionsCarRoundedIcon style={{ fontSize: 22 }} />
          </div>
          <span className="nav-rail-label">Projects</span>
        </button>

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

  const handleSelectProject = (id) => {
    onSelectProject(id);
    setShowProjects(false);
    setSection('work');
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 56px)' }}>
            <div className="quickadd-row">
              <button className="quickadd-card" onClick={() => setShowProjects(true)}>
                <div className="quickadd-card-icon">
                  <AddRoundedIcon style={{ fontSize: 17, color: '#1558D6' }} />
                </div>
                New project
              </button>
              <button className="quickadd-card" onClick={() => setSection('customers')}>
                <div className="quickadd-card-icon">
                  <PeopleRoundedIcon style={{ fontSize: 17, color: '#1558D6' }} />
                </div>
                Customer
              </button>
              <button className="quickadd-card" onClick={() => setSection('invoices')}>
                <div className="quickadd-card-icon">
                  <ReceiptLongRoundedIcon style={{ fontSize: 17, color: '#1558D6' }} />
                </div>
                Quote
              </button>
            </div>
            <div className="panel-right" style={{ flex: 1, height: 'auto', minHeight: 0 }}>
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
          </div>
        )}

        {section === 'invoices'  && <Invoices  token={token} />}
        {section === 'customers' && <Customers token={token} />}
      </div>
    </div>
  );
}
