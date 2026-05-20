import { useState, useEffect, useRef } from 'react';
import {
  Box, Stack, Typography, Tabs, Tab,
  Card, CardContent, TextField, Button, IconButton,
  Switch, FormControlLabel,
  Table, TableHead, TableBody, TableRow, TableCell,
  Alert, Snackbar, InputAdornment,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';

const BASE = '/api';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function apiFetch(path, opts = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const m3Theme = createTheme({
  palette: {
    primary: { main: '#1558D6', contrastText: '#fff' },
    secondary: { main: '#565E71' },
    error: { main: '#BA1A1A' },
    background: { default: '#F3F4F9', paper: '#fff' },
    text: { primary: '#1A1C1E', secondary: '#44474E' },
  },
  typography: {
    fontFamily: '"Roboto", "Google Sans", "Helvetica Neue", sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 100, textTransform: 'none', fontWeight: 500 },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: '0 1px 3px rgba(0,0,0,.15)' } },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: { '& .MuiOutlinedInput-root': { borderRadius: '10px' } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 500, fontSize: '0.875rem',
          minWidth: 'auto', padding: '10px 20px',
          '&.Mui-selected': { fontWeight: 600 },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: 'none', border: '1px solid #E0E2EC', borderRadius: '16px' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#F3F4F9', fontWeight: 600, fontSize: '0.75rem',
          textTransform: 'uppercase', letterSpacing: '0.06em', color: '#44474E',
        },
      },
    },
  },
});

// ── Shared helpers ────────────────────────────────────────────────────────────

function Section({ title, children, sx }) {
  return (
    <Card sx={{ mb: 2.5, ...sx }}>
      <CardContent sx={{ p: 3 }}>
        {title && (
          <Typography sx={{ mb: 2.5, fontSize: '0.78rem', fontWeight: 700, color: 'primary.main', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {title}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, severity: 'success', msg: '' });
  const toast = (severity, msg) => setSnack({ open: true, severity, msg });
  const closeSnack = () => setSnack(s => ({ ...s, open: false }));
  return { saving, setSaving, snack, toast, closeSnack };
}

function SaveButton({ saving, onSave }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
      <Button variant="contained" onClick={onSave} disabled={saving}
        startIcon={<SaveRoundedIcon fontSize="small" />} sx={{ px: 3, py: 1 }}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </Box>
  );
}

function SaveSnack({ snack, onClose }) {
  return (
    <Snackbar open={snack.open} autoHideDuration={3000} onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={onClose} severity={snack.severity} variant="filled"
        sx={{ borderRadius: 3 }}>{snack.msg}</Alert>
    </Snackbar>
  );
}

// ── Workshop Details ──────────────────────────────────────────────────────────

function DetailsTab({ token }) {
  const [form, setForm] = useState({
    workshopName: '', addressLine1: '', addressLine2: '',
    city: '', postcode: '', phone: '', email: '', paymentNotes: '',
  });
  const { saving, setSaving, snack, toast, closeSnack } = useSaveState();

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token).then((s) => setForm({
      workshopName: s.workshopName || '', addressLine1: s.addressLine1 || '',
      addressLine2: s.addressLine2 || '', city: s.city || '',
      postcode: s.postcode || '', phone: s.phone || '',
      email: s.email || '', paymentNotes: s.paymentNotes || '',
    })).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try { await apiFetch('/quotes/settings', { method: 'PATCH', body: form }, token); toast('success', 'Settings saved'); }
    catch (err) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="Workshop details">
        <Stack spacing={2}>
          <TextField fullWidth label="Workshop name" value={form.workshopName} onChange={set('workshopName')} placeholder="e.g. Ace Motors Ltd" />
          <TextField fullWidth label="Address line 1" value={form.addressLine1} onChange={set('addressLine1')} />
          <TextField fullWidth label="Address line 2" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Optional" />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 2 }}>
            <TextField fullWidth label="City / Town" value={form.city} onChange={set('city')} />
            <TextField fullWidth label="Postcode" value={form.postcode} onChange={set('postcode')} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField fullWidth label="Phone" value={form.phone} onChange={set('phone')} />
            <TextField fullWidth label="Email" type="email" value={form.email} onChange={set('email')} />
          </Box>
        </Stack>
      </Section>

      <Section title="Payment & invoicing">
        <TextField fullWidth multiline rows={4} label="Payment notes"
          helperText="Shown on quotes/invoices — e.g. bank details, Stripe link, terms"
          value={form.paymentNotes} onChange={set('paymentNotes')} />
      </Section>

      <SaveButton saving={saving} onSave={handleSave} />
      <SaveSnack snack={snack} onClose={closeSnack} />
    </>
  );
}

