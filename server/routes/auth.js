const express = require('express');
const { createUser, loginUser, subscribeUser, findUserByToken } = require('../services/authService');
const router = express.Router();

function formatUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    token: user.token,
    subscribed: user.subscribed,
    demoMode: !Boolean(process.env.OPENAI_API_KEY),
  };
}

router.post('/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = createUser(email, password);
    return res.json(formatUserResponse(user));
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = loginUser(email, password);
    return res.json(formatUserResponse(user));
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

router.post('/subscribe', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

  try {
    const user = subscribeUser(token);
    return res.json(formatUserResponse(user));
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
  return res.json(formatUserResponse(user));
});

module.exports = router;
