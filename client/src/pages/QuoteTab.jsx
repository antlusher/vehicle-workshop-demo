import { useState, useEffect, useCallback } from 'react';
import * as quotesApi from '../services/quotesApi';

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent to customer', approved: 'Approved', invoiced: 'Invoiced' };
const TYPE_LABELS   = { part: 'Part', labour: 'Labour', other: 'Other' };

function QuotePreviewModal({ quote, quoteFields, onClose }) {
  const allLines = quote.lines.map((l) => ({
    ...l,
    // apply any unsaved quoteFields edits by using saved quote lines
  }));
  const partLines   = allLines.filter((l) => l.type === 'part');
  const labourLines = allLines.filter((l) => l.type === 'labour');
  const otherLines  = allLines.filter((l) => l.type !== 'part' && l.type !== 'labour');

  const renderLines = (lines) => lines.map((l) => (
    <div key={l.id} className="cp-quote-line">
      <span className="cp-quote-line-desc">{l.description}</span>
      <span className="cp-quote-line-qty">×{l.qty}</span>
      <span className="cp-quote-line-total">£{l.lineTotal.toFixed(2)}</span>
    </div>
  ));

  const summary = quoteFields.diagnosticSummary;
  const notes   = quoteFields.notes;

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
            {summary && <p className="cp-section-text" style={{ marginBottom: 12 }}>{summary}</p>}

            {partLines.length > 0 && <div className="cp-quote-group"><div className="cp-quote-group-label">Parts</div>{renderLines(partLines)}</div>}
            {labourLines.length > 0 && <div className="cp-quote-group"><div className="cp-quote-group-label">Labour</div>{renderLines(labourLines)}</div>}
            {otherLines.length > 0 && <div className="cp-quote-group"><div className="cp-quote-group-label">Other</div>{renderLines(otherLines)}</div>}

            {allLines.length === 0 && <p style={{ color: '#9ca3af', padding: '12px 0' }}>No line items yet — add parts or labour to see them here.</p>}

            <div className="cp-quote-totals">
              <div className="cp-cost-row"><span>Subtotal</span><span>£{quote.totals.subtotal.toFixed(2)}</span></div>
              <div className="cp-cost-row"><span>VAT ({quote.totals.vatRate}%)</span><span>£{quote.totals.vat.toFixed(2)}</span></div>
              <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>£{quote.totals.total.toFixed(2)}</span></div>
            </div>

            {notes && <p className="cp-quote-notes">{notes}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  };

  return (
    <div className="parts-search">
      <form onSubmit={search} className="parts-search-form">
        <input
          className="parts-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parts (e.g. brake pads, oil filter, EGR…)"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {searched && results.length === 0 && !loading && (
        <p className="parts-empty">No parts found. Try a broader search term.</p>
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
                <button type="button" className="part-add-btn" onClick={() => handleAdd(part)}>
                  + Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteLines({ quote, token, onUpdated }) {
  const [editing, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});

  const handleDelete = async (lineId) => {
    const updated = await quotesApi.deleteLine(quote.id, lineId, token);
    onUpdated(updated);
  };

  const startEdit = (line) => {
    setEditing(line.id);
    setEditVals({ qty: line.qty, unitCost: line.unitCost, markupPct: line.markupPct });
  };

  const saveEdit = async (lineId) => {
    const updated = await quotesApi.updateLine(quote.id, lineId, {
      qty: parseFloat(editVals.qty),
      unitCost: parseFloat(editVals.unitCost),
      markupPct: parseFloat(editVals.markupPct),
    }, token);
    setEditing(null);
    onUpdated(updated);
  };

  if (!quote.lines.length) return <p className="parts-empty">No lines yet. Search for parts or add labour below.</p>;

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
          {quote.lines.map((line) => (
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

function AddLabourForm({ quoteId, token, settings, onUpdated }) {
  const [open, setOpen]       = useState(false);
  const [desc, setDesc]       = useState('');
  const [hours, setHours]     = useState('1');
  const [rate, setRate]       = useState(settings.labourRatePerHour.toFixed(2));
  const [markup, setMarkup]   = useState('0');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const updated = await quotesApi.addLine(quoteId, {
      type: 'labour',
      description: desc,
      qty: parseFloat(hours),
      unitCost: parseFloat(rate),
      markupPct: parseFloat(markup),
    }, token);
    onUpdated(updated);
    setDesc(''); setHours('1'); setOpen(false);
  };

  if (!open) return (
    <button type="button" className="secondary" onClick={() => setOpen(true)}>+ Add labour</button>
  );

  return (
    <form onSubmit={handleSubmit} className="add-labour-form">
      <input placeholder="Labour description e.g. Diagnostic, EGR replacement" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} required />
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

export default function QuoteTab({ project, token }) {
  const [quotes, setQuotes]         = useState([]);
  const [settings, setSettings]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [activeId, setActiveId]     = useState(null);
  const [creating, setCreating]     = useState(false);
  const [diagSummary, setDiagSummary] = useState('');
  const [quoteFields, setQuoteFields] = useState({ diagnosticSummary: '', notes: '' });
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const activeQuote = quotes.find((q) => q.id === activeId) || quotes[0] || null;

  useEffect(() => {
    if (activeQuote) {
      setQuoteFields({ diagnosticSummary: activeQuote.diagnosticSummary || '', notes: activeQuote.notes || '' });
      setSaved(false);
    }
  }, [activeQuote?.id]);

  const load = useCallback(async () => {
    const [qs, s] = await Promise.all([
      quotesApi.getQuotes(project.id, token),
      quotesApi.getSettings(token),
    ]);
    setQuotes(qs);
    setSettings(s);
    if (qs.length && !activeId) setActiveId(qs[0].id);
    setLoading(false);
  }, [project.id, token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const q = await quotesApi.createQuote({ project_id: project.id, diagnostic_summary: diagSummary }, token);
      setQuotes((prev) => [q, ...prev]);
      setActiveId(q.id);
      setDiagSummary('');
    } finally {
      setCreating(false);
    }
  };

  const handleAddPart = async (lineData) => {
    if (!activeQuote) return;
    const updated = await quotesApi.addLine(activeQuote.id, lineData, token);
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
  };

  const handleUpdated = (updated) => {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
  };

  const handleStatusChange = async (status) => {
    if (!activeQuote) return;
    const updated = await quotesApi.updateQuote(activeQuote.id, { status }, token);
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
  };

  const handleSaveFields = async () => {
    if (!activeQuote) return;
    setSaving(true);
    try {
      const updated = await quotesApi.updateQuote(activeQuote.id, {
        notes: quoteFields.notes,
        diagnostic_summary: quoteFields.diagnosticSummary,
      }, token);
      setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (quoteId) => {
    if (!window.confirm('Delete this quote? This cannot be undone.')) return;
    await quotesApi.deleteQuote(quoteId, token);
    const remaining = quotes.filter((q) => q.id !== quoteId);
    setQuotes(remaining);
    setActiveId(remaining[0]?.id || null);
  };

  if (loading) return <p className="specs-loading">Loading quotes…</p>;

  return (
    <div className="quote-tab">
      {/* Quote selector / create */}
      <div className="quote-header">
        <div className="quote-selector">
          {quotes.map((q, i) => (
            <div key={q.id} className={`quote-pill${q.id === activeQuote?.id ? ' active' : ''}`}>
              <span onClick={() => setActiveId(q.id)} style={{ cursor: 'pointer' }}>
                Quote {quotes.length - i} <span className={`quote-status-dot ${q.status}`} />
              </span>
              <button
                type="button"
                className="quote-pill-delete"
                title="Delete quote"
                onClick={() => handleDelete(q.id)}
              >✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : '+ New quote'}
        </button>
      </div>

      {!activeQuote && (
        <div className="quote-empty-state">
          <p>No quotes yet for this job.</p>
          {diagSummary === '' && (
            <textarea
              className="diag-summary-input"
              placeholder="Paste diagnostic summary from the AI conversation (optional)…"
              value={diagSummary}
              onChange={(e) => setDiagSummary(e.target.value)}
              rows={3}
            />
          )}
          <button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create first quote'}
          </button>
        </div>
      )}

      {activeQuote && (
        <>
          {previewing && (
            <QuotePreviewModal
              quote={activeQuote}
              quoteFields={quoteFields}
              onClose={() => setPreviewing(false)}
            />
          )}

          {/* Status bar */}
          <div className="quote-status-bar">
            <span className={`quote-status-badge ${activeQuote.status}`}>
              {STATUS_LABELS[activeQuote.status] || activeQuote.status}
            </span>
            <div className="quote-status-actions">
              <button type="button" className="secondary" onClick={() => setPreviewing(true)}>Preview</button>
              {activeQuote.status === 'draft' && (
                <button type="button" className="secondary" onClick={() => handleStatusChange('sent')}>Mark as sent</button>
              )}
              {activeQuote.status === 'sent' && (
                <>
                  <button type="button" className="secondary" onClick={() => handleStatusChange('approved')}>Mark approved</button>
                  <button type="button" className="secondary" onClick={() => handleStatusChange('draft')}>Back to draft</button>
                </>
              )}
              {activeQuote.status === 'approved' && (
                <button type="button" className="secondary" onClick={() => handleStatusChange('invoiced')}>Mark invoiced</button>
              )}
            </div>
          </div>

          {/* Diagnostic summary + notes */}
          <div className="quote-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Quote details</h4>
              <button type="button" onClick={handleSaveFields} disabled={saving} style={{ fontSize: '0.8rem', padding: '4px 14px' }}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>Diagnostic summary</label>
            <textarea
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              placeholder="Summary of diagnosis for the customer…"
              value={quoteFields.diagnosticSummary}
              onChange={(e) => setQuoteFields((f) => ({ ...f, diagnosticSummary: e.target.value }))}
            />
            <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="Internal notes or customer-facing comments…"
              value={quoteFields.notes}
              onChange={(e) => setQuoteFields((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Parts search */}
          <div className="quote-section">
            <h4>Add parts</h4>
            <PartsSearch
              project={project}
              token={token}
              onAdd={handleAddPart}
              defaultMarkupPct={settings.defaultMarkupPct}
            />
          </div>

          {/* Lines */}
          <div className="quote-section">
            <h4>Quote lines</h4>
            <QuoteLines quote={activeQuote} token={token} onUpdated={handleUpdated} />
            <div className="labour-add-row">
              <AddLabourForm quoteId={activeQuote.id} token={token} settings={settings} onUpdated={handleUpdated} />
            </div>
          </div>

          {/* Totals */}
          <div className="quote-totals">
            <div className="quote-total-row">
              <span>Subtotal</span>
              <span>£{activeQuote.totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="quote-total-row">
              <span>VAT ({activeQuote.totals.vatRate}%)</span>
              <span>£{activeQuote.totals.vat.toFixed(2)}</span>
            </div>
            <div className="quote-total-row total">
              <span>Total</span>
              <span>£{activeQuote.totals.total.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
