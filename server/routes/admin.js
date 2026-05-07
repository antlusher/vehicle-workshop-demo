const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { findUserByToken, createUser } = require('../services/authService');
const { query } = require('../services/db');
const admin = require('../services/adminService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// Projects
router.get('/projects', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const projects = await admin.listProjects({ limit, offset });
  return res.json(projects);
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

// PDF knowledge import
router.post('/knowledge/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
  try {
    const { text } = await pdfParse(req.file.buffer);
    const chunks = chunkPdfText(text);
    return res.json({ chunks });
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse PDF: ' + err.message });
  }
});

router.post('/knowledge/import-chunks', async (req, res) => {
  const { chunks } = req.body;
  if (!Array.isArray(chunks) || !chunks.length) {
    return res.status(400).json({ error: 'chunks array is required' });
  }
  const saved = [];
  for (const chunk of chunks) {
    if (!chunk.title?.trim() || !chunk.content?.trim()) continue;
    const { rows } = await query(
      `INSERT INTO knowledge_base
         (category, make, model, year_from, year_to, fault_code, title, content, source, engine_id, transmission_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        chunk.category || 'General',
        chunk.make || null,
        chunk.model || null,
        chunk.year_from || null,
        chunk.year_to || null,
        chunk.fault_code || null,
        chunk.title.trim(),
        chunk.content.trim(),
        chunk.source || null,
        chunk.engine_id || null,
        chunk.transmission_id || null,
        req.admin.id,
      ]
    );
    saved.push(rows[0].id);
  }
  return res.json({ imported: saved.length });
});

function chunkPdfText(text) {
  // Normalise line endings, collapse 3+ newlines to 2
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paragraphs = normalised.split('\n\n').map((p) => p.trim()).filter(Boolean);

  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    // Skip page-number-only lines and very short noise
    if (/^\d+$/.test(para) || para.length < 40) continue;

    if (buffer.length === 0) {
      buffer = para;
    } else if (buffer.length + para.length < 1200) {
      buffer += '\n\n' + para;
    } else {
      chunks.push(makeChunk(buffer));
      buffer = para;
    }
  }
  if (buffer.length >= 40) chunks.push(makeChunk(buffer));

  return chunks;
}

function makeChunk(text) {
  const lines = text.split('\n');
  // First line is the title if it's short enough, otherwise truncate
  const firstLine = lines[0].trim();
  const title = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 117) + '…';
  return { title, content: text, category: 'General', make: '', model: '', year_from: '', year_to: '', fault_code: '', source: '', engine_id: '', transmission_id: '', included: true };
}

module.exports = router;
