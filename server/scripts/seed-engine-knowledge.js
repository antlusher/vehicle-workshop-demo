#!/usr/bin/env node
/**
 * seed-engine-knowledge.js
 *
 * Bootstraps the engine knowledge base by enriching common UK market
 * engine codes via Claude. Safe to re-run — skips already enriched codes
 * unless --force is passed.
 *
 * Usage:
 *   node server/scripts/seed-engine-knowledge.js              # skip already enriched
 *   node server/scripts/seed-engine-knowledge.js --force      # re-enrich all
 *   node server/scripts/seed-engine-knowledge.js --force=R9M  # re-enrich one code
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

// db and enrichment must be required AFTER dotenv so DATABASE_URL is set
const { query, pool } = require('../services/db');
const { enrichEngineCode } = require('../services/engineEnrichment');

const DELAY_MS = 2000; // 2s between Claude calls to avoid rate limits

// Parse flags: --force (all) or --force=CODE (single)
const forceArg = process.argv.find((a) => a.startsWith('--force'));
const FORCE_ALL  = forceArg === '--force';
const FORCE_CODE = forceArg?.startsWith('--force=') ? forceArg.split('=')[1].toUpperCase() : null;

// Common UK market engine codes — ordered by workshop frequency
const ENGINE_CODES = [
  // Renault / Nissan / Vauxhall (van & car fleet)
  { code: 'R9M',   make: 'Renault' },   // 1.6 dCi — Trafic, Vivaro, NV300
  { code: 'M9R',   make: 'Renault' },   // 2.0 dCi — Trafic mk2, Vivaro A
  { code: 'G9U',   make: 'Renault' },   // 2.5 dCi — Trafic, Vivaro
  { code: 'K9K',   make: 'Renault' },   // 1.5 dCi — Clio, Megane, Kangoo, Qashqai
  { code: 'M5MT',  make: 'Renault' },   // 1.3 TCe — Clio, Megane
  { code: 'H4Dt',  make: 'Renault' },   // 1.3 TCe (newer)

  // BMW
  { code: 'N47',   make: 'BMW' },       // 2.0d — 1/3/5 Series, X1 (timing chain issue)
  { code: 'N57',   make: 'BMW' },       // 3.0d — 5/6/7 Series, X5
  { code: 'B47',   make: 'BMW' },       // 2.0d — successor to N47
  { code: 'N52',   make: 'BMW' },       // 2.5/3.0i — 3/5 Series
  { code: 'N55',   make: 'BMW' },       // 3.0 TwinPower — 1/3/5 Series, X5
  { code: 'B58',   make: 'BMW' },       // 3.0 TwinPower — newer gen

  // VW Group (diesel)
  { code: 'EA288',  make: 'Volkswagen' }, // 2.0 TDI — Golf, Passat, A4, Leon
  { code: 'EA189',  make: 'Volkswagen' }, // 2.0 TDI — dieselgate engine
  { code: 'CAYC',   make: 'Volkswagen' }, // 1.6 TDI — Polo, Golf, A1, Ibiza
  { code: 'CFHC',   make: 'Volkswagen' }, // 2.0 TDI CR
  { code: 'CLJA',   make: 'Volkswagen' }, // 1.4 TSI

  // VW Group (petrol)
  { code: 'EA888',  make: 'Volkswagen' }, // 1.8/2.0 TSI — Golf GTI, A4, Leon Cupra
  { code: 'EA211',  make: 'Volkswagen' }, // 1.0/1.2/1.4 TSI — Polo, Up, A1

  // PSA / Ford (diesel)
  { code: 'DW10',   make: 'Peugeot' },   // 2.0 HDi — 407, 307, C5, Focus, Transit Connect
  { code: 'DV6',    make: 'Peugeot' },   // 1.6 HDi — 207, 307, Focus, Fiesta
  { code: 'DW8',    make: 'Peugeot' },   // 1.4 HDi — 206, Berlingo
  { code: 'EHH',    make: 'Ford' },      // 1.5 TDCi — Fiesta, Focus
  { code: 'T8',     make: 'Ford' },      // 2.0 EcoBlue — Transit, Focus, Mondeo
  { code: 'PUMA',   make: 'Ford' },      // 2.4 TDCi — Transit

  // Mercedes
  { code: 'OM651',  make: 'Mercedes-Benz' }, // 2.1 CDI — C/E/S Class, Vito, Sprinter
  { code: 'OM654',  make: 'Mercedes-Benz' }, // 2.0 CDI — newer gen
  { code: 'OM626',  make: 'Mercedes-Benz' }, // 1.8 CDI — A/B Class
  { code: 'M274',   make: 'Mercedes-Benz' }, // 2.0T petrol — C/E Class
  { code: 'M276',   make: 'Mercedes-Benz' }, // 3.0 V6 petrol

  // GM / Vauxhall
  { code: 'Z20DTH', make: 'Vauxhall' },  // 2.0 CDTi — Astra, Vectra, Zafira
  { code: 'A20DTH', make: 'Vauxhall' },  // 2.0 CDTi — Astra J, Insignia
  { code: 'Z16XER', make: 'Vauxhall' },  // 1.6 petrol — Astra, Corsa
  { code: 'A14NET', make: 'Vauxhall' },  // 1.4T — Astra J, Corsa D

  // Toyota
  { code: '1ND-TV', make: 'Toyota' },    // 1.4 D4D — Yaris, Auris, Corolla
  { code: '2AD-FHV', make: 'Toyota' },   // 2.2 D4D — Avensis, RAV4
  { code: '1ZR-FE', make: 'Toyota' },    // 1.6 petrol — Auris, Corolla
  { code: '2GR-FE', make: 'Toyota' },    // 3.5 V6 — RAV4, Highlander

  // Volvo
  { code: 'D4204T', make: 'Volvo' },     // 2.0d — V40, S60, XC60
  { code: 'D5244T', make: 'Volvo' },     // 2.4d — S60, V70, XC90

  // Subaru
  { code: 'EJ20T',  make: 'Subaru' },    // 2.0 Turbo — Impreza, Forester, Legacy
  { code: 'EJ257',  make: 'Subaru' },    // 2.5 Turbo — Impreza STI

  // Ford petrol
  { code: 'M1DA',   make: 'Ford' },      // 1.0 EcoBoost — Fiesta, Focus, C-Max
  { code: 'JTDA',   make: 'Ford' },      // 1.5 EcoBoost
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const modeLabel = FORCE_CODE ? `--force=${FORCE_CODE}` : FORCE_ALL ? '--force (all)' : 'normal';
  console.log('─────────────────────────────────────────');
  console.log('  Engine knowledge seed');
  console.log(`  Mode    : ${modeLabel}`);
  console.log(`  Engines : ${ENGINE_CODES.length} codes in list`);
  console.log('─────────────────────────────────────────\n');

  // If targeting a single code not in the list, add it on the fly
  let targets = ENGINE_CODES;
  if (FORCE_CODE && !ENGINE_CODES.some((e) => e.code.toUpperCase() === FORCE_CODE)) {
    targets = [{ code: FORCE_CODE, make: null }];
  } else if (FORCE_CODE) {
    targets = ENGINE_CODES.filter((e) => e.code.toUpperCase() === FORCE_CODE);
  }

  let done = 0;
  let skipped = 0;

  for (const { code, make } of targets) {
    const force = FORCE_ALL || !!FORCE_CODE;
    try {
      if (!force) {
        // Check if already enriched before calling Claude
        const engineRow = await query(
          'SELECT id, enriched_at FROM engines WHERE LOWER(code) = LOWER($1)', [code]
        );
        if (engineRow.rows.length) {
          const kbRow = await query(
            `SELECT id FROM knowledge_base WHERE engine_id=$1 AND source='claude-enrichment' LIMIT 1`,
            [engineRow.rows[0].id]
          );
          if (kbRow.rows.length) {
            const when = engineRow.rows[0].enriched_at
              ? new Date(engineRow.rows[0].enriched_at).toLocaleDateString('en-GB')
              : 'unknown date';
            console.log(`  ${code.padEnd(10)} already enriched (${when}) — skipping`);
            skipped++;
            continue;
          }
        }
      }

      process.stdout.write(`  ${code.padEnd(10)} enriching${force ? ' [force]' : ''}...`);
      await enrichEngineCode(code, make, { force });
      process.stdout.write(' done\n');
      done++;
      await sleep(DELAY_MS);
    } catch (err) {
      process.stdout.write(` ERROR: ${err.message}\n`);
    }
  }

  console.log(`\n✓ Complete — ${done} enriched, ${skipped} already done`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
