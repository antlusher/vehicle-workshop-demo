const express = require('express');
const { query } = require('../services/db');
const { lookupVehicle } = require('../services/vehicleProviders');
const { findUserByToken } = require('../services/authService');
const { generateVehicleSpecs } = require('../services/aiService');
const { findOrCreateVehicle, getVehicleHistory } = require('../services/vehicleService');
const { fetchAndStoreMotHistory } = require('../services/motService');
const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

function toProject(row, history = [], confirmedFixes = [], vehicleHistory = null, motTests = null) {
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
    motTests: motTests,
    history: history.map((h) => ({
      id: h.id,
      role: h.role,
      text: h.text,
      confirmed: h.confirmed,
      createdAt: h.created_at,
    })),
  };
}

async function getMotTests(vehicleId) {
  if (!vehicleId) return null;
  const { rows } = await query('SELECT mot_tests FROM vehicles WHERE id = $1', [vehicleId]);
  return rows[0]?.mot_tests || null;
}

router.get('/', requireAuth, async (req, res) => {
  const showArchived = req.query.archived === 'true';
  const { rows } = await query(
    `SELECT * FROM projects WHERE user_id = $1 AND archived_at IS ${showArchived ? 'NOT NULL' : 'NULL'} ORDER BY updated_at DESC`,
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
  const { identifier, manualData } = req.body;
  if (!identifier && !manualData) {
    return res.status(400).json({ error: 'Vehicle registration, VIN, or manual vehicle data is required' });
  }

  try {
    let vehicleData;
    if (manualData) {
      const reg = manualData.registration?.trim().toUpperCase().replace(/\s+/g, '') || null;
      vehicleData = {
        vin: manualData.vin?.trim().toUpperCase() || null,
        make: manualData.make?.trim() || null,
        model: manualData.model?.trim() || null,
        year: manualData.year?.toString().trim() || null,
        engineCode: manualData.engineCode?.trim() || null,
        fuelType: manualData.fuelType?.trim() || null,
        trim: manualData.trim?.trim() || null,
        bodyType: manualData.bodyType?.trim() || null,
        registration: reg,
        source: 'manual',
        vehicleData: null,
      };
    } else {
      vehicleData = await lookupVehicle(identifier);
    }

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
    const project = rows[0];

    // Generate specs in the background — don't block the response
    if (vehicleData.make && vehicleData.model && vehicleData.year) {
      generateVehicleSpecs({
        make: vehicleData.make, model: vehicleData.model, year: vehicleData.year,
        engineCode: vehicleData.engineCode, fuelType: vehicleData.fuelType, trim: vehicleData.trim,
      }).then((specs) => {
        if (specs) {
          query('UPDATE projects SET specs = $1, updated_at = now() WHERE id = $2',
            [JSON.stringify(specs), project.id]);
        }
      }).catch(() => {});
    }

    // Fetch MOT history in the background
    if (vehicle.id && vehicleData.registration) {
      fetchAndStoreMotHistory(vehicle.id, vehicleData.registration).catch(() => {});
    }

    return res.json(toProject(project, [], [], vehicleHistory));
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
  const [{ rows: history }, { rows: confirmedFixes }, vehicleHistory, motTests] = await Promise.all([
    query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
    getMotTests(project.vehicle_id),
  ]);

  return res.json(toProject(project, history, confirmedFixes, vehicleHistory, motTests));
});

router.patch('/:projectId/vehicle', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = rows[0];

    const { vin, make, model, year, engineCode, fuelType, trim, bodyType, registration } = req.body;
    const reg = registration?.trim().toUpperCase().replace(/\s+/g, '') || null;
    const cleanVin = vin?.trim().toUpperCase() || null;

    const { rows: updated } = await query(
      `UPDATE projects SET
         vin=$1, make=$2, model=$3, year=$4, engine_code=$5,
         fuel_type=$6, trim=$7, body_type=$8, registration=$9,
         specs=NULL, updated_at=now()
       WHERE id=$10 RETURNING *`,
      [cleanVin, make || null, model || null, year || null, engineCode || null,
       fuelType || null, trim || null, bodyType || null, reg, project.id]
    );

    if (project.vehicle_id) {
      // Only update VIN if it's not already taken by a different vehicle
      if (cleanVin) {
        const { rows: vinCheck } = await query(
          'SELECT id FROM vehicles WHERE vin = $1 AND id != $2',
          [cleanVin, project.vehicle_id]
        );
        if (!vinCheck.length) {
          await query('UPDATE vehicles SET vin=$1, updated_at=now() WHERE id=$2', [cleanVin, project.vehicle_id]);
        }
      }
      await query(
        `UPDATE vehicles SET make=$1, model=$2, year=$3, engine_code=$4,
           fuel_type=$5, trim=$6, body_type=$7, updated_at=now() WHERE id=$8`,
        [make || null, model || null, year || null, engineCode || null,
         fuelType || null, trim || null, bodyType || null, project.vehicle_id]
      );
      if (reg) {
        const { upsertRegistration } = require('../services/vehicleService');
        await upsertRegistration(project.vehicle_id, reg);
      }
    }

    if (make && model && year) {
      generateVehicleSpecs({ make, model, year, engineCode, fuelType, trim })
        .then((specs) => {
          if (specs) query('UPDATE projects SET specs = $1, updated_at = now() WHERE id = $2', [JSON.stringify(specs), project.id]);
        }).catch(() => {});
    }

    const [{ rows: history }, { rows: confirmedFixes }, vehicleHistory] = await Promise.all([
      query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
      query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
      project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
    ]);
    return res.json(toProject(updated[0], history, confirmedFixes, vehicleHistory));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to update vehicle' });
  }
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

router.post('/:projectId/archive', requireAuth, async (req, res) => {
  const { rows } = await query(
    `UPDATE projects SET archived_at = now(), updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  return res.json(toProject(rows[0]));
});

router.post('/:projectId/restore', requireAuth, async (req, res) => {
  const { rows } = await query(
    `UPDATE projects SET archived_at = NULL, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  return res.json(toProject(rows[0]));
});

router.post('/:projectId/mot/refresh', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.projectId, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  const project = rows[0];
  if (!project.vehicle_id || !project.registration) {
    return res.status(400).json({ error: 'No registration on this project' });
  }
  const tests = await fetchAndStoreMotHistory(project.vehicle_id, project.registration);
  return res.json({ motTests: tests });
});

module.exports = router;
