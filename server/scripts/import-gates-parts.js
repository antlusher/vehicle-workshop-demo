#!/usr/bin/env node
/**
 * Import Gates fitment data from JSON (produced by parse-gates-pdf.py) into:
 *   1. gates_fitment  — one row per fitment record (engine code × part)
 *   2. parts_catalogue — one row per unique Gates article number
 *
 * Usage:
 *   node server/scripts/import-gates-parts.js [--dry-run] [--json=server/data/gates-parts.json]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { pool } = require('../services/db');

const DRY_RUN  = process.argv.includes('--dry-run');
const jsonArg  = process.argv.find(a => a.startsWith('--json='));
const JSON_PATH = jsonArg
  ? jsonArg.split('=')[1]
  : path.join(__dirname, '../data/gates-parts.json');

// Human-readable title for each part_type (used in parts_catalogue.title)
const PART_TYPE_TITLE = {
  timing_belt_kit_wp:           'PowerGrip™ Timing Belt Kit + Water Pump',
  timing_belt_kit:              'PowerGrip™ Timing Belt Kit',
  timing_belt:                  'PowerGrip™ Timing Belt',
  timing_belt_tensioner:        'PowerGrip™ Tensioner Pulley',
  timing_belt_guide:            'PowerGrip™ Guide Pulley',
  timing_chain_kit:             'Timing Chain Kit',
  timing_belt_kit_budget:       'RoadMax™ Value Line Timing Belt Kit',
  drive_belt_kit:               'Micro-V® Drive Belt Kit',
  drive_belt:                   'Micro-V® Drive Belt',
  drive_belt_stretch:           'Micro-V® Stretch Fit™ Drive Belt',
  v_belt:                       'FleetRunner™ V-Belt',
  drive_belt_tensioner:         'DriveAlign™ Tensioner Unit',
  drive_belt_idler:             'DriveAlign™ Idler Pulley',
  overrunning_alternator_pulley:'DriveAlign™ Overrunning Alternator Pulley',
  torsional_vibration_damper:   'DriveAlign™ Torsional Vibration Damper',
  water_pump:                   'Water Pump',
};

async function run() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`JSON not found: ${JSON_PATH}`);
    console.error('Run parse-gates-pdf.py first.');
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`Loaded ${records.length} fitment records from ${JSON_PATH}`);

  if (DRY_RUN) {
    console.log('[DRY RUN — no DB writes]');
  }

  // ── 1. Truncate + insert gates_fitment ──────────────────────────────────────
  if (!DRY_RUN) {
    await pool.query('TRUNCATE TABLE gates_fitment RESTART IDENTITY CASCADE');
    console.log('Truncated gates_fitment');
  }

  let inserted = 0;
  for (const r of records) {
    const yfy = r.year_from?.year  ?? null;
    const yfm = r.year_from?.month ?? null;
    const yty = r.year_to?.year    ?? null;
    const ytm = r.year_to?.month   ?? null;

    if (DRY_RUN) {
      inserted++;
      continue;
    }

    await pool.query(
      `INSERT INTO gates_fitment
         (make, model, engine_codes, stroke, kw,
          year_from_year, year_from_month, year_to_year, year_to_month,
          part_type, article_group, article_no, brand, powered_units, comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        r.make, r.model, r.engine_codes, r.stroke, r.kw,
        yfy, yfm, yty, ytm,
        r.part_type, r.article_group, r.article_no, r.brand,
        r.powered_units || null, r.comments || null,
      ]
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} fitment rows`);

  // ── 2. Upsert into parts_catalogue ─────────────────────────────────────────
  // Group by article_no: collect all engine codes, makes, models
  const byArticle = new Map();
  for (const r of records) {
    if (!byArticle.has(r.article_no)) {
      byArticle.set(r.article_no, {
        article_no:   r.article_no,
        part_type:    r.part_type,
        article_group: r.article_group,
        brand:        r.brand,
        makes:        new Set(),
        models:       new Set(),
        engine_codes: new Set(),
      });
    }
    const entry = byArticle.get(r.article_no);
    entry.makes.add(r.make);
    if (r.model) entry.models.add(r.model);
    r.engine_codes.forEach(ec => entry.engine_codes.add(ec));
  }

  if (!DRY_RUN) {
    await pool.query(`DELETE FROM parts_catalogue WHERE source = 'gates'`);
    console.log('Cleared existing Gates entries from parts_catalogue');
  }

  let upserted = 0;
  for (const entry of byArticle.values()) {
    const title = PART_TYPE_TITLE[entry.part_type] || entry.article_group;
    const makes  = [...entry.makes];
    const models = [...entry.models];
    const codes  = [...entry.engine_codes];

    if (DRY_RUN) {
      console.log(`  [DRY] ${entry.article_no} | ${title} | engines: ${codes.slice(0,4).join(',')}`);
      upserted++;
      continue;
    }

    await pool.query(
      `INSERT INTO parts_catalogue
         (part_number, brand, title, category,
          compatible_makes, compatible_models, compatible_engine_codes,
          cost_price, list_price, in_stock, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,false,'gates')`,
      [entry.article_no, entry.brand, title, entry.part_type, makes, models, codes]
    );
    upserted++;
  }

  console.log(`Upserted ${upserted} rows in parts_catalogue`);
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); }).finally(() => pool.end());
