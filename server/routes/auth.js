const express = require('express');
const {
  createUser,
  loginUser,
  logLogin,
  logoutUser,
  subscribeUser,
  findUserByToken,
  createPasswordResetToken,
  resetPassword,
} = require('../services/authService');
const { sendSubscriptionConfirmation, sendPasswordReset } = require('../services/emailService');
const router = express.Router();

function formatUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    token: user.token,
    subscribed: user.subscribed,
    demoMode: !Boolean(process.env.OPENAI_API_KEY),
  };
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    await createUser(email, password);
    return res.status(201).json({ message: 'Account created. Please log in.' });
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await loginUser(email, password);
    logLogin(user.id, req.ip, req.headers['user-agent']);
    return res.json(formatUserResponse(user));
  } catch (error) {
    const isConcurrent = error.message.includes('already active');
    return res.status(isConcurrent ? 409 : 401).json({ error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await logoutUser(token);
  }
  return res.json({ message: 'Logged out' });
});

router.post('/subscribe', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }
  try {
    const user = await subscribeUser(token);
    sendSubscriptionConfirmation(user.email).catch((err) =>
      console.error('Failed to send subscription email:', err.message)
    );
    return res.json(formatUserResponse(user));
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const resetToken = await createPasswordResetToken(email);
  if (resetToken) {
    sendPasswordReset(email, resetToken).catch((err) =>
      console.error('Failed to send reset email:', err.message)
    );
  }
  return res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  try {
    await resetPassword(token, password);
    return res.json({ message: 'Password reset successfully. Please log in.' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await findUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  return res.json(formatUserResponse(user));
});

module.exports = router;
