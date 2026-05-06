require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { query, pool } = require('../services/db');
const { findOrCreateVehicle } = require('../services/vehicleService');

async function run() {
  console.log('Backfilling vehicle records from existing projects...');

  const { rows: projects } = await query(
    `SELECT id, registration, vin, make, model, year, engine_code, fuel_type, trim, body_type, source
     FROM projects
     WHERE vehicle_id IS NULL
     ORDER BY created_at ASC`
  );

  console.log(`Found ${projects.length} projects without vehicle_id`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const p of projects) {
    if (!p.registration && !p.vin) {
      skipped++;
      continue;
    }

    try {
      const vehicle = await findOrCreateVehicle({
        vin: p.vin,
        registration: p.registration,
        make: p.make,
        model: p.model,
        year: p.year,
        engineCode: p.engine_code,
        fuelType: p.fuel_type,
        trim: p.trim,
        bodyType: p.body_type,
        source: p.source || 'backfill',
      });

      const isNew = vehicle.created_at > new Date(Date.now() - 5000) ? 'new' : 'existing';
      if (isNew === 'new') created++;
      else linked++;

      await query(
        `UPDATE projects SET vehicle_id = $1, registration_snapshot = $2 WHERE id = $3`,
        [vehicle.id, p.registration || null, p.id]
      );

      console.log(`  Project ${p.id}: linked to vehicle ${vehicle.id} (${isNew}) [${p.registration || p.vin}]`);
    } catch (err) {
      console.error(`  Project ${p.id}: ERROR — ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${created} vehicles created, ${linked} projects linked to existing vehicles, ${skipped} skipped`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
