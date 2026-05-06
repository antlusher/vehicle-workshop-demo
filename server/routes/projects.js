const express = require('express');
const { query } = require('../services/db');
const { lookupVehicle } = require('../services/vehicleProviders');
const { findUserByToken } = require('../services/authService');
const { generateVehicleSpecs } = require('../services/aiService');
const { findOrCreateVehicle, getVehicleHistory } = require('../services/vehicleService');
const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

function toProject(row, history = [], confirmedFixes = [], vehicleHistory = null) {
  return {
    id: row.id,
    userId: row.user_id,
    vehicleId: row.vehicle_id || null,
    registration: row.registration_snapshot || row.registration,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    engineCode: row.engine_code,
    fuelType: row.fuel_type,
    trim: row.trim,
    bodyType: row.body_type,
    source: row.source,
    active: row.active,
    closed: row.closed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    specs: row.specs || null,
    vehicleData: row.vehicle_data || null,
    confirmedFixes: confirmedFixes.map((f) => ({ id: f.id, text: f.text, createdAt: f.created_at })),
    vehicleHistory: vehicleHistory,
    history: history.map((h) => ({
      id: h.id,
      role: h.role,
      text: h.text,
      confirmed: h.confirmed,
      createdAt: h.created_at,
    })),
  };
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
    [req.user.id]
  );
  const projects = await Promise.all(rows.map(async (row) => {
    const [{ rows: history }, { rows: confirmedFixes }] = await Promise.all([
      query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [row.id]),
      query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [row.id]),
    ]);
    return toProject(row, history, confirmedFixes);
  }));
  return res.json(projects);
});

router.post('/', requireAuth, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Vehicle registration or VIN is required' });
  }

  try {
    const vehicleData = await lookupVehicle(identifier);

    // Find or create the canonical vehicle record
    const vehicle = await findOrCreateVehicle(vehicleData);

    const { rows } = await query(
      `INSERT INTO projects
         (user_id, vehicle_id, registration_snapshot, registration, vin,
          make, model, year, engine_code, fuel_type, trim, body_type, source, vehicle_data, active, closed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,false) RETURNING *`,
      [req.user.id, vehicle.id, vehicleData.registration || null, vehicleData.registration,
       vehicleData.vin, vehicleData.make, vehicleData.model, vehicleData.year,
       vehicleData.engineCode, vehicleData.fuelType, vehicleData.trim,
       vehicleData.bodyType, vehicleData.source,
       vehicleData.vehicleData ? JSON.stringify(vehicleData.vehicleData) : null]
    );

    const vehicleHistory = vehicle.id ? await getVehicleHistory(vehicle.id) : null;
    return res.json(toProject(rows[0], [], [], vehicleHistory));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to create project' });
  }
});

router.get('/:projectId', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  const project = rows[0];
  const [{ rows: history }, { rows: confirmedFixes }, vehicleHistory] = await Promise.all([
    query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
  ]);

  return res.json(toProject(project, history, confirmedFixes, vehicleHistory));
});

router.post('/:projectId/specs', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  const project = rows[0];

  if (project.specs) return res.json(project.specs);

  const specs = await generateVehicleSpecs({
    make: project.make, model: project.model, year: project.year,
    engineCode: project.engine_code, fuelType: project.fuel_type, trim: project.trim,
  });

  if (!specs) return res.status(500).json({ error: 'Could not generate specs' });

  await query('UPDATE projects SET specs = $1, updated_at = now() WHERE id = $2', [JSON.stringify(specs), project.id]);

  return res.json(specs);
});

router.post('/:projectId/clear', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  await query('DELETE FROM project_history WHERE project_id = $1', [req.params.projectId]);
  await query('DELETE FROM confirmed_suggestions WHERE project_id = $1', [req.params.projectId]);
  await query('UPDATE projects SET updated_at = now() WHERE id = $1', [req.params.projectId]);

  return res.json({ cleared: true });
});

router.post('/:projectId/close', requireAuth, async (req, res) => {
  const { rows } = await query(
    `UPDATE projects SET closed = true, active = false, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  return res.json(toProject(rows[0], []));
});

module.exports = router;
