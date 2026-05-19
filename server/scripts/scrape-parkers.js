#!/usr/bin/env node
/**
 * scrape-parkers.js — scrapes vehicle specs from parkers.co.uk
 * Outputs: server/data/scraped-vehicles.json
 *
 * Usage:
 *   node server/scripts/scrape-parkers.js
 *   node server/scripts/scrape-parkers.js --make=ford --model=focus
 *   node server/scripts/scrape-parkers.js --make=ford --limit=20
 *
 * Strategy:
 *   1. /ford/focus/specs/ → list of body-style generations
 *   2. Each generation → list of trim spec URLs
 *   3. Each trim → full spec page (engine size, fuel, bhp, etc.)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.parkers.co.uk';

// Default vehicles to scrape — [make, model] pairs
const DEFAULT_VEHICLES = [
  ['ford',       'focus'],
  ['ford',       'fiesta'],
  ['vauxhall',   'astra'],
  ['renault',    'megane'],
  ['volkswagen', 'golf'],
  ['bmw',        '3-series'],
  ['toyota',     'corolla'],
  ['honda',      'civic'],
];

const args = process.argv.slice(2);
const makeArg  = args.find(a => a.startsWith('--make='))?.split('=')[1];
const modelArg = args.find(a => a.startsWith('--model='))?.split('=')[1];
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];

const VEHICLES = (makeArg && modelArg) ? [[makeArg, modelArg]] : DEFAULT_VEHICLES;
const LIMIT_PER_MODEL = limitArg ? parseInt(limitArg) : 30;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Parse "Ford Focus Hatchback (2011 - 2018)" → { bodyType, yearFrom, yearTo }
function parseGenerationLabel(label) {
  // Matches: (2018 onwards), (2018 on), (2018 - 2025), (2018 – 2025)
  const rangeMatch = label.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/);
  const openMatch  = label.match(/\((\d{4})\s+(?:onwards|on)\)/);
  const yearFrom   = rangeMatch ? parseInt(rangeMatch[1]) : openMatch ? parseInt(openMatch[1]) : null;
  const yearTo     = rangeMatch ? parseInt(rangeMatch[2]) : null;
  return {
    bodyType: label.replace(/\s*\(.*\)/, '').trim(),
    yearFrom,
    yearTo,
  };
}

// Parse trim label "1.6 TDCi (115bhp) Zetec 5d" → { engineSize, bhp, fuelHint, transmission, trim }
function parseTrimLabel(label) {
  const bhp = label.match(/\((\d+)bhp\)/)?.[1];
  const engineSize = label.match(/^(\d+\.\d+)/)?.[1];
  return { engineSize: engineSize || null, bhp: bhp ? parseInt(bhp) : null, trim: label };
}

async function getGenerationLinks(page, make, model) {
  await page.goto(`${BASE}/${make}/${model}/specs/`, { waitUntil: 'domcontentloaded', timeout: 20000 });

  return page.evaluate((BASE) => {
    const links = [];
    document.querySelectorAll('a[href*="/specs/"]').forEach(a => {
      const href = a.href;
      // Generation-level: /make/model/generation-year/specs/ → 4 segments
      const parts = href.replace(BASE + '/', '').split('/').filter(Boolean);
      if (parts.length === 4 && parts[3] === 'specs') {
          const label = a.innerText?.trim() || '';
        if (!links.find(l => l.href === href)) links.push({ href, label });
      }
    });
    return links;
  }, BASE);
}

async function getTrimLinks(page, generationUrl) {
  await page.goto(generationUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  return page.evaluate((BASE) => {
    const links = [];
    document.querySelectorAll('a[href*="/specs/"]').forEach(a => {
      const href = a.href;
      // Trim-level: /make/model/generation-year/trim-slug/specs/ → 5 segments
      const parts = href.replace(BASE + '/', '').split('/').filter(Boolean);
      if (parts.length === 5 && parts[4] === 'specs') {
        if (!links.find(l => l.href === href)) {
          const label = a.closest('h2,h3,[class*="card"],[class*="title"],li')?.innerText?.split('\n')[0]?.trim()
            || a.innerText?.trim() || '';
          links.push({ href, label });
        }
      }
    });
    return links;
  }, BASE);
}

async function scrapeSpecPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  return page.evaluate(() => {
    const specs = {};

    // Parkers: each spec is a <li class="specs-detail-table__item"> with "Label\nValue" text
    document.querySelectorAll('.specs-detail-table__item').forEach(li => {
      const lines = li.innerText?.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const key = lines[0];
        const val = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim();
        if (key && val && key.length < 80 && !val.toLowerCase().includes('for sale')) {
          specs[key] = val;
        }
      }
    });

    return specs;
  });
}

async function scrapeVehicle(page, make, model) {
  console.log(`\n[${make}/${model}] Fetching generations...`);
  let generations;
  try {
    generations = await getGenerationLinks(page, make, model);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return [];
  }

  if (!generations.length) {
    console.log(`  No generations found`);
    return [];
  }
  console.log(`  Found ${generations.length} generations`);

  const vehicles = [];

  for (const gen of generations) {
    const genMeta = parseGenerationLabel(gen.label);
    console.log(`  Generation: ${gen.label}`);

    let trimLinks;
    try {
      trimLinks = await getTrimLinks(page, gen.href);
    } catch { continue; }

    const limited = trimLinks.slice(0, LIMIT_PER_MODEL);
    console.log(`    ${trimLinks.length} trims found, scraping ${limited.length}...`);

    for (const trim of limited) {
      try {
        const specs = await scrapeSpecPage(page, trim.href);
        const trimMeta = parseTrimLabel(trim.label);

        vehicles.push({
          make: make.charAt(0).toUpperCase() + make.slice(1),
          model: model.charAt(0).toUpperCase() + model.slice(1),
          bodyType: genMeta.bodyType,
          yearFrom: genMeta.yearFrom,
          yearTo: genMeta.yearTo,
          trim: trim.label,
          engineSize: trimMeta.engineSize,
          bhp: trimMeta.bhp,
          url: trim.href,
          specs,
        });

        process.stdout.write('.');
        await sleep(250);
      } catch {
        process.stdout.write('x');
      }
    }
    console.log('');
  }

  console.log(`  [${make}/${model}] Done — ${vehicles.length} trim specs scraped`);
  return vehicles;
}

(async () => {
  const outPath = path.join(__dirname, '../data/scraped-vehicles.json');

  // Load existing results for resumability
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : [];
  const doneKeys = new Set(existing.map(v => `${v.make?.toLowerCase()}/${v.model?.toLowerCase()}`));
  const allVehicles = [...existing];

  const toScrape = VEHICLES.filter(([make, model]) => !doneKeys.has(`${make}/${model}`));
  console.log(`${doneKeys.size} vehicles already done. Scraping ${toScrape.length} remaining.`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

  for (const [make, model] of toScrape) {
    const results = await scrapeVehicle(page, make, model);
    allVehicles.push(...results);
    // Save after each vehicle so progress isn't lost
    fs.writeFileSync(outPath, JSON.stringify(allVehicles, null, 2));
    await sleep(1000);
  }

  await browser.close();

  console.log(`\nDone. ${allVehicles.length} vehicle specs saved to ${outPath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
