import React, { useState, useEffect, useCallback } from 'react';
import * as quotesApi from '../../services/quotesApi';

const STATUS_LABELS = { approved: 'Customer accepted', invoiced: 'Paid' };
const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };

function fmt(v) { return v == null ? '—' : `£${parseFloat(v).toFixed(2)}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

// ── Inline invoice view ───────────────────────────────────────────────────────

function InvoiceModal({ invoiceId, token, onClose, onStatusChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    Promise.all([
      quotesApi.getQuoteDetail(invoiceId, token),
      quotesApi.getSettings(token),
    ]).then(([q, s]) => { setData(q); setSettings(s); }).finally(() => setLoading(false));
  }, [invoiceId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await quotesApi.downloadInvoicePdf(invoiceId, token, `invoice-${data?.reference || invoiceId}.pdf`);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleStatus = async (status) => {
    setBusy(true);
    try {
      const updated = await quotesApi.updateQuote(invoiceId, { status }, token);
      setData(updated);
      onStatusChange(updated);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="admin-invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      </div>
    </div>
  );

  if (!data) return null;

  const isInvoice = data.status === 'approved' || data.status === 'invoiced';
  const registration = data.items ? null : null; // data comes from getQuoteDetail which has project info via QuoteTab

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="admin-invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-invoice-toolbar">
          <button type="button" className="secondary" onClick={onClose}>← Back</button>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
            {data.status === 'approved' && (
              <button type="button" onClick={() => handleStatus('invoiced')} disabled={busy}>
                {busy ? 'Saving…' : 'Mark as paid'}
              </button>
            )}
            {data.status === 'invoiced' && (
              <button type="button" className="secondary" onClick={() => handleStatus('approved')} disabled={busy}>
                {busy ? 'Saving…' : 'Revert to invoice'}
              </button>
            )}
            <button type="button" className="secondary" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Generating…' : '↓ Download PDF'}
            </button>
          </div>
        </div>

        <div className="cp-invoice-paper">
          <div className="cp-inv-header">
            <div>
              {settings?.workshopName && <p className="cp-inv-workshop">{settings.workshopName}</p>}
              <h1 className="cp-inv-title">{isInvoice ? 'Invoice' : 'Estimate'}</h1>
              <p className="cp-inv-ref">{data.reference}{data.title ? ` — ${data.title}` : ''}</p>
            </div>
            <div className="cp-inv-meta">
              <p>{fmtDate(data.updatedAt)}</p>
              {data.customer && <p>{data.customer.name || data.customer.email}</p>}
              <span className={`cp-status-badge cp-status-badge--${data.status}`}>{STATUS_LABELS[data.status] || data.status}</span>
            </div>
          </div>

          <table className="cp-inv-table">
            <thead>
              <tr><th>Type</th><th>Description</th><th className="right">Qty</th><th className="right">Total</th></tr>
            </thead>
            <tbody>
              {data.items?.map((item) => (
                <React.Fragment key={item.id}>
                  {item.title && <tr><td colSpan={4} style={{ fontWeight: 700, paddingTop: 10, color: '#1e293b', borderBottom: '1px solid #e2e8f0' }}>{item.title}</td></tr>}
                  {item.lines?.map((l) => (
                    <tr key={l.id}>
                      <td>{TYPE_LABELS[l.type] || l.type}</td>
                      <td>{l.description}</td>
                      <td className="right">×{l.qty}</td>
                      <td className="right">{fmt(l.lineTotal)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {data.ungroupedLines?.map((l) => (
                <tr key={l.id}>
                  <td>{TYPE_LABELS[l.type] || l.type}</td>
                  <td>{l.description}</td>
                  <td className="right">×{l.qty}</td>
                  <td className="right">{fmt(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, borderTop: '2px solid #1e293b', paddingTop: 12 }}>
            <table style={{ fontSize: '0.88rem', color: '#374151', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ padding: '3px 0', paddingRight: 32 }}>Subtotal</td><td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.totals?.subtotal)}</td></tr>
                <tr><td style={{ padding: '3px 0', paddingRight: 32 }}>VAT ({data.totals?.vatRate}%)</td><td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.totals?.vat)}</td></tr>
                <tr style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  <td style={{ padding: '6px 0', paddingRight: 32, borderTop: '1px solid #e2e8f0' }}>Total</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', borderTop: '1px solid #e2e8f0' }}>{fmt(data.totals?.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.notes && <p style={{ marginTop: 20, fontSize: '0.82rem', color: '#6b7280', fontStyle: 'italic' }}>{data.notes}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Invoices page ────────────────────────────────────────────────────────

export default function Invoices({ token }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [from, setFrom]                 = useState('');
  const [to, setTo]                     = useState('');
  const [searchInput, setSearchInput]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await quotesApi.getInvoices({ status: statusFilter, search, from, to }, token);
      setInvoices(data);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search, from, to]);

  useEffect(() => { load(); }, [load]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleStatusChange = (updated) => {
    setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? { ...inv, status: updated.status } : inv));
  };

  const totalRevenue = invoices.reduce((s, inv) => s + (inv.totals?.total || 0), 0);
  const paidCount    = invoices.filter((inv) => inv.status === 'invoiced').length;
  const pendingCount = invoices.filter((inv) => inv.status === 'approved').length;

  return (
    <div className="inv-page">
      {selectedId && (
        <InvoiceModal
          invoiceId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <div className="inv-page-header">
        <h2 className="inv-page-title">Invoices</h2>
        <div className="inv-stats">
          <div className="inv-stat"><span className="inv-stat-val">{invoices.length}</span><span className="inv-stat-label">shown</span></div>
          <div className="inv-stat"><span className="inv-stat-val">{pendingCount}</span><span className="inv-stat-label">pending</span></div>
          <div className="inv-stat"><span className="inv-stat-val">{paidCount}</span><span className="inv-stat-label">paid</span></div>
          <div className="inv-stat inv-stat--total"><span className="inv-stat-val">£{totalRevenue.toFixed(2)}</span><span className="inv-stat-label">total</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="inv-filters">
        <form onSubmit={handleSearchSubmit} className="inv-search-form">
          <input
            className="inv-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search reference, customer, registration…"
          />
          <button type="submit">Search</button>
          {search && (
            <button type="button" className="secondary" onClick={() => { setSearch(''); setSearchInput(''); }}>
              Clear
            </button>
          )}
        </form>

        <div className="inv-filter-row">
          <label className="inv-filter-label">Status</label>
          <select className="inv-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="approved">Customer accepted</option>
            <option value="invoiced">Paid</option>
          </select>

          <label className="inv-filter-label">From</label>
          <input type="date" className="inv-filter-date" value={from} onChange={(e) => setFrom(e.target.value)} />

          <label className="inv-filter-label">To</label>
          <input type="date" className="inv-filter-date" value={to} onChange={(e) => setTo(e.target.value)} />

          {(statusFilter || from || to) && (
            <button type="button" className="secondary" style={{ fontSize: '0.8rem' }}
              onClick={() => { setStatusFilter(''); setFrom(''); setTo(''); }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p style={{ padding: '24px 0', color: '#9ca3af' }}>Loading…</p>
      ) : invoices.length === 0 ? (
        <p style={{ padding: '24px 0', color: '#9ca3af' }}>No invoices found.</p>
      ) : (
        <div className="inv-list">
          <div className="inv-list-header">
            <span>Reference</span>
            <span>Customer</span>
            <span>Vehicle</span>
            <span>Date</span>
            <span className="right">Total</span>
            <span>Status</span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="inv-row"
              onClick={() => setSelectedId(inv.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(inv.id); } }}
            >
              <span className="inv-row-ref">{inv.reference}{inv.title ? ` · ${inv.title}` : ''}</span>
              <span className="inv-row-customer">{inv.customer ? (inv.customer.name || inv.customer.email) : <span style={{ color: '#9ca3af' }}>—</span>}</span>
              <span className="inv-row-vehicle">{inv.registration || <span style={{ color: '#9ca3af' }}>—</span>}{inv.vehicle ? <span className="inv-row-vehicle-desc"> · {inv.vehicle}</span> : ''}</span>
              <span className="inv-row-date">{fmtDate(inv.updatedAt)}</span>
              <span className="inv-row-total right">£{inv.totals?.total?.toFixed(2) ?? '—'}</span>
              <span><span className={`qlr-status ${inv.status}`}>{STATUS_LABELS[inv.status] || inv.status}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
