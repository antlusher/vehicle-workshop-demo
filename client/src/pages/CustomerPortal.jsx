import { useState, useEffect, useRef } from 'react';
import { getMyVehicles, getVehicleJobs, getJobReport, getJobQuote,
         getVehicleMot, getVehicleGallery, getVehicleInvoices, getInvoiceDetail,
         getProfile, updateProfile, changePassword, submitEnquiry } from '../services/customerApi';
import { mediaUrl } from '../services/reportsApi';

const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };
function fmt(val) { return val == null ? '—' : `£${parseFloat(val).toFixed(2)}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

// ── Invoice print view ──────────────────────────────────────────────────────
function InvoiceView({ invoiceId, token, onBack, workshopName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    getInvoiceDetail(invoiceId, token).then(setData).finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) return <div className="cp-loading">Loading invoice…</div>;
  if (!data) return <div className="cp-error">Invoice not found.</div>;

  const { id, reference, title, status, vehicle, registration, date, subtotal, vat, total, vatRate, items, ungroupedLines } = data;

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${reference}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 40px; }
        h1 { font-size: 1.6rem; margin: 0 0 4px; }
        .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 0.82rem; }
        td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 0.88rem; }
        .right { text-align: right; }
        .totals td { border: none; font-size: 0.9rem; }
        .total-row td { font-weight: 700; font-size: 1rem; border-top: 2px solid #111; }
        .section-title { font-weight: 600; margin: 20px 0 4px; font-size: 0.9rem; color: #374151; }
        .badge { display:inline-block; padding:2px 10px; border-radius:20px; font-size:0.76rem; font-weight:600;
                 background:${status==='approved'?'#dcfce7':'#fef9c3'}; color:${status==='approved'?'#15803d':'#a16207'}; }
      </style></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const renderLines = (lines) => lines.map((l) => (
    <tr key={l.id}>
      <td>{TYPE_LABELS[l.type] || l.type}</td>
      <td>{l.description}</td>
      <td className="right">×{l.qty}</td>
      <td className="right">{fmt(l.lineTotal)}</td>
    </tr>
  ));

  return (
    <div className="cp-invoice-shell">
      <div className="cp-invoice-toolbar">
        <button className="cp-back" onClick={onBack}>← Back to invoices</button>
        <button onClick={handlePrint} style={{ marginLeft: 'auto' }}>Print / Save PDF</button>
      </div>

      <div className="cp-invoice-paper" ref={printRef}>
        <div className="cp-inv-header">
          <div>
            <h1 className="cp-inv-title">{status === 'approved' ? 'Invoice' : 'Estimate'}</h1>
            <p className="cp-inv-ref">{reference}{title ? ` — ${title}` : ''}</p>
          </div>
          <div className="cp-inv-meta">
            <p>{fmtDate(date)}</p>
            <p>{registration} {vehicle ? `· ${vehicle}` : ''}</p>
            <span className={`cp-status-badge cp-status-badge--${status}`}>{status}</span>
          </div>
        </div>

        <table className="cp-inv-table">
          <thead>
            <tr><th>Type</th><th>Description</th><th className="right">Qty</th><th className="right">Total</th></tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <>
                {item.title && <tr key={`g-${item.id}`}><td colSpan={4} className="section-title">{item.title}</td></tr>}
                {renderLines(item.lines)}
              </>
            ))}
            {renderLines(ungroupedLines || [])}
          </tbody>
        </table>

        <table className="cp-inv-totals">
          <tbody>
            <tr><td colSpan={3} /><td className="right">Subtotal</td><td className="right">{fmt(subtotal)}</td></tr>
            <tr><td colSpan={3} /><td className="right">VAT ({vatRate}%)</td><td className="right">{fmt(vat)}</td></tr>
            <tr className="total-row"><td colSpan={3} /><td className="right">Total</td><td className="right">{fmt(total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MOT / vehicle history ───────────────────────────────────────────────────
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
    <div className="cp-chart-wrap">
      <p className="cp-chart-label">Mileage over time</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
        <polyline points={points.join(' ')} fill="none" stroke="#1e40af" strokeWidth="2.5" strokeLinejoin="round" />
        {withMileage.map((t, i) => {
          const [x, y] = points[i].split(',');
          return <circle key={i} cx={x} cy={y} r="4" fill="#1e40af" />;
        })}
        {withMileage.map((t, i) => {
          const [x] = points[i].split(',');
          return <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{dates[i]}</text>;
        })}
        <text x={pad - 4} y={pad} textAnchor="end" fontSize="10" fill="#6b7280">{maxM.toLocaleString()}</text>
        <text x={pad - 4} y={H - pad} textAnchor="end" fontSize="10" fill="#6b7280">{minM.toLocaleString()}</text>
      </svg>
    </div>
  );
}

function VehicleHistoryTab({ vehicleId, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleMot(vehicleId, token).then(setData).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div className="cp-loading">Loading vehicle data…</div>;
  if (!data) return <div className="cp-error">No vehicle data available.</div>;

  const { motTests, motMeta } = data;
  const sorted = [...(motTests || [])].sort((a, b) => new Date(b.testDate) - new Date(a.testDate));

  return (
    <div className="cp-tab-content">
      <div className="cp-vehicle-spec-grid">
        {motMeta.make && <div className="cp-spec"><span>Make</span><strong>{motMeta.make}</strong></div>}
        {motMeta.model && <div className="cp-spec"><span>Model</span><strong>{motMeta.model}</strong></div>}
        {(motMeta.firstUsedDate || motMeta.manufactureDate) && (
          <div className="cp-spec"><span>First used</span><strong>{fmtDate(motMeta.firstUsedDate || motMeta.manufactureDate)}</strong></div>
        )}
        {motMeta.fuelType && <div className="cp-spec"><span>Fuel</span><strong>{motMeta.fuelType}</strong></div>}
        {motMeta.engineSize && <div className="cp-spec"><span>Engine</span><strong>{motMeta.engineSize}cc</strong></div>}
        {motMeta.primaryColour && <div className="cp-spec"><span>Colour</span><strong>{motMeta.primaryColour}</strong></div>}
      </div>

      <MileageChart tests={motTests} />

      <h3 className="cp-section-title" style={{ marginTop: 24 }}>MOT history</h3>
      {sorted.length === 0 ? (
        <p className="cp-empty">No MOT history available.</p>
      ) : (
        <div className="cp-mot-list">
          {sorted.map((t, i) => (
            <div key={i} className={`cp-mot-item cp-mot-item--${t.result?.toLowerCase()}`}>
              <div className="cp-mot-top">
                <span className={`cp-mot-badge cp-mot-badge--${t.result?.toLowerCase()}`}>{t.result}</span>
                <span className="cp-mot-date">{fmtDate(t.testDate)}</span>
                {t.odometerValue && <span className="cp-mot-miles">{t.odometerValue.toLocaleString()} mi</span>}
                {t.expiryDate && t.result === 'PASSED' && (
                  <span className="cp-mot-expiry">Expires {fmtDate(t.expiryDate)}</span>
                )}
              </div>
              {t.defects?.length > 0 && (
                <ul className="cp-mot-defects">
                  {t.defects.map((d, j) => (
                    <li key={j} className={`cp-mot-defect cp-mot-defect--${d.type?.toLowerCase()}`}>
                      <span className="cp-defect-type">{d.type}</span> {d.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Gallery ─────────────────────────────────────────────────────────────────
function GalleryTab({ vehicleId, token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    getVehicleGallery(vehicleId, token).then(setItems).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div className="cp-loading">Loading gallery…</div>;
  if (!items.length) return <p className="cp-empty">No photos or videos yet.</p>;

  return (
    <div className="cp-tab-content">
      <div className="cp-gallery-grid">
        {items.map((item) => (
          <div key={item.id} className="cp-gallery-item" onClick={() => setLightbox(item)}>
            {item.mediaType === 'video' ? (
              <div className="cp-gallery-video-thumb">
                <span className="cp-play-icon">▶</span>
              </div>
            ) : (
              <img src={mediaUrl(item.filename)} alt={item.caption || 'Job photo'} loading="lazy" />
            )}
            {item.caption && <p className="cp-gallery-caption">{item.caption}</p>}
            <p className="cp-gallery-date">{fmtDate(item.jobDate)}</p>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="preview-overlay" onClick={() => setLightbox(null)}>
          <div className="preview-modal" style={{ maxWidth: 800, background: '#000' }} onClick={(e) => e.stopPropagation()}>
            <button className="preview-close" onClick={() => setLightbox(null)} style={{ color: '#fff' }}>✕</button>
            {lightbox.mediaType === 'video' ? (
              <video src={mediaUrl(lightbox.filename)} controls autoPlay style={{ width: '100%', maxHeight: '80vh' }} />
            ) : (
              <img src={mediaUrl(lightbox.filename)} alt={lightbox.caption} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
            )}
            {lightbox.caption && <p style={{ color: '#e5e7eb', padding: '8px 16px', fontSize: '0.85rem' }}>{lightbox.caption}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invoices list ────────────────────────────────────────────────────────────
function InvoicesTab({ vehicleId, token, onOpenInvoice }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleInvoices(vehicleId, token).then(setInvoices).finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div className="cp-loading">Loading invoices…</div>;
  if (!invoices.length) return <p className="cp-empty">No invoices yet.</p>;

  return (
    <div className="cp-tab-content">
      <div className="cp-invoice-list">
        {invoices.map((inv) => (
          <div key={inv.id} className="cp-invoice-row" onClick={() => onOpenInvoice(inv.id)}>
            <div className="cp-inv-row-left">
              <span className="cp-inv-row-ref">{inv.reference}</span>
              {inv.title && <span className="cp-inv-row-title">{inv.title}</span>}
            </div>
            <div className="cp-inv-row-right">
              <span className="cp-inv-row-date">{fmtDate(inv.date)}</span>
              <span className="cp-inv-row-total">{fmt(inv.total)}</span>
              <span className={`cp-status-badge cp-status-badge--${inv.status}`}>{inv.status}</span>
              <span className="cp-inv-row-arrow">→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Jobs (existing) ──────────────────────────────────────────────────────────
function QuoteSection({ quote }) {
  const renderLines = (lines) => lines.map((l) => (
    <div key={l.id} className="cp-quote-line">
      <span className="cp-quote-line-desc">{l.description}</span>
      <span className="cp-quote-line-qty">×{l.qty}</span>
      <span className="cp-quote-line-total">£{l.lineTotal.toFixed(2)}</span>
    </div>
  ));
  const hasItems = quote.items?.length > 0;
  const hasUngrouped = quote.ungroupedLines?.length > 0;
  return (
    <div className="cp-report-section cp-quote-section">
      <h3 className="cp-section-title">Your estimate</h3>
      {quote.diagnosticSummary && <p className="cp-section-text" style={{ marginBottom: 16 }}>{quote.diagnosticSummary}</p>}
      {hasItems && quote.items.map((item) => (
        <div key={item.id} className="cp-quote-item-group">
          <div className="cp-quote-item-title">{item.title}</div>
          {item.description && <p className="cp-quote-item-desc">{item.description}</p>}
          {renderLines(item.lines)}
          {item.lines.length > 1 && <div className="cp-quote-item-subtotal">Item total: £{item.subtotal.toFixed(2)}</div>}
        </div>
      ))}
      {hasUngrouped && <div className="cp-quote-item-group">{renderLines(quote.ungroupedLines)}</div>}
      {!hasItems && !hasUngrouped && <p style={{ color: '#9ca3af' }}>No items on this quote.</p>}
      <div className="cp-quote-totals">
        <div className="cp-cost-row"><span>Subtotal</span><span>£{quote.totals.subtotal.toFixed(2)}</span></div>
        <div className="cp-cost-row"><span>VAT ({quote.totals.vatRate}%)</span><span>£{quote.totals.vat.toFixed(2)}</span></div>
        <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>£{quote.totals.total.toFixed(2)}</span></div>
      </div>
      {quote.notes && <p className="cp-quote-notes">{quote.notes}</p>}
    </div>
  );
}

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
      setData(reportData);
      setQuote(quoteData);
      if (!reportData && !quoteData) setError('No report or quote available for this job.');
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="cp-loading">Loading report…</div>;
  if (error) return <div className="cp-error">{error}</div>;

  if (!data && quote) {
    return (
      <div className="cp-detail">
        <button className="cp-back" onClick={onBack}>← Back to jobs</button>
        <div className="cp-detail-header">
          <h2 className="cp-detail-title">Estimate for your vehicle</h2>
          <span className="cp-status-badge cp-status-badge--quote">Quote pending</span>
        </div>
        <QuoteSection quote={quote} />
      </div>
    );
  }
  if (!data) return null;

  const { job, report, images, confirmedFixes } = data;
  return (
    <div className="cp-detail">
      <button className="cp-back" onClick={onBack}>← Back to jobs</button>
      <div className="cp-detail-header">
        <div>
          <h2 className="cp-detail-title">{job.registration} — Service Report</h2>
          <p className="cp-detail-meta">
            {[job.make, job.model, job.year].filter(Boolean).join(' ')} · {fmtDate(job.openedAt)}
          </p>
        </div>
      </div>
      {report.diagnosis && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Diagnosis</h3>
          <p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{report.diagnosis}</p>
        </div>
      )}
      {report.workCarriedOut && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Work carried out</h3>
          <p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{report.workCarriedOut}</p>
        </div>
      )}
      {(report.costParts != null || report.costLabour != null || report.costTotal != null) && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Your bill</h3>
          <div className="cp-costs">
            {report.costParts != null && <div className="cp-cost-row"><span>Parts</span><span>{fmt(report.costParts)}</span></div>}
            {report.costLabour != null && <div className="cp-cost-row"><span>Labour</span><span>{fmt(report.costLabour)}</span></div>}
            {report.costTotal != null && <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>{fmt(report.costTotal)}</span></div>}
          </div>
        </div>
      )}
      {images?.length > 0 && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Photos</h3>
          <div className="cp-photos">
            {images.filter((img) => img.mediaType !== 'video').map((img) => (
              <div key={img.id} className="cp-photo">
                <img src={mediaUrl(img.filename)} alt={img.caption || 'Job photo'} />
                {img.caption && <p className="cp-photo-caption">{img.caption}</p>}
              </div>
            ))}
            {images.filter((img) => img.mediaType === 'video').map((img) => (
              <div key={img.id} className="cp-photo">
                <video src={mediaUrl(img.filename)} controls style={{ width: '100%', borderRadius: 8 }} />
                {img.caption && <p className="cp-photo-caption">{img.caption}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="cp-published-at">Report published {fmtDate(report.publishedAt)}</p>
      {quote && <QuoteSection quote={quote} />}
    </div>
  );
}

function VehicleJobs({ vehicle, token, onBack, onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleJobs(vehicle.id, token).then(setJobs).finally(() => setLoading(false));
  }, [vehicle.id]);

  return (
    <div>
      <button className="cp-back" onClick={onBack}>← My vehicles</button>
      <div className="cp-vehicle-header">
        <h2 className="cp-vehicle-title">{vehicle.registration}</h2>
        <p className="cp-vehicle-meta">{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}</p>
      </div>
      {loading ? <div className="cp-loading">Loading…</div> : jobs.length === 0 ? (
        <p className="cp-empty">No jobs found for this vehicle.</p>
      ) : (
        <div className="cp-jobs-list">
          {jobs.map((job) => (
            <div key={job.id} className="cp-job-card" onClick={() => onSelectJob(job.id)}>
              <div className="cp-job-date">{fmtDate(job.openedAt)}</div>
              {job.diagnosisSummary && <p className="cp-job-summary">{job.diagnosisSummary}</p>}
              <div className="cp-job-footer">
                {job.costTotal != null && <span className="cp-job-cost">{fmt(job.costTotal)}</span>}
                {job.quoteStatus && <span className={`cp-status-badge cp-status-badge--${job.quoteStatus}`}>{job.quoteStatus}</span>}
                <span className="cp-job-arrow">View →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vehicle detail with tabs ─────────────────────────────────────────────────
const TABS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'mycar', label: 'My Car' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'invoices', label: 'Invoices' },
];

function VehicleDetail({ vehicle, token, onBack }) {
  const [tab, setTab] = useState('jobs');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  // Read magic-link project from localStorage
  useEffect(() => {
    const pid = localStorage.getItem('portalProjectId');
    if (pid) { localStorage.removeItem('portalProjectId'); setSelectedJobId(pid); }
  }, []);

  if (selectedInvoiceId) {
    return <InvoiceView invoiceId={selectedInvoiceId} token={token} onBack={() => setSelectedInvoiceId(null)} />;
  }
  if (selectedJobId) {
    return <JobDetail projectId={selectedJobId} token={token} onBack={() => setSelectedJobId(null)} />;
  }

  return (
    <div>
      <button className="cp-back" onClick={onBack}>← My vehicles</button>
      <div className="cp-vehicle-header">
        <h2 className="cp-vehicle-title">{vehicle.registration}</h2>
        <p className="cp-vehicle-meta">{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}</p>
      </div>

      <div className="cp-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`cp-tab${tab === t.id ? ' cp-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'jobs' && (
        <VehicleJobs vehicle={vehicle} token={token} onBack={onBack} onSelectJob={setSelectedJobId} />
      )}
      {tab === 'mycar' && <VehicleHistoryTab vehicleId={vehicle.id} token={token} />}
      {tab === 'gallery' && <GalleryTab vehicleId={vehicle.id} token={token} />}
      {tab === 'invoices' && <InvoicesTab vehicleId={vehicle.id} token={token} onOpenInvoice={setSelectedInvoiceId} />}
    </div>
  );
}