// ── Rates ─────────────────────────────────────────────────────────────────────

function RatesTab({ token }) {
  const [form, setForm] = useState({ labourRatePerHour: '75', defaultMarkupPct: '30', vatRate: '20' });
  const { saving, setSaving, snack, toast, closeSnack } = useSaveState();

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token).then((s) => setForm({
      labourRatePerHour: String(s.labourRatePerHour ?? 75),
      defaultMarkupPct: String(s.defaultMarkupPct ?? 30),
      vatRate: String(s.vatRate ?? 20),
    })).catch(() => {});
  }, [token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toNum = (v, fb) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch('/quotes/settings', { method: 'PATCH', body: {
        labourRatePerHour: toNum(form.labourRatePerHour, 75),
        defaultMarkupPct: toNum(form.defaultMarkupPct, 30),
        vatRate: toNum(form.vatRate, 20),
      }}, token);
      setForm({
        labourRatePerHour: String(updated.labourRatePerHour ?? 75),
        defaultMarkupPct: String(updated.defaultMarkupPct ?? 30),
        vatRate: String(updated.vatRate ?? 20),
      });
      toast('success', 'Rates saved');
    } catch (err) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="Labour & parts rates">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2.5, mb: 2 }}>
          <TextField label="Labour rate (£/hr)" type="number" inputProps={{ min: 0, step: 0.5 }} value={form.labourRatePerHour} onChange={set('labourRatePerHour')} />
          <TextField label="Parts markup (%)" type="number" inputProps={{ min: 0, step: 1 }} value={form.defaultMarkupPct} onChange={set('defaultMarkupPct')} />
          <TextField label="VAT rate (%)" type="number" inputProps={{ min: 0, step: 0.5 }} value={form.vatRate} onChange={set('vatRate')} />
        </Box>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          These defaults apply to all new quotes. Individual lines can be adjusted per quote.
        </Typography>
      </Section>
      <SaveButton saving={saving} onSave={handleSave} />
      <SaveSnack snack={snack} onClose={closeSnack} />
    </>
  );
}

// ── Technicians ───────────────────────────────────────────────────────────────

