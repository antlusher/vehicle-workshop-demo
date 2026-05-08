#!/usr/bin/env node
/**
 * seed-vrns.js
 *
 * Generates every valid UK current-format VRN (LL YY LLL) that contains
 * the letter 'A', queries UKVD for each one, and saves any hit to the
 * vehicles + vehicle_registrations tables.
 *
 * Usage:
 *   node server/scripts/seed-vrns.js
 *
 * Progress is saved to server/scripts/seed-progress.json after every
 * LOG_INTERVAL requests so the script can be safely stopped and resumed.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const axios  = require('axios');
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const PROGRESS_FILE = path.join(__dirname, 'seed-progress.json');
const DELAY_MS      = 250;   // 4 req/sec — conservative to avoid rate limiting
const LOG_INTERVAL  = 100;   // save progress + print stats every N requests
const DAILY_LIMIT   = 1000;  // UKVD cap

const UKVD_API_KEY      = process.env.UKVD_API_KEY;
const UKVD_PACKAGE_NAME = process.env.UKVD_PACKAGE_NAME || 'VehicleDetails';
const UKVD_BASE_URL     = 'https://uk.api.vehicledataglobal.com/r2/lookup';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── VRN generation ────────────────────────────────────────────────────────────

// Valid letters in UK current format (A-Z, excluding I and Q)
const LETTERS = 'ABCDEFGHJKLMNOPRSTUVWXYZ'.split('');

// Age identifiers — 2016 to 2020 only (March + September plates)
const YEARS = [
  '16','17','18','19','20',   // March 2016–2020
  '65','66','67','68','69',   // September 2016–2020
];

// Yields every LL YY LLL combination that contains at least one 'A'
function* generateVrns() {
  for (const year of YEARS) {
    for (const l1 of LETTERS) {
      for (const l2 of LETTERS) {
        for (const s1 of LETTERS) {
          for (const s2 of LETTERS) {
            for (const s3 of LETTERS) {
              const vrn = `${l1}${l2}${year}${s1}${s2}${s3}`;
              if (vrn.includes('A')) yield vrn;
            }
          }
        }
      }
    }
  }
}

// ── Progress ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const state = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      // Reset daily counter if it's a new day
      if (state.date !== today()) {
        state.date = today();
        state.todayCount = 0;
      }
      return state;
    }
  } catch {}
  return { lastVrn: null, processed: 0, found: 0, date: today(), todayCount: 0 };
}

function saveProgress(state) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// ── UKVD ──────────────────────────────────────────────────────────────────────

async function queryUkvd(vrn) {
  try {
    const { data } = await axios.get(UKVD_BASE_URL, {
      params: { ApiKey: UKVD_API_KEY, PackageName: UKVD_PACKAGE_NAME, Vrm: vrn },
      timeout: 8000,
    });
    const statusCode = data.ResponseInformation?.StatusCode ?? data.StatusCode;
    if (statusCode !== 0 && !data.ResponseInformation?.IsSuccessStatusCode) return null;
    const results = data.Results?.[0] || data.Results || data;
    if (!results || (!results.VehicleDetails && !results.ModelDetails)) return null;
    return results;
  } catch {
    return null;
  }
}

// ── Database ──────────────────────────────────────────────────────────────────

async function saveVehicle(vrn, data) {
  const vi  = data?.VehicleDetails?.VehicleIdentification || {};
  const mi  = data?.ModelDetails?.ModelIdentification    || {};
  const pt  = data?.ModelDetails?.Powertrain             || {};
  const bd  = data?.ModelDetails?.BodyDetails            || {};
  const dt  = data?.VehicleDetails?.DvlaTechnicalDetails || {};

  const make     = mi.Make  || vi.DvlaMake  || null;
  const model    = mi.Model || mi.Range || vi.DvlaModel || null;
  const year     = vi.YearOfManufacture ? String(vi.YearOfManufacture) : null;
  const vin      = vi.Vin && vi.Vin !== 'Permission Required' ? vi.Vin : null;
  const fuelType = pt.FuelType  || vi.DvlaFuelType  || null;
  const bodyType = bd.BodyStyle || vi.DvlaBodyType  || null;
  const engineCode = dt.EngineNumber || null;
  const source   = data ? 'ukvd-seed' : 'ukvd-seed-empty';

  const client = await pool.connect();
  try {
    // Check if already exists by VIN
    if (vin) {
      const { rows } = await client.query('SELECT id FROM vehicles WHERE vin = $1', [vin]);
      if (rows.length) {
        // Ensure the registration is linked
        await client.query(
          `INSERT INTO vehicle_registrations (vehicle_id, registration)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [rows[0].id, vrn]
        );
        return 'existing';
      }
    }

    // Check if already exists by registration
    const { rows: regRows } = await client.query(
      'SELECT id FROM vehicles WHERE registration = $1', [vrn]
    );
    if (regRows.length) return 'existing';

    // Insert new vehicle
    const { rows: inserted } = await client.query(
      `INSERT INTO vehicles
         (registration, vin, make, model, year, engine_code, fuel_type, body_type, source, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [vrn, vin, make, model, year, engineCode, fuelType, bodyType, source, data ? JSON.stringify(data) : null]
    );

    const vehicleId = inserted[0].id;

    // Link registration record
    await client.query(
      `INSERT INTO vehicle_registrations (vehicle_id, registration)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [vehicleId, vrn]
    );

    return 'inserted';
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!UKVD_API_KEY) {
    console.error('ERROR: UKVD_API_KEY not set in server/.env');
    process.exit(1);
  }

  const state = loadProgress();
  console.log('─────────────────────────────────────────');
  console.log('  Ask Bob — VRN seed script');
  console.log('─────────────────────────────────────────');
  console.log(`  Processed so far : ${state.processed}`);
  console.log(`  Vehicles found   : ${state.found}`);
  console.log(`  Today (${state.date})  : ${state.todayCount} / ${DAILY_LIMIT}`);
  if (state.lastVrn) console.log(`  Resuming after  : ${state.lastVrn}`);
  console.log('─────────────────────────────────────────\n');

  if (state.todayCount >= DAILY_LIMIT) {
    console.log(`Daily limit of ${DAILY_LIMIT} already reached for ${state.date}. Run again tomorrow.`);
    await pool.end();
    return;
  }

  // Skip ahead to resume position
  let skip = !!state.lastVrn;

  for (const vrn of generateVrns()) {
    if (skip) {
      if (vrn === state.lastVrn) skip = false;
      continue;
    }

    // Check daily limit before each request
    if (state.todayCount >= DAILY_LIMIT) {
      saveProgress(state);
      console.log(`\nDaily limit of ${DAILY_LIMIT} reached. Resume tomorrow.`);
      console.log(`[${state.processed} processed / ${state.found} found]  last: ${vrn}`);
      break;
    }

    state.processed++;
    state.todayCount++;
    state.lastVrn = vrn;

    const data = await queryUkvd(vrn);

    try {
      const result = await saveVehicle(vrn, data);
      if (result === 'inserted') {
        if (data) {
          const make  = data.ModelDetails?.ModelIdentification?.Make  || '?';
          const model = data.ModelDetails?.ModelIdentification?.Model || '?';
          state.found++;
          console.log(`✓ ${vrn}  ${make} ${model}`);
        } else {
          console.log(`  ${vrn}  saved (no UKVD data)`);
        }
      }
    } catch (err) {
      console.error(`  ${vrn}  DB error: ${err.message}`);
    }

    if (state.processed % LOG_INTERVAL === 0) {
      saveProgress(state);
      console.log(`\n[${state.processed} processed / ${state.found} found / ${state.todayCount} today]  last: ${vrn}\n`);
    }

    await sleep(DELAY_MS);
  }

  saveProgress(state);
  console.log(`\n✓ Complete — ${state.processed} VRNs tried, ${state.found} vehicles saved.`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
