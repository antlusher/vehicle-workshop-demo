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

// Managers/admins can access any project in their workshop; techs only their own
async function canAccessProject(projectId, user) {
  const isWide = ['owner', 'admin', 'sysadmin'].includes(user.role);
  if (isWide) {
    const { rows } = await query(
      'SELECT id FROM projects WHERE id = $1 AND workshop_id = $2',
      [projectId, user.workshopId]
    );
    return rows.length > 0;
  }
  const { rows } = await query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, user.id]
  );
  return rows.length > 0;
}

function toProject(row, history = [], confirmedFixes = [], vehicleHistory = null, motTests = null, motVehicleMeta = null) {
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
    motVehicleMeta: motVehicleMeta,
    history: history.map((h) => ({
      id: h.id,
      role: h.role,
      text: h.text,
      confirmed: h.confirmed,
      createdAt: h.created_at,
    })),
  };
}

async function getMotData(vehicleId) {
  if (!vehicleId) return { motTests: null, motVehicleMeta: null };
  const { rows } = await query('SELECT mot_tests, mot_vehicle_meta FROM vehicles WHERE id = $1', [vehicleId]);
  return {
    motTests: rows[0]?.mot_tests || null,
    motVehicleMeta: rows[0]?.mot_vehicle_meta || null,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const showArchived = req.query.archived === 'true';
  const user = req.user;

  // Managers/admins see all workshop projects; techs see only their own
  const isWideRole = ['owner', 'admin', 'sysadmin'].includes(user.role);
  const scopeClause = isWideRole
    ? `p.workshop_id = $1 AND p.archived_at IS ${showArchived ? 'NOT NULL' : 'NULL'}`
    : `p.user_id = $1 AND p.archived_at IS ${showArchived ? 'NOT NULL' : 'NULL'}`;
  const scopeParam = isWideRole ? user.workshopId : user.id;

  // Explicit column list avoids duplicate-name clash when using p.* alongside COALESCE aliases
  const { rows } = await query(
    `SELECT
        p.id, p.user_id, p.vehicle_id, p.registration_snapshot, p.registration, p.vin,
        COALESCE(p.make,      v.mot_vehicle_meta->>'make')            AS make,
        COALESCE(p.model,     v.mot_vehicle_meta->>'model')           AS model,
        COALESCE(p.year,      SUBSTRING(COALESCE(v.mot_vehicle_meta->>'firstUsedDate', v.mot_vehicle_meta->>'manufactureDate'), 1, 4)) AS year,
        p.engine_code,
        COALESCE(p.fuel_type, v.mot_vehicle_meta->>'fuelType')        AS fuel_type,
        p.trim, p.body_type, p.source, p.active, p.closed,
        p.created_at, p.updated_at, p.specs, p.vehicle_data, p.archived_at
      FROM projects p
      LEFT JOIN vehicles v ON v.id = p.vehicle_id
      WHERE ${scopeClause}
      ORDER BY p.updated_at DESC`,
    [scopeParam]
  );

  // Write back any fields sourced from motVehicleMeta so the DB stays in sync
  rows.filter((r) => r.make || r.model).forEach((r) => {
    query(
      `UPDATE projects SET
         make      = COALESCE(make, $1),
         model     = COALESCE(model, $2),
         year      = COALESCE(year, $3),
         fuel_type = COALESCE(fuel_type, $4),
         updated_at = now()
       WHERE id = $5 AND (make IS NULL OR model IS NULL)`,
      [r.make || null, r.model || null, r.year || null, r.fuel_type || null, r.id]
    ).catch(() => {});
  });

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
         (user_id, workshop_id, vehicle_id, registration_snapshot, registration, vin,
          make, model, year, engine_code, fuel_type, trim, body_type, source, vehicle_data, active, closed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,false) RETURNING *`,
      [req.user.id, req.user.workshopId || null, vehicle.id,
       vehicleData.registration || null, vehicleData.registration,
       vehicleData.vin, vehicleData.make, vehicleData.model, vehicleData.year,
       vehicleData.engineCode, vehicleData.fuelType, vehicleData.trim,
       vehicleData.bodyType, vehicleData.source,
       vehicleData.vehicleData ? JSON.stringify(vehicleData.vehicleData) : null]
    );

    const vehicleHistory = vehicle.id ? await getVehicleHistory(vehicle.id) : null;
    const project = rows[0];

    // Background chain: MOT fetch → patch missing fields → generate specs
    const runBackground = async () => {
      let motMeta = null;
      if (vehicle.id && vehicleData.registration) {
        const motResult = await fetchAndStoreMotHistory(vehicle.id, vehicleData.registration);
        motMeta = motResult?.vehicleMeta || null;
      }

      // Patch project (and vehicle) with MOT meta when DVLA lookup left fields blank
      if (motMeta) {
        const patchedMake = vehicleData.make || motMeta.make || null;
        const patchedModel = vehicleData.model || motMeta.model || null;
        const patchedYear = vehicleData.year || (motMeta.firstUsedDate || motMeta.manufactureDate
          ? String(new Date(motMeta.firstUsedDate || motMeta.manufactureDate).getFullYear()) : null);
        const patchedFuel = vehicleData.fuelType || motMeta.fuelType || null;

        await query(
          `UPDATE projects SET
             make       = COALESCE(make, $1),
             model      = COALESCE(model, $2),
             year       = COALESCE(year, $3),
             fuel_type  = COALESCE(fuel_type, $4),
             updated_at = now()
           WHERE id = $5`,
          [patchedMake, patchedModel, patchedYear, patchedFuel, project.id]
        );

        if (vehicle.id) {
          await query(
            `UPDATE vehicles SET
               make      = COALESCE(make, $1),
               model     = COALESCE(model, $2),
               year      = COALESCE(year, $3),
               fuel_type = COALESCE(fuel_type, $4),
               updated_at = now()
             WHERE id = $5`,
            [patchedMake, patchedModel, patchedYear, patchedFuel, vehicle.id]
          );
        }

        // Refresh vehicleData for specs generation
        vehicleData.make = patchedMake;
        vehicleData.model = patchedModel;
        vehicleData.year = patchedYear;
        vehicleData.fuelType = patchedFuel;
      }

      const specMake = vehicleData.make;
      const specModel = vehicleData.model;
      if (specMake && specModel && vehicleData.year) {
        const specs = await generateVehicleSpecs({
          make: specMake,
          model: specModel,
          year: vehicleData.year,
          engineCode: vehicleData.engineCode,
          fuelType: vehicleData.fuelType,
          trim: vehicleData.trim,
          engineSize: motMeta?.engineSize,
        });
        if (specs) {
          await query('UPDATE projects SET specs = $1, updated_at = now() WHERE id = $2',
            [JSON.stringify(specs), project.id]);
        }
      }
    };
    runBackground().catch(() => {});

    return res.json(toProject(project, [], [], vehicleHistory));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to create project' });
  }
});

router.get('/:projectId', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  const project = rows[0];
  const [{ rows: history }, { rows: confirmedFixes }, vehicleHistory, motData] = await Promise.all([
    query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
    project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
    getMotData(project.vehicle_id),
  ]);

  // Write back make/model/year from motVehicleMeta if still missing — closes the creation-time sync gap
  const meta = motData.motVehicleMeta;
  if (meta && (!project.make || !project.model)) {
    const m = { make: project.make || meta.make || null, model: project.model || meta.model || null,
                 year: project.year || (meta.firstUsedDate || meta.manufactureDate
                   ? String(new Date(meta.firstUsedDate || meta.manufactureDate).getFullYear()) : null),
                 fuel_type: project.fuel_type || meta.fuelType || null };
    project.make = m.make; project.model = m.model; project.year = m.year; project.fuel_type = m.fuel_type;
    query(`UPDATE projects SET make=COALESCE(make,$1), model=COALESCE(model,$2),
             year=COALESCE(year,$3), fuel_type=COALESCE(fuel_type,$4), updated_at=now() WHERE id=$5`,
      [m.make, m.model, m.year, m.fuel_type, project.id]).catch(() => {});
  }

  return res.json(toProject(project, history, confirmedFixes, vehicleHistory, motData.motTests, motData.motVehicleMeta));
});

router.patch('/:projectId/vehicle', requireAuth, async (req, res) => {
  try {
    if (!await canAccessProject(req.params.projectId, req.user)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
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

    const [{ rows: history }, { rows: confirmedFixes }, vehicleHistory, motData] = await Promise.all([
      query('SELECT * FROM project_history WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
      query('SELECT * FROM confirmed_suggestions WHERE project_id = $1 ORDER BY created_at ASC', [project.id]),
      project.vehicle_id ? getVehicleHistory(project.vehicle_id) : Promise.resolve(null),
      getMotData(project.vehicle_id),
    ]);

    // specs cleared by UPDATE above — Quick Reference tab will trigger regen on next open
    return res.json(toProject(updated[0], history, confirmedFixes, vehicleHistory, motData.motTests, motData.motVehicleMeta));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to update vehicle' });
  }
});

router.post('/:projectId/specs', requireAuth, async (req, res) => {
  try {
    if (!await canAccessProject(req.params.projectId, req.user)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = rows[0];

    if (project.specs) return res.json(project.specs);

    const motData = await getMotData(project.vehicle_id);
    const motMeta = motData.motVehicleMeta;

    const vehicle = [project.make || motMeta?.make, project.model || motMeta?.model, project.year].filter(Boolean).join(' ');
    if (!vehicle) return res.status(400).json({ error: 'Project has no vehicle data to generate specs for' });

    const specs = await generateVehicleSpecs({
      make: project.make || motMeta?.make,
      model: project.model || motMeta?.model,
      year: project.year,
      engineCode: project.engine_code,
      fuelType: project.fuel_type || motMeta?.fuelType,
      trim: project.trim,
      engineSize: motMeta?.engineSize,
    });

    if (!specs) return res.status(502).json({ error: 'Specs could not be generated — AI returned an unexpected response' });

    await query('UPDATE projects SET specs = $1, updated_at = now() WHERE id = $2', [JSON.stringify(specs), project.id]);

    return res.json(specs);
  } catch (err) {
    console.error('[specs route]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:projectId/clear', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  await query('DELETE FROM project_history WHERE project_id = $1', [req.params.projectId]);
  await query('DELETE FROM confirmed_suggestions WHERE project_id = $1', [req.params.projectId]);
  await query('UPDATE projects SET updated_at = now() WHERE id = $1', [req.params.projectId]);

  return res.json({ cleared: true });
});

router.post('/:projectId/close', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE projects SET closed = true, active = false, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.projectId]
  );
  return res.json(toProject(rows[0], []));
});

router.post('/:projectId/reopen', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE projects SET closed = false, active = true, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.projectId]
  );
  return res.json(toProject(rows[0], []));
});

router.post('/:projectId/archive', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE projects SET archived_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.projectId]
  );
  return res.json(toProject(rows[0]));
});

router.post('/:projectId/restore', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE projects SET archived_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.projectId]
  );
  return res.json(toProject(rows[0]));
});

router.post('/:projectId/mot/refresh', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  const project = rows[0];
  if (!project.vehicle_id || !project.registration) {
    return res.status(400).json({ error: 'No registration on this project' });
  }
  const result = await fetchAndStoreMotHistory(project.vehicle_id, project.registration);
  return res.json({ motTests: result?.tests || null, motVehicleMeta: result?.vehicleMeta || null });
});

module.exports = router;
