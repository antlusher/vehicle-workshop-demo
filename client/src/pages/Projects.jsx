import { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent,
  Chip, IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Menu,
} from '@mui/material';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';

const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'Mild Hybrid', 'Plug-in Hybrid', 'LPG', 'Other'];
const BODY_TYPES = ['Hatchback', 'Saloon', 'Estate', 'SUV', 'MPV', 'Van', 'Pickup', 'Coupe', 'Convertible', 'Other'];
const EMPTY_MANUAL = { registration: '', vin: '', make: '', model: '', year: '', engineCode: '', fuelType: '', trim: '', bodyType: '' };

const m3Theme = createTheme({
  palette: { primary: { main: '#1558D6' }, background: { default: '#F3F4F9', paper: '#ffffff' } },
  typography: { fontFamily: '"Roboto", "Helvetica Neue", sans-serif' },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: { root: { borderRadius: 100, textTransform: 'none', fontWeight: 500 } },
    },
    MuiCard: {
      styleOverrides: { root: { boxShadow: 'none' } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: '24px' } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: '8px', fontWeight: 500, fontSize: '0.72rem' } },
    },
  },
});

function ProjectCard({ project, selected, onSelect, onClose, onReopen, onArchive, archived }) {
  const [anchor, setAnchor] = useState(null);

  const openMenu = (e) => { e.stopPropagation(); setAnchor(e.currentTarget); };
  const closeMenu = () => setAnchor(null);

  const reg = project.registration || project.vin || '—';
  const vehicleLine = [project.make, project.model, project.year].filter(Boolean).join(' ') || 'Unknown vehicle';

  return (
    <Card sx={{
      minWidth: 164, maxWidth: 180, flexShrink: 0,
      border: selected ? '2px solid #1558D6' : '1.5px solid #E0E2EC',
      bgcolor: selected ? alpha('#1558D6', 0.05) : 'background.paper',
      transition: 'border-color 0.15s, background-color 0.15s',
      opacity: archived ? 0.6 : 1,
      position: 'relative',
    }}>
      <CardActionArea onClick={() => !archived && onSelect(project.id)} disabled={archived}>
        <CardContent sx={{ p: 1.5, pb: '10px !important' }}>
          <Typography sx={{
            fontFamily: '"Courier New", "Roboto Mono", monospace',
            fontWeight: 700, fontSize: '1rem', letterSpacing: '0.04em',
            textTransform: 'uppercase', color: selected ? 'primary.main' : 'text.primary',
            lineHeight: 1.2,
          }}>
            {reg}
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.74rem', color: 'text.secondary', mt: 0.25, lineHeight: 1.3 }}>
            {vehicleLine}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Chip
              label={archived ? 'Archived' : project.closed ? 'Closed' : 'Open'}
              size="small"
              sx={{
                height: 20, px: 0.25,
                bgcolor: archived ? '#E0E2EC' : project.closed ? '#E0E2EC' : alpha('#1558D6', 0.1),
                color: archived ? 'text.secondary' : project.closed ? 'text.secondary' : 'primary.main',
              }}
            />
            {!archived && <ChevronRightRoundedIcon sx={{ fontSize: 16, color: selected ? 'primary.main' : 'text.secondary' }} />}
          </Box>
        </CardContent>
      </CardActionArea>

      {/* Actions menu */}
      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
        <IconButton size="small" onClick={openMenu} sx={{ width: 22, height: 22, opacity: 0.5, '&:hover': { opacity: 1 } }}>
          <MoreVertRoundedIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}
          PaperProps={{ sx: { borderRadius: 3, minWidth: 160 } }}>
          {!archived && !project.closed && (
            <MenuItem onClick={() => { onClose(project.id); closeMenu(); }} sx={{ fontSize: '0.875rem' }}>
              Close project
            </MenuItem>
          )}
          {!archived && project.closed && (
            <MenuItem onClick={() => { onReopen(project.id); closeMenu(); }} sx={{ fontSize: '0.875rem' }}>
              Reopen project
            </MenuItem>
          )}
          {archived && (
            <MenuItem onClick={() => { onReopen && onReopen(project.id); closeMenu(); }} sx={{ fontSize: '0.875rem' }}>
              Restore project
            </MenuItem>
          )}
          {!archived && (
            <MenuItem onClick={(e) => { onArchive(e, project.id); closeMenu(); }}
              sx={{ fontSize: '0.875rem', color: 'error.main' }}>
              Delete project
            </MenuItem>
          )}
        </Menu>
      </Box>
    </Card>
  );
}

