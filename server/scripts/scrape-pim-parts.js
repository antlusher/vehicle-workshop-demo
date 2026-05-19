#!/usr/bin/env node
/**
 * scrape-pim-parts.js (v2)
 *
 * For each vehicle+category on Parts In Motion:
 *  1. Scrape listing page → product cards (part number, price, title, notes, detailUrl)
 *  2. Fast path: parse "Engine Code: XXXX" from listing-page notes
 *  3. Detail path: for each product without notes, visit detail page and search the
 *     full page text for "Engine Code: XXXX" patterns (OE refs section, application
 *     notes, product description, etc.)
 *  4. Context fallback: if still no codes found, apply the vehicle context's engine
 *     family codes (e.g. EA288 for VW Golf VII — all products returned in that
 *     vehicle context are compatible)
 *  5. Upsert part records into engine_codes.common_parts
 *
 * The Applicable Vehicles section on each detail page lists compatible makes/models
 * with ktypenr identifiers. PIM's vehicleDetails AJAX only returns vehicle specs
 * (KW, displacement, body style) — not the engine code letters. Use listing notes
 * and full-page text as the engine code source; vehicle context as the fallback.
 *
 * Usage:
 *   node server/scripts/scrape-pim-parts.js [--dry-run] [--vehicle=vw-golf-vii]
 *     [--category=timing_belt_kit] [--max-products=N] [--skip-detail]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const { chromium } = require('playwright');
const { pool } = require('../services/db');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DETAIL   = process.argv.includes('--skip-detail');  // listing notes only
const vehicleFilter = process.argv.find(a => a.startsWith('--vehicle='))?.split('=')[1];
const catFilter     = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];
const maxProducts   = parseInt(process.argv.find(a => a.startsWith('--max-products='))?.split('=')[1] || '999', 10);

const BASE = 'https://www.partsinmotion.co.uk/car-parts';

// ── Vehicle contexts ──────────────────────────────────────────────────────────
// engineFamily: the family_name in engine_families to use as context fallback.
// All products returned via the vehicle URL are compatible with that family.
const VEHICLES = {
  'vw-golf-vii': {
    path: 'volkswagen/golf/golf-vii-5g1-bq1-be1-be2/volks-golf-317',
    label: 'VW Golf VII 2.0 TDI (EA288)',
    engineFamily: 'EA288',
  },
};

// ── Part categories ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { slug: 'engine-parts/timing-belt-kits',             type: 'timing_belt_kit' },
  { slug: 'eng-belts-chains-tensioners/timing-belts',  type: 'timing_belt' },
  { slug: 'eng-belts-chains-tensioners/drive-belt-kits', type: 'drive_belt_kit' },
  { slug: 'engine-parts/drive-belts',                  type: 'drive_belt' },
  { slug: 'engine-parts/tensioners-idlers-dampers',    type: 'tensioner' },
  { slug: 'filters/oil-filters',                       type: 'oil_filter' },
  { slug: 'filters/air-filters',                       type: 'air_filter' },
  { slug: 'filters/fuel-filters',                      type: 'fuel_filter' },
  { slug: 'ignition/glow-plugs',                       type: 'glow_plugs' },
  { slug: 'ignition/spark-plugs',                      type: 'spark_plugs' },
  { slug: 'braking/brake-pads',                        type: 'brake_pads_front' },
];

// ── Cookie banner ─────────────────────────────────────────────────────────────
async function acceptCookies(page) {
  try {
    await page.waitForSelector('button:has-text("Allow All")', { timeout: 5000 });
    await page.click('button:has-text("Allow All")');
    await sleep(500);
  } catch {}
}

// ── Parse engine codes from text ──────────────────────────────────────────────
function parseEngineCodes(text) {
  if (!text) return { include: [], exclude: [] };
  const rawInclude = [...text.matchAll(/engine\s+code[:\s]+([A-Z0-9]{3,6})/gi)].map(m => m[1].toUpperCase());
  const rawExclude = [...text.matchAll(/not for engine code[:\s]+([A-Z0-9]{3,6})/gi)].map(m => m[1].toUpperCase());
  // Remove exclude matches from include
  const excSet = new Set(rawExclude);
  const include = [...new Set(rawInclude)].filter(c => !excSet.has(c));
  return { include, exclude: [...new Set(rawExclude)] };
}

// ── Scrape listing page ───────────────────────────────────────────────────────
async function scrapeListingPage(browser, vehiclePath, categorySlug, partType) {
  const url = `${BASE}/${categorySlug}/vehicle/${vehiclePath}`;
  const page = await browser.newPage();
  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await acceptCookies(page);
    await sleep(3000);

    const title   = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (/no search results/i.test(title) || bodyText.length < 500) {
      return { url, products: [], skipped: 'no results' };
    }

    const products = await page.evaluate((pType) => {
      const items = [];
      document.querySelectorAll('.pim-product-contain').forEach(card => {
        const titleEl   = card.querySelector('h2.partTitle a');
        const partNoEl  = card.querySelector('.box-part-no');
        const notesEl   = card.querySelector('.box-application-notes');
        const brandEl   = card.querySelector('.manuf_desc h3');
        const cardText  = card.innerText;
        const priceMatch = cardText.match(/£([\d,]+\.\d{2})/);
        const fullTitle = titleEl?.innerText?.trim() || '';

        items.push({
          title:      fullTitle,
          partNumber: partNoEl?.innerText?.replace(/Part\s*number:/i, '').trim() || '',
          detailUrl:  titleEl?.href || '',
          price:      priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null,
          brand:      brandEl?.innerText?.replace('About ', '').trim() || fullTitle.split(' ')[0],
          notes:      notesEl?.innerText?.trim() || '',
          partType:   pType,
        });
      });
      return items;
    }, partType);

    return { url, products: products.filter(p => p.partNumber && p.detailUrl) };
  } catch (e) {
    return { url, products: [], error: e.message };
  } finally {
    await page.close();
  }
}

// ── Scan product detail page for engine codes in full page text ───────────────
// PIM's vehicleDetails AJAX only returns vehicle specs (KW, body, fuel type),
// NOT engine code letters. Instead we scan the full page HTML for explicit
// "Engine Code: XXXX" patterns in any section (OE notes, description, etc.).
async function getDetailPageEngineCodes(browser, detailUrl) {
  const page = await browser.newPage();
  try {
    await page.goto(detailUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await acceptCookies(page);
    await sleep(3000);

    // Count applicable vehicle variants for reporting
    const variantCount = await page.evaluate(() =>
      document.querySelectorAll('a.applicablemodellink[data-ktypenr]').length
    );
    process.stdout.write(`    [${variantCount} vehicles] `);

    // Scan full page text for engine code patterns
    const text = await page.evaluate(() => document.body.innerText);
    const { include } = parseEngineCodes(text);

    return include;
  } catch (e) {
    process.stdout.write(`    Detail error: ${e.message.substring(0, 60)}\n`);
    return [];
  } finally {
    await page.close();
  }
}

// ── Fetch family-level engine code rows for a vehicle context ─────────────────
// Used as fallback when no explicit engine codes are found: all products
// returned in a given vehicle context URL are compatible with that engine family.
async function getFamilyRows(engineFamily) {
  const { rows } = await pool.query(
    `SELECT ec.id, ec.code, ec.make
     FROM engine_codes ec
     JOIN engine_families ef ON ef.id = ec.family_id
     WHERE ef.codename ILIKE $1 OR ef.family_name ILIKE $1`,
    [engineFamily]
  );
  return rows;
}

// ── Map explicit engine codes to DB rows ──────────────────────────────────────
async function resolveEngineCodesToRows(codes) {
  if (!codes.length) return [];
  const { rows } = await pool.query(
    `SELECT id, code, make FROM engine_codes WHERE UPPER(code) = ANY($1)`,
    [codes]
  );
  return rows;
}

// ── Upsert part into engine_codes.common_parts ────────────────────────────────
async function upsertPart(ecRow, product) {
  const partEntry = {
    part_number: product.partNumber,
    brand:       product.brand,
    part_type:   product.partType,
    title:       product.title,
    price:       product.price,
    url:         product.detailUrl,
    source:      'partsinmotion.co.uk',
  };

  if (DRY_RUN) {
    console.log(`  [DRY] ${ecRow.make}/${ecRow.code} ← ${product.brand} ${product.partNumber} (${product.partType}) £${product.price}`);
    return;
  }

  await pool.query(
    `UPDATE engine_codes
     SET common_parts = (
       CASE
         WHEN common_parts @> $1::jsonb THEN common_parts
         ELSE common_parts || $1::jsonb
       END
     )
     WHERE id = $2`,
    [JSON.stringify([partEntry]), ecRow.id]
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const vehiclesToProcess = vehicleFilter
      ? Object.entries(VEHICLES).filter(([k]) => k === vehicleFilter)
      : Object.entries(VEHICLES);

    const categoriesToProcess = catFilter
      ? CATEGORIES.filter(c => c.type === catFilter)
      : CATEGORIES;

    for (const [vehicleKey, vehicleInfo] of vehiclesToProcess) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`Vehicle: ${vehicleInfo.label}`);
      console.log(`${'═'.repeat(60)}`);

      for (const cat of categoriesToProcess) {
        process.stdout.write(`\n  Category: ${cat.type}\n`);

        // ── Step 1: Get products from listing page ──────────────────────────
        const result = await scrapeListingPage(browser, vehicleInfo.path, cat.slug, cat.type);

        if (result.skipped) {
          console.log(`  SKIP (${result.skipped})`);
          continue;
        }
        if (result.error) {
          console.log(`  ERROR: ${result.error}`);
          continue;
        }

        const products = result.products.slice(0, maxProducts);
        console.log(`  Found ${products.length} products on listing page`);

        let totalStored = 0;

        // Pre-load family fallback rows once per vehicle context
      const familyFallbackRows = await getFamilyRows(vehicleInfo.engineFamily);

      for (const product of products) {
          process.stdout.write(`\n  → ${product.brand} ${product.partNumber} `);

          let engineCodes = [];
          let source = '';

          // ── Step 2a: Fast path — explicit codes in listing-page notes ───
          const { include: noteCodes } = parseEngineCodes(product.notes);
          if (noteCodes.length > 0) {
            engineCodes = noteCodes;
            source = `notes [${engineCodes.join(',')}]`;
            process.stdout.write(`← ${source}\n`);
          }

          // ── Step 2b: Detail page full-text scan ─────────────────────────
          if (engineCodes.length === 0 && !SKIP_DETAIL && product.detailUrl) {
            const detailCodes = await getDetailPageEngineCodes(browser, product.detailUrl);
            if (detailCodes.length > 0) {
              engineCodes = detailCodes;
              source = `detail [${engineCodes.join(',')}]`;
              process.stdout.write(`← ${source}\n`);
            } else {
              process.stdout.write(`← no codes on detail page\n`);
            }
            await sleep(1500);
          } else if (engineCodes.length === 0) {
            process.stdout.write('\n');
          }

          // ── Step 3: Map to DB rows ───────────────────────────────────────
          let ecRows;
          if (engineCodes.length > 0) {
            ecRows = await resolveEngineCodesToRows(engineCodes);
            if (ecRows.length === 0) {
              console.log(`    No DB match for codes ${engineCodes.join(',')} — falling back to ${vehicleInfo.engineFamily} family`);
              ecRows = familyFallbackRows;
              source += ' (family fallback)';
            }
          } else {
            // Context fallback: applies to the entire engine family
            ecRows = familyFallbackRows;
            source = `${vehicleInfo.engineFamily} family fallback`;
          }

          if (ecRows.length === 0) {
            console.log(`    No engine_codes matched — skipping`);
            continue;
          }

          // ── Step 4: Upsert ───────────────────────────────────────────────
          for (const ecRow of ecRows) {
            await upsertPart(ecRow, product);
            totalStored++;
          }
          const uniqueCodes = [...new Set(ecRows.map(r => r.code.toUpperCase()))];
          console.log(`    → ${ecRows.length} rows (${uniqueCodes.slice(0,6).join(',')}) [${source}]`);
        }

        console.log(`  Category total: ${totalStored} part→engine_code associations`);
        await sleep(2000);
      }
    }
  } finally {
    await browser.close();
    await pool.end();
  }

  console.log('\nDone.');
})().catch(err => { console.error(err); process.exit(1); });
