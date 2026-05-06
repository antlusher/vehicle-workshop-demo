const { query } = require('./db');

/**
 * Find or create a canonical vehicle record by VIN (preferred) or registration.
 * Updates vehicle data if found but stale. Creates vehicle_registrations entry for new VRNs.
 * Returns the vehicles row.
 */
async function findOrCreateVehicle(vehicleData) {
  const { vin, registration, make, model, year, engineCode, fuelType, trim, bodyType, source } = vehicleData;

  // 1. Match by VIN — the definitive physical car identifier
  if (vin) {
    const { rows } = await query('SELECT * FROM vehicles WHERE vin = $1', [vin]);
    if (rows.length) {
      const vehicle = rows[0];
      // Refresh vehicle data from latest lookup
      await query(
        `UPDATE vehicles SET make=$1, model=$2, year=$3, engine_code=$4, fuel_type=$5,
         trim=$6, body_type=$7, source=$8, updated_at=now() WHERE id=$9`,
        [make, model, year, engineCode, fuelType, trim, bodyType, source, vehicle.id]
      );
      // Record new registration if it has changed (private plate transfer)
      if (registration) {
        await upsertRegistration(vehicle.id, registration);
      }
      return { ...vehicle, make, model, year, engine_code: engineCode, fuel_type: fuelType };
    }
  }

  // 2. Match by current registration if no VIN match
  if (registration) {
    const { rows } = await query(
      `SELECT v.* FROM vehicles v
       JOIN vehicle_registrations vr ON v.id = vr.vehicle_id
       WHERE vr.registration = $1 AND vr.assigned_to IS NULL`,
      [registration]
    );
    if (rows.length) {
      const vehicle = rows[0];
      // If we now have a VIN and the record didn't, update it
      if (vin && !vehicle.vin) {
        await query('UPDATE vehicles SET vin=$1, updated_at=now() WHERE id=$2', [vin, vehicle.id]);
      }
      return vehicle;
    }
  }

  // 3. Create new vehicle record
  const { rows: newRows } = await query(
    `INSERT INTO vehicles (vin, registration, make, model, year, engine_code, fuel_type, trim, body_type, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [vin || null, registration || null, make, model, year, engineCode, fuelType, trim, bodyType, source]
  );
  const newVehicle = newRows[0];

  if (registration) {
    await query(
      'INSERT INTO vehicle_registrations (vehicle_id, registration) VALUES ($1, $2)',
      [newVehicle.id, registration]
    );
  }

  return newVehicle;
}

/**
 * Ensure a registration is recorded as current for this vehicle.
 * If the vehicle has a different current registration, close it out (private plate transfer).
 */
async function upsertRegistration(vehicleId, registration) {
  const { rows: existing } = await query(
    'SELECT * FROM vehicle_registrations WHERE vehicle_id = $1 AND assigned_to IS NULL',
    [vehicleId]
  );

  if (existing.length) {
    if (existing[0].registration.toUpperCase() === registration.toUpperCase()) return; // unchanged
    // Close the old registration — plate has moved
    await query(
      'UPDATE vehicle_registrations SET assigned_to = now() WHERE id = $1',
      [existing[0].id]
    );
  }

  await query(
    'INSERT INTO vehicle_registrations (vehicle_id, registration) VALUES ($1, $2)',
    [vehicleId, registration.toUpperCase()]
  );
}

/**
 * Get all confirmed fixes for a vehicle across all workshops, with timeline of jobs.
 * vehicleId is the canonical vehicles.id.
 */
async function getVehicleHistory(vehicleId) {
  const [fixRows, projectRows, regRows] = await Promise.all([
    query(
      `SELECT cs.id, cs.text, cs.created_at,
              p.id as project_id, p.registration_snapshot, p.registration,
              p.created_at as job_opened_at
       FROM confirmed_suggestions cs
       JOIN projects p ON cs.project_id = p.id
       WHERE p.vehicle_id = $1
       ORDER BY cs.created_at DESC`,
      [vehicleId]
    ),
    query(
      `SELECT p.id, p.registration_snapshot, p.registration, p.created_at, p.closed, p.active,
              COUNT(cs.id) as confirmed_fix_count,
              COUNT(ph.id) FILTER (WHERE ph.role = 'ai') as ai_message_count
       FROM projects p
       LEFT JOIN confirmed_suggestions cs ON cs.project_id = p.id
       LEFT JOIN project_history ph ON ph.project_id = p.id
       WHERE p.vehicle_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [vehicleId]
    ),
    query(
      `SELECT registration, assigned_from, assigned_to
       FROM vehicle_registrations
       WHERE vehicle_id = $1
       ORDER BY assigned_from ASC`,
      [vehicleId]
    ),
  ]);

  return {
    confirmedFixes: fixRows.rows.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.created_at,
      jobId: r.project_id,
    })),
    jobTimeline: projectRows.rows.map((r) => ({
      id: r.id,
      registration: r.registration_snapshot || r.registration,
      openedAt: r.created_at,
      closed: r.closed,
      confirmedFixCount: parseInt(r.confirmed_fix_count),
      aiMessageCount: parseInt(r.ai_message_count),
    })),
    registrationHistory: regRows.rows.map((r) => ({
      registration: r.registration,
      assignedFrom: r.assigned_from,
      assignedTo: r.assigned_to,
    })),
  };
}

module.exports = { findOrCreateVehicle, upsertRegistration, getVehicleHistory };
