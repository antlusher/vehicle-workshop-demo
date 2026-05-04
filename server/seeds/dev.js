const bcrypt = require('bcrypt');
const { query } = require('../services/db');
const vehicles = require('../data/vehicles.json');

async function seed() {
  const hashedPassword = await bcrypt.hash('demo123', 10);

  await query(
    `INSERT INTO users (id, email, password, role, subscribed, session_active)
     VALUES ('00000000-0000-0000-0000-000000000001', $1, $2, 'tech', true, false)
     ON CONFLICT (email) DO NOTHING`,
    ['demo@workshop.local', hashedPassword]
  );

  for (const v of vehicles) {
    await query(
      `INSERT INTO vehicles (registration, vin, make, model, year, engine_code, fuel_type, trim, body_type, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seed')
       ON CONFLICT DO NOTHING`,
      [v.registration || null, v.vin || null, v.make || null, v.model || null,
       v.year || null, v.engineCode || null, v.fuelType || null, v.trim || null, v.bodyType || null]
    );
  }

  console.log('Seed complete');
}

seed().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