function TechnicianRow({ tech, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: tech.name, role: tech.role || '', email: tech.email || '',
    phone: tech.phone || '', hourlyRate: tech.hourlyRate != null ? String(tech.hourlyRate) : '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tech.id, { name: form.name, role: form.role || null, email: form.email || null, phone: form.phone || null, hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const td = { py: 1, fontSize: '0.88rem' };

  if (editing) {
    return (
      <TableRow>
        <TableCell sx={td}><TextField size="small" value={form.name} onChange={set('name')} sx={{ width: 130 }} /></TableCell>
        <TableCell sx={td}><TextField size="small" value={form.role} onChange={set('role')} sx={{ width: 140 }} /></TableCell>
        <TableCell sx={td}><TextField size="small" value={form.email} onChange={set('email')} sx={{ width: 180 }} /></TableCell>
        <TableCell sx={td}><TextField size="small" value={form.phone} onChange={set('phone')} sx={{ width: 130 }} /></TableCell>
        <TableCell sx={td}><TextField size="small" type="number" value={form.hourlyRate} onChange={set('hourlyRate')} sx={{ width: 80 }} /></TableCell>
        <TableCell sx={{ ...td, whiteSpace: 'nowrap' }}>
          <Button size="small" variant="contained" onClick={handleSave} disabled={saving} sx={{ mr: 1 }}>{saving ? '…' : 'Save'}</Button>
          <Button size="small" variant="outlined" onClick={() => setEditing(false)}>Cancel</Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow hover>
      <TableCell sx={td}>{tech.name}</TableCell>
      <TableCell sx={{ ...td, color: 'text.secondary' }}>{tech.role || '—'}</TableCell>
      <TableCell sx={{ ...td, color: 'text.secondary' }}>{tech.email || '—'}</TableCell>
      <TableCell sx={{ ...td, color: 'text.secondary' }}>{tech.phone || '—'}</TableCell>
      <TableCell sx={td}>{tech.hourlyRate != null ? `£${tech.hourlyRate}/hr` : '—'}</TableCell>
      <TableCell sx={{ ...td, whiteSpace: 'nowrap' }}>
        <IconButton size="small" onClick={() => setEditing(true)} sx={{ mr: 0.5 }}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => onDelete(tech.id)} sx={{ color: 'error.main' }}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

function TechniciansTab({ token }) {
  const [techs, setTechs] = useState([]);
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '', hourlyRate: '' });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { apiFetch('/technicians', {}, token).then(setTechs).catch(() => {}); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setError('');
    try {
      const t = await apiFetch('/technicians', { method: 'POST', body: { name: form.name, role: form.role || null, email: form.email || null, phone: form.phone || null, hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null } }, token);
      setTechs((prev) => [...prev, t]);
      setForm({ name: '', role: '', email: '', phone: '', hourlyRate: '' });
      setAdding(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleSave = async (id, data) => {
    const t = await apiFetch(`/technicians/${id}`, { method: 'PATCH', body: data }, token);
    setTechs((prev) => prev.map((x) => x.id === id ? t : x));
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this technician?')) return;
    await apiFetch(`/technicians/${id}`, { method: 'DELETE' }, token);
    setTechs((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <Section title="Technicians">
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {techs.length > 0 && (
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell><TableCell>Role</TableCell>
              <TableCell>Email</TableCell><TableCell>Phone</TableCell>
              <TableCell>Rate</TableCell><TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {techs.map((t) => <TechnicianRow key={t.id} tech={t} onSave={handleSave} onDelete={handleDelete} />)}
          </TableBody>
        </Table>
      )}

      {adding ? (
        <Box sx={{ border: '1px solid #E0E2EC', borderRadius: 2, p: 2.5 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 2 }}>New technician</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 120px', gap: 1.5, mb: 2 }}>
            <TextField label="Name *" value={form.name} onChange={set('name')} />
            <TextField label="Role" value={form.role} onChange={set('role')} />
            <TextField label="Email" value={form.email} onChange={set('email')} />
            <TextField label="Phone" value={form.phone} onChange={set('phone')} />
            <TextField label="£/hr" type="number" value={form.hourlyRate} onChange={set('hourlyRate')} />
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleAdd} disabled={saving || !form.name.trim()}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
            <Button variant="outlined" onClick={() => setAdding(false)}>Cancel</Button>
          </Stack>
        </Box>
      ) : (
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>
          Add technician
        </Button>
      )}
    </Section>
  );
}

// ── Parts Catalogue ────────────────────────────────────────────────────────────

function PartsCatalogueTab({ token }) {
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const doSearch = async (q) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/parts/search?${new URLSearchParams({ q: q || '' })}`, {}, token);
      setParts(data);
    } catch { setParts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { doSearch(''); }, []);

  return (
    <Section title="Parts catalogue">
      <Typography sx={{ mb: 2, color: 'text.secondary', fontSize: '0.85rem' }}>
        The AI assistant searches this catalogue when building quotes.
      </Typography>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); doSearch(search); }}
        sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
        <TextField fullWidth value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, part number, or brand…"
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} /></InputAdornment> }}
        />
        <Button type="submit" variant="contained" disabled={loading} sx={{ whiteSpace: 'nowrap', px: 2.5 }}>Search</Button>
        {search && <Button variant="outlined" onClick={() => { setSearch(''); doSearch(''); }}>Clear</Button>}
      </Box>

      {loading && <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem' }}>Searching…</Typography>}
      {!loading && parts.length === 0 && <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem' }}>No parts found.</Typography>}

      {!loading && parts.length > 0 && (
        <>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Part No.</TableCell><TableCell>Brand</TableCell>
                <TableCell>Description</TableCell><TableCell>Category</TableCell>
                <TableCell align="right">Cost</TableCell><TableCell align="right">List</TableCell>
                <TableCell align="center">Stock</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {parts.map((p) => (
                <TableRow hover key={p.id}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.partNumber || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.88rem' }}>{p.brand || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.88rem' }}>{p.title}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{p.category || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.88rem' }}>£{p.costPrice?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>£{p.listPrice?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.88rem' }}>{p.inStock ? '✓' : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', mt: 1 }}>
            {parts.length} result{parts.length !== 1 ? 's' : ''}
          </Typography>
        </>
      )}
    </Section>
  );
}

// ── Permissions ───────────────────────────────────────────────────────────────

const FEATURES = [
  { key: 'customers',      label: 'Customer management', desc: 'View and manage customer accounts and vehicles' },
  { key: 'knowledge_base', label: 'AI knowledge base',   desc: 'View and contribute to the AI knowledge base' },
  { key: 'registry',       label: 'Vehicle registry',    desc: 'Look up vehicles and view full registry' },
  { key: 'inventory',      label: 'Parts inventory',     desc: 'View and manage parts stock levels' },
  { key: 'financials',     label: 'Financial data',      desc: 'View quote totals, invoice values and spend' },
];

function PermissionsTab({ token }) {
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    apiFetch('/admin/role-permissions', {}, token).then(setPerms).finally(() => setLoading(false));
  }, []);

  const getVal = (role, feature) => {
    const p = perms.find((p) => p.role === role && p.feature === feature);
    return p ? p.allowed : false;
  };

  const toggle = async (role, feature, allowed) => {
    const key = `${role}:${feature}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const updated = await apiFetch('/admin/role-permissions', { method: 'PATCH', body: { role, feature, allowed } }, token);
      setPerms((prev) => [...prev.filter((p) => !(p.role === role && p.feature === feature)), updated]);
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[key]; return n; });
    }
  };

  if (loading) return <Typography sx={{ color: 'text.secondary', p: 3 }}>Loading…</Typography>;

  return (
    <Section title="Role permissions">
      <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '0.85rem' }}>
        Control which features are accessible to each role. Managers always have full access.
      </Typography>
      <Box sx={{ border: '1px solid #E0E2EC', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', bgcolor: '#F3F4F9', px: 2.5, py: 1.5 }}>
          {['Feature', 'Admin', 'Tech'].map((h) => (
            <Typography key={h} sx={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#44474E', textAlign: h === 'Feature' ? 'left' : 'center' }}>{h}</Typography>
          ))}
        </Box>
        {FEATURES.map((f, i) => (
          <Box key={f.key} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', px: 2.5, py: 2, borderTop: i === 0 ? 'none' : '1px solid #F0F0F5', '&:hover': { bgcolor: '#FAFAFA' } }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.88rem' }}>{f.label}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.25 }}>{f.desc}</Typography>
            </Box>
            {['admin', 'tech'].map((role) => (
              <Box key={role} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Switch size="small" checked={getVal(role, f.key)} disabled={!!saving[`${role}:${f.key}`]}
                  onChange={() => toggle(role, f.key, !getVal(role, f.key))} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Section>
  );
}

// ── AI Features ───────────────────────────────────────────────────────────────

function AiFeaturesTab({ token }) {
  const [aiEnabled, setAiEnabled] = useState(true);
  const { saving, setSaving, snack, toast, closeSnack } = useSaveState();

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token).then((s) => setAiEnabled(s.aiEnabled !== false)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await apiFetch('/quotes/settings', { method: 'PATCH', body: { aiEnabled } }, token); toast('success', 'Saved'); }
    catch (err) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Section title="AI assistant">
        <FormControlLabel
          control={<Switch checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />}
          label={
            <Box sx={{ ml: 1 }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>Enable AI features</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 0.25 }}>
                When disabled, the diagnostic chat and assistant are hidden. All other workshop features remain fully usable.
              </Typography>
            </Box>
          }
          sx={{ alignItems: 'center', m: 0 }}
        />
      </Section>
      <SaveButton saving={saving} onSave={handleSave} />
      <SaveSnack snack={snack} onClose={closeSnack} />
    </>
  );
}

// ── Invoice Template ───────────────────────────────────────────────────────────

function InvoiceTemplateTab({ token }) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    invoiceAccentColor: '#1e40af', invoiceVatNumber: '', invoiceFooterText: '',
    invoiceShowBankDetails: false,
    invoiceBankName: '', invoiceAccountName: '', invoiceAccountNumber: '', invoiceSortCode: '',
    invoiceCompanyReg: '', invoicePaymentTerms: 'Due on receipt',
  });
  const [workshopName, setWorkshopName] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const { saving, setSaving, snack, toast, closeSnack } = useSaveState();

  useEffect(() => {
    apiFetch('/quotes/settings', {}, token).then((s) => {
      setWorkshopName(s.workshopName || '');
      setLogoUrl(s.invoiceLogoUrl || null);
      setForm({
        invoiceAccentColor: s.invoiceAccentColor || '#1e40af',
        invoiceVatNumber: s.invoiceVatNumber || '',
        invoiceFooterText: s.invoiceFooterText || '',
        invoiceShowBankDetails: s.invoiceShowBankDetails || false,
        invoiceBankName: s.invoiceBankName || '',
        invoiceAccountName: s.invoiceAccountName || '',
        invoiceAccountNumber: s.invoiceAccountNumber || '',
        invoiceSortCode: s.invoiceSortCode || '',
        invoiceCompanyReg: s.invoiceCompanyReg || '',
        invoicePaymentTerms: s.invoicePaymentTerms || 'Due on receipt',
      });
    }).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: typeof e === 'object' && e.target ? e.target.value : e }));
  const setBool = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${BASE_URL}/api/quotes/settings/logo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLogoUrl(data.logoUrl);
      toast('success', 'Logo uploaded');
    } catch (err) { toast('error', err.message); }
    finally { setLogoUploading(false); e.target.value = ''; }
  };

  const handleRemoveLogo = async () => {
    try { await apiFetch('/quotes/settings/logo', { method: 'DELETE' }, token); setLogoUrl(null); }
    catch (err) { toast('error', err.message); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await apiFetch('/quotes/settings', { method: 'PATCH', body: form }, token); toast('success', 'Template saved'); }
    catch (err) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  const accent = form.invoiceAccentColor || '#1e40af';
  const logoSrc = logoUrl
    ? (logoUrl.startsWith('logos/') ? `${BASE_URL}/api/media/${logoUrl}` : `${BASE_URL}/uploads/${logoUrl}`)
    : null;

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 3, alignItems: 'start' }}>
        {/* Form */}
        <Box>
          <Section title="Logo">
            {logoSrc && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, border: '1px solid #E0E2EC', borderRadius: 2, width: 'fit-content' }}>
                <Box component="img" src={logoSrc} alt="Logo" sx={{ height: 52, maxWidth: 160, objectFit: 'contain' }} />
                <Button size="small" variant="outlined" color="error" onClick={handleRemoveLogo}>Remove</Button>
              </Box>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} hidden />
            <Button variant="outlined" disabled={logoUploading} onClick={() => fileInputRef.current?.click()}>
              {logoUploading ? 'Uploading…' : logoSrc ? 'Replace logo' : 'Upload logo'}
            </Button>
          </Section>

          <Section title="Branding">
            <Stack spacing={2}>
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, mb: 1, color: 'text.secondary' }}>Accent colour</Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box component="input" type="color" value={accent} onChange={(e) => set('invoiceAccentColor')(e.target.value)}
                    sx={{ width: 44, height: 36, p: '2px', border: '1px solid #D0D2DC', borderRadius: '8px', cursor: 'pointer', bgcolor: 'transparent' }} />
                  <TextField value={accent} onChange={set('invoiceAccentColor')} placeholder="#1e40af"
                    sx={{ width: 130, '& input': { fontFamily: 'monospace' } }} />
                </Stack>
              </Box>
              <TextField fullWidth label="VAT registration number" value={form.invoiceVatNumber} onChange={set('invoiceVatNumber')} placeholder="GB 123 4567 89" />
              <TextField fullWidth label="Company registration number" value={form.invoiceCompanyReg} onChange={set('invoiceCompanyReg')} placeholder="e.g. 14563790" />
              <TextField fullWidth label="Payment terms" value={form.invoicePaymentTerms} onChange={set('invoicePaymentTerms')} placeholder="Due on receipt" />
            </Stack>
          </Section>

          <Section title="Footer text">
            <TextField fullWidth multiline rows={2} label="Footer" value={form.invoiceFooterText} onChange={set('invoiceFooterText')}
              placeholder="Thank you for your business." helperText="Leave blank for default" />
          </Section>

          <Section title="Bank details">
            <FormControlLabel
              control={<Switch checked={form.invoiceShowBankDetails} onChange={setBool('invoiceShowBankDetails')} />}
              label="Show bank details on invoices"
              sx={{ mb: form.invoiceShowBankDetails ? 2 : 0 }}
            />
            {form.invoiceShowBankDetails && (
              <Stack spacing={2}>
                <TextField fullWidth label="Bank name" value={form.invoiceBankName} onChange={set('invoiceBankName')} placeholder="e.g. Barclays" />
                <TextField fullWidth label="Account name" value={form.invoiceAccountName} onChange={set('invoiceAccountName')} placeholder="Your Business Ltd" />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField fullWidth label="Sort code" value={form.invoiceSortCode} onChange={set('invoiceSortCode')} placeholder="12-34-56" />
                  <TextField fullWidth label="Account number" value={form.invoiceAccountNumber} onChange={set('invoiceAccountNumber')} placeholder="12345678" />
                </Box>
              </Stack>
            )}
          </Section>
        </Box>

        {/* Preview */}
        <Box sx={{ position: 'sticky', top: 24 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 1.5 }}>
            Preview
          </Typography>
          <Card sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, pb: 1.5, borderBottom: `2px solid ${accent}` }}>
              <Box>
                {logoSrc && <Box component="img" src={logoSrc} alt="" sx={{ height: 32, maxWidth: 100, objectFit: 'contain', display: 'block', mb: 0.5 }} />}
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{workshopName || 'Your Workshop'}</Typography>
                {form.invoiceVatNumber && <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>VAT: {form.invoiceVatNumber}</Typography>}
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: accent }}>INVOICE</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>INV-001</Typography>
              </Box>
            </Box>
            <Box sx={{ fontSize: '0.72rem', mb: 1.5 }}>
              {[['Oil change service', '£45.00'], ['Brake pads (front)', '£120.00']].map(([d, a]) => (
                <Box key={d} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #EFEFEF' }}>
                  <span>{d}</span><span>{a}</span>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, fontWeight: 700, fontSize: '0.8rem' }}>
                <span>GBP TOTAL</span><span>£198.00</span>
              </Box>
            </Box>
            {form.invoiceFooterText && (
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mt: 1.5, pt: 1, borderTop: '1px solid #EFEFEF', textAlign: 'center' }}>
                {form.invoiceFooterText}
              </Typography>
            )}
          </Card>
        </Box>
      </Box>

      <SaveButton saving={saving} onSave={handleSave} />
      <SaveSnack snack={snack} onClose={closeSnack} />
    </>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'details',     label: 'Workshop Details' },
  { id: 'rates',       label: 'Rates' },
  { id: 'technicians', label: 'Technicians' },
  { id: 'parts',       label: 'Parts Catalogue' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'ai',          label: 'AI Features' },
  { id: 'template',    label: 'Invoice Template' },
];

export default function WorkshopSettings({ token }) {
  const [tab, setTab] = useState('details');

  return (
    <ThemeProvider theme={m3Theme}>
      <Box sx={{ bgcolor: 'background.default', minHeight: '100%', pb: 6 }}>
        <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #E0E2EC', px: 4, pt: 3, pb: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.35rem', color: 'text.primary', mb: 2 }}>
            Workshop Settings
          </Typography>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
            sx={{ '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}>
            {TABS.map((t) => <Tab key={t.id} value={t.id} label={t.label} disableRipple />)}
          </Tabs>
        </Box>

        <Box sx={{ maxWidth: 940, mx: 'auto', px: 4, pt: 4 }}>
          {tab === 'details'     && <DetailsTab token={token} />}
          {tab === 'rates'       && <RatesTab token={token} />}
          {tab === 'technicians' && <TechniciansTab token={token} />}
          {tab === 'parts'       && <PartsCatalogueTab token={token} />}
          {tab === 'permissions' && <PermissionsTab token={token} />}
          {tab === 'ai'          && <AiFeaturesTab token={token} />}
          {tab === 'template'    && <InvoiceTemplateTab token={token} />}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