// ── Profile panel ────────────────────────────────────────────────────────────
function ProfilePanel({ token, onClose }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    getProfile(token).then((p) => { setProfile(p); setForm({ name: p.name, phone: p.phone }); });
  }, [token]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      const updated = await updateProfile(form, token);
      setProfile(updated);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (err) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(''); setPwMsg('');
    if (pw.next !== pw.confirm) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      await changePassword({ currentPassword: pw.current, newPassword: pw.next }, token);
      setPwMsg('Password updated.');
      setPw({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwMsg(''), 3000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="cp-profile-overlay" onClick={onClose}>
      <div className="cp-profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-profile-header">
          <h2>My account</h2>
          <button className="cp-profile-close" onClick={onClose}>✕</button>
        </div>

        {!profile ? <div className="cp-loading">Loading…</div> : (
          <>
            <p className="cp-profile-email">{profile.email}</p>

            <form onSubmit={handleSaveProfile} className="cp-profile-form">
              <h3>Contact details</h3>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" />
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="e.g. 07700 900000" />
              <div className="cp-profile-actions">
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                {saveMsg && <span className="cp-profile-msg">{saveMsg}</span>}
              </div>
            </form>

            <form onSubmit={handleChangePassword} className="cp-profile-form cp-profile-form--pw">
              <h3>Change password</h3>
              <label>Current password</label>
              <input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} required />
              <label>New password</label>
              <input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} minLength={8} required />
              <label>Confirm new password</label>
              <input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} required />
              {pwError && <p className="cp-profile-error">{pwError}</p>}
              <div className="cp-profile-actions">
                <button type="submit" disabled={pwSaving}>{pwSaving ? 'Updating…' : 'Update password'}</button>
                {pwMsg && <span className="cp-profile-msg">{pwMsg}</span>}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Enquiry modal ─────────────────────────────────────────────────────────────
function EnquiryModal({ token, vehicles, onClose }) {
  const [vehicleId, setVehicleId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await submitEnquiry({ message, vehicleId: vehicleId || undefined }, token);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cp-enquiry-overlay" onClick={onClose}>
      <div className="cp-enquiry-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-enquiry-header">
          <h2>Send an enquiry</h2>
          <button className="cp-enquiry-close" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="cp-enquiry-done">
            <p>Your message has been sent. We'll be in touch soon.</p>
            <button className="cp-enquiry-submit" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="cp-enquiry-form">
            {vehicles.length > 0 && (
              <label className="cp-enquiry-label">
                Vehicle (optional)
                <select className="cp-enquiry-select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">— General enquiry —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration} — {[v.make, v.model].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="cp-enquiry-label">
              Message
              <textarea
                className="cp-enquiry-textarea"
                rows={5}
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>
            {error && <p className="cp-enquiry-error">{error}</p>}
            <div className="cp-enquiry-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="cp-enquiry-submit" disabled={sending || !message.trim()}>
                {sending ? 'Sending…' : 'Send enquiry'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Root portal ──────────────────────────────────────────────────────────────
export default function CustomerPortal({ user, token, onLogout }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showEnquiry, setShowEnquiry] = useState(false);

  useEffect(() => {
    getMyVehicles(token).then((v) => {
      setVehicles(v);
      if (v.length === 1) setSelectedVehicle(v[0]);
    }).finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="cp-shell">
      <header className="cp-header">
        <div className="cp-brand">
          <span className="cp-brand-name">Your Gofer</span>
          <span className="cp-brand-sub">Customer Portal</span>
        </div>
        <div className="cp-header-right">
          <button className="cp-enquiry-btn" onClick={() => setShowEnquiry(true)}>Enquiry</button>
          <button className="cp-user-email cp-profile-btn" onClick={() => setShowProfile(true)}>
            {user.name || user.email}
          </button>
          <button className="secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={onLogout}>Logout</button>
        </div>
      </header>

      {showProfile && <ProfilePanel token={token} onClose={() => setShowProfile(false)} />}
      {showEnquiry && <EnquiryModal token={token} vehicles={vehicles} onClose={() => setShowEnquiry(false)} />}

      <main className="cp-main">
        {selectedVehicle ? (
          <VehicleDetail vehicle={selectedVehicle} token={token} onBack={() => setSelectedVehicle(null)} />
        ) : (
          <div>
            <h2 className="cp-page-title">Your vehicles</h2>
            {loading ? <div className="cp-loading">Loading…</div> : vehicles.length === 0 ? (
              <p className="cp-empty">No vehicles linked to your account yet. Please contact the workshop.</p>
            ) : (
              <div className="cp-vehicle-grid">
                {vehicles.map((v) => (
                  <button key={v.id} className="cp-vehicle-card" onClick={() => setSelectedVehicle(v)}>
                    <div className="cp-vehicle-reg">{v.registration || '—'}</div>
                    <div className="cp-vehicle-info">{[v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehicle'}</div>
                    <div className="cp-vehicle-jobs">{v.publishedJobCount} report{v.publishedJobCount !== 1 ? 's' : ''} available</div>
                    <div className="cp-vehicle-arrow">View history →</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
