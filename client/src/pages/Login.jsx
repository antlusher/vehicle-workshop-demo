import { useState } from 'react';
import * as api from '../services/api';

function Login({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    try {
      const result = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password);
      onLogin(result);
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 420, margin: '60px auto' }}>
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>
          {formError && <p className="error">{formError}</p>}
          {error && <p className="error">{error}</p>}
        </form>
        <p style={{ marginTop: 14 }}>
          {mode === 'login'
            ? 'Need an account?'
            : 'Already have an account?'}
          {' '}
          <button className="secondary" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;
