import { useState, useRef, useEffect } from 'react';

async function askAdminAgent(history, question, token) {
  const res = await fetch('/api/ai/admin-agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const SUGGESTIONS = [
  'Create a new project',
  'List active projects',
  'Find a customer',
  'Create a new customer',
];

export default function AdminAgent({ token, onClose, onProjectCreated }) {
  const [history, setHistory]   = useState([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput('');
    setError('');
    setBusy(true);

    const userMsg = { role: 'user', text: q };
    setHistory((h) => [...h, userMsg]);

    try {
      const result = await askAdminAgent([...history, userMsg], q, token);
      setHistory((h) => [...h, { role: 'ai', text: result.answer }]);

      if (result.answer.toLowerCase().includes('project created') && onProjectCreated) {
        onProjectCreated();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="admin-agent-overlay" onClick={onClose}>
      <div className="admin-agent-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-agent-header">
          <div className="admin-agent-title">
            <span className="admin-agent-dot" />
            Assistant
          </div>
          <button className="admin-agent-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Messages */}
        <div className="admin-agent-messages">
          {history.length === 0 && (
            <div className="admin-agent-welcome">
              <p>Hi — I can help with workshop admin tasks. Try one of these or just type what you need:</p>
              <div className="admin-agent-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="admin-agent-suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((msg, i) => (
            <div key={i} className={`admin-agent-msg ${msg.role}`}>
              <div className="admin-agent-bubble">
                {msg.text.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          ))}

          {busy && (
            <div className="admin-agent-msg ai">
              <div className="admin-agent-bubble admin-agent-thinking">
                <span /><span /><span />
              </div>
            </div>
          )}

          {error && (
            <div className="admin-agent-error">{error}</div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="admin-agent-input-row">
          <textarea
            ref={inputRef}
            className="admin-agent-input"
            rows={1}
            placeholder="Type a task or question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={busy}
          />
          <button
            type="button"
            className="admin-agent-send"
            onClick={() => send()}
            disabled={!input.trim() || busy}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
