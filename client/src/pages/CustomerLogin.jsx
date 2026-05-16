import { useState } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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

// ── Set password screen (activation + reset) ──────────────────────────────────
function SetPasswordForm({ activateToken, onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      const data = await apiPost('/api/customer/activate', { token: activateToken, password });
      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customer-login-wrap">
      <div className="customer-login-card">
        <div className="customer-login-logo">Your Gofer</div>
        <h2 className="customer-login-title">Set your password</h2>
        <p className="customer-login-sub">Choose a password to secure your customer account.</p>
        <form onSubmit={handleSubmit} className="customer-login-form">
          <label>Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoFocus
          />
          <label>Confirm password</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
          />
          {error && <p className="customer-login-error">{error}</p>}
          <button type="submit" disabled={loading} className="customer-login-btn">
            {loading ? 'Setting password…' : 'Set password & sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Forgot password screen ────────────────────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiPost('/api/customer/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="customer-login-wrap">
        <div className="customer-login-card">
          <div className="customer-login-logo">Your Gofer</div>
          <h2 className="customer-login-title">Check your email</h2>
          <p className="customer-login-sub">
            If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
          </p>
          <button className="customer-login-back" onClick={onBack}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-login-wrap">
      <div className="customer-login-card">
        <div className="customer-login-logo">Your Gofer</div>
        <h2 className="customer-login-title">Forgot password?</h2>
        <p className="customer-login-sub">Enter your email and we'll send you a reset link.</p>
        <form onSubmit={handleSubmit} className="customer-login-form">
          <label>Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
          {error && <p className="customer-login-error">{error}</p>}
          <button type="submit" disabled={loading} className="customer-login-btn">
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <button className="customer-login-back" onClick={onBack}>Back to sign in</button>
      </div>
    </div>
  );
}

// ── Main login screen ─────────────────────────────────────────────────────────
export default function CustomerLogin({ activateToken, onSuccess }) {
  const [screen, setScreen] = useState(activateToken ? 'activate' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (screen === 'activate') {
    return <SetPasswordForm activateToken={activateToken} onSuccess={onSuccess} />;
  }
  if (screen === 'forgot') {
    return <ForgotPasswordForm onBack={() => setScreen('login')} />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await apiPost('/api/customer/login', { email, password });
      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customer-login-wrap">
      <div className="customer-login-card">
        <div className="customer-login-logo">Your Gofer</div>
        <h2 className="customer-login-title">Customer portal</h2>
        <p className="customer-login-sub">Sign in to view your vehicles, reports and quotes.</p>
        <form onSubmit={handleLogin} className="customer-login-form">
          <label>Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
          <label>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
          {error && <p className="customer-login-error">{error}</p>}
          <button type="submit" disabled={loading} className="customer-login-btn">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button className="customer-login-back" onClick={() => setScreen('forgot')}>
          Forgot password?
        </button>
      </div>
    </div>
  );
}
