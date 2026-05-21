import { useState, useEffect, useRef } from 'react';
import {
  Box, Stack, Typography, AppBar, Toolbar, Tabs, Tab,
  Card, CardActionArea, CardContent,
  Button, IconButton, Badge,
  Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Drawer, TextField, MenuItem,
  Alert, CircularProgress,
  Menu, List, ListItemButton, ListItemText,
} from '@mui/material';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import HandymanRoundedIcon from '@mui/icons-material/HandymanRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded';
import ReceiptRoundedIcon from '@mui/icons-material/ReceiptRounded';

import { getMyVehicles, addVehicle, getVehicleStats, getVehicleJobs, getJobReport, getJobQuote,
         getVehicleMot, getVehicleGallery, getVehicleInvoices, getInvoiceDetail, downloadInvoicePdf,
         getWorkshopInfo, acceptQuote, getProfile, updateProfile, changePassword,
         getNotifications, submitEnquiry, getVehiclePhotos } from '../services/customerApi';
import { mediaUrl } from '../services/reportsApi';

// ── Theme ─────────────────────────────────────────────────────────────────────

const cpTheme = createTheme({
  palette: {
    primary: { main: '#1558D6', contrastText: '#fff' },
    secondary: { main: '#575E71' },
    success: { main: '#1A6B3A' },
    error: { main: '#BA1A1A' },
    warning: { main: '#7B5800' },
    background: { default: '#F6F8FF', paper: '#FFFFFF' },
    text: { primary: '#1A1B1F', secondary: '#44464F' },
  },
  typography: {
    fontFamily: '"Roboto", "Google Sans", "Helvetica Neue", sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 100, textTransform: 'none', fontWeight: 500 },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: '0 1px 3px rgba(0,0,0,.12)' } },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: 'none', border: '1px solid #E1E2EC', borderRadius: '16px' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: '8px', fontWeight: 500, fontSize: '0.78rem' },
        colorSuccess: { backgroundColor: '#C7EFCF', color: '#1A6B3A' },
        colorError: { backgroundColor: '#FFDAD6', color: '#BA1A1A' },
        colorWarning: { backgroundColor: '#FFDDB3', color: '#7B5800' },
        colorInfo: { backgroundColor: '#D8E2FF', color: '#1558D6' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 500, fontSize: '0.875rem',
          minWidth: 'auto', padding: '10px 16px', minHeight: 48,
          '&.Mui-selected': { fontWeight: 600 },
          '& .MuiTab-iconWrapper': { marginBottom: 0 },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: { '& .MuiOutlinedInput-root': { borderRadius: '10px' } },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: '24px' } },
    },
    MuiAppBar: {
      styleOverrides: { root: { boxShadow: 'none' } },
    },
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val) { return val == null ? '—' : `£${parseFloat(val).toFixed(2)}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

function StatusChip({ status, size = 'small' }) {
  const map = {
    approved: { color: 'success', label: 'Approved' },
    invoiced:  { color: 'success', label: 'Invoiced' },
    sent:      { color: 'info',    label: 'Sent' },
    published: { color: 'info',    label: 'Published' },
    pending:   { color: 'warning', label: 'Pending' },
    draft:     { color: 'default', label: 'Draft' },
    PASSED:    { color: 'success', label: 'PASSED' },
    FAILED:    { color: 'error',   label: 'FAILED' },
  };
  const c = map[status] || { color: 'default', label: status };
  return <Chip label={c.label} color={c.color} size={size} />;
}

async function resolvePhotoUrl(filename, token) {
  if (!filename) return '';
  const base = import.meta.env.VITE_API_BASE_URL || '';
  if (filename.includes('/')) {
    const res = await fetch(`${base}/api/reports/media/url?key=${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.url || '';
  }
  return `${base}/uploads/${filename}`;
}

// ── Invoice view ──────────────────────────────────────────────────────────────

