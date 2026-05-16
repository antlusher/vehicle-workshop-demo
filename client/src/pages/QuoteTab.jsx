import { useState, useEffect, useCallback, useRef } from 'react';
import * as quotesApi from '../services/quotesApi';

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', approved: 'Customer accepted', invoiced: 'Invoiced' };
const TYPE_LABELS   = { part: 'Part', labour: 'Labour', other: 'Other' };

// ── Preview modal ─────────────────────────────────────────────────────────────

function QuotePreviewModal({ quote, onClose }) {
  const renderLines = (lines) => lines.map((l) => (
    <div key={l.id} className="cp-quote-line">
      <span className="cp-quote-line-desc">{l.description}</span>
      <span className="cp-quote-line-qty">×{l.qty}</span>
      <span className="cp-quote-line-total">£{l.lineTotal.toFixed(2)}</span>
    </div>
  ));

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Customer view — quote preview</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body cp-detail">
          <div className="cp-report-section cp-quote-section">
            <h3 className="cp-section-title">Your estimate</h3>
            {quote.diagnosticSummary && (
              <p className="cp-section-text" style={{ marginBottom: 12 }}>{quote.diagnosticSummary}</p>
            )}

            {quote.items.map((item) => (
              <div key={item.id} className="cp-quote-item-group">
                <div className="cp-quote-item-title">{item.title}</div>
                {item.description && <p className="cp-quote-item-desc">{item.description}</p>}
                {item.lines.length > 0 && renderLines(item.lines)}
                <div className="cp-quote-item-subtotal">Item total: £{item.subtotal.toFixed(2)}</div>
              </div>
            ))}

            {quote.ungroupedLines.length > 0 && (
              <div className="cp-quote-item-group">
                {renderLines(quote.ungroupedLines)}
              </div>
            )}

            {quote.items.length === 0 && quote.ungroupedLines.length === 0 && (
              <p style={{ color: '#9ca3af', padding: '12px 0' }}>No line items yet.</p>
            )}

            <div className="cp-quote-totals">
              <div className="cp-cost-row"><span>Subtotal</span><span>£{quote.totals.subtotal.toFixed(2)}</span></div>
              <div className="cp-cost-row"><span>VAT ({quote.totals.vatRate}%)</span><span>£{quote.totals.vat.toFixed(2)}</span></div>
              <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>£{quote.totals.total.toFixed(2)}</span></div>
            </div>

            {quote.notes && <p className="cp-quote-notes">{quote.notes}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Parts search ──────────────────────────────────────────────────────────────

function PartsSearch({ project, token, onAdd, defaultMarkupPct }) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    try {
      const res = await quotesApi.searchParts(
        q,
        { make: project.make, model: project.model, engineCode: project.engineCode },
        token
      );
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (part) => {
    onAdd({
      type: 'part',
      description: `${part.brand} ${part.title}${part.partNumber ? ` (${part.partNumber})` : ''}`,
      qty: 1,
      unitCost: part.costPrice,
      markupPct: defaultMarkupPct,
      partId: part.id,
      partNumber: part.partNumber,
    });
    setResults([]);
    setQ('');
    setSearched(false);
  };

  return (
    <div className="parts-search">
      <form onSubmit={search} className="parts-search-form">
        <input
          className="parts-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parts catalogue (e.g. oil filter, brake pads…)"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {searched && results.length === 0 && !loading && (
        <p className="parts-empty">No parts found.</p>
      )}
      {results.length > 0 && (
        <div className="parts-results">
          {results.map((part) => (
            <div key={part.id} className="part-result-row">
              <div className="part-result-info">
                <span className="part-brand">{part.brand}</span>
                <span className="part-title">{part.title}</span>
                {part.partNumber && <span className="part-number">{part.partNumber}</span>}
                <span className="part-category">{part.category}</span>
              </div>
              <div className="part-result-price">
                <span className="part-cost">Cost £{part.costPrice.toFixed(2)}</span>
                <span className="part-sell">Sell £{(part.costPrice * (1 + defaultMarkupPct / 100)).toFixed(2)}</span>
                <button type="button" className="part-add-btn" onClick={() => handleAdd(part)}>+ Add</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manual part entry ────────────────────────────────────────────────────────

function AddCustomPartForm({ onAdd, defaultMarkupPct }) {
  const [open, setOpen]     = useState(false);
  const [desc, setDesc]     = useState('');
  const [qty, setQty]       = useState('1');
  const [cost, setCost]     = useState('');
  const [markup, setMarkup] = useState(String(defaultMarkupPct));

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      type: 'part',
      description: desc,
      qty: parseFloat(qty),
      unitCost: parseFloat(cost),
      markupPct: parseFloat(markup),
    });
    setDesc(''); setQty('1'); setCost(''); setMarkup(String(defaultMarkupPct));
    setOpen(false);
  };

  if (!open) return (
    <button type="button" className="secondary" style={{ fontSize: '0.8rem', marginTop: 6 }} onClick={() => setOpen(true)}>
      + Add part manually
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="add-labour-form" style={{ marginTop: 8 }}>
      <input
        placeholder="Part description e.g. Exhaust mid section, Cabin filter"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        required
      />
      <div className="add-labour-row">
        <label>Qty<input type="number" step="1" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>Cost (£)<input type="number" step="0.01" min="0" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} required /></label>
        <label>Markup %<input type="number" step="1" value={markup} onChange={(e) => setMarkup(e.target.value)} /></label>
      </div>
      <div className="add-labour-actions">
        <button type="submit">Add part</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// ── Labour entry ─────────────────────────────────────────────────────────────

function AddLabourForm({ onAdd, settings }) {
  const [open, setOpen]   = useState(false);
  const [desc, setDesc]   = useState('');
  const [hours, setHours] = useState('1');
  const [rate, setRate]   = useState(settings.labourRatePerHour.toFixed(2));
  const [markup, setMarkup] = useState('0');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      type: 'labour',
      description: desc,
      qty: parseFloat(hours),
      unitCost: parseFloat(rate),
      markupPct: parseFloat(markup),
    });
    setDesc(''); setHours('1'); setOpen(false);
  };

  if (!open) return (
    <button type="button" className="secondary" style={{ fontSize: '0.8rem', marginTop: 6 }} onClick={() => setOpen(true)}>
      + Add labour
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="add-labour-form" style={{ marginTop: 8 }}>
      <input
        placeholder="Labour e.g. Exhaust fitting, Diagnostic"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        required
      />
      <div className="add-labour-row">
        <label>Hours<input type="number" step="0.5" min="0.5" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        <label>Rate (£/hr)<input type="number" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <label>Markup %<input type="number" step="1" value={markup} onChange={(e) => setMarkup(e.target.value)} /></label>
      </div>
      <div className="add-labour-actions">
        <button type="submit">Add labour</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// ── Line items table ─────────────────────────────────────────────────────────

function LineTable({ lines, quoteId, token, onUpdated }) {
  const [editing, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});

  const handleDelete = async (lineId) => {
    const updated = await quotesApi.deleteLine(quoteId, lineId, token);
    onUpdated(updated);
  };

  const startEdit = (line) => {
    setEditing(line.id);
    setEditVals({ qty: line.qty, unitCost: line.unitCost, markupPct: line.markupPct });
  };

  const saveEdit = async (lineId) => {
    const updated = await quotesApi.updateLine(quoteId, lineId, {
      qty: parseFloat(editVals.qty),
      unitCost: parseFloat(editVals.unitCost),
      markupPct: parseFloat(editVals.markupPct),
    }, token);
    setEditing(null);
    onUpdated(updated);
  };

  if (!lines.length) return <p className="parts-empty" style={{ margin: '6px 0' }}>No lines yet.</p>;

  return (
    <div className="quote-lines">
      <table className="quote-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th className="num">Qty</th>
            <th className="num">Unit cost</th>
            <th className="num">Markup</th>
            <th className="num">Unit price</th>
            <th className="num">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.description}</td>
              <td><span className="line-type-badge">{TYPE_LABELS[line.type] || line.type}</span></td>
              {editing === line.id ? (
                <>
                  <td><input className="line-edit-input" type="number" step="0.5" value={editVals.qty} onChange={(e) => setEditVals(v => ({ ...v, qty: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveEdit(line.id)} /></td>
                  <td><input className="line-edit-input" type="number" step="0.01" value={editVals.unitCost} onChange={(e) => setEditVals(v => ({ ...v, unitCost: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveEdit(line.id)} /></td>
                  <td><input className="line-edit-input" type="number" step="1" value={editVals.markupPct} onChange={(e) => setEditVals(v => ({ ...v, markupPct: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveEdit(line.id)} /></td>
                  <td className="num">£{(parseFloat(editVals.unitCost || 0) * (1 + parseFloat(editVals.markupPct || 0) / 100)).toFixed(2)}</td>
                  <td className="num">£{(parseFloat(editVals.unitCost || 0) * (1 + parseFloat(editVals.markupPct || 0) / 100) * parseFloat(editVals.qty || 1)).toFixed(2)}</td>
                  <td className="line-actions">
                    <button type="button" onClick={() => saveEdit(line.id)}>Save</button>
                    <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="num">{line.qty}</td>
                  <td className="num">£{line.unitCost.toFixed(2)}</td>
                  <td className="num">{line.markupPct}%</td>
                  <td className="num">£{line.unitPrice.toFixed(2)}</td>
                  <td className="num">£{line.lineTotal.toFixed(2)}</td>
                  <td className="line-actions">
                    <button type="button" className="secondary" onClick={() => startEdit(line)}>Edit</button>
                    <button type="button" className="secondary danger" onClick={() => handleDelete(line.id)}>✕</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Quote item card ───────────────────────────────────────────────────────────

function QuoteItemCard({ item, quote, project, settings, token, onUpdated }) {
  const [expanded, setExpanded] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);
  const [title, setTitle]       = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes]       = useState(item.notes);
  const [saving, setSaving]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description);
    setNotes(item.notes);
  }, [item.id]);

  useEffect(() => {
    if (editingMeta && titleRef.current) titleRef.current.focus();
  }, [editingMeta]);

  const saveMeta = async () => {
    setSaving(true);
    try {
      const updated = await quotesApi.updateItem(quote.id, item.id, { title, description, notes }, token);
      onUpdated(updated);
      setEditingMeta(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddLine = async (lineData) => {
    const updated = await quotesApi.addLine(quote.id, { ...lineData, quote_item_id: item.id }, token);
    onUpdated(updated);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    const updated = await quotesApi.deleteItem(quote.id, item.id, token);
    onUpdated(updated);
  };

  return (
    <div className={`quote-item-card${expanded ? ' expanded' : ''}`}>
      <div className="quote-item-header" onClick={() => !editingMeta && setExpanded((v) => !v)}>
        <span className="quote-item-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="quote-item-title-text">{item.title}</span>
        <span className="quote-item-subtotal">£{item.subtotal.toFixed(2)}</span>
        <div className="quote-item-header-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            onClick={() => { setEditingMeta((v) => !v); setConfirmDelete(false); }}
          >
            {editingMeta ? 'Cancel' : 'Edit'}
          </button>
          <button
            type="button"
            className={`secondary danger`}
            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            onClick={handleDelete}
          >
            {confirmDelete ? 'Confirm delete' : '✕'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="quote-item-body">
          {editingMeta ? (
            <div className="quote-item-meta-form">
              <input
                ref={titleRef}
                className="quote-item-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Item title e.g. Full Service, Exhaust Replacement"
              />
              <textarea
                className="quote-item-desc-input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description for customer (optional)…"
              />
              <textarea
                className="quote-item-notes-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes (optional)…"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={saveMeta} disabled={saving || !title.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="secondary" onClick={() => setEditingMeta(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {item.description && <p className="quote-item-desc-display">{item.description}</p>}
              {item.notes && <p className="quote-item-notes-display">Note: {item.notes}</p>}
            </>
          )}

          <LineTable lines={item.lines} quoteId={quote.id} token={token} onUpdated={onUpdated} />

          <div className="quote-item-add-row">
            <PartsSearch
              project={project}
              token={token}
              onAdd={handleAddLine}
              defaultMarkupPct={settings.defaultMarkupPct}
            />
            <AddCustomPartForm onAdd={handleAddLine} defaultMarkupPct={settings.defaultMarkupPct} />
            <AddLabourForm onAdd={handleAddLine} settings={settings} />
          </div>

          <div className="quote-item-subtotal-row">
            <span>Item subtotal</span>
            <span>£{item.subtotal.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add item form ─────────────────────────────────────────────────────────────

function AddItemForm({ quoteId, token, onUpdated }) {
  const [open, setOpen]   = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const updated = await quotesApi.createItem(quoteId, { title: title.trim() }, token);
      onUpdated(updated);
      setTitle('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return (
    <button type="button" className="quote-add-item-btn" onClick={() => setOpen(true)}>
      + Add item
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="add-item-form">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item name e.g. Full Service, Exhaust Replacement, Brake Pads"
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        required
      />
      <div className="add-item-form-actions">
        <button type="submit" disabled={saving || !title.trim()}>{saving ? 'Adding…' : 'Add'}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// ── Main QuoteTab ─────────────────────────────────────────────────────────────

// ── Customer picker ───────────────────────────────────────────────────────────

function CustomerPicker({ quote, project, token, onUpdated }) {
  const [customers, setCustomers] = useState(null);
  const [open, setOpen]           = useState(false);
  const [saving, setSaving]       = useState(false);

  const loadCustomers = async () => {
    if (customers) { setOpen(true); return; }
    const list = await quotesApi.getProjectCustomers(project.id, token);
    setCustomers(list);
    setOpen(true);
  };

  const assign = async (customerId) => {
    setSaving(true);
    try {
      const updated = await quotesApi.updateQuote(quote.id, { customer_id: customerId }, token);
      onUpdated(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customer_id: null }),
      });
      onUpdated({ ...quote, customer: null });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quote-customer-row">
      <span className="quote-customer-label">Customer</span>
      {quote.customer ? (
        <span className="quote-customer-value">
          <span className="quote-customer-name">{quote.customer.name || quote.customer.email}</span>
          <span className="quote-customer-email">{quote.customer.name ? `· ${quote.customer.email}` : ''}</span>
          <button type="button" className="secondary" style={{ fontSize: '0.72rem', padding: '1px 8px' }} onClick={loadCustomers}>Change</button>
        </span>
      ) : (
        <button type="button" className="secondary" style={{ fontSize: '0.78rem' }} onClick={loadCustomers}>
          + Attach customer
        </button>
      )}

      {open && (
        <div className="customer-picker-dropdown">
          {!customers ? (
            <p style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.85rem' }}>Loading…</p>
          ) : customers.length === 0 ? (
            <p style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.85rem' }}>
              No customers linked to this vehicle. Add a customer in Admin → Customers first.
            </p>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                className="customer-picker-option"
                disabled={saving}
                onClick={() => assign(c.id)}
              >
                <span className="cpo-name">{c.name || c.email}</span>
                {c.name && <span className="cpo-email">{c.email}</span>}
              </button>
            ))
          )}
          {quote.customer && (
            <button type="button" className="customer-picker-option customer-picker-remove" onClick={remove} disabled={saving}>
              Remove customer
            </button>
          )}
          <button type="button" className="customer-picker-cancel" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Send modal ────────────────────────────────────────────────────────────────

function SendModal({ quote, onClose, onSent }) {
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  const confirm = async () => {
    setSending(true);
    setError('');
    try {
      const updated = await onSent();
      if (updated) onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Send quote to customer</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ margin: '0 0 16px', fontSize: '0.9rem' }}>
            An email will be sent to <strong>{quote.customer?.email}</strong> with a link to view the estimate in their portal.
          </p>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#6b7280' }}>Reference</span>
              <strong>{quote.reference}{quote.title ? ` · ${quote.title}` : ''}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>Total (inc. VAT)</span>
              <strong>£{quote.totals.total.toFixed(2)}</strong>
            </div>
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={confirm} disabled={sending}>
              {sending ? 'Sending…' : 'Send email'}
            </button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit quote modal (title + overview + notes) ───────────────────────────────

function EditQuoteModal({ quote, token, onUpdated, onClose }) {
  const [title, setTitle]   = useState(quote.title || '');
  const [summary, setSummary] = useState(quote.diagnosticSummary || '');
  const [notes, setNotes]   = useState(quote.notes || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await quotesApi.updateQuote(quote.id, {
        title: title.trim() || null,
        diagnostic_summary: summary,
        notes,
      }, token);
      onUpdated(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Edit quote — {quote.reference}</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Title
              <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual service, Exhaust repair…"
                style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Customer-facing overview
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
                placeholder="Summary of work for the customer…"
                style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box', resize: 'vertical' }} />
            </label>
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Payment terms, lead times, conditions…"
                style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Quote detail panel ────────────────────────────────────────────────────────

function QuoteDetail({ quote, project, settings, token, onUpdated, onDeleted }) {
  const [showSend, setShowSend]       = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isReadOnly = quote.status === 'invoiced';

  const handleStatusChange = async (status) => {
    const updated = await quotesApi.updateQuote(quote.id, { status }, token);
    onUpdated(updated);
  };

  const handleSend = async () => {
    const updated = await quotesApi.sendQuote(quote.id, token);
    onUpdated(updated);
    setShowSend(false);
  };

  return (
    <div className="quote-detail">
      {showPreview && <QuotePreviewModal quote={quote} onClose={() => setShowPreview(false)} />}
      {showSend && <SendModal quote={quote} onClose={() => setShowSend(false)} onSent={handleSend} />}

      {/* Detail header */}
      <div className="qd-header">
        <div className="qd-header-left">
          <span className="qa-ref">{quote.reference}</span>
          {quote.title && <span className="qd-title">{quote.title}</span>}
          <span className={`qa-status ${quote.status}`}>{STATUS_LABELS[quote.status] || quote.status}</span>
          {quote.sentAt && (
            <span className="qa-sent-label">
              · sent {new Date(quote.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
        <CustomerPicker quote={quote} project={project} token={token} onUpdated={onUpdated} />
      </div>

      {/* Overview + notes (read display) */}
      {(quote.diagnosticSummary || quote.notes) && (
        <div className="qd-overview">
          {quote.diagnosticSummary && <p className="qd-summary">{quote.diagnosticSummary}</p>}
          {quote.notes && <p className="qd-notes">Note: {quote.notes}</p>}
        </div>
      )}

      {/* Items */}
      <div className="quote-items-section">
        {quote.items.map((item) => (
          <QuoteItemCard
            key={item.id}
            item={item}
            quote={quote}
            project={project}
            settings={settings}
            token={token}
            onUpdated={onUpdated}
          />
        ))}

        {quote.ungroupedLines.length > 0 && (
          <div className="quote-item-card expanded">
            <div className="quote-item-header">
              <span className="quote-item-title-text">General</span>
              <span className="quote-item-subtotal">
                £{quote.ungroupedLines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2)}
              </span>
            </div>
            <div className="quote-item-body">
              <LineTable lines={quote.ungroupedLines} quoteId={quote.id} token={token} onUpdated={onUpdated} />
            </div>
          </div>
        )}

        {!isReadOnly && <AddItemForm quoteId={quote.id} token={token} onUpdated={onUpdated} />}
      </div>

      {/* Totals */}
      <div className="quote-totals">
        <div className="quote-total-row"><span>Subtotal</span><span>£{quote.totals.subtotal.toFixed(2)}</span></div>
        <div className="quote-total-row"><span>VAT ({quote.totals.vatRate}%)</span><span>£{quote.totals.vat.toFixed(2)}</span></div>
        <div className="quote-total-row total"><span>Total</span><span>£{quote.totals.total.toFixed(2)}</span></div>
      </div>

      {/* Status actions */}
      <div className="qd-status-actions">
        {quote.status === 'draft' && (
          <button
            type="button"
            title={!quote.customer ? 'Attach a customer to the project first (top of the job panel)' : ''}
            style={!quote.customer ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            onClick={() => {
              if (!quote.customer) return;
              setShowSend(true);
            }}
          >
            {quote.customer
              ? `Send to ${quote.customer.name || quote.customer.email}`
              : 'Send to customer — attach customer first'}
          </button>
        )}
        {quote.status === 'sent' && (
          <>
            <button type="button" onClick={() => handleStatusChange('approved')}>Customer accepted</button>
            <button type="button" className="secondary" onClick={() => handleStatusChange('draft')}>Back to draft</button>
          </>
        )}
        {quote.status === 'approved' && (
          <>
            <button type="button" className="secondary" onClick={() => handleStatusChange('invoiced')}>Mark invoiced</button>
            <button type="button" className="secondary" onClick={() => handleStatusChange('sent')}>Unaccept</button>
          </>
        )}
        <button type="button" className="secondary" onClick={() => setShowPreview(true)}>Preview</button>
      </div>
    </div>
  );
}

// ── Selectable quote list row ─────────────────────────────────────────────────

function QuoteListRow({ quote, checked, selected, onToggle, onSelect }) {
  return (
    <div className={`quote-list-row status-${quote.status}${checked ? ' checked' : ''}${selected ? ' selected' : ''}`}>
      {/* Checkbox — multi-select only, does NOT open detail */}
      <input
        type="checkbox"
        className="qlr-checkbox"
        checked={checked}
        onChange={onToggle}
      />
      {/* Row body — opens detail panel, does NOT affect checkboxes */}
      <div
        className="qlr-body"
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      >
        <span className="qlr-ref">{quote.reference}</span>
        {quote.title && <span className="qlr-title">{quote.title}</span>}
        {quote.customer && (
          <span className="qlr-customer">{quote.customer.name || quote.customer.email}</span>
        )}
        <span className="qlr-spacer" />
        <span className="qlr-total">£{quote.totals.total.toFixed(2)}</span>
        <span className={`qlr-status ${quote.status}`}>{STATUS_LABELS[quote.status] || quote.status}</span>
      </div>
    </div>
  );
}

// ── Add quote modal ───────────────────────────────────────────────────────────

function AddQuoteModal({ projectId, customerId, token, onCreated, onClose }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const q = await quotesApi.createQuote({ project_id: projectId, title: title.trim() || null, customer_id: customerId || null }, token);
      onCreated(q);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>New quote</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Title <span style={{ fontWeight: 400 }}>(optional)</span>
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual service, Exhaust repair…"
                onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
                style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Add quote'}</button>
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main QuoteTab ─────────────────────────────────────────────────────────────

export default function QuoteTab({ project, token }) {
  const [quotes, setQuotes]         = useState([]);
  const [settings, setSettings]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);   // detail panel
  const [checkedIds, setCheckedIds] = useState(new Set()); // bulk ops
  const [showAdd, setShowAdd]       = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [showSend, setShowSend]     = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [bulkBusy, setBulkBusy]     = useState(false);

  const load = useCallback(async () => {
    const [qs, s] = await Promise.all([
      quotesApi.getQuotes(project.id, token),
      quotesApi.getSettings(token),
    ]);
    setSettings(s);
    setQuotes(qs);
    setLoading(false);
  }, [project.id, token]);

  useEffect(() => { load(); }, [load]);

  const selected    = quotes.find((q) => q.id === selectedId) || null;
  const checkedList = quotes.filter((q) => checkedIds.has(q.id));
  const allChecked  = quotes.length > 0 && quotes.every((q) => checkedIds.has(q.id));

  const toggleCheck = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedIds(allChecked ? new Set() : new Set(quotes.map((q) => q.id)));
  };

  const handleUpdated = (updated) => {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
  };

  const handleDeleted = (id) => {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (selectedId === id) setSelectedId(null);
  };

  const handleCreated = (q) => {
    setQuotes((prev) => [...prev, q]);
    setSelectedId(q.id);
  };

  const handleDelete = async () => {
    const targets = checkedList.length > 0 ? checkedList : selected ? [selected] : [];
    if (!targets.length) return;
    const noun = targets.length === 1 ? 'this quote' : `${targets.length} quotes`;
    if (!window.confirm(`Delete ${noun} and all their items?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(targets.map((q) => quotesApi.deleteQuote(q.id, token)));
      targets.forEach((q) => handleDeleted(q.id));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSend = async () => {
    const updated = await quotesApi.sendQuote(selected.id, token);
    handleUpdated(updated);
    setShowSend(false);
  };

  const bulkSetStatus = async (status) => {
    setBulkBusy(true);
    try {
      const results = await Promise.all(checkedList.map((q) => quotesApi.updateQuote(q.id, { status }, token)));
      results.forEach(handleUpdated);
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <p className="specs-loading">Loading quotes…</p>;

  const hasChecked        = checkedList.length > 0;
  const deletable         = hasChecked
    ? checkedList.every((q) => q.status !== 'invoiced')
    : selected?.status !== 'invoiced';
  const canSend           = selected?.status === 'draft';
  const canBulkMarkSent   = hasChecked && checkedList.every((q) => q.status === 'draft');
  const canBulkAccept     = hasChecked && checkedList.every((q) => q.status === 'sent');
  const canBulkUnaccept   = hasChecked && checkedList.every((q) => q.status === 'approved');

  return (
    <div className="quote-tab">
      {showAdd && (
        <AddQuoteModal projectId={project.id} customerId={project.customerId} token={token} onCreated={handleCreated} onClose={() => setShowAdd(false)} />
      )}
      {showEdit && selected && (
        <EditQuoteModal quote={selected} token={token} onUpdated={handleUpdated} onClose={() => setShowEdit(false)} />
      )}
      {showSend && selected && (
        <SendModal quote={selected} onClose={() => setShowSend(false)} onSent={handleSend} />
      )}
      {showPreview && selected && (
        <QuotePreviewModal quote={selected} onClose={() => setShowPreview(false)} />
      )}

      {/* ── Toolbar ── */}
      <div className="quote-toolbar">
        <button type="button" onClick={() => setShowAdd(true)}>+ Add quote</button>

        {/* Single-quote actions — always present, driven by selectedId */}
        {!hasChecked && <>
          <button type="button" className="secondary" disabled={!selected} onClick={() => setShowEdit(true)}>Edit</button>
          <button type="button" className="secondary" disabled={!selected || !deletable} onClick={handleDelete}>Delete</button>
          <span className="quote-toolbar-sep" />
          <button
            type="button" className="secondary" disabled={!canSend}
            onClick={() => {
              if (!selected.customer) { alert('Attach a customer before sending.'); return; }
              setShowSend(true);
            }}
          >Send</button>
          <button type="button" className="secondary" disabled={!selected} onClick={() => setShowPreview(true)}>Preview</button>
        </>}

        {/* Bulk actions — shown when any checkboxes are ticked */}
        {hasChecked && <>
          <span className="quote-toolbar-count">{checkedList.length} checked</span>
          <span className="quote-toolbar-sep" />
          <button type="button" className="secondary" disabled={!deletable || bulkBusy} onClick={handleDelete}>Delete</button>
          <button type="button" className="secondary" disabled={!canBulkMarkSent || bulkBusy} onClick={() => bulkSetStatus('sent')}>Mark sent</button>
          <button type="button" className="secondary" disabled={!canBulkAccept || bulkBusy} onClick={() => bulkSetStatus('approved')}>Customer accepted</button>
          <button type="button" className="secondary" disabled={!canBulkUnaccept || bulkBusy} onClick={() => bulkSetStatus('sent')}>Unaccept</button>
          <button type="button" className="secondary" onClick={() => setCheckedIds(new Set())}>Clear</button>
        </>}
      </div>

      {/* ── Quote list ── */}
      <div className="quote-list-panel">
        {quotes.length === 0 ? (
          <p className="quote-empty-hint">No quotes yet — click &ldquo;+ Add quote&rdquo; to create one.</p>
        ) : (
          <>
            <div className="quote-select-all-row">
              <input type="checkbox" id="ql-select-all" checked={allChecked} onChange={toggleAll} />
              <label htmlFor="ql-select-all">Select all</label>
            </div>
            {quotes.map((q) => (
              <QuoteListRow
                key={q.id}
                quote={q}
                checked={checkedIds.has(q.id)}
                selected={q.id === selectedId}
                onToggle={() => toggleCheck(q.id)}
                onSelect={() => setSelectedId((prev) => (prev === q.id ? null : q.id))}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <QuoteDetail
          quote={selected}
          project={project}
          settings={settings}
          token={token}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
