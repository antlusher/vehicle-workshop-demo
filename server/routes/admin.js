const express = require('express');
const { findUserByToken, createUser } = require('../services/authService');
const { query } = require('../services/db');
const admin = require('../services/adminService');

const router = express.Router();

const ADMIN_ROLES = ['owner', 'admin', 'sysadmin'];

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = user;
    req.workshopId = user.workshopId;
    next();
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}

router.use(requireAdmin);

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const stats = await admin.getDashboardStats(req.workshopId);
  return res.json(stats);
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const users = await admin.listUsers({ limit, offset, workshopId: req.workshopId });
  return res.json(users);
});

router.get('/users/:id', async (req, res) => {
  const user = await admin.getUser(req.params.id, req.workshopId);
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

// ── AI requests ───────────────────────────────────────────────────────────────

router.get('/ai-requests', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId || null;
  const requests = await admin.listAiRequests({ limit, offset, userId, workshopId: req.workshopId });
  return res.json(requests);
});

router.get('/ai-requests/stats', async (req, res) => {
  const stats = await admin.getAiStats(req.workshopId);
  return res.json(stats);
});

// ── Misc ──────────────────────────────────────────────────────────────────────

router.get('/projects/:projectId/conversation', async (req, res) => {
  const convo = await admin.getProjectConversation(req.params.projectId, req.workshopId);
  if (!convo) return res.status(404).json({ error: 'Project not found' });
  return res.json(convo);
});

router.get('/learning', async (req, res) => {
  const data = await admin.getLearningStats(req.workshopId);
  return res.json(data);
});

router.get('/projects', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const projects = await admin.listProjects({ limit, offset, workshopId: req.workshopId });
  return res.json(projects);
});

// ── Sub-routers ───────────────────────────────────────────────────────────────

router.use(require('./admin/knowledge'));
router.use(require('./admin/customers'));
router.use(require('./admin/staff'));

module.exports = router;
