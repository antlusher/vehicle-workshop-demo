const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { generateRepairAdvice } = require('../services/aiService');
const { getVehicleHistory } = require('../services/vehicleService');
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
  const { projectId, question, chatMode } = req.body;
  if (!projectId || !question) {
    return res.status(400).json({ error: 'Project ID and question are required' });
  }

  const { rows: projectRows } = await query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );
  if (!projectRows.length) return res.status(404).json({ error: 'Project not found' });

  const project = projectRows[0];
  const [historyResult, vehicleHistory, motRow] = await Promise.all([
    query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [projectId]),
    project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
    project.vehicle_id
      ? query('SELECT mot_tests, mot_vehicle_meta FROM vehicles WHERE id = $1', [project.vehicle_id])
      : Promise.resolve({ rows: [] }),
  ]);
  const history = historyResult.rows.map((h) => ({ role: h.role, text: h.text }));
  const motTests = motRow.rows[0]?.mot_tests || null;
  const motVehicleMeta = motRow.rows[0]?.mot_vehicle_meta || null;

  // Cross-workshop confirmed fixes: all fixes on this vehicle excluding current project
  const crossWorkshopFixes = (vehicleHistory?.confirmedFixes || []).filter(
    (f) => f.jobId !== projectId
  );

  const startMs = Date.now();
  try {
    const result = await generateRepairAdvice(
      { make: project.make, model: project.model, year: project.year,
        engineCode: project.engine_code, fuelType: project.fuel_type,
        registration: project.registration_snapshot || project.registration,
        vin: project.vin, motTests, motVehicleMeta },
      history,
      question,
      crossWorkshopFixes,
      chatMode
    );
    const { answer, inputTokens, outputTokens } = result;
    const durationMs = Date.now() - startMs;

    await query(
      'INSERT INTO project_history (project_id, role, text) VALUES ($1, $2, $3)',
      [projectId, 'user', question]
    );
    await query(
      'INSERT INTO project_history (project_id, role, text) VALUES ($1, $2, $3)',
      [projectId, 'ai', answer]
    );
    await query('UPDATE projects SET updated_at = now() WHERE id = $1', [projectId]);
    query(
      `INSERT INTO ai_requests (user_id, project_id, question_preview, answer_preview, input_tokens, output_tokens, model, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, projectId,
       question.slice(0, 200), answer.slice(0, 200),
       inputTokens, outputTokens, 'claude-sonnet-4-6', durationMs]
    ).catch(() => {});

    const [{ rows: updatedHistory }, { rows: confirmedFixes }] = await Promise.all([
      query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [projectId]),
      query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [projectId]),
    ]);
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
      motTests,
      motVehicleMeta,
      confirmedFixes: confirmedFixes.map((f) => ({ id: f.id, text: f.text, createdAt: f.created_at })),
      history: updatedHistory.map((h) => ({
        id: h.id, role: h.role, text: h.text, confirmed: h.confirmed, createdAt: h.created_at,
      })),
    };

    return res.json({ project: updatedProject, answer: answer });
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

  const { rows: existing } = await query(
    'SELECT id FROM confirmed_suggestions WHERE project_id = $1 AND text = $2',
    [projectId, text]
  );
  if (existing.length) return res.json({ confirmed: true, id: existing[0].id });

  const { rows } = await query(
    'INSERT INTO confirmed_suggestions (project_id, history_id, text) VALUES ($1, $2, $3) RETURNING *',
    [projectId, historyId || null, text]
  );

  return res.json({ confirmed: true, id: rows[0].id });
});

module.exports = router;
