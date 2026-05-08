#!/usr/bin/env node
/**
 * seed-parts.js — seeds realistic UK workshop parts for testing quotes
 * Usage: node server/scripts/seed-parts.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const { query, pool } = require('../services/db');

const PARTS = [
  // ── Oil Filters ───────────────────────────────────────────────────────────
  {
    part_number: 'W712/75',
    brand: 'Mann',
    title: 'Oil Filter',
    category: 'filters',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Passat', 'A3', 'A4', 'Leon', 'Octavia'],
    compatible_engine_codes: ['EA288', 'EA189', 'CAYC', 'CFHC'],
    cost_price: 4.50,
    list_price: 8.99,
  },
  {
    part_number: 'OC 217',
    brand: 'Mahle',
    title: 'Oil Filter',
    category: 'filters',
    compatible_makes: ['BMW'],
    compatible_models: ['1 Series', '3 Series', '5 Series', 'X1', 'X3'],
    compatible_engine_codes: ['N47', 'N57', 'B47'],
    cost_price: 8.20,
    list_price: 15.99,
  },
  {
    part_number: '7701478777',
    brand: 'Renault',
    title: 'Oil Filter',
    category: 'filters',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall', 'Fiat'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro', 'Talento', 'Clio', 'Megane'],
    compatible_engine_codes: ['R9M', 'M9R', 'K9K'],
    cost_price: 6.80,
    list_price: 12.99,
  },
  // ── Air Filters ───────────────────────────────────────────────────────────
  {
    part_number: 'C 2882',
    brand: 'Mann',
    title: 'Air Filter',
    category: 'filters',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Passat', 'Tiguan', 'A4', 'A6'],
    compatible_engine_codes: ['EA288', 'EA189'],
    cost_price: 12.00,
    list_price: 22.99,
  },
  {
    part_number: 'LX 1874',
    brand: 'Mahle',
    title: 'Air Filter',
    category: 'filters',
    compatible_makes: ['BMW'],
    compatible_models: ['3 Series', '5 Series', 'X3'],
    compatible_engine_codes: ['N47', 'N57', 'N52'],
    cost_price: 18.50,
    list_price: 34.99,
  },
  // ── Fuel Filters ─────────────────────────────────────────────────────────
  {
    part_number: 'KL 229',
    brand: 'Mann',
    title: 'Fuel Filter',
    category: 'filters',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro', 'Laguna', 'Megane'],
    compatible_engine_codes: ['R9M', 'M9R', 'G9U'],
    cost_price: 15.00,
    list_price: 28.99,
  },
  {
    part_number: 'F026402085',
    brand: 'Bosch',
    title: 'Fuel Filter',
    category: 'filters',
    compatible_makes: ['Ford'],
    compatible_models: ['Transit', 'Transit Connect', 'Focus', 'Mondeo'],
    compatible_engine_codes: ['T8', 'PUMA', 'EHH'],
    cost_price: 22.00,
    list_price: 42.99,
  },
  // ── Brake Pads ────────────────────────────────────────────────────────────
  {
    part_number: '0 986 424 530',
    brand: 'Bosch',
    title: 'Front Brake Pad Set',
    category: 'brakes',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Passat', 'A3', 'A4', 'Leon', 'Octavia'],
    compatible_engine_codes: ['EA288', 'EA189', 'EA888'],
    cost_price: 18.00,
    list_price: 35.99,
  },
  {
    part_number: 'DP1527',
    brand: 'EBC',
    title: 'Front Brake Pad Set (Greenstuff)',
    category: 'brakes',
    compatible_makes: ['BMW'],
    compatible_models: ['3 Series', '5 Series'],
    compatible_engine_codes: ['N47', 'N52', 'N55'],
    cost_price: 32.00,
    list_price: 58.99,
  },
  {
    part_number: '7701208019',
    brand: 'Renault',
    title: 'Front Brake Pad Set',
    category: 'brakes',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro'],
    compatible_engine_codes: ['R9M', 'M9R'],
    cost_price: 28.00,
    list_price: 52.99,
  },
  // ── Brake Discs ───────────────────────────────────────────────────────────
  {
    part_number: '09.A356.11',
    brand: 'Brembo',
    title: 'Front Brake Disc Pair',
    category: 'brakes',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall', 'Fiat'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro', 'Talento'],
    compatible_engine_codes: ['R9M', 'M9R', 'G9U'],
    cost_price: 45.00,
    list_price: 85.99,
  },
  {
    part_number: 'BD1439',
    brand: 'EBC',
    title: 'Front Brake Disc Pair',
    category: 'brakes',
    compatible_makes: ['BMW'],
    compatible_models: ['3 Series', '5 Series', 'X3'],
    compatible_engine_codes: ['N47', 'N52', 'N55', 'B47'],
    cost_price: 68.00,
    list_price: 125.99,
  },
  // ── EGR Valves ────────────────────────────────────────────────────────────
  {
    part_number: '7.22870.54.0',
    brand: 'Pierburg',
    title: 'EGR Valve',
    category: 'engine',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall', 'Fiat'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro', 'Talento', 'Laguna'],
    compatible_engine_codes: ['R9M', 'M9R'],
    cost_price: 85.00,
    list_price: 165.99,
  },
  {
    part_number: '700422',
    brand: 'Valeo',
    title: 'EGR Valve',
    category: 'engine',
    compatible_makes: ['Peugeot', 'Citroen', 'Ford'],
    compatible_models: ['407', '307', 'C5', 'C4', 'Focus', 'Transit Connect'],
    compatible_engine_codes: ['DW10', 'DV6'],
    cost_price: 95.00,
    list_price: 185.99,
  },
  // ── Glow Plugs ────────────────────────────────────────────────────────────
  {
    part_number: '0 250 202 026',
    brand: 'Bosch',
    title: 'Glow Plug Set x4',
    category: 'ignition',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Passat', 'A4', 'Leon', 'Octavia'],
    compatible_engine_codes: ['EA288', 'EA189', 'CAYC'],
    cost_price: 28.00,
    list_price: 52.99,
  },
  {
    part_number: 'Y-904AS',
    brand: 'NGK',
    title: 'Glow Plug Set x4',
    category: 'ignition',
    compatible_makes: ['BMW'],
    compatible_models: ['1 Series', '3 Series', '5 Series', 'X1'],
    compatible_engine_codes: ['N47', 'B47'],
    cost_price: 35.00,
    list_price: 65.99,
  },
  {
    part_number: 'HDS103',
    brand: 'Delphi',
    title: 'Glow Plug Set x4',
    category: 'ignition',
    compatible_makes: ['Renault', 'Nissan', 'Dacia'],
    compatible_models: ['Clio', 'Megane', 'Kangoo', 'Qashqai', 'Sandero'],
    compatible_engine_codes: ['K9K'],
    cost_price: 24.00,
    list_price: 45.99,
  },
  // ── Spark Plugs ───────────────────────────────────────────────────────────
  {
    part_number: 'ILFR6B',
    brand: 'NGK',
    title: 'Iridium Spark Plug Set x4',
    category: 'ignition',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Polo', 'A3', 'A1', 'Ibiza'],
    compatible_engine_codes: ['EA888', 'EA211', 'CLJA'],
    cost_price: 32.00,
    list_price: 58.99,
  },
  // ── Timing ───────────────────────────────────────────────────────────────
  {
    part_number: 'KTB549',
    brand: 'Dayco',
    title: 'Timing Belt Kit',
    category: 'timing',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda'],
    compatible_models: ['Golf', 'Passat', 'A3', 'A4', 'Leon', 'Octavia'],
    compatible_engine_codes: ['CAYC'],
    cost_price: 75.00,
    list_price: 145.99,
  },
  {
    part_number: '559003810',
    brand: 'INA',
    title: 'Timing Chain Kit',
    category: 'timing',
    compatible_makes: ['BMW'],
    compatible_models: ['1 Series', '3 Series', '5 Series', 'X1', 'X3'],
    compatible_engine_codes: ['N47'],
    cost_price: 220.00,
    list_price: 395.99,
  },
  // ── MAF Sensors ──────────────────────────────────────────────────────────
  {
    part_number: '0 281 002 576',
    brand: 'Bosch',
    title: 'Mass Air Flow Sensor',
    category: 'sensors',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda', 'Renault'],
    compatible_models: ['Golf', 'Passat', 'A4', 'Trafic', 'Vivaro'],
    compatible_engine_codes: ['EA288', 'EA189', 'R9M', 'M9R'],
    cost_price: 65.00,
    list_price: 125.99,
  },
  // ── Coolant ──────────────────────────────────────────────────────────────
  {
    part_number: 'XSTREAM-G30-5L',
    brand: 'Comma',
    title: 'X-Stream G30 Antifreeze & Coolant 5L',
    category: 'fluids',
    compatible_makes: ['Volkswagen', 'Audi', 'Seat', 'Skoda', 'BMW', 'Mercedes-Benz'],
    compatible_models: [],
    compatible_engine_codes: [],
    cost_price: 12.00,
    list_price: 22.99,
  },
  // ── Engine Oil ────────────────────────────────────────────────────────────
  {
    part_number: 'EDGE-5W30-5L',
    brand: 'Castrol',
    title: 'Edge 5W-30 Fully Synthetic Engine Oil 5L',
    category: 'fluids',
    compatible_makes: ['BMW', 'Volkswagen', 'Mercedes-Benz'],
    compatible_models: [],
    compatible_engine_codes: ['N47', 'N57', 'EA288', 'OM651'],
    cost_price: 28.00,
    list_price: 52.99,
  },
  {
    part_number: 'EDGE-0W30-5L',
    brand: 'Castrol',
    title: 'Edge 0W-30 Fully Synthetic Engine Oil 5L (Renault RN0720)',
    category: 'fluids',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall'],
    compatible_models: ['Trafic', 'Vivaro', 'NV300', 'Laguna', 'Megane'],
    compatible_engine_codes: ['R9M', 'M9R', 'K9K'],
    cost_price: 32.00,
    list_price: 59.99,
  },
  // ── Thermostat ────────────────────────────────────────────────────────────
  {
    part_number: 'TH6882.88J',
    brand: 'Wahler',
    title: 'Thermostat with Housing',
    category: 'cooling',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro'],
    compatible_engine_codes: ['R9M', 'M9R'],
    cost_price: 42.00,
    list_price: 79.99,
  },
  // ── Turbo ─────────────────────────────────────────────────────────────────
  {
    part_number: '53039880290',
    brand: 'BorgWarner',
    title: 'Turbocharger',
    category: 'engine',
    compatible_makes: ['Renault', 'Nissan', 'Vauxhall'],
    compatible_models: ['Trafic', 'NV300', 'Vivaro'],
    compatible_engine_codes: ['R9M'],
    cost_price: 385.00,
    list_price: 695.99,
  },
];

async function main() {
  console.log('─────────────────────────────────────────');
  console.log('  Parts catalogue seed');
  console.log(`  ${PARTS.length} parts to insert`);
  console.log('─────────────────────────────────────────\n');

  let inserted = 0;
  let skipped = 0;

  for (const part of PARTS) {
    const existing = await query(
      'SELECT id FROM parts_catalogue WHERE part_number=$1 AND brand=$2',
      [part.part_number, part.brand]
    );
    if (existing.rows.length) {
      console.log(`  ${part.brand.padEnd(12)} ${part.part_number.padEnd(20)} already exists — skipping`);
      skipped++;
      continue;
    }

    await query(
      `INSERT INTO parts_catalogue
         (part_number, brand, title, category, compatible_makes, compatible_models,
          compatible_engine_codes, cost_price, list_price, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seeded')`,
      [part.part_number, part.brand, part.title, part.category,
       part.compatible_makes, part.compatible_models, part.compatible_engine_codes,
       part.cost_price, part.list_price]
    );
    console.log(`  ${part.brand.padEnd(12)} ${part.part_number.padEnd(20)} ${part.title}`);
    inserted++;
  }

  // Ensure default workshop settings row exists
  const settings = await query('SELECT id FROM workshop_settings LIMIT 1');
  if (!settings.rows.length) {
    await query('INSERT INTO workshop_settings (default_markup_pct, labour_rate_per_hour, vat_rate) VALUES (30, 75, 20)');
    console.log('\n  Default workshop settings created (30% markup, £75/hr labour, 20% VAT)');
  }

  console.log(`\n✓ Complete — ${inserted} inserted, ${skipped} already existed`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
