import { useState, useEffect } from 'react';
import { getMyVehicles, getVehicleJobs, getJobReport, getJobQuote } from '../services/customerApi';
import { imageUrl } from '../services/reportsApi';

const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };

function fmt(val) {
  if (val == null) return '—';
  return `£${parseFloat(val).toFixed(2)}`;
}

function QuoteSection({ quote }) {
  const partLines = quote.lines.filter((l) => l.type === 'part');
  const labourLines = quote.lines.filter((l) => l.type === 'labour');
  const otherLines = quote.lines.filter((l) => l.type !== 'part' && l.type !== 'labour');

  const renderLines = (lines) => lines.map((l) => (
    <div key={l.id} className="cp-quote-line">
      <span className="cp-quote-line-desc">{l.description}</span>
      <span className="cp-quote-line-qty">×{l.qty}</span>
      <span className="cp-quote-line-total">£{l.lineTotal.toFixed(2)}</span>
    </div>
  ));

  return (
    <div className="cp-report-section cp-quote-section">
      <h3 className="cp-section-title">Your estimate</h3>
      {quote.diagnosticSummary && <p className="cp-section-text" style={{ marginBottom: 12 }}>{quote.diagnosticSummary}</p>}

      {partLines.length > 0 && (
        <div className="cp-quote-group">
          <div className="cp-quote-group-label">Parts</div>
          {renderLines(partLines)}
        </div>
      )}
      {labourLines.length > 0 && (
        <div className="cp-quote-group">
          <div className="cp-quote-group-label">Labour</div>
          {renderLines(labourLines)}
        </div>
      )}
      {otherLines.length > 0 && (
        <div className="cp-quote-group">
          <div className="cp-quote-group-label">Other</div>
          {renderLines(otherLines)}
        </div>
      )}

      <div className="cp-quote-totals">
        <div className="cp-cost-row"><span>Subtotal</span><span>£{quote.totals.subtotal.toFixed(2)}</span></div>
        <div className="cp-cost-row"><span>VAT ({quote.totals.vatRate}%)</span><span>£{quote.totals.vat.toFixed(2)}</span></div>
        <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>£{quote.totals.total.toFixed(2)}</span></div>
      </div>

      {quote.notes && <p className="cp-quote-notes">{quote.notes}</p>}
      <p className="cp-published-at" style={{ marginTop: 8 }}>
        Quote {quote.status === 'approved' ? 'approved' : 'sent'}{' '}
        {new Date(quote.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
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
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="cp-loading">Loading report…</div>;
  if (error) return <div className="cp-error">{error}</div>;
  if (!data) return null;

  // quote-only view (no published report yet)
  if (!data && quote) {
    return (
      <div className="cp-detail">
        <button className="cp-back" onClick={onBack}>← Back to jobs</button>
        <div className="cp-detail-header">
          <div>
            <h2 className="cp-detail-title">Estimate for your vehicle</h2>
          </div>
          <span className="cp-status-badge cp-status-badge--quote">Quote pending</span>
        </div>
        <QuoteSection quote={quote} />
      </div>
    );
  }

  const { job, report, images, confirmedFixes } = data;

  return (
    <div className="cp-detail">
      <button className="cp-back" onClick={onBack}>← Back to jobs</button>

      <div className="cp-detail-header">
        <div>
          <h2 className="cp-detail-title">{job.registration} — Service Report</h2>
          <p className="cp-detail-meta">
            {[job.make, job.model, job.year].filter(Boolean).join(' ')}
            {' · '}
            {new Date(job.openedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <span className="cp-status-badge">{job.closed ? 'Completed' : 'In progress'}</span>
      </div>

      {report.diagnosis && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">What we found</h3>
          <p className="cp-section-text">{report.diagnosis}</p>
        </div>
      )}

      {report.workCarriedOut && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">What we did</h3>
          <p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{report.workCarriedOut}</p>
        </div>
      )}

      {confirmedFixes.length > 0 && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Repairs confirmed</h3>
          <ul className="cp-fixes">
            {confirmedFixes.map((f) => (
              <li key={f.id} className="cp-fix">✓ {f.text}</li>
            ))}
          </ul>
        </div>
      )}

      {report.technicianNotes && (
        <div className="cp-report-section cp-report-section--note">
          <h3 className="cp-section-title">Technician notes</h3>
          <p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{report.technicianNotes}</p>
        </div>
      )}

      {(report.costParts != null || report.costLabour != null || report.costTotal != null) && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Your bill</h3>
          <div className="cp-costs">
            {report.costParts != null && (
              <div className="cp-cost-row"><span>Parts</span><span>{fmt(report.costParts)}</span></div>
            )}
            {report.costLabour != null && (
              <div className="cp-cost-row"><span>Labour</span><span>{fmt(report.costLabour)}</span></div>
            )}
            {report.costTotal != null && (
              <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>{fmt(report.costTotal)}</span></div>
            )}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="cp-report-section">
          <h3 className="cp-section-title">Photos</h3>
          <div className="cp-photos">
            {images.map((img) => (
              <div key={img.id} className="cp-photo">
                <img src={imageUrl(img.filename)} alt={img.caption || 'Job photo'} />
                {img.caption && <p className="cp-photo-caption">{img.caption}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="cp-published-at">
        Report published {new Date(report.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

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
        <p className="cp-empty">No reports or quotes yet.</p>
      ) : (
        <div className="cp-job-list">
          {jobs.map((job) => (
            <button key={job.id} className="cp-job-card" onClick={() => onSelectJob(job.id)}>
              <div className="cp-job-date">
                {new Date(job.openedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="cp-job-badges">
                {job.reportId && <span className="cp-badge cp-badge--report">Report</span>}
                {job.quoteId && (
                  <span className={`cp-badge cp-badge--quote${job.quoteStatus === 'approved' ? ' cp-badge--approved' : ''}`}>
                    {job.quoteStatus === 'approved' ? 'Quote approved' : 'Quote pending'}
                  </span>
                )}
              </div>
              {job.diagnosisSummary && <p className="cp-job-summary">{job.diagnosisSummary}</p>}
              <div className="cp-job-footer">
                {job.costTotal != null && <span className="cp-job-cost">{fmt(job.costTotal)}</span>}
                <span className="cp-job-arrow">View →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerPortal({ user, token, onLogout }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  useEffect(() => {
    getMyVehicles(token).then(setVehicles).finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="cp-shell">
      <header className="cp-header">
        <div className="cp-brand">
          <span className="cp-brand-name">Ask Bob</span>
          <span className="cp-brand-sub">Customer Portal</span>
        </div>
        <div className="cp-header-right">
          <span className="cp-user-email">{user.email}</span>
          <button className="secondary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="cp-main">
        {selectedJobId ? (
          <JobDetail projectId={selectedJobId} token={token} onBack={() => setSelectedJobId(null)} />
        ) : selectedVehicle ? (
          <VehicleJobs
            vehicle={selectedVehicle} token={token}
            onBack={() => setSelectedVehicle(null)}
            onSelectJob={setSelectedJobId}
          />
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
                    <div className="cp-vehicle-jobs">
                      {v.publishedJobCount} report{v.publishedJobCount !== 1 ? 's' : ''} available
                    </div>
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
