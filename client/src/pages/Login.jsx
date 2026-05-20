import { useState, useEffect } from 'react';
import * as api from '../services/api';

function Login({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [workshop, setWorkshop] = useState(null);

  const slug = api.getWorkshopSlug();

  useEffect(() => {
    if (!slug) return;
    api.getWorkshopBySlug(slug)
      .then(setWorkshop)
      .catch(() => setWorkshop(null));
  }, [slug]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setFormError('');
    setSuccessMessage('');
    setPassword('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');

    try {
      if (mode === 'login') {
        const result = await api.login(email, password, slug);
        onLogin(result);
      } else if (mode === 'register') {
        await api.register(email, password);
        setSuccessMessage('Account created. Please sign in.');
        switchMode('login');
      } else if (mode === 'forgot') {
        await api.forgotPassword(email);
        setSuccessMessage('If an account exists for that email, a reset link has been sent.');
      }
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
        {workshop ? (
          <>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 2 }}>Ask Bob</p>
            <h1 style={{ marginTop: 0 }}>{workshop.name}</h1>
          </>
        ) : (
          <h1>Ask Bob</h1>
        )}
        <h2 style={{ fontWeight: 400, fontSize: '1rem', marginTop: 0, marginBottom: 20, color: '#4b5563' }}>
          {mode === 'login' && 'Sign in'}
          {mode === 'register' && 'Create account'}
          {mode === 'forgot' && 'Reset password'}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          {mode !== 'forgot' && (
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          )}
          <button type="submit">
            {mode === 'login' && 'Sign in'}
            {mode === 'register' && 'Create account'}
            {mode === 'forgot' && 'Send reset link'}
          </button>
          {successMessage && <p style={{ color: '#16a34a', marginTop: 8 }}>{successMessage}</p>}
          {formError && <p className="error">{formError}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default Login;
