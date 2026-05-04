import { useState } from 'react';
import * as api from '../services/api';

function Login({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
        const result = await api.login(email, password);
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
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 420, margin: '60px auto' }}>
        <h1>
          {mode === 'login' && 'Sign in'}
          {mode === 'register' && 'Create account'}
          {mode === 'forgot' && 'Reset password'}
        </h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== 'forgot' && (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
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

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mode === 'login' && (
            <>
              <p>
                Need an account?{' '}
                <button className="secondary" type="button" onClick={() => switchMode('register')}>Register</button>
              </p>
              <p>
                Forgot your password?{' '}
                <button className="secondary" type="button" onClick={() => switchMode('forgot')}>Reset it</button>
              </p>
            </>
          )}
          {mode !== 'login' && (
            <p>
              Already have an account?{' '}
              <button className="secondary" type="button" onClick={() => switchMode('login')}>Sign in</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