function CreateProjectDialog({ open, onClose, onLookup, onManual, error }) {
  const [tab, setTab] = useState('lookup');
  const [identifier, setIdentifier] = useState('');
  const [form, setForm] = useState(EMPTY_MANUAL);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleLookup = async (e) => {
    e.preventDefault();
    const cleaned = identifier.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned) return;
    await onLookup(cleaned);
    setIdentifier('');
  };

  const handleManual = async (e) => {
    e.preventDefault();
    if (!form.registration && !form.vin && !form.make) return;
    await onManual(form);
    setForm(EMPTY_MANUAL);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>New project</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        {/* Tab toggle */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
          {['lookup', 'manual'].map((t) => (
            <Button key={t} variant={tab === t ? 'contained' : 'outlined'} size="small"
              onClick={() => setTab(t)} sx={{ px: 2 }}>
              {t === 'lookup' ? 'Reg / VIN lookup' : 'Enter manually'}
            </Button>
          ))}
        </Box>

        {tab === 'lookup' ? (
          <Box component="form" id="create-form" onSubmit={handleLookup}>
            <TextField
              fullWidth label="Registration or VIN" value={identifier} autoFocus
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. AB12 CDE or 17-char VIN"
              size="small" variant="outlined"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
          </Box>
        ) : (
          <Box component="form" id="create-form" onSubmit={handleManual}
            sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {[
              { key: 'registration', label: 'Registration', placeholder: 'AB12 CDE' },
              { key: 'vin', label: 'VIN', placeholder: '17-char VIN' },
              { key: 'make', label: 'Make', placeholder: 'e.g. Ford' },
              { key: 'model', label: 'Model', placeholder: 'e.g. Focus' },
              { key: 'year', label: 'Year', placeholder: '2019', maxLength: 4 },
              { key: 'engineCode', label: 'Engine code', placeholder: 'e.g. R9M' },
              { key: 'trim', label: 'Trim / variant', placeholder: 'ST-Line, Titanium', colSpan: 2 },
            ].map(({ key, label, placeholder, maxLength, colSpan }) => (
              <TextField key={key} label={label} value={form[key]} onChange={set(key)}
                placeholder={placeholder} size="small" variant="outlined"
                inputProps={{ maxLength }}
                sx={{ gridColumn: colSpan ? '1 / -1' : undefined, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
            ))}
            <TextField select label="Fuel type" value={form.fuelType} onChange={set('fuelType')}
              size="small" variant="outlined" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}>
              <MenuItem value="">— Select —</MenuItem>
              {FUEL_TYPES.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </TextField>
            <TextField select label="Body type" value={form.bodyType} onChange={set('bodyType')}
              size="small" variant="outlined" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}>
              <MenuItem value="">— Select —</MenuItem>
              {BODY_TYPES.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
            </TextField>
          </Box>
        )}

        {error && (
          <Typography sx={{ mt: 1.5, fontSize: '0.85rem', color: 'error.main' }}>{error}</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ px: 3 }}>Cancel</Button>
        <Button type="submit" form="create-form" variant="contained" sx={{ px: 3 }}>
          Create project
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Projects({ projects, archivedProjects, onCreateProject, onCreateProjectManual, onSelectProject,
  onCloseProject, onReopenProject, onArchiveProject, onRestoreProject, selectedProject, error }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const handleLookup = async (cleaned) => {
    await onCreateProject(cleaned);
    setDialogOpen(false);
  };

  const handleManual = async (form) => {
    await onCreateProjectManual(form);
    setDialogOpen(false);
  };

  const handleArchive = (e, projectId) => {
    e.stopPropagation();
    if (window.confirm('Remove this project? Data and history are kept and can be restored.')) {
      onArchiveProject(projectId);
    }
  };

  const handleRestore = (e, projectId) => {
    e?.stopPropagation();
    onRestoreProject(projectId);
  };

  const displayProjects = showArchived ? (archivedProjects || []) : projects;
  const openCount = projects.filter(p => !p.closed).length;
  const closedCount = projects.filter(p => p.closed).length;
  const archivedCount = (archivedProjects || []).length;

  return (
    <ThemeProvider theme={m3Theme}>
      <Box sx={{ bgcolor: 'background.paper', border: '1.5px solid #E0E2EC', borderRadius: 3, px: 2, py: 1.5 }}>

        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <DirectionsCarRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'text.primary', flex: 1 }}>
            Projects
            {!showArchived && (openCount > 0 || closedCount > 0) && (
              <Typography component="span" sx={{ ml: 1, fontSize: '0.8rem', color: 'text.secondary', fontWeight: 400 }}>
                {openCount} open{closedCount > 0 ? `, ${closedCount} closed` : ''}
              </Typography>
            )}
          </Typography>
          {archivedCount > 0 && (
            <Button size="small" variant={showArchived ? 'contained' : 'outlined'}
              startIcon={<ArchiveRoundedIcon sx={{ fontSize: 14 }} />}
              onClick={() => setShowArchived(v => !v)}
              sx={{ fontSize: '0.75rem', px: 1.5, py: 0.5, height: 28 }}>
              Archived ({archivedCount})
            </Button>
          )}
        </Box>

        {/* Card strip */}
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#C4C6D0', borderRadius: 2 },
        }}>

          {/* New project card (only in active view) */}
          {!showArchived && (
            <Card sx={{ minWidth: 120, maxWidth: 120, flexShrink: 0, border: '1.5px dashed #C4C6D0',
              bgcolor: 'transparent', boxShadow: 'none !important' }}>
              <CardActionArea onClick={() => setDialogOpen(true)}
                sx={{ height: '100%', minHeight: 96, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: alpha('#1558D6', 0.1),
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AddRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: 'primary.main', fontWeight: 500, textAlign: 'center' }}>
                  New project
                </Typography>
              </CardActionArea>
            </Card>
          )}

          {/* Project cards */}
          {displayProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              selected={selectedProject?.id === project.id}
              archived={showArchived}
              onSelect={onSelectProject}
              onClose={onCloseProject}
              onReopen={showArchived ? (id) => handleRestore(null, id) : onReopenProject}
              onArchive={handleArchive}
            />
          ))}

          {/* Empty state */}
          {displayProjects.length === 0 && (
            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', py: 2.5, px: 1 }}>
              {showArchived ? 'No archived projects.' : 'No projects yet — create your first one.'}
            </Typography>
          )}
        </Box>
      </Box>

      <CreateProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onLookup={handleLookup}
        onManual={handleManual}
        error={error}
      />
    </ThemeProvider>
  );
}

export default Projects;
