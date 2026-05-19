#!/usr/bin/env node
/**
 * import-engine-families.js
 *
 * Populates engine_families from two sources:
 *   1. Wikipedia wiki JSON files  — auto-populated from "Also called" infobox field
 *   2. MANUAL_FAMILIES below      — hand-curated entries with specific engine codes
 *
 * Safe to re-run — uses ON CONFLICT DO UPDATE.
 *
 * Usage:
 *   node server/scripts/import-engine-families.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const fs   = require('fs');
const path = require('path');
const { pool } = require('../services/db');

const WIKI_DIR = path.join(__dirname, '../data/wiki');

// ─── Manual entries ────────────────────────────────────────────────────────
// Add known marketing-name → codename → code mappings here.
// engine_codes: array of { code, drivetrain?, notes? }

const MANUAL_FAMILIES = [
  {
    make:        'ford',
    family_name: 'EcoBlue',
    codename:    'Panther',
    also_known_as: ['Ford EcoBlue TDCi', 'Ford TDCI'],
    wiki_title:  'Ford EcoBlue',
    notes:       'Ford 2.0L diesel engine family, replaced the Duratorq TDCi',
    engine_codes: [
      // FWD variants
      { code: 'BJFA', drivetrain: 'FWD' },
      { code: 'BJFB', drivetrain: 'FWD' },
      { code: 'BKFB', drivetrain: 'FWD' },
      { code: 'YLF6', drivetrain: 'FWD' },
      { code: 'YLFA', drivetrain: 'FWD' },
      { code: 'YLFB', drivetrain: 'FWD' },
      { code: 'YLFS', drivetrain: 'FWD' },
      { code: 'YMF6', drivetrain: 'FWD' },
      { code: 'YMFA', drivetrain: 'FWD' },
      { code: 'YMFB', drivetrain: 'FWD' },
      { code: 'YMFS', drivetrain: 'FWD' },
      { code: 'YNF6', drivetrain: 'FWD' },
      { code: 'YNFA', drivetrain: 'FWD' },
      { code: 'YNFS', drivetrain: 'FWD' },
      // RWD variants
      { code: 'BLHA', drivetrain: 'RWD' },
      { code: 'BLRA', drivetrain: 'RWD' },
      { code: 'YLR6', drivetrain: 'RWD' },
      { code: 'YMHA', drivetrain: 'RWD' },
      { code: 'YMR6', drivetrain: 'RWD' },
      { code: 'YMRA', drivetrain: 'RWD' },
      { code: 'YNR6', drivetrain: 'RWD' },
      { code: 'YNRA', drivetrain: 'RWD' },
      { code: 'BCFB', drivetrain: 'RWD' },
      { code: 'BJRA', drivetrain: 'RWD' },
      { code: 'BKFA', drivetrain: 'RWD' },
      { code: 'BKRA', drivetrain: 'RWD' },
      { code: 'BLFB', drivetrain: 'RWD' },
    ],
  },
  // ── VW Group EA288 (Gen 2 TDI 2.0) ────────────────────────────────────────
  // Shared across VW, Audi, Seat, Skoda. Replaced EA189 after Dieselgate.
  // Each code = specific power/spec variant; most common in Mk7/Mk7.5 Golf, Passat, Tiguan.
  {
    make:        'volkswagen',
    family_name: 'EA288',
    codename:    'EA288',
    also_known_as: ['VW TDI 2.0', 'Gen 2 TDI', 'MQB TDI'],
    wiki_title:  'Volkswagen EA288 engine',
    notes:       'VW Group 2.0L 4-cyl diesel (EA288). Replaced EA189 after 2015. Used across VW/Audi/Seat/Skoda on MQB platform.',
    engine_codes: [
      // 115 PS variants
      { code: 'CLHA', drivetrain: 'FWD', notes: '115 PS, 320 Nm — Mk7 Golf, Passat B8 (2012–2015)' },
      // 150 PS variants
      { code: 'CRKB', drivetrain: 'FWD', notes: '150 PS, 340 Nm — Mk7 Golf, Passat (Euro 6)' },
      { code: 'CRBC', drivetrain: 'FWD', notes: '150 PS — DSG/auto gearbox variant' },
      { code: 'DCFA', drivetrain: 'FWD', notes: '150 PS — Mk7.5 Golf, Passat B8 refresh' },
      { code: 'DGTE', drivetrain: 'FWD', notes: '150 PS — Euro 6d-TEMP, Tiguan Mk2, T-Roc' },
      { code: 'DFCA', drivetrain: 'FWD', notes: '150 PS — 2019+ refresh, Passat/Tiguan' },
      // 190 PS variants
      { code: 'DDYB', drivetrain: 'FWD', notes: '190 PS, 400 Nm — high-output FWD' },
      { code: 'DFGA', drivetrain: '4WD', notes: '190 PS — 4Motion/4WD variant' },
      { code: 'CUVA', drivetrain: '4WD', notes: '190 PS — Passat B8 4Motion, Skoda Superb 4x4' },
    ],
  },
  // ── Audi EA288 variants (same block, Audi-specific codes) ─────────────────
  {
    make:        'audi',
    family_name: 'EA288',
    codename:    'EA288',
    also_known_as: ['Audi TDI 2.0', 'TFSI 2.0 diesel', 'ultra TDI'],
    wiki_title:  'Volkswagen EA288 engine',
    notes:       'Audi-spec EA288 2.0 TDI. Same block as VW; codes differ by application and market.',
    engine_codes: [
      { code: 'CRLB', drivetrain: 'FWD', notes: '150 PS — A4 B9, A5 (2016+)' },
      { code: 'DETA', drivetrain: 'FWD', notes: '150 PS — A3 8V Mk3 refresh, Q2' },
      { code: 'DDYA', drivetrain: 'FWD', notes: '190 PS — S tronic, A4/A5 B9' },
      { code: 'DETA', drivetrain: '4WD', notes: '150 PS quattro — Q5 FY' },
    ],
  },
  // Add more manual entries here as they're discovered
];

// ─── Auto-populate from Wikipedia "Also called" fields ───────────────────

function loadWikiEntries() {
  if (!fs.existsSync(WIKI_DIR)) return [];
  const entries = [];

  for (const file of fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.json'))) {
    const make = file.replace('_engines_wiki.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(WIKI_DIR, file)));

    for (const engine of (data.engines || [])) {
      const alsoCalled = engine.specs?.['Also called'];
      if (!alsoCalled) continue;

      // Split multi-line "Also called" into individual aliases
      const aliases = alsoCalled
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 100);

      if (!aliases.length) continue;

      entries.push({
        make,
        family_name: engine.title?.replace(/\s*engine$/i, '').trim() || engine.title,
        codename:    null,
        also_known_as: aliases,
        wiki_title:  engine.title,
        wiki_url:    engine.url,
        engine_codes: [],
        notes:       null,
      });
    }
  }

  return entries;
}

// ─── Upsert ────────────────────────────────────────────────────────────────

async function upsert(entry) {
  return pool.query(
    `INSERT INTO engine_families
       (make, family_name, codename, also_known_as, wiki_title, wiki_url, engine_codes, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (make, family_name) DO UPDATE SET
       codename      = COALESCE(EXCLUDED.codename,      engine_families.codename),
       also_known_as = EXCLUDED.also_known_as,
       wiki_title    = COALESCE(EXCLUDED.wiki_title,    engine_families.wiki_title),
       wiki_url      = COALESCE(EXCLUDED.wiki_url,      engine_families.wiki_url),
       engine_codes  = CASE
         WHEN jsonb_array_length(EXCLUDED.engine_codes) > 0 THEN EXCLUDED.engine_codes
         ELSE engine_families.engine_codes
       END,
       notes         = COALESCE(EXCLUDED.notes,         engine_families.notes)`,
    [
      entry.make,
      entry.family_name,
      entry.codename || null,
      entry.also_known_as,
      entry.wiki_title || null,
      entry.wiki_url || null,
      JSON.stringify(entry.engine_codes || []),
      entry.notes || null,
    ]
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  // Need unique constraint for upsert
  await pool.query(`
    ALTER TABLE engine_families
    ADD CONSTRAINT IF NOT EXISTS engine_families_make_name_uq UNIQUE (make, family_name)
  `).catch(() => {}); // ignore if already exists

  const wikiEntries   = loadWikiEntries();
  const allEntries    = [...MANUAL_FAMILIES, ...wikiEntries];

  console.log(`Importing ${MANUAL_FAMILIES.length} manual + ${wikiEntries.length} wiki entries...`);

  let inserted = 0, failed = 0;
  for (const entry of allEntries) {
    try {
      await upsert(entry);
      inserted++;
    } catch (err) {
      console.warn(`  Failed: ${entry.make}/${entry.family_name} — ${err.message}`);
      failed++;
    }
  }

  const { rows } = await pool.query('SELECT COUNT(*) FROM engine_families');
  console.log(`\nDone. ${inserted} upserted, ${failed} failed.`);
  console.log(`engine_families table now has ${rows[0].count} rows.`);

  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
