#!/usr/bin/env node
/**
 * link-engine-families.js
 *
 * Wires engine_codes.family_id by matching codes listed in
 * engine_families.engine_codes JSONB against engine_codes rows.
 *
 * Also back-fills engine_families from engine_codes: any code whose
 * engine_codes row has a name that contains a known family/codename
 * will be linked even if not listed in the JSONB array.
 *
 * Safe to re-run.
 *
 * Usage:
 *   node server/scripts/link-engine-families.js
 *   node server/scripts/link-engine-families.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const { pool } = require('../services/db');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  // ── Step 1: Link by explicit code list in engine_families.engine_codes ──────
  // For each family that has codes listed, find matching engine_codes rows and set family_id.

  const { rows: families } = await pool.query(`
    SELECT id, make, family_name, codename,
           jsonb_array_elements(engine_codes) ->> 'code' AS code
    FROM engine_families
    WHERE jsonb_array_length(engine_codes) > 0
  `);

  console.log(`Processing ${families.length} family–code pairs from engine_families...`);

  let linked = 0, notFound = 0;

  for (const row of families) {
    if (!row.code) continue;

    if (DRY_RUN) {
      const { rows } = await pool.query(
        `SELECT id, make FROM engine_codes WHERE UPPER(code) = UPPER($1) LIMIT 3`,
        [row.code]
      );
      if (rows.length) { linked++; console.log(`  WOULD link: ${row.code} (${rows.map(r=>r.make).join('/')}) → family ${row.id} (${row.family_name})`); }
      else notFound++;
      continue;
    }

    // Match by code only — VW Group engines appear across makes (audi/volkswagen/skoda)
    const result = await pool.query(
      `UPDATE engine_codes
       SET family_id = $1
       WHERE UPPER(code) = UPPER($2)
         AND (family_id IS NULL OR family_id = $1)
       RETURNING id`,
      [row.id, row.code]
    );
    if (result.rowCount > 0) linked++;
    else notFound++;
  }

  console.log(`  Linked: ${linked}, not in engine_codes yet: ${notFound}`);

  // ── Step 2: Back-fill via name matching ────────────────────────────────────
  // For codes that still have no family_id, try matching the engine's `name`
  // field against family_name and codename using pg_trgm similarity or ILIKE.

  console.log(`\nBack-filling unlinked codes by name matching...`);

  const { rows: unlinked } = await pool.query(`
    SELECT ec.id, ec.make, ec.code, ec.name
    FROM engine_codes ec
    WHERE ec.family_id IS NULL
      AND ec.name IS NOT NULL
    LIMIT 5000
  `);

  console.log(`  ${unlinked.length} engine_codes rows without a family_id`);

  const { rows: allFamilies } = await pool.query(`
    SELECT id, make, family_name, codename
    FROM engine_families
  `);

  let nameLinked = 0;
  for (const ec of unlinked) {
    const nameLower = (ec.name || '').toLowerCase();

    const match = allFamilies.find(f => {
      if (f.make && f.make !== ec.make) return false;
      const fname = (f.family_name || '').toLowerCase();
      const cname = (f.codename || '').toLowerCase();
      return (fname.length > 3 && nameLower.includes(fname)) ||
             (cname.length > 3 && nameLower.includes(cname));
    });

    if (!match) continue;

    if (DRY_RUN) {
      console.log(`  WOULD name-link: ${ec.make}/${ec.code} "${ec.name}" → ${match.family_name}`);
      nameLinked++;
      continue;
    }

    await pool.query(
      `UPDATE engine_codes SET family_id = $1 WHERE id = $2 AND family_id IS NULL`,
      [match.id, ec.id]
    );
    nameLinked++;
  }

  console.log(`  Name-matched: ${nameLinked}`);

  // ── Summary ────────────────────────────────────────────────────────────────

  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE family_id IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE family_id IS NULL)     AS unlinked,
      COUNT(*)                                       AS total
    FROM engine_codes
  `);

  console.log(`\nengine_codes: ${summary[0].linked} linked, ${summary[0].unlinked} unlinked (${summary[0].total} total)`);

  if (!DRY_RUN) {
    // Show top families with linked codes
    const { rows: topFamilies } = await pool.query(`
      SELECT ef.make, ef.family_name, ef.codename, COUNT(ec.id) AS code_count
      FROM engine_families ef
      JOIN engine_codes ec ON ec.family_id = ef.id
      GROUP BY ef.id, ef.make, ef.family_name, ef.codename
      ORDER BY code_count DESC
      LIMIT 20
    `);
    if (topFamilies.length) {
      console.log('\nTop linked families:');
      topFamilies.forEach(r =>
        console.log(`  ${r.make} / ${r.family_name}${r.codename && r.codename !== r.family_name ? ` (${r.codename})` : ''}: ${r.code_count} codes`)
      );
    }
  }

  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