function InvoiceView({ invoiceId, token, onBack, workshopName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getInvoiceDetail(invoiceId, token).then(setData).finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error" sx={{ m: 3 }}>Invoice not found.</Alert>;

  const { reference, status, vehicle, registration, date, subtotal, vat, total, vatRate, items, ungroupedLines } = data;

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadInvoicePdf(invoiceId, token, `invoice-${reference}.pdf`); }
    catch (err) { alert(err.message); }
    finally { setDownloading(false); }
  };

  const renderLines = (lines) => lines.map((l) => (
    <Box key={l.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #F0F0F5', fontSize: '0.9rem' }}>
      <Typography sx={{ fontSize: 'inherit', color: 'text.primary' }}>{l.description}</Typography>
      <Stack direction="row" spacing={3} alignItems="center">
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>×{l.qty}</Typography>
        <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{fmt(l.lineTotal)}</Typography>
      </Stack>
    </Box>
  ));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ borderRadius: 100, textTransform: 'none', color: 'text.secondary' }}>
          Back to invoices
        </Button>
        <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={handleDownload} disabled={downloading} sx={{ borderRadius: 100 }}>
          {downloading ? 'Generating…' : 'Download PDF'}
        </Button>
      </Box>

      <Card sx={{ p: 0, maxWidth: 720, mx: 'auto' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, pb: 3, borderBottom: '2px solid #1558D6' }}>
            <Box>
              {workshopName && <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>{workshopName}</Typography>}
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#1558D6' }}>
                {status === 'approved' || status === 'invoiced' ? 'INVOICE' : 'ESTIMATE'}
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{reference}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '0.9rem', mb: 0.5 }}>{fmtDate(date)}</Typography>
              <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>{registration} {vehicle ? `· ${vehicle}` : ''}</Typography>
              <Box sx={{ mt: 1 }}><StatusChip status={status} /></Box>
            </Box>
          </Box>

          <Box sx={{ mb: 2 }}>
            {items?.map((item) => (
              <Box key={item.id} sx={{ mb: 2 }}>
                {item.title && (
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'primary.main', mb: 1 }}>
                    {item.title}
                  </Typography>
                )}
                {renderLines(item.lines)}
              </Box>
            ))}
            {renderLines(ungroupedLines || [])}
          </Box>

          <Box sx={{ borderTop: '2px solid #1A1B1F', pt: 2 }}>
            {subtotal != null && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 8, mb: 0.5 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>Subtotal</Typography>
                <Typography sx={{ fontSize: '0.9rem', minWidth: 80, textAlign: 'right' }}>{fmt(subtotal)}</Typography>
              </Box>
            )}
            {vat != null && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 8, mb: 0.5 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>VAT ({vatRate}%)</Typography>
                <Typography sx={{ fontSize: '0.9rem', minWidth: 80, textAlign: 'right' }}>{fmt(vat)}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 8, mt: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>GBP TOTAL</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', minWidth: 80, textAlign: 'right' }}>{fmt(total)}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

function MileageChart({ tests }) {
  if (!tests?.length) return null;
  const withMileage = [...tests].filter((t) => t.odometerValue && t.odometerUnit === 'MI')
    .sort((a, b) => new Date(a.testDate) - new Date(b.testDate));
  if (withMileage.length < 2) return null;

  const W = 520, H = 140, pad = 40;
  const miles = withMileage.map((t) => t.odometerValue);
  const dates = withMileage.map((t) => new Date(t.testDate).getFullYear());
  const minM = Math.min(...miles), maxM = Math.max(...miles);
  const points = withMileage.map((t, i) => {
    const x = pad + (i / (withMileage.length - 1)) * (W - pad * 2);
    const y = H - pad - ((t.odometerValue - minM) / (maxM - minM || 1)) * (H - pad * 2);
    return `${x},${y}`;
  });

  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Mileage over time
      </Typography>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
        <polyline points={points.join(' ')} fill="none" stroke="#1558D6" strokeWidth="2.5" strokeLinejoin="round" />
        {withMileage.map((_, i) => {
          const [x, y] = points[i].split(',');
          return <circle key={i} cx={x} cy={y} r="4" fill="#1558D6" />;
        })}
        {withMileage.map((_, i) => {
          const [x] = points[i].split(',');
          return <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="#75777F">{dates[i]}</text>;
        })}
        <text x={pad - 4} y={pad} textAnchor="end" fontSize="10" fill="#75777F">{miles[miles.length - 1]?.toLocaleString()}</text>
        <text x={pad - 4} y={H - pad} textAnchor="end" fontSize="10" fill="#75777F">{Math.min(...miles).toLocaleString()}</text>
      </svg>
    </Box>
  );
}

