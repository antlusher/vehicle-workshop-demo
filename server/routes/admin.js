const express = require('express');
const { findUserByToken, createUser } = require('../services/authService');
const { query } = require('../services/db');
const admin = require('../services/adminService');

const router = express.Router();

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}

router.use(requireAdmin);

// Dashboard
router.get('/dashboard', async (req, res) => {
  const stats = await admin.getDashboardStats();
  return res.json(stats);
});

// Users
router.get('/users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const users = await admin.listUsers({ limit, offset });
  return res.json(users);
});

router.get('/users/:id', async (req, res) => {
  const user = await admin.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

router.post('/users', async (req, res) => {
  const { email, password, role = 'tech', subscribed = false } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const user = await createUser(email, password);
    await query('UPDATE users SET role = $1, subscribed = $2 WHERE id = $3', [role, subscribed, user.id]);
    return res.status(201).json({ ...user, role, subscribed });
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
});

router.post('/users/:id/logout', async (req, res) => {
  await query('UPDATE users SET token = NULL, session_active = false WHERE id = $1', [req.params.id]);
  return res.json({ loggedOut: true });
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { role, subscribed } = req.body;
    const updated = await admin.updateUser(req.params.id, { role, subscribed });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// AI requests
router.get('/ai-requests', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId || null;
  const requests = await admin.listAiRequests({ limit, offset, userId });
  return res.json(requests);
});

router.get('/ai-requests/stats', async (req, res) => {
  const stats = await admin.getAiStats();
  return res.json(stats);
});

// Conversations
router.get('/projects/:projectId/conversation', async (req, res) => {
  const convo = await admin.getProjectConversation(req.params.projectId);
  if (!convo) return res.status(404).json({ error: 'Project not found' });
  return res.json(convo);
});

// Learning stats
router.get('/learning', async (req, res) => {
  const data = await admin.getLearningStats();
  return res.json(data);
});

// Knowledge base
router.get('/knowledge-base', async (req, res) => {
  const { category, make, search } = req.query;
  const entries = await admin.listKnowledgeBase({ category, make, search });
  return res.json(entries);
});

router.post('/knowledge-base', async (req, res) => {
  try {
    const entry = await admin.createKnowledgeBaseEntry(req.body, req.admin.id);
    return res.status(201).json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/knowledge-base/:id', async (req, res) => {
  try {
    const entry = await admin.updateKnowledgeBaseEntry(req.params.id, req.body);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    return res.json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/knowledge-base/:id', async (req, res) => {
  await admin.deleteKnowledgeBaseEntry(req.params.id);
  return res.json({ deleted: true });
});

module.exports = router;
