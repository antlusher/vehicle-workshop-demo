#!/usr/bin/env node
// Fetches/refreshes MOT history from DVSA for all vehicles with a registration.
// Usage:
//   node refresh-mot-history.js            -- all vehicles
//   node refresh-mot-history.js AB12CDE    -- single registration
//   node refresh-mot-history.js --force    -- re-fetch even if already stored

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { fetchAndStoreMotHistory } = require('../services/motService');
const { query } = require('../services/db');

const args = process.argv.slice(2);
const force = args.includes('--force');
const singleReg = args.find((a) => !a.startsWith('--'))?.toUpperCase().replace(/\s+/g, '');

async function run() {
  let rows;
  if (singleReg) {
    const { rows: r } = await query(
      `SELECT v.id, vr.registration
       FROM vehicles v
       JOIN vehicle_registrations vr ON vr.vehicle_id = v.id
       WHERE vr.registration = $1`,
      [singleReg]
    );
    rows = r;
  } else {
    const { rows: r } = await query(
      `SELECT v.id, vr.registration
       FROM vehicles v
       JOIN vehicle_registrations vr ON vr.vehicle_id = v.id
       WHERE vr.registration IS NOT NULL
       ${force ? '' : 'AND v.mot_fetched_at IS NULL'}
       GROUP BY v.id, vr.registration`
    );
    rows = r;
  }

  if (!rows.length) {
    console.log(force ? 'No vehicles found.' : 'All vehicles already have MOT data. Use --force to re-fetch.');
    process.exit(0);
  }

  console.log(`Fetching MOT history for ${rows.length} vehicle(s)...\n`);

  for (const row of rows) {
    process.stdout.write(`  ${row.registration.padEnd(12)} `);
    try {
      const result = await fetchAndStoreMotHistory(row.id, row.registration);
      if (result === null) {
        console.log('no data (404 or API unavailable)');
      } else {
        console.log(`${result.tests.length} test(s) stored`);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\nDone.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
