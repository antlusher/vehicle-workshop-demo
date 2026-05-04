const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { generateRepairAdvice } = require('../services/aiService');
const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

router.post('/ask', requireAuth, async (req, res) => {
  const { projectId, question } = req.body;
  if (!projectId || !question) {
    return res.status(400).json({ error: 'Project ID and question are required' });
  }

  const { rows: projectRows } = await query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );
  if (!projectRows.length) return res.status(404).json({ error: 'Project not found' });

  const project = projectRows[0];
  const { rows: historyRows } = await query(
    'SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId]
  );
  const history = historyRows.map((h) => ({ role: h.role, text: h.text }));

  try {
    const answer = await generateRepairAdvice(
      { make: project.make, model: project.model, year: project.year,
        engineCode: project.engine_code, fuelType: project.fuel_type,
        registration: project.registration, vin: project.vin },
      history,
      question
    );

    await query(
      'INSERT INTO project_history (project_id, role, text) VALUES ($1, $2, $3)',
      [projectId, 'user', question]
    );
    await query(
      'INSERT INTO project_history (project_id, role, text) VALUES ($1, $2, $3)',
      [projectId, 'ai', answer]
    );
    await query('UPDATE projects SET updated_at = now() WHERE id = $1', [projectId]);

    const { rows: updatedHistory } = await query(
      'SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId]
    );
    const updatedProject = {
      ...project,
      id: project.id,
      userId: project.user_id,
      registration: project.registration,
      vin: project.vin,
      make: project.make,
      model: project.model,
      year: project.year,
      engineCode: project.engine_code,
      fuelType: project.fuel_type,
      trim: project.trim,
      bodyType: project.body_type,
      source: project.source,
      active: project.active,
      closed: project.closed,
      history: updatedHistory.map((h) => ({
        id: h.id, role: h.role, text: h.text, confirmed: h.confirmed, createdAt: h.created_at,
      })),
    };

    return res.json({ project: updatedProject, answer });
  } catch (error) {
    return res.status(500).json({ error: 'AI request failed' });
  }
});

router.post('/confirm-suggestion', requireAuth, async (req, res) => {
  const { projectId, historyId, text } = req.body;
  if (!projectId || !text) {
    return res.status(400).json({ error: 'projectId and text are required' });
  }

  const { rows: projectRows } = await query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );
  if (!projectRows.length) return res.status(404).json({ error: 'Project not found' });

  const { rows } = await query(
    'INSERT INTO confirmed_suggestions (project_id, history_id, text) VALUES ($1, $2, $3) RETURNING *',
    [projectId, historyId || null, text]
  );

  return res.json({ id: rows[0].id, confirmed: true });
});

router.post('/confirm/:historyId', requireAuth, async (req, res) => {
  const { historyId } = req.params;

  const { rows } = await query(
    `UPDATE project_history ph
     SET confirmed = true
     FROM projects p
     WHERE ph.id = $1
       AND ph.project_id = p.id
       AND p.user_id = $2
       AND ph.role = 'ai'
     RETURNING ph.*`,
    [historyId, req.user.id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Response not found' });
  }

  return res.json({ id: rows[0].id, confirmed: rows[0].confirmed });
});

module.exports = router;
