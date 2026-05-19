#!/usr/bin/env node
/**
 * import-reference-data.js — imports scraped JSON files into the database
 *
 * Tables: dtc_codes, engine_codes, vehicle_specs
 * Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE
 *
 * Usage:
 *   node server/scripts/import-reference-data.js          # all three datasets
 *   node server/scripts/import-reference-data.js --dtc    # DTC codes only
 *   node server/scripts/import-reference-data.js --engines
 *   node server/scripts/import-reference-data.js --vehicles
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const fs   = require('fs');
const path = require('path');
const { pool } = require('../services/db');

const DATA = path.join(__dirname, '../data');

const args = process.argv.slice(2);
const ALL  = args.length === 0;
const DO_DTC      = ALL || args.includes('--dtc');
const DO_ENGINES  = ALL || args.includes('--engines');
const DO_VEHICLES = ALL || args.includes('--vehicles');

// ─── Helpers ────────────────────────────────────────────────────────────────

function load(filename) {
  const p = path.join(DATA, filename);
  if (!fs.existsSync(p)) { console.warn(`  WARNING: ${p} not found — skipping`); return null; }
  return JSON.parse(fs.readFileSync(p));
}

async function batchInsert(label, rows, insertFn, batchSize = 200) {
  console.log(`\n[${label}] ${rows.length} rows to import...`);
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(r => insertFn(r).catch(() => null)));
    results.forEach(r => { if (r?.rowCount > 0) inserted++; else skipped++; });
    process.stdout.write('.');
  }
  console.log(`\n  Done — ${inserted} inserted, ${skipped} already existed`);
}

// ─── DTC Codes ──────────────────────────────────────────────────────────────

async function importDtc() {
  const base    = load('dtc-codes.json');
  const detail  = load('scraped-dtc-detail.json');
  if (!base) return;

  // Index detail by code for O(1) lookup
  const detailMap = {};
  if (detail) detail.forEach(d => { detailMap[d.code] = d; });

  const rows = base.map(({ code, description, system }) => {
    const d = detailMap[code] || {};
    return {
      code,
      description,
      system,
      fault_location: d.faultLocation  || null,
      probable_cause: d.probableCause  || null,
      meaning:        d.meaning        || null,
      causes:         d.causes         || null,
      symptoms:       d.symptoms       || null,
      how_to:         d.howTo          || null,
      related_codes:  d.relatedCodes   || [],
    };
  });

  await batchInsert('DTC codes', rows, (r) =>
    pool.query(
      `INSERT INTO dtc_codes
         (code, description, system, fault_location, probable_cause,
          meaning, causes, symptoms, how_to, related_codes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (code) DO UPDATE SET
         description    = EXCLUDED.description,
         system         = EXCLUDED.system,
         fault_location = EXCLUDED.fault_location,
         probable_cause = EXCLUDED.probable_cause,
         meaning        = EXCLUDED.meaning,
         causes         = EXCLUDED.causes,
         symptoms       = EXCLUDED.symptoms,
         how_to         = EXCLUDED.how_to,
         related_codes  = EXCLUDED.related_codes`,
      [r.code, r.description, r.system, r.fault_location, r.probable_cause,
       r.meaning, r.causes, r.symptoms, r.how_to, r.related_codes]
    )
  );
}

// ─── Engine Codes ────────────────────────────────────────────────────────────

async function importEngines() {
  const data = load('scraped-enginecodes.json');
  if (!data) return;

  await batchInsert('Engine codes', data, (r) =>
    pool.query(
      `INSERT INTO engine_codes
         (make, code, fuel_type, name, description, specs,
          compatible_vehicles, reliability_summary, reliability_issues,
          faq_items, related_engines, url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (make, code) DO UPDATE SET
         fuel_type           = EXCLUDED.fuel_type,
         name                = EXCLUDED.name,
         description         = EXCLUDED.description,
         specs               = EXCLUDED.specs,
         compatible_vehicles = EXCLUDED.compatible_vehicles,
         reliability_summary = EXCLUDED.reliability_summary,
         reliability_issues  = EXCLUDED.reliability_issues,
         faq_items           = EXCLUDED.faq_items,
         related_engines     = EXCLUDED.related_engines,
         url                 = EXCLUDED.url`,
      [
        r.make,
        r.code,
        r.fuelType            || null,
        r.name                || null,
        r.description         || null,
        JSON.stringify(r.specs               || {}),
        JSON.stringify(r.compatibleVehicles  || []),
        r.reliabilitySummary  || null,
        JSON.stringify(r.reliabilityIssues   || []),
        JSON.stringify(r.faqItems            || []),
        JSON.stringify(r.relatedEngines      || []),
        r.url                 || null,
      ]
    )
  );
}

// ─── Vehicle Specs ────────────────────────────────────────────────────────────

async function importVehicles() {
  const data = load('scraped-vehicles.json');
  if (!data) return;

  await batchInsert('Vehicle specs', data, (r) =>
    pool.query(
      `INSERT INTO vehicle_specs
         (make, model, body_type, year_from, year_to, trim, engine_size, bhp, url, specs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (url) DO UPDATE SET
         make        = EXCLUDED.make,
         model       = EXCLUDED.model,
         body_type   = EXCLUDED.body_type,
         year_from   = EXCLUDED.year_from,
         year_to     = EXCLUDED.year_to,
         trim        = EXCLUDED.trim,
         engine_size = EXCLUDED.engine_size,
         bhp         = EXCLUDED.bhp,
         specs       = EXCLUDED.specs`,
      [
        r.make        || null,
        r.model       || null,
        r.bodyType    || null,
        r.yearFrom    || null,
        r.yearTo      || null,
        r.trim        || null,
        r.engineSize  || null,
        r.bhp         || null,
        r.url         || null,
        JSON.stringify(r.specs || {}),
      ]
    )
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (DO_DTC)      await importDtc();
    if (DO_ENGINES)  await importEngines();
    if (DO_VEHICLES) await importVehicles();

    // Final counts
    console.log('\n── Summary ──────────────────────────────────────────────');
    const counts = await pool.query(`
      SELECT 'dtc_codes'     AS tbl, COUNT(*) FROM dtc_codes
      UNION ALL
      SELECT 'engine_codes'  AS tbl, COUNT(*) FROM engine_codes
      UNION ALL
      SELECT 'vehicle_specs' AS tbl, COUNT(*) FROM vehicle_specs
    `);
    counts.rows.forEach(r => console.log(`  ${r.tbl.padEnd(16)} ${r.count} rows`));

    await pool.end();
    console.log('\nDone.\n');
  } catch (err) {
    console.error(err);
    await pool.end();
    process.exit(1);
  }
})();