function SpendByYearChart({ data }) {
  if (!data?.length) return null;
  const W = 520, H = 140, pad = 40;
  const vals = data.map((d) => d.total);
  const maxV = Math.max(...vals, 1);
  const barW = Math.min(40, (W - pad * 2) / data.length - 8);

  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Workshop spend by year
      </Typography>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
        {data.map((d, i) => {
          const x = pad + (i / (data.length - 1 || 1)) * (W - pad * 2) - barW / 2;
          const barH = ((d.total / maxV) * (H - pad * 2));
          const y = H - pad - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill="#1558D6" rx="4" />
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#75777F">{d.year}</text>
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill="#1A1B1F">£{d.total.toLocaleString()}</text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

function CostBreakdownBar({ parts, labour }) {
  const total = (parts || 0) + (labour || 0);
  if (!total) return null;
  const partsPct = Math.round((parts / total) * 100);
  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Cost breakdown
      </Typography>
      <Box sx={{ display: 'flex', borderRadius: 2, overflow: 'hidden', height: 12, mb: 1.5 }}>
        {parts > 0 && <Box sx={{ width: `${partsPct}%`, bgcolor: '#1558D6' }} title={`Parts £${parts.toFixed(2)}`} />}
        {labour > 0 && <Box sx={{ width: `${100 - partsPct}%`, bgcolor: '#7C4DFF' }} title={`Labour £${labour.toFixed(2)}`} />}
      </Box>
      <Stack direction="row" spacing={3}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#1558D6' }} />
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Parts £{(parts || 0).toFixed(2)}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#7C4DFF' }} />
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Labour £{(labour || 0).toFixed(2)}</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

// ── Vehicle History ────────────────────────────────────────────────────────────

function VehicleHistoryTab({ vehicleId, token }) {
  const [motData, setMotData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getVehicleMot(vehicleId, token).catch(() => null),
      getVehicleStats(vehicleId, token).catch(() => null),
    ]).then(([mot, s]) => { setMotData(mot); setStats(s); }).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const motMeta = motData?.motMeta || {};
  const motTests = motData?.motTests || [];
  const sorted = [...motTests].sort((a, b) => new Date(b.testDate) - new Date(a.testDate));

  return (
    <Box>
      {(motMeta.make || motMeta.model || motMeta.fuelType || motMeta.engineSize) && (
        <Card sx={{ mb: 3, bgcolor: alpha('#1558D6', 0.04), border: 'none' }}>
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 2 }}>
              {[
                motMeta.make && ['Make', motMeta.make],
                motMeta.model && ['Model', motMeta.model],
                (motMeta.firstUsedDate || motMeta.manufactureDate) && ['First used', fmtDate(motMeta.firstUsedDate || motMeta.manufactureDate)],
                motMeta.fuelType && ['Fuel', motMeta.fuelType],
                motMeta.engineSize && ['Engine', `${motMeta.engineSize}cc`],
                motMeta.primaryColour && ['Colour', motMeta.primaryColour],
              ].filter(Boolean).map(([label, value]) => (
                <Box key={label}>
                  <Typography sx={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', mt: 0.25 }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {stats && stats.jobCount > 0 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
            {[
              [stats.jobCount, 'Workshop visits'],
              [`£${stats.totalSpend.toFixed(2)}`, 'Total spend'],
              [stats.lastServiceAt ? fmtDate(stats.lastServiceAt) : '—', 'Last service'],
            ].map(([value, label]) => (
              <Card key={label} sx={{ bgcolor: '#F6F8FF', border: 'none', textAlign: 'center' }}>
                <CardContent sx={{ py: 2.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.3rem', color: 'primary.main', lineHeight: 1.2 }}>{value}</Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
          {stats.spendByYear?.length > 1 && <SpendByYearChart data={stats.spendByYear} />}
          {(stats.totalParts > 0 || stats.totalLabour > 0) && <CostBreakdownBar parts={stats.totalParts} labour={stats.totalLabour} />}
        </>
      )}

      <MileageChart tests={motTests} />

      {stats?.jobs?.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 2 }}>
            Service history
          </Typography>
          <Stack spacing={0}>
            {stats.jobs.map((job, i) => (
              <Box key={job.id || i} sx={{ display: 'flex', gap: 2, pb: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                  {i < stats.jobs.length - 1 && <Box sx={{ width: 2, flexGrow: 1, bgcolor: '#E1E2EC', mt: 0.5 }} />}
                </Box>
                <Box sx={{ flexGrow: 1, pb: i < stats.jobs.length - 1 ? 0 : 0 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>{fmtDate(job.date)}</Typography>
                  {job.diagnosis && <Typography sx={{ fontSize: '0.9rem', mb: 0.5 }}>{job.diagnosis}{job.diagnosis.length >= 200 ? '…' : ''}</Typography>}
                  {job.workCarriedOut && <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', mb: 0.5 }}>{job.workCarriedOut}{job.workCarriedOut.length >= 200 ? '…' : ''}</Typography>}
                  {job.costTotal != null && <Chip label={fmt(job.costTotal)} size="small" sx={{ bgcolor: '#D8E2FF', color: '#1558D6', fontWeight: 600 }} />}
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 2 }}>
          MOT history
        </Typography>
        {sorted.length === 0 ? (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>No MOT history available.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {sorted.map((t, i) => (
              <Card key={i} sx={{ borderLeft: `4px solid ${t.result === 'PASSED' ? '#1A6B3A' : '#BA1A1A'}` }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {t.result === 'PASSED'
                      ? <CheckCircleRoundedIcon sx={{ color: '#1A6B3A', fontSize: '1.1rem' }} />
                      : <CancelRoundedIcon sx={{ color: '#BA1A1A', fontSize: '1.1rem' }} />}
                    <StatusChip status={t.result} />
                    <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>{fmtDate(t.testDate)}</Typography>
                    {t.odometerValue && <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>{t.odometerValue.toLocaleString()} mi</Typography>}
                    {t.expiryDate && t.result === 'PASSED' && (
                      <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>Expires {fmtDate(t.expiryDate)}</Typography>
                    )}
                  </Box>
                  {t.defects?.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      {t.defects.map((d, j) => (
                        <Typography key={j} sx={{ fontSize: '0.82rem', color: d.type === 'FAIL' ? '#BA1A1A' : '#7B5800', mb: 0.25 }}>
                          <strong>{d.type}</strong> — {d.text}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────

function GalleryTab({ vehicleId, token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    getVehicleGallery(vehicleId, token).then(setItems).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!items.length) return <Typography sx={{ color: 'text.secondary', py: 2 }}>No photos or videos yet.</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
        {items.map((item) => (
          <Box key={item.id} onClick={() => setLightbox(item)} sx={{ borderRadius: 3, overflow: 'hidden', cursor: 'pointer', bgcolor: '#1A1B1F', aspectRatio: '4/3', position: 'relative',
            '&:hover img': { opacity: 0.9 }, '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,.15)' } }}>
            {item.mediaType === 'video' ? (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#2A2B2F' }}>
                <Typography sx={{ fontSize: '2rem' }}>▶</Typography>
              </Box>
            ) : (
              <Box component="img" src={mediaUrl(item.filename)} alt={item.caption || 'Job photo'} loading="lazy"
                sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.2s' }} />
            )}
            {item.caption && (
              <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 1, background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#fff' }}>{item.caption}</Typography>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="md" fullWidth>
        <Box sx={{ position: 'relative', bgcolor: '#000' }}>
          <IconButton onClick={() => setLightbox(null)} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 1 }}>
            <CloseRoundedIcon />
          </IconButton>
          {lightbox?.mediaType === 'video'
            ? <video src={mediaUrl(lightbox.filename)} controls autoPlay style={{ width: '100%', maxHeight: '70vh' }} />
            : lightbox && <Box component="img" src={mediaUrl(lightbox.filename)} alt={lightbox.caption} sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />}
          {lightbox?.caption && <Box sx={{ p: 2, bgcolor: '#000' }}><Typography sx={{ color: '#e5e7eb', fontSize: '0.88rem' }}>{lightbox.caption}</Typography></Box>}
        </Box>
      </Dialog>
    </Box>
  );
}

// ── Invoices ──────────────────────────────────────────────────────────────────

function InvoicesTab({ vehicleId, token, onOpenInvoice }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleInvoices(vehicleId, token).then(setInvoices).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!invoices.length) return <Typography sx={{ color: 'text.secondary', py: 2 }}>No invoices yet.</Typography>;

  return (
    <Stack spacing={1.5}>
      {invoices.map((inv) => (
        <Card key={inv.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.15s' }}
          onClick={() => onOpenInvoice(inv.id)}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{inv.reference}</Typography>
                {inv.title && <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{inv.title}</Typography>}
              </Box>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{fmtDate(inv.date)}</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(inv.total)}</Typography>
                <StatusChip status={inv.status} />
                <ChevronRightRoundedIcon sx={{ color: 'text.secondary', fontSize: '1.2rem' }} />
              </Stack>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

// ── Quote section ─────────────────────────────────────────────────────────────

function QuoteSection({ quote, onAccept }) {
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  const handleAccept = async () => {
    setAccepting(true); setAcceptError('');
    try { await onAccept(); } catch (err) { setAcceptError(err.message); } finally { setAccepting(false); }
  };

  const renderLines = (lines) => lines.map((l) => (
    <Box key={l.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #F0F0F5' }}>
      <Typography sx={{ fontSize: '0.9rem' }}>{l.description}</Typography>
      <Stack direction="row" spacing={3}>
        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>×{l.qty}</Typography>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', minWidth: 70, textAlign: 'right' }}>£{l.lineTotal.toFixed(2)}</Typography>
      </Stack>
    </Box>
  ));

  const hasItems = quote.items?.length > 0;
  const hasUngrouped = quote.ungroupedLines?.length > 0;

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Your estimate</Typography>
          <StatusChip status={quote.status} />
        </Box>
        {quote.diagnosticSummary && <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2 }}>{quote.diagnosticSummary}</Typography>}
        {hasItems && quote.items.map((item) => (
          <Box key={item.id} sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'primary.main', mb: 1 }}>{item.title}</Typography>
            {item.description && <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', mb: 1 }}>{item.description}</Typography>}
            {renderLines(item.lines)}
          </Box>
        ))}
        {hasUngrouped && renderLines(quote.ungroupedLines)}
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E1E2EC' }}>
          {[['Subtotal', `£${quote.totals.subtotal.toFixed(2)}`], [`VAT (${quote.totals.vatRate}%)`, `£${quote.totals.vat.toFixed(2)}`]].map(([l, v]) => (
            <Box key={l} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 6, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>{l}</Typography>
              <Typography sx={{ fontSize: '0.88rem', minWidth: 80, textAlign: 'right' }}>{v}</Typography>
            </Box>
          ))}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 6, mt: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography sx={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>£{quote.totals.total.toFixed(2)}</Typography>
          </Box>
        </Box>
        {quote.notes && <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 2, fontStyle: 'italic' }}>{quote.notes}</Typography>}
        {onAccept && (quote.status === 'sent' || quote.status === 'published') && (
          <Box sx={{ mt: 3 }}>
            {acceptError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{acceptError}</Alert>}
            <Button variant="contained" size="large" onClick={handleAccept} disabled={accepting} sx={{ borderRadius: 100 }}>
              {accepting ? 'Approving…' : 'Approve this estimate'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ── Job detail ────────────────────────────────────────────────────────────────

function JobDetail({ projectId, token, onBack }) {
  const [data, setData] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getJobReport(projectId, token).catch(() => null),
      getJobQuote(projectId, token).catch(() => null),
    ]).then(([reportData, quoteData]) => {
      setData(reportData); setQuote(quoteData);
      if (!reportData && !quoteData) setError('No report or quote available for this job.');
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [projectId]);

  const handleAcceptQuote = async () => {
    await acceptQuote(projectId, token);
    setQuote((q) => ({ ...q, status: 'approved' }));
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

  if (!data && quote) {
    return (
      <Box>
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ borderRadius: 100, textTransform: 'none', color: 'text.secondary', mb: 2 }}>
          Back to jobs
        </Button>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Estimate for your vehicle</Typography>
        <QuoteSection quote={quote} onAccept={handleAcceptQuote} />
      </Box>
    );
  }
  if (!data) return null;

  const { job, report, images, confirmedFixes } = data;

  return (
    <Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ borderRadius: 100, textTransform: 'none', color: 'text.secondary', mb: 2 }}>
        Back to jobs
      </Button>
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.25rem' }}>{job.registration} — Service Report</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
          {[job.make, job.model, job.year].filter(Boolean).join(' ')} · {fmtDate(job.openedAt)}
        </Typography>
      </Box>
      {[
        report.diagnosis && ['Diagnosis', report.diagnosis],
        report.workCarriedOut && ['Work carried out', report.workCarriedOut],
      ].filter(Boolean).map(([title, text]) => (
        <Card key={title} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 1.5 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{text}</Typography>
          </CardContent>
        </Card>
      ))}
      {(report.costParts != null || report.costLabour != null || report.costTotal != null) && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 1.5 }}>Your bill</Typography>
            {report.costParts != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography sx={{ color: 'text.secondary' }}>Parts</Typography><Typography>{fmt(report.costParts)}</Typography>
              </Box>
            )}
            {report.costLabour != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography sx={{ color: 'text.secondary' }}>Labour</Typography><Typography>{fmt(report.costLabour)}</Typography>
              </Box>
            )}
            {report.costTotal != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, borderTop: '1px solid #E1E2EC' }}>
                <Typography sx={{ fontWeight: 700 }}>Total</Typography>
                <Typography sx={{ fontWeight: 700 }}>{fmt(report.costTotal)}</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
      {images?.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 2 }}>Photos</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5 }}>
              {images.filter((img) => img.mediaType !== 'video').map((img) => (
                <Box key={img.id} sx={{ borderRadius: 2, overflow: 'hidden', aspectRatio: '4/3' }}>
                  <Box component="img" src={mediaUrl(img.filename)} alt={img.caption || ''} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </Box>
              ))}
              {images.filter((img) => img.mediaType === 'video').map((img) => (
                <Box key={img.id} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <video src={mediaUrl(img.filename)} controls style={{ width: '100%', borderRadius: 8 }} />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 1 }}>Report published {fmtDate(report.publishedAt)}</Typography>
      {quote && <QuoteSection quote={quote} onAccept={handleAcceptQuote} />}
    </Box>
  );
}

// ── Vehicle Jobs ──────────────────────────────────────────────────────────────

function VehicleJobs({ vehicle, token, onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleJobs(vehicle.id, token).then(setJobs).finally(() => setLoading(false));
  }, [vehicle.id]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (jobs.length === 0) return <Typography sx={{ color: 'text.secondary', py: 2 }}>No jobs found for this vehicle.</Typography>;

  return (
    <Stack spacing={1.5}>
      {jobs.map((job) => (
        <Card key={job.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.15s' }}
          onClick={() => onSelectJob(job.id)}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>{fmtDate(job.openedAt)}</Typography>
                {job.diagnosisSummary && <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{job.diagnosisSummary}</Typography>}
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
                  {job.costTotal != null && <Chip label={fmt(job.costTotal)} size="small" sx={{ bgcolor: '#D8E2FF', color: '#1558D6', fontWeight: 600 }} />}
                  {job.quoteStatus && <StatusChip status={job.quoteStatus} />}
                </Stack>
              </Box>
              <ChevronRightRoundedIcon sx={{ color: 'text.secondary', mt: 0.5, flexShrink: 0 }} />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

// ── Project Photos ────────────────────────────────────────────────────────────

function ProjectPhotosTab({ vehicleId, token }) {
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [activeTag, setActiveTag] = useState('');

  useEffect(() => {
    getVehiclePhotos(vehicleId, token)
      .then(async (list) => {
        setPhotos(list);
        const entries = await Promise.all(list.map(async (p) => [p.id, await resolvePhotoUrl(p.filename, token)]));
        setUrls(Object.fromEntries(entries));
      }).catch(() => {}).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!photos.length) return <Typography sx={{ color: 'text.secondary', py: 2 }}>No photos uploaded yet.</Typography>;

  const allTags = [...new Set(photos.flatMap((p) => p.tags || []))].sort();
  const visible = activeTag ? photos.filter((p) => p.tags?.includes(activeTag)) : photos;

  return (
    <Box>
      {allTags.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          {['All', ...allTags].map((tag) => {
            const active = tag === 'All' ? !activeTag : activeTag === tag;
            return (
              <Chip key={tag} label={tag} onClick={() => setActiveTag(tag === 'All' ? '' : tag === activeTag ? '' : tag)}
                color={active ? 'primary' : 'default'} variant={active ? 'filled' : 'outlined'} size="small" sx={{ cursor: 'pointer' }} />
            );
          })}
        </Stack>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
        {visible.map((photo) => (
          <Box key={photo.id} onClick={() => setLightbox(photo)} sx={{ borderRadius: 3, overflow: 'hidden', cursor: 'pointer', position: 'relative', aspectRatio: '4/3',
            '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,.15)' } }}>
            <Box component="img" src={urls[photo.id] || ''} alt={photo.caption || 'Photo'} loading="lazy"
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {photo.tags?.length > 0 && (
              <Box sx={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {photo.tags.map((t) => <Chip key={t} label={t} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.68rem', height: 20 }} />)}
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="md" fullWidth>
        <Box sx={{ position: 'relative', bgcolor: '#000' }}>
          <IconButton onClick={() => setLightbox(null)} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 1 }}>
            <CloseRoundedIcon />
          </IconButton>
          {lightbox && <Box component="img" src={urls[lightbox.id] || ''} alt={lightbox.caption} sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />}
          {lightbox?.caption && <Box sx={{ p: 2, bgcolor: '#111' }}><Typography sx={{ color: '#e5e7eb', fontSize: '0.88rem', textAlign: 'center' }}>{lightbox.caption}</Typography></Box>}
          {lightbox?.tags?.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, px: 2, pb: 2 }}>
              {lightbox.tags.map((t) => <Chip key={t} label={t} size="small" sx={{ bgcolor: '#334155', color: '#e2e8f0' }} />)}
            </Box>
          )}
        </Box>
      </Dialog>
    </Box>
  );
}

// ── Vehicle Detail ────────────────────────────────────────────────────────────

const VEHICLE_TABS = [
  { id: 'jobs',    label: 'Jobs',          icon: <HandymanRoundedIcon sx={{ fontSize: 18 }} /> },
  { id: 'mycar',   label: 'My Car',        icon: <DirectionsCarRoundedIcon sx={{ fontSize: 18 }} /> },
  { id: 'photos',  label: 'Photos',        icon: <PhotoCameraRoundedIcon sx={{ fontSize: 18 }} /> },
  { id: 'gallery', label: 'Report Gallery',icon: <PhotoLibraryRoundedIcon sx={{ fontSize: 18 }} /> },
  { id: 'invoices',label: 'Invoices',      icon: <ReceiptRoundedIcon sx={{ fontSize: 18 }} /> },
];

function VehicleDetail({ vehicle, token, onBack, workshopName }) {
  const [tab, setTab] = useState('jobs');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  useEffect(() => {
    const pid = localStorage.getItem('portalProjectId');
    if (pid) { localStorage.removeItem('portalProjectId'); setSelectedJobId(pid); }
  }, []);

  if (selectedInvoiceId) {
    return <InvoiceView invoiceId={selectedInvoiceId} token={token} workshopName={workshopName} onBack={() => setSelectedInvoiceId(null)} />;
  }
  if (selectedJobId) {
    return <JobDetail projectId={selectedJobId} token={token} onBack={() => setSelectedJobId(null)} />;
  }

  return (
    <Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ borderRadius: 100, textTransform: 'none', color: 'text.secondary', mb: 2 }}>
        My vehicles
      </Button>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontFamily: '"Courier New", "Roboto Mono", monospace', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.06em', lineHeight: 1.1 }}>
          {vehicle.registration}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', mt: 0.5 }}>
          {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
        </Typography>
      </Box>

      <Box sx={{ borderBottom: '1px solid #E1E2EC', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}>
          {VEHICLE_TABS.map((t) => <Tab key={t.id} value={t.id} label={t.label} icon={t.icon} iconPosition="start" disableRipple />)}
        </Tabs>
      </Box>

      {tab === 'jobs'    && <VehicleJobs vehicle={vehicle} token={token} onSelectJob={setSelectedJobId} />}
      {tab === 'mycar'   && <VehicleHistoryTab vehicleId={vehicle.id} token={token} />}
      {tab === 'photos'  && <ProjectPhotosTab vehicleId={vehicle.id} token={token} />}
      {tab === 'gallery' && <GalleryTab vehicleId={vehicle.id} token={token} />}
      {tab === 'invoices'&& <InvoicesTab vehicleId={vehicle.id} token={token} onOpenInvoice={setSelectedInvoiceId} />}
    </Box>
  );
}

// ── Profile drawer ────────────────────────────────────────────────────────────

function ProfileDrawer({ token, open, onClose }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (open) {
      getProfile(token).then((p) => {
        setProfile(p);
        setForm({ name: p.name, phone: p.phone, addressLine1: p.addressLine1, addressLine2: p.addressLine2, city: p.city, postcode: p.postcode });
      });
    }
  }, [open, token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSaveProfile = async (e) => {
    e.preventDefault(); setSaving(true); setSaveMsg('');
    try {
      const updated = await updateProfile(form, token);
      setProfile(updated); setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (err) { setSaveMsg(err.message); } finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault(); setPwError(''); setPwMsg('');
    if (pw.next !== pw.confirm) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      await changePassword({ currentPassword: pw.current, newPassword: pw.next }, token);
      setPwMsg('Password updated.'); setPw({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwMsg(''), 3000);
    } catch (err) { setPwError(err.message); } finally { setPwSaving(false); }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, borderRadius: '24px 0 0 24px' } }}>
      <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.25rem' }}>My account</Typography>
          <IconButton onClick={onClose}><CloseRoundedIcon /></IconButton>
        </Box>

        {!profile ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box> : (
          <>
            <Box component="form" onSubmit={handleSaveProfile}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 2 }}>
                Personal details
              </Typography>
              <Stack spacing={2}>
                <TextField fullWidth label="Email address" value={profile.email} disabled />
                <TextField fullWidth label="Full name" value={form.name} onChange={set('name')} placeholder="Your name" />
                <TextField fullWidth label="Phone" value={form.phone} onChange={set('phone')} />
                <Divider />
                <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main' }}>Address</Typography>
                <TextField fullWidth label="Address line 1" value={form.addressLine1} onChange={set('addressLine1')} />
                <TextField fullWidth label="Address line 2" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Optional" />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 2 }}>
                  <TextField fullWidth label="City" value={form.city} onChange={set('city')} />
                  <TextField fullWidth label="Postcode" value={form.postcode} onChange={set('postcode')} inputProps={{ style: { textTransform: 'uppercase' } }} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button type="submit" variant="contained" disabled={saving} sx={{ borderRadius: 100 }}>{saving ? 'Saving…' : 'Save changes'}</Button>
                  {saveMsg && <Typography sx={{ fontSize: '0.85rem', color: '#1A6B3A' }}>{saveMsg}</Typography>}
                </Box>
              </Stack>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box component="form" onSubmit={handleChangePassword}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 2 }}>
                Change password
              </Typography>
              <Stack spacing={2}>
                <TextField fullWidth type="password" label="Current password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} required />
                <TextField fullWidth type="password" label="New password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} inputProps={{ minLength: 8 }} required />
                <TextField fullWidth type="password" label="Confirm new password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} required />
                {pwError && <Alert severity="error" sx={{ borderRadius: 2 }}>{pwError}</Alert>}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button type="submit" variant="outlined" disabled={pwSaving} sx={{ borderRadius: 100 }}>{pwSaving ? 'Updating…' : 'Update password'}</Button>
                  {pwMsg && <Typography sx={{ fontSize: '0.85rem', color: '#1A6B3A' }}>{pwMsg}</Typography>}
                </Box>
              </Stack>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}

// ── Notification bell ─────────────────────────────────────────────────────────

const NOTIF_KEY = 'cp_notif_seen_at';

function NotificationBell({ token, onNavigate }) {
  const [items, setItems] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(NOTIF_KEY) || null);

  useEffect(() => { getNotifications(token).then(setItems).catch(() => {}); }, [token]);

  const unread = items.filter((n) => !seenAt || new Date(n.eventAt) > new Date(seenAt)).length;

  const handleOpen = (e) => {
    setAnchorEl(e.currentTarget);
    const now = new Date().toISOString();
    localStorage.setItem(NOTIF_KEY, now);
    setSeenAt(now);
  };

  return (
    <>
      <IconButton onClick={handleOpen} size="small">
        <Badge badgeContent={unread || null} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 16, height: 16 } }}>
          <NotificationsOutlinedIcon sx={{ fontSize: '1.3rem' }} />
        </Badge>
      </IconButton>

      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { borderRadius: 3, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,.12)', mt: 1 } }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #F0F0F5' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Recent activity</Typography>
        </Box>
        {items.length === 0 ? (
          <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem' }}>No recent activity.</Typography>
          </Box>
        ) : (
          items.map((n, i) => (
            <ListItemButton key={i} onClick={() => { setAnchorEl(null); onNavigate(n.projectId); }}
              sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #F5F5F8' }}>
              <Box>
                <Chip label={n.type === 'report' ? 'Report ready' : 'Estimate sent'}
                  size="small" color={n.type === 'report' ? 'success' : 'info'} sx={{ mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{n.registration}{n.vehicle ? ` · ${n.vehicle}` : ''}</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{fmtDate(n.eventAt)}</Typography>
              </Box>
            </ListItemButton>
          ))
        )}
      </Menu>
    </>
  );
}

// ── Add vehicle dialog ────────────────────────────────────────────────────────

function AddVehicleDialog({ token, open, onClose, onAdded }) {
  const [reg, setReg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const vehicle = await addVehicle({ registration: reg.trim() }, token);
      onAdded(vehicle); onClose(); setReg('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Add a vehicle</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1 }}>
          <TextField fullWidth label="Registration number" value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())} required autoFocus
            inputProps={{ style: { fontFamily: '"Courier New", monospace', fontSize: '1.1rem', letterSpacing: '0.08em', textTransform: 'uppercase' } }}
            placeholder="e.g. AB12 CDE" sx={{ mb: 1.5 }} />
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
            We'll look up your vehicle details from the DVSA database automatically.
          </Typography>
          {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 100 }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading || !reg.trim()} sx={{ borderRadius: 100 }}>
            {loading ? 'Looking up…' : 'Add vehicle'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ── Enquiry dialog ────────────────────────────────────────────────────────────

function EnquiryDialog({ token, vehicles, open, onClose }) {
  const [vehicleId, setVehicleId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => { onClose(); setDone(false); setMessage(''); setVehicleId(''); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!message.trim()) return;
    setSending(true); setError('');
    try { await submitEnquiry({ message, vehicleId: vehicleId || undefined }, token); setDone(true); }
    catch (err) { setError(err.message); } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Send an enquiry</DialogTitle>
      {done ? (
        <>
          <DialogContent>
            <Alert severity="success" sx={{ borderRadius: 2 }}>Your message has been sent. We'll be in touch soon.</Alert>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button variant="contained" onClick={handleClose} sx={{ borderRadius: 100 }}>Close</Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2}>
              {vehicles.length > 0 && (
                <TextField select fullWidth label="Vehicle (optional)" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <MenuItem value="">— General enquiry —</MenuItem>
                  {vehicles.map((v) => (
                    <MenuItem key={v.id} value={v.id}>{v.registration} — {[v.make, v.model].filter(Boolean).join(' ')}</MenuItem>
                  ))}
                </TextField>
              )}
              <TextField fullWidth multiline rows={5} label="Message" placeholder="How can we help?" value={message}
                onChange={(e) => setMessage(e.target.value)} required />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleClose} variant="outlined" sx={{ borderRadius: 100 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={sending || !message.trim()} sx={{ borderRadius: 100 }}>
              {sending ? 'Sending…' : 'Send enquiry'}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

// ── Root portal ───────────────────────────────────────────────────────────────

export default function CustomerPortal({ user, token, onLogout }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [workshop, setWorkshop] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);

  useEffect(() => {
    getWorkshopInfo(token).then(setWorkshop).catch(() => {});
    getMyVehicles(token).then((v) => {
      setVehicles(v);
      if (v.length === 1) setSelectedVehicle(v[0]);
    }).finally(() => setLoading(false));
  }, [token]);

  return (
    <ThemeProvider theme={cpTheme}>
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>

        {/* Top app bar */}
        <AppBar position="sticky" color="inherit" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #E1E2EC', top: 0, zIndex: 100 }}>
          <Toolbar sx={{ px: { xs: 2, sm: 3 }, minHeight: '60px !important' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                {workshop?.name || 'Customer Portal'}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Customer Portal
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button size="small" startIcon={<MessageOutlinedIcon fontSize="small" />} onClick={() => setShowEnquiry(true)}
                sx={{ borderRadius: 100, textTransform: 'none', color: 'text.secondary', display: { xs: 'none', sm: 'flex' } }}>
                Enquiry
              </Button>
              <IconButton size="small" onClick={() => setShowEnquiry(true)} sx={{ display: { xs: 'flex', sm: 'none' } }}>
                <MessageOutlinedIcon fontSize="small" />
              </IconButton>
              <NotificationBell token={token} onNavigate={(pid) => setSelectedJobId(pid)} />
              <IconButton size="small" onClick={() => setShowProfile(true)}>
                <AccountCircleOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={onLogout}>
                <LogoutRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Toolbar>
        </AppBar>

        {/* Modals & overlays */}
        <ProfileDrawer token={token} open={showProfile} onClose={() => setShowProfile(false)} />
        <EnquiryDialog token={token} vehicles={vehicles} open={showEnquiry} onClose={() => setShowEnquiry(false)} />
        <AddVehicleDialog token={token} open={showAddVehicle} onClose={() => setShowAddVehicle(false)}
          onAdded={(v) => setVehicles((prev) => [...prev, v])} />

        {/* Notification job navigation */}
        {selectedJobId && (
          <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default', zIndex: 50, overflowY: 'auto' }}>
            <Box sx={{ maxWidth: 820, mx: 'auto', px: { xs: 2, sm: 4 }, py: 4 }}>
              <JobDetail projectId={selectedJobId} token={token} onBack={() => setSelectedJobId(null)} />
            </Box>
          </Box>
        )}

        {/* Main content */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 4 }, py: 4 }}>
          {selectedVehicle ? (
            <VehicleDetail vehicle={selectedVehicle} token={token} workshopName={workshop?.name} onBack={() => setSelectedVehicle(null)} />
          ) : (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.2 }}>Your vehicles</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mt: 0.5 }}>
                    View service history, reports and invoices
                  </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddVehicle(true)} sx={{ borderRadius: 100 }}>
                  Add vehicle
                </Button>
              </Box>

              {loading ? (
                <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>
              ) : vehicles.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: alpha('#1558D6', 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                    <DirectionsCarRoundedIcon sx={{ fontSize: '2rem', color: 'primary.main' }} />
                  </Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', mb: 0.5 }}>No vehicles yet</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mb: 3 }}>Add your vehicle to view service history and reports.</Typography>
                  <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddVehicle(true)} sx={{ borderRadius: 100 }}>
                    Add your first vehicle
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
                  {vehicles.map((v) => (
                    <Card key={v.id} sx={{ bgcolor: alpha('#1558D6', 0.04), border: 'none', borderRadius: 4,
                      transition: 'box-shadow 0.2s, transform 0.15s',
                      '&:hover': { boxShadow: '0 4px 24px rgba(21,88,214,0.15)', transform: 'translateY(-2px)' } }}>
                      <CardActionArea onClick={() => setSelectedVehicle(v)} sx={{ p: 3 }}>
                        <Typography sx={{ fontFamily: '"Courier New", "Roboto Mono", monospace', fontSize: '1.75rem', fontWeight: 700, letterSpacing: '0.05em', color: '#1A1B1F', lineHeight: 1.1 }}>
                          {v.registration || '—'}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', mt: 0.75, mb: 2 }}>
                          {[v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehicle'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Chip label={`${v.publishedJobCount} report${v.publishedJobCount !== 1 ? 's' : ''}`}
                            size="small" sx={{ bgcolor: alpha('#1558D6', 0.12), color: '#1558D6', fontWeight: 600 }} />
                          <ChevronRightRoundedIcon sx={{ color: 'text.secondary' }} />
                        </Box>
                      </CardActionArea>
                    </Card>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
