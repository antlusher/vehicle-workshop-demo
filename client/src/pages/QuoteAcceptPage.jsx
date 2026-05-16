import { useState, useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function fmt(n) { return `£${parseFloat(n).toFixed(2)}`; }

function QuoteSummary({ quote }) {
  return (
    <div className="qap-quote">
      <div className="qap-quote-header">
        <div>
          <h2 className="qap-quote-title">{quote.title || `Quote ${quote.reference}`}</h2>
          {quote.vehicle && <p className="qap-quote-vehicle">{quote.vehicle}{quote.registration ? ` · ${quote.registration}` : ''}</p>}
        </div>
        <div className="qap-quote-ref">{quote.reference}</div>
      </div>

      {quote.diagnosticSummary && (
        <p className="qap-quote-summary">{quote.diagnosticSummary}</p>
      )}

      {quote.items.map((item) => (
        <div key={item.id} className="qap-item">
          <div className="qap-item-title">{item.title}</div>
          {item.description && <p className="qap-item-desc">{item.description}</p>}
          <table className="qap-lines">
            <tbody>
              {item.lines.map((l) => (
                <tr key={l.id}>
                  <td className="qap-line-desc">{l.description}</td>
                  <td className="qap-line-qty">{l.qty !== 1 ? `×${l.qty}` : ''}</td>
                  <td className="qap-line-total">{fmt(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="qap-item-subtotal"><span>Item total</span><span>{fmt(item.subtotal)}</span></div>
        </div>
      ))}

      {quote.ungroupedLines.length > 0 && (
        <div className="qap-item">
          <table className="qap-lines">
            <tbody>
              {quote.ungroupedLines.map((l) => (
                <tr key={l.id}>
                  <td className="qap-line-desc">{l.description}</td>
                  <td className="qap-line-qty">{l.qty !== 1 ? `×${l.qty}` : ''}</td>
                  <td className="qap-line-total">{fmt(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="qap-totals">
        <div className="qap-total-row"><span>Subtotal</span><span>{fmt(quote.totals.subtotal)}</span></div>
        <div className="qap-total-row"><span>VAT ({quote.totals.vatRate}%)</span><span>{fmt(quote.totals.vat)}</span></div>
        <div className="qap-total-row qap-total-grand"><span>Total</span><span>{fmt(quote.totals.total)}</span></div>
      </div>
    </div>
  );
}

function AcceptForm({ token, quote, onAccepted }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiPost(`/api/customer/quick-quote/${token}/accept`, { name, phone });
      onAccepted();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qap-accept-form">
      <h3 className="qap-accept-title">Accept this quote</h3>
      <p className="qap-accept-sub">
        Please confirm your details and we'll get started.
        {quote.quoteEmail && <> Your account will be set up at <strong>{quote.quoteEmail}</strong>.</>}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="qap-field">
          <label>Full name <span className="qap-req">*</span></label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            autoFocus
          />
        </div>
        <div className="qap-field">
          <label>Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07700 900000"
          />
        </div>
        {error && <p className="qap-error">{error}</p>}
        <button type="submit" className="qap-accept-btn" disabled={loading}>
          {loading ? 'Accepting…' : `Accept quote — ${fmt(quote.totals.total)}`}
        </button>
      </form>
    </div>
  );
}

function AcceptedScreen({ quote }) {
  return (
    <div className="qap-accepted">
      <div className="qap-accepted-icon">✓</div>
      <h2>Quote accepted!</h2>
      <p>
        Thank you — <strong>{quote.workshopName}</strong> has been notified and will be in touch shortly.
      </p>
      <p className="qap-accepted-sub">
        Check your email for a link to set up your customer account and view your full job history.
      </p>
    </div>
  );
}

export default function QuoteAcceptPage({ quoteToken }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    apiGet(`/api/customer/quick-quote/${quoteToken}`)
      .then(setQuote)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [quoteToken]);

  return (
    <div className="qap-wrap">
      <header className="qap-header">
        <div className="qap-logo">Your Gofer</div>
        {quote?.workshopName && <div className="qap-workshop">{quote.workshopName}</div>}
      </header>

      <div className="qap-body">
        {loading && <p className="qap-loading">Loading quote…</p>}
        {error && (
          <div className="qap-expired">
            <h2>Quote unavailable</h2>
            <p>{error}</p>
          </div>
        )}
        {quote && !accepted && (
          <>
            {quote.status === 'approved' ? (
              <div className="qap-expired">
                <h2>Already accepted</h2>
                <p>This quote has already been accepted. Contact {quote.workshopName} if you have any questions.</p>
              </div>
            ) : (
              <>
                <QuoteSummary quote={quote} />
                <AcceptForm token={quoteToken} quote={quote} onAccepted={() => setAccepted(true)} />
              </>
            )}
          </>
        )}
        {accepted && <AcceptedScreen quote={quote} />}
      </div>
    </div>
  );
}
