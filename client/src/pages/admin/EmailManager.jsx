import { useEffect, useState } from 'react';
import { getEmailStatus, sendEmail } from '../../services/adminApi';

function StatusBanner({ status }) {
  if (!status) return null;
  if (status.transport === 'smtp') {
    return (
      <div className="kb-form-wrap" style={{ background: '#ecfdf5', borderColor: '#10b981' }}>
        <strong>SMTP transport ready</strong>
        <p style={{ margin: '6px 0 0' }}>
          Sending via <code>{status.host}:{status.port}</code>
          {status.from ? <> as <code>{status.from}</code></> : <> — <em>SMTP_FROM_EMAIL is not set</em></>}
        </p>
      </div>
    );
  }
  if (status.transport === 'ses') {
    return (
      <div className="kb-form-wrap" style={{ background: '#eff6ff', borderColor: '#3b82f6' }}>
        <strong>AWS SES transport ready</strong>
        <p style={{ margin: '6px 0 0' }}>
          Sending as <code>{status.from || '— SES_FROM_EMAIL is not set'}</code>
        </p>
      </div>
    );
  }
  return (
    <div className="kb-form-wrap" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
      <strong>No email transport configured</strong>
      <p style={{ margin: '6px 0 0' }}>
        Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
        <code>SMTP_PASS</code> and <code>SMTP_FROM_EMAIL</code> in <code>server/.env</code>,
        then restart the server.
      </p>
    </div>
  );
}

export default function EmailManager({ token }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ to: '', subject: '', body: '', isHtml: false });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    getEmailStatus(token).then(setStatus).catch((e) => setError(e.message));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.to || !form.subject || !form.body) {
      setError('Recipient, subject and body are required');
      return;
    }
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await sendEmail(form, token);
      setResult(res);
      setForm({ to: '', subject: '', body: '', isHtml: form.isHtml });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || status?.transport === 'none';

  return (
    <div>
      <h2 className="admin-page-title">Email Manager</h2>

      <StatusBanner status={status} />

      <div className="kb-form-wrap">
        <h3 className="admin-section-title" style={{ marginTop: 0 }}>Compose</h3>
        <form className="kb-form" onSubmit={handleSubmit}>
          <div className="kb-form-row">
            <div className="kb-form-group" style={{ flex: 2 }}>
              <label>To</label>
              <input
                type="email"
                value={form.to}
                onChange={(e) => set('to', e.target.value)}
                placeholder="customer@example.com"
                required
              />
            </div>
            <div className="kb-form-group" style={{ flex: 3 }}>
              <label>Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
                placeholder="Your job is ready"
                required
              />
            </div>
            <div className="kb-form-group" style={{ justifyContent: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isHtml}
                  onChange={(e) => set('isHtml', e.target.checked)}
                  style={{ width: 'auto', marginBottom: 0 }}
                />
                Send as HTML
              </label>
            </div>
          </div>
          <div className="kb-form-group">
            <label>Body{form.isHtml ? ' (HTML)' : ''}</label>
            <textarea
              rows={10}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder={form.isHtml ? '<p>Hello,</p>' : 'Hello,'}
              required
              style={{ fontFamily: form.isHtml ? 'monospace' : 'inherit' }}
            />
          </div>
          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
          {result && (
            <p style={{ margin: 0, color: '#059669' }}>
              Sent via {result.transport}
              {result.messageId ? ` (id: ${result.messageId})` : ''}
            </p>
          )}
          <div className="kb-form-actions">
            <button type="submit" disabled={disabled}>
              {sending ? 'Sending...' : 'Send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
