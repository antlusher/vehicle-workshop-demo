#!/usr/bin/env node
/**
 * scrape-enginecodes.js — scrapes enginecode.uk for engine code data
 * Outputs: server/data/scraped-enginecodes.json
 *
 * Usage:
 *   node server/scripts/scrape-enginecodes.js
 *   node server/scripts/scrape-enginecodes.js --makes ford,renault,vauxhall
 *   node server/scripts/scrape-enginecodes.js --limit 10
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.enginecode.uk';

const args = process.argv.slice(2);
const makesArg   = args.find(a => a.startsWith('--makes='))?.split('=')[1];
const limitArg   = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const searchArg  = args.find(a => a.startsWith('--search='))?.split('=')[1]; // e.g. --search=ford
const RESCRAPE   = args.includes('--rescrape');
const LIMIT = limitArg ? parseInt(limitArg) : Infinity;

const NON_MAKES = new Set(['blog', 'accessibility', 'corrections', 'privacy']);

// Discover all manufacturer slugs from the homepage
async function discoverMakes(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  const links = await page.evaluate((BASE) =>
    [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.match(/enginecode\.uk\/[a-z][a-z0-9-]+$/))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map(h => h.replace(BASE + '/', ''))
  , BASE);
  return links;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Discover engine URLs via /search?q=make (for makes without a listing page)
async function discoverBySearch(page, query) {
  const urls = new Set();
  let pageNum = 1;

  while (true) {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&page=${pageNum}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    const { links, hasNext } = await page.evaluate(() => {
      const links = [...new Set(
        [...document.querySelectorAll('a[href*="-specs"]')].map(a => a.href)
      )];
      const hasNext = !!document.querySelector('a[href*="page="]')?.innerText?.includes('Next')
        || !!([...document.querySelectorAll('a')].find(a => a.innerText?.trim() === 'Next'));
      return { links, hasNext };
    });

    links.forEach(l => urls.add(l));
    console.log(`  Search page ${pageNum}: ${links.length} URLs (total so far: ${urls.size})`);

    if (!hasNext || links.length === 0) break;
    pageNum++;
    await sleep(300);
  }

  return [...urls];
}

async function scrapeMaker(page, make) {
  console.log(`\n[${make}] Fetching engine list...`);
  await page.goto(`${BASE}/${make}`, { waitUntil: 'networkidle', timeout: 20000 });

  // Skip 404 pages — some manufacturers have no listing page
  const is404 = await page.evaluate(() => document.title.includes('404') || document.body.innerText.includes('This page could not be found'));
  if (is404) {
    console.log(`  [${make}] No listing page (404) — skipping`);
    return [];
  }

  // Extract code + spec link from the table
  const codes = await page.evaluate(() => {
    return [...document.querySelectorAll('table tbody tr, [class*="table"] tr')].map(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return null;
      const code = cells[0]?.innerText?.trim();
      const fuelType = cells[1]?.innerText?.trim();
      const link = row.querySelector('a[href*="-specs"]')?.href;
      return code && link ? { code, fuelType, link } : null;
    }).filter(Boolean);
  });

  if (!codes.length) {
    console.log(`  [${make}] No codes found — page structure may differ`);
    return [];
  }

  const limited = codes.slice(0, LIMIT);
  console.log(`  [${make}] Found ${codes.length} codes, scraping ${limited.length}...`);

  const results = [];

  for (const { code, fuelType, link } of limited) {
    try {
      await page.goto(link, { waitUntil: 'networkidle', timeout: 20000 });

      // Scroll to bottom so lazy-loaded sections (related engines, FAQ) render
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1200);

      // Click all dropdown/accordion triggers to expose FAQ answers
      await page.evaluate(() => {
        document.querySelectorAll('button[aria-expanded="false"], details:not([open]) summary').forEach(el => {
          try { el.click(); } catch {}
        });
      });
      await sleep(600);

      const data = await page.evaluate(() => {
        // Specs: only the first table with "Parameter | Value" headers
        const specs = {};
        const specTable = [...document.querySelectorAll('table')].find(t => {
          const headers = [...t.querySelectorAll('th')].map(th => th.innerText?.trim().toLowerCase());
          return headers.includes('parameter') && headers.includes('value');
        });
        if (specTable) {
          specTable.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const key = cells[0]?.innerText?.trim();
              const val = cells[1]?.innerText?.trim();
              if (key && val && key.length < 80) specs[key] = val;
            }
          });
        }

        // Compatible vehicles: find table with Make/Years/Models headers
        const compatVehicles = [];
        const compatTable = [...document.querySelectorAll('table')].find(t => {
          const headers = [...t.querySelectorAll('th')].map(th => th.innerText?.trim().toLowerCase());
          return headers.includes('make') && headers.includes('years');
        });
        if (compatTable) {
          compatTable.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const make    = cells[0]?.innerText?.trim();
              const years   = cells[1]?.innerText?.trim();
              const model   = cells[2]?.innerText?.trim();
              const variant = cells[3]?.innerText?.trim();
              if (make && years && /\d{4}/.test(years)) compatVehicles.push({ make, years, model, variant });
            }
          });
        }

        // Reliability issue cards — grid of cards with Symptoms / Cause / Fix
        const reliabilityIssues = [];
        const grid = [...document.querySelectorAll('div')].find(el => el.className?.includes('grid gap-6'));
        if (grid) {
          [...grid.children].forEach(card => {
            const titleEl = card.children[1];
            const bodyEl  = card.children[2];
            if (!titleEl || !bodyEl) return;
            const title = titleEl.innerText?.trim();
            const body  = bodyEl.innerText?.trim();
            const extract = (label) => {
              const pattern = new RegExp(label + ':\\s*([\\s\\S]*?)(?=\\n(?:Symptoms|Cause|Fix):|$)');
              return body.match(pattern)?.[1]?.trim() || null;
            };
            if (title) reliabilityIssues.push({
              issue: title,
              symptoms: extract('Symptoms'),
              cause: extract('Cause'),
              fix: extract('Fix'),
            });
          });
        }

        // Reliability summary paragraph
        const reliabilityH2 = [...document.querySelectorAll('h2')].find(h => h.innerText?.toLowerCase().includes('reliability'));
        const reliabilitySummary = reliabilityH2?.parentElement?.parentElement
          ?.querySelector('p')?.innerText?.trim() || null;

        // FAQ: extract from expanded accordion items (button + sibling panel, or details)
        const faqItems = [];
        // Try details elements first
        [...document.querySelectorAll('details')].forEach(d => {
          const q = d.querySelector('summary')?.innerText?.trim();
          const a = [...d.childNodes]
            .filter(n => n.nodeName !== 'SUMMARY')
            .map(n => n.textContent?.trim()).filter(Boolean).join(' ').trim();
          if (q && a && !q.toLowerCase().includes('view source')) faqItems.push({ q, a });
        });
        // Also try button-based accordions
        if (!faqItems.length) {
          [...document.querySelectorAll('[aria-expanded]')].forEach(btn => {
            const q = btn.innerText?.trim();
            const panelId = btn.getAttribute('aria-controls');
            const panel = panelId ? document.getElementById(panelId) : btn.nextElementSibling;
            const a = panel?.innerText?.trim();
            if (q && a) faqItems.push({ q, a });
          });
        }

        // Related engines — links to other -specs pages (loaded after scroll)
        const relatedEngines = [...document.querySelectorAll('a[href*="-specs"]')]
          .map(a => ({ name: a.innerText?.trim(), url: a.href }))
          .filter(l => l.name && !l.url.includes(window.location.pathname));

        const h1 = document.querySelector('h1')?.innerText?.trim();
        const description = document.querySelector('meta[name="description"]')?.content || null;

        return { h1, specs, compatVehicles: compatVehicles.slice(0, 30), reliabilityIssues, reliabilitySummary, faqItems, relatedEngines, description };
      });

      results.push({
        make,
        code,
        fuelType,
        url: link,
        name: data.h1,
        specs: data.specs,
        compatibleVehicles: data.compatVehicles,
        reliabilitySummary: data.reliabilitySummary,
        reliabilityIssues: data.reliabilityIssues,
        faqItems: data.faqItems,
        relatedEngines: data.relatedEngines,
        description: data.description,
      });

      process.stdout.write('.');
      await sleep(300); // polite delay
    } catch (err) {
      process.stdout.write('x');
    }
  }

  console.log(`\n  [${make}] Done — ${results.length} engine codes scraped`);
  return results;
}

(async () => {
  const outPath = path.join(__dirname, '../data/scraped-enginecodes.json');

  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : [];
  const doneUrls = new Set(existing.map(r => r.url));
  const doneMakes = new Set(existing.map(r => r.make));
  const allResults = RESCRAPE ? [] : [...existing];

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

  // ── Search mode: discover URLs via /search?q= ─────────────────────────────
  if (searchArg) {
    const make = searchArg.toLowerCase();
    console.log(`\nSearch mode: discovering "${make}" engine pages...`);
    const allUrls = await discoverBySearch(page, make);
    const toScrape = allUrls.filter(u => !doneUrls.has(u)).slice(0, LIMIT);
    console.log(`${doneUrls.size} already done. Scraping ${toScrape.length} remaining...`);

    let scraped = 0;
    for (const url of toScrape) {
      // Derive code from URL slug: /ford/2-0l-ecoboost-gen-1-specs → 2-0l-ecoboost-gen-1
      const slug = url.split('/').pop()?.replace('-specs', '') || '';
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1200);
        await page.evaluate(() => {
          document.querySelectorAll('button[aria-expanded="false"], details:not([open]) summary').forEach(el => {
            try { el.click(); } catch {}
          });
        });
        await sleep(600);

        const data = await page.evaluate(() => {
          const specs = {};
          const specTable = [...document.querySelectorAll('table')].find(t => {
            const h = [...t.querySelectorAll('th')].map(th => th.innerText?.trim().toLowerCase());
            return h.includes('parameter') && h.includes('value');
          });
          if (specTable) {
            specTable.querySelectorAll('tbody tr').forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const key = cells[0]?.innerText?.trim();
                const val = cells[1]?.innerText?.trim();
                if (key && val && key.length < 80) specs[key] = val;
              }
            });
          }

          const compatVehicles = [];
          const compatTable = [...document.querySelectorAll('table')].find(t => {
            const h = [...t.querySelectorAll('th')].map(th => th.innerText?.trim().toLowerCase());
            return h.includes('make') && h.includes('years');
          });
          if (compatTable) {
            compatTable.querySelectorAll('tbody tr').forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 3) {
                compatVehicles.push({
                  make: cells[0]?.innerText?.trim(), years: cells[1]?.innerText?.trim(),
                  model: cells[2]?.innerText?.trim(), variant: cells[3]?.innerText?.trim(),
                });
              }
            });
          }

          const reliabilityIssues = [];
          const grid = [...document.querySelectorAll('div')].find(el => el.className?.includes('grid gap-6'));
          if (grid) {
            [...grid.children].forEach(card => {
              const titleEl = card.children[1];
              const bodyEl  = card.children[2];
              if (!titleEl || !bodyEl) return;
              const title = titleEl.innerText?.trim();
              const body  = bodyEl.innerText?.trim();
              const extract = (label) => {
                const pattern = new RegExp(label + ':\\s*([\\s\\S]*?)(?=\\n(?:Symptoms|Cause|Fix):|$)');
                return body.match(pattern)?.[1]?.trim() || null;
              };
              if (title) reliabilityIssues.push({ issue: title, symptoms: extract('Symptoms'), cause: extract('Cause'), fix: extract('Fix') });
            });
          }

          const reliabilityH2 = [...document.querySelectorAll('h2')].find(h => h.innerText?.toLowerCase().includes('reliability'));
          const reliabilitySummary = reliabilityH2?.parentElement?.parentElement?.querySelector('p')?.innerText?.trim() || null;

          const faqItems = [];
          [...document.querySelectorAll('details')].forEach(d => {
            const q = d.querySelector('summary')?.innerText?.trim();
            const a = [...d.childNodes].filter(n => n.nodeName !== 'SUMMARY').map(n => n.textContent?.trim()).filter(Boolean).join(' ').trim();
            if (q && a && !q.toLowerCase().includes('view source')) faqItems.push({ q, a });
          });

          const relatedEngines = [...document.querySelectorAll('a[href*="-specs"]')]
            .map(a => ({ name: a.innerText?.trim(), url: a.href }))
            .filter(l => l.name && !l.url.includes(window.location.pathname));

          const fuelType = specs['Fuel type'] || null;
          const h1 = document.querySelector('h1')?.innerText?.trim();
          const description = document.querySelector('meta[name="description"]')?.content || null;

          return { h1, fuelType, specs, compatVehicles: compatVehicles.slice(0, 30), reliabilityIssues, reliabilitySummary, faqItems, relatedEngines, description };
        });

        allResults.push({
          make, code: slug, fuelType: data.fuelType, url,
          name: data.h1, specs: data.specs,
          compatibleVehicles: data.compatVehicles,
          reliabilitySummary: data.reliabilitySummary,
          reliabilityIssues: data.reliabilityIssues,
          faqItems: data.faqItems,
          relatedEngines: data.relatedEngines,
          description: data.description,
        });
        scraped++;
        process.stdout.write('.');
      } catch {
        process.stdout.write('x');
      }

      if (scraped % 50 === 0) fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
      await sleep(300);
    }

    await browser.close();
    fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
    console.log(`\nDone. ${scraped} scraped. ${allResults.length} total saved to ${outPath}`);
    return;
  }

  // ── Listing-page mode (existing behaviour) ────────────────────────────────
  let allMakes = makesArg ? makesArg.split(',') : await discoverMakes(page);
  allMakes = allMakes.filter(m => !NON_MAKES.has(m));

  const toScrape = RESCRAPE ? allMakes : allMakes.filter(m => !doneMakes.has(m));
  console.log(`${doneMakes.size} makes already done. Scraping ${toScrape.length} remaining: ${toScrape.join(', ')}`);

  for (const make of toScrape) {
    const results = await scrapeMaker(page, make);
    allResults.push(...results);
    fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  }

  await browser.close();
  console.log(`\nDone. ${allResults.length} engine codes saved to ${outPath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
