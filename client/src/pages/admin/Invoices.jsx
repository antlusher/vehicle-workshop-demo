import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as quotesApi from '../../services/quotesApi';

const STATUS_LABELS = { approved: 'Customer accepted', invoiced: 'Paid' };
const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };

function fmt(v) { return v == null ? '—' : `£${parseFloat(v).toFixed(2)}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

// ── Row action menu ───────────────────────────────────────────────────────────

function ActionMenu({ invoice, token, onView, onUpdated, onDuplicated }) {
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState('');
  const [flash, setFlash]   = useState('');
  const menuRef             = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
      setOpen(false);
    }
  };

  const handleSendEmail = () => run('email', async () => {
    const result = await quotesApi.sendInvoiceEmail(invoice.id, token);
    setFlash(`Sent to ${result.sentTo}`);
    onUpdated({ ...invoice, invoiceSentAt: new Date().toISOString() });
    setTimeout(() => setFlash(''), 3000);
  });

  const handleMarkSent = () => run('sent', async () => {
    const result = await quotesApi.markInvoiceSent(invoice.id, token);
    onUpdated({ ...invoice, invoiceSentAt: result.invoiceSentAt });
  });

  const handleDuplicate = () => run('dup', async () => {
    const newQuote = await quotesApi.duplicateQuote(invoice.id, token);
    onDuplicated(newQuote);
  });

  const handleDownload = () => run('pdf', () =>
    quotesApi.downloadInvoicePdf(invoice.id, token, `invoice-${invoice.reference}.pdf`)
  );

  return (
    <div className="inv-action-menu" ref={menuRef}>
      {flash && <span className="inv-action-flash">{flash}</span>}
      <button
        type="button"
        className="inv-action-trigger secondary"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={!!busy}
      >
        {busy ? '…' : '⋯'}
      </button>
      {open && (
        <div className="inv-action-dropdown" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="inv-action-item" onClick={() => { setOpen(false); onView(); }}>
            View invoice
          </button>
          <button
            type="button"
            className="inv-action-item"
            onClick={handleSendEmail}
            disabled={!invoice.customer?.email}
            title={!invoice.customer?.email ? 'No customer email on this invoice' : ''}
          >
            Send by email
          </button>
          <button type="button" className="inv-action-item" onClick={handleMarkSent} disabled={!!invoice.invoiceSentAt}>
            {invoice.invoiceSentAt ? `Marked sent ${fmtDate(invoice.invoiceSentAt)}` : 'Mark as sent'}
          </button>
          <div className="inv-action-divider" />
          <button type="button" className="inv-action-item" onClick={handleDuplicate}>
            Duplicate
          </button>
          <button type="button" className="inv-action-item" onClick={handleDownload}>
            Download PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ── Invoice view modal ────────────────────────────────────────────────────────

function InvoiceModal({ invoiceId, token, onClose, onStatusChange }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy]         = useState(false);
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

// ── Create invoice modal ──────────────────────────────────────────────────────

function CreateInvoiceModal({ token, onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [registration, setRegistration] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ description: '', qty: '1', unitPrice: '', type: 'labour' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    quotesApi.getProjectCustomers('_', token).catch(() => []).then(() => {});
    // Use the project-customers endpoint with a workaround — fetch all customers via settings context
    fetch('/api/admin/customers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCustomers(Array.isArray(data) ? data : (data.customers || [])))
      .catch(() => {});
  }, [token]);

  const setLine = (i, field, val) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const addLine = () => setLines((prev) => [...prev, { description: '', qty: '1', unitPrice: '', type: 'other' }]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validLines = lines.filter((l) => l.description.trim() && parseFloat(l.unitPrice) > 0);
    if (!validLines.length) { setError('Add at least one line item with a price.'); return; }
    setSaving(true);
    try {
      const invoice = await quotesApi.createInvoice({
        customer_id: customerId || null,
        registration: registration.trim().toUpperCase() || null,
        title: title.trim() || null,
        notes: notes.trim() || null,
        lines: validLines.map((l) => ({ ...l, qty: parseFloat(l.qty) || 1, unitPrice: parseFloat(l.unitPrice) })),
      }, token);
      onCreated(invoice);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>New invoice</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Customer
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ fontSize: '0.85rem' }}>
                  <option value="">— none —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Registration
                <input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="e.g. AB12 CDE" style={{ textTransform: 'uppercase' }} />
              </label>
            </div>

            <label style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Title <span style={{ fontWeight: 400 }}>(optional)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual service, Brake replacement…" />
            </label>

            <div>
              <div style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600, marginBottom: 8 }}>Line items</div>
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <select value={line.type} onChange={(e) => setLine(i, 'type', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 6px' }}>
                    <option value="labour">Labour</option>
                    <option value="part">Part</option>
                    <option value="other">Other</option>
                  </select>
                  <input placeholder="Description" value={line.description} onChange={(e) => setLine(i, 'description', e.target.value)} style={{ fontSize: '0.83rem' }} required />
                  <input type="number" min="0.5" step="0.5" placeholder="Qty" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} style={{ fontSize: '0.83rem' }} />
                  <input type="number" min="0" step="0.01" placeholder="Price £" value={line.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} style={{ fontSize: '0.83rem' }} />
                  <button type="button" className="secondary danger" style={{ padding: '4px 6px', fontSize: '0.8rem' }} onClick={() => removeLine(i)} disabled={lines.length === 1}>✕</button>
                </div>
              ))}
              <button type="button" className="secondary" style={{ fontSize: '0.78rem', marginTop: 4 }} onClick={addLine}>+ Add line</button>
            </div>

            <label style={{ fontSize: '0.82rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Notes <span style={{ fontWeight: 400 }}>(optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Payment terms, additional info…" style={{ resize: 'vertical' }} />
            </label>

            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create invoice'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main Invoices page ────────────────────────────────────────────────────────

export default function Invoices({ token }) {
  const [invoices, setInvoices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [dupFlash, setDupFlash]     = useState('');

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

  const handleUpdated = (updated) => {
    setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? { ...inv, ...updated } : inv));
  };

  const handleStatusChange = (updated) => {
    setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? { ...inv, status: updated.status } : inv));
  };

  const handleDuplicated = (newQuote) => {
    setDupFlash(`Duplicated as ${newQuote.reference} (draft)`);
    setTimeout(() => setDupFlash(''), 4000);
  };

  const handleCreated = (invoice) => {
    setShowCreate(false);
    setInvoices((prev) => [invoice, ...prev]);
    setSelectedId(invoice.id);
  };

  const totalRevenue = invoices.reduce((s, inv) => s + (inv.totals?.total || 0), 0);
  const paidCount    = invoices.filter((inv) => inv.status === 'invoiced').length;
  const pendingCount = invoices.filter((inv) => inv.status === 'approved').length;

  return (
    <div className="inv-page">
      {showCreate && (
        <CreateInvoiceModal token={token} onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {selectedId && (
        <InvoiceModal
          invoiceId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <div className="inv-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 className="inv-page-title">Invoices</h2>
          <button type="button" onClick={() => setShowCreate(true)}>+ New invoice</button>
        </div>
        <div className="inv-stats">
          <div className="inv-stat"><span className="inv-stat-val">{invoices.length}</span><span className="inv-stat-label">shown</span></div>
          <div className="inv-stat"><span className="inv-stat-val">{pendingCount}</span><span className="inv-stat-label">pending</span></div>
          <div className="inv-stat"><span className="inv-stat-val">{paidCount}</span><span className="inv-stat-label">paid</span></div>
          <div className="inv-stat inv-stat--total"><span className="inv-stat-val">£{totalRevenue.toFixed(2)}</span><span className="inv-stat-label">total</span></div>
        </div>
      </div>

      {dupFlash && (
        <div className="inv-dup-flash">{dupFlash}</div>
      )}

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
            <span style={{ textAlign: 'right' }}>Total</span>
            <span>Status</span>
            <span></span>
          </div>
          {invoices.map((inv) => (
            <div key={inv.id} className="inv-row" onClick={() => setSelectedId(inv.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(inv.id); } }}
            >
              <span className="inv-row-ref">
                {inv.reference}{inv.title ? ` · ${inv.title}` : ''}
                {inv.invoiceSentAt && <span className="inv-sent-dot" title={`Sent ${fmtDate(inv.invoiceSentAt)}`}>✉</span>}
              </span>
              <span className="inv-row-customer">
                {inv.customer ? (inv.customer.name || inv.customer.email) : <span style={{ color: '#9ca3af' }}>—</span>}
              </span>
              <span className="inv-row-vehicle">
                {inv.registration || <span style={{ color: '#9ca3af' }}>—</span>}
                {inv.vehicle ? <span className="inv-row-vehicle-desc"> · {inv.vehicle}</span> : ''}
              </span>
              <span className="inv-row-date">{fmtDate(inv.updatedAt)}</span>
              <span className="inv-row-total">£{inv.totals?.total?.toFixed(2) ?? '—'}</span>
              <span><span className={`qlr-status ${inv.status}`}>{STATUS_LABELS[inv.status] || inv.status}</span></span>
              <span onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  invoice={inv}
                  token={token}
                  onView={() => setSelectedId(inv.id)}
                  onUpdated={handleUpdated}
                  onDuplicated={handleDuplicated}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
