#!/usr/bin/env node
/**
 * scrape-dtc-detail.js — scrapes full diagnostic detail for OBD codes from troublecodes.net
 *
 * Source of truth: the listing pages on troublecodes.net (not the GitHub dataset)
 * Covers: P-codes (2,400+), B-codes, C-codes, U-codes
 *
 * Writes: server/data/scraped-dtc-detail.json
 * Resumable: skips codes already in the output file
 *
 * Usage:
 *   node server/scripts/scrape-dtc-detail.js               # all families
 *   node server/scripts/scrape-dtc-detail.js --family=p    # P-codes only
 *   node server/scripts/scrape-dtc-detail.js --code=P0131  # single code
 *   node server/scripts/scrape-dtc-detail.js --limit=50    # first N codes
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_FILE  = path.join(__dirname, '../data/scraped-dtc-detail.json');
const BASE      = 'https://www.troublecodes.net';
const DELAY_MS  = 350;

const args      = process.argv.slice(2);
const familyArg = args.find(a => a.startsWith('--family='))?.split('=')[1]?.toLowerCase();
const codeArg   = args.find(a => a.startsWith('--code='))?.split('=')[1]?.toUpperCase();
const limitArg  = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT     = limitArg ? parseInt(limitArg) : Infinity;

const FAMILIES  = familyArg ? [familyArg] : ['p', 'b', 'c', 'u'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Discover all codes from a listing page ───────────────────────────────

async function discoverCodes(page, family) {
  const url = `${BASE}/${family}codes/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  return page.evaluate((family) => {
    const pattern = new RegExp(`/${family}codes/${family}[\\da-f]+/`, 'i');
    return [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, code: a.innerText?.trim().toUpperCase() }))
      .filter(l => pattern.test(l.href) && l.code && /^[PBCU][\dA-F]/i.test(l.code))
      .filter((l, i, arr) => arr.findIndex(x => x.href === l.href) === i);
  }, family);
}

// ─── Scrape a single detail page ─────────────────────────────────────────

async function scrapePage(page, url, code) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    return await page.evaluate((code) => {
      function collectSection(h2) {
        const parts = [];
        let el = h2.nextElementSibling;
        while (el && el.tagName !== 'H2') {
          const text = el.innerText?.trim();
          if (text && !el.className?.includes('ad-')) parts.push(text);
          el = el.nextElementSibling;
        }
        return parts.join('\n').trim() || null;
      }

      // Must have diagnostic content
      if (!document.body.innerText.includes('What Does Code')) return null;

      // Top summary table: Code | Fault Location | Probable Cause
      const tableRows = [...document.querySelectorAll('table tr')].map(r =>
        [...r.querySelectorAll('th,td')].map(c =>
          c.innerText?.replace(/\(Buy Part.*?\)/g, '').trim()
        )
      );
      const dataRow       = tableRows.find(r => r[0]?.toUpperCase() === code.toUpperCase());
      const faultLocation = dataRow?.[1] || null;
      const probableCause = dataRow?.[2] || null;

      // Extract H2 sections
      const h2s = [...document.querySelectorAll('h2')];
      const getSection = (matchFn) => {
        const h2 = h2s.find(h => matchFn(h.innerText?.toLowerCase() || ''));
        return h2 ? collectSection(h2) : null;
      };

      const meaning  = getSection(t => t.includes('what does code') || t.includes('mean'));
      const causes   = getSection(t => t.includes('cause'));
      const symptoms = getSection(t => t.includes('symptom'));
      const howTo    = getSection(t => t.includes('troubleshoot') || t.includes('how do you'));
      const relatedRaw = getSection(t => t.includes('related'));

      const relatedCodes = relatedRaw
        ? relatedRaw.split('\n').map(l => l.match(/^([PBCU][\dA-F]{4})/i)?.[1]?.toUpperCase()).filter(Boolean)
        : [];

      return { faultLocation, probableCause, meaning, causes, symptoms, howTo, relatedCodes };
    }, code);

  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

(async () => {
  // Load existing results for resumability
  const existing = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE)) : [];
  const done     = new Map(existing.map(r => [r.code.toUpperCase(), r]));
  const results  = [...existing];

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page    = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

  let totalScraped = 0, totalSkipped = 0;

  // Single-code mode
  if (codeArg) {
    const family = codeArg[0].toLowerCase();
    const url    = `${BASE}/${family}codes/${codeArg.toLowerCase()}/`;
    console.log(`Scraping single code: ${codeArg}`);
    const data = await scrapePage(page, url, codeArg);
    if (data) {
      const existing = done.get(codeArg);
      const entry = { code: codeArg, ...(existing || {}), ...data };
      done.set(codeArg, entry);
      if (!results.find(r => r.code === codeArg)) results.push(entry);
      else { const idx = results.findIndex(r => r.code === codeArg); results[idx] = entry; }
      console.log('Done:', JSON.stringify(data, null, 2));
    } else {
      console.log('No diagnostic content found for', codeArg);
    }
    await browser.close();
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    return;
  }

  // Full scrape: discover from listing pages
  for (const family of FAMILIES) {
    console.log(`\n[${family.toUpperCase()}-codes] Discovering from listing page...`);
    let codes;
    try {
      codes = await discoverCodes(page, family);
    } catch (err) {
      console.log(`  Error loading listing: ${err.message}`);
      continue;
    }

    const toScrape = codes
      .filter(c => !done.has(c.code.toUpperCase()))
      .slice(0, LIMIT);

    console.log(`  ${codes.length} codes found, ${done.size} already done, scraping ${toScrape.length}...`);

    let scraped = 0, skipped = 0;

    for (const { href, code } of toScrape) {
      const data = await scrapePage(page, href, code);
      if (data) {
        results.push({ code, ...data });
        done.set(code, data);
        scraped++;
        process.stdout.write('.');
      } else {
        skipped++;
        process.stdout.write('_');
      }

      if ((scraped + skipped) % 100 === 0) {
        fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      }

      await sleep(DELAY_MS);
    }

    totalScraped += scraped;
    totalSkipped += skipped;
    console.log(`\n  Done — ${scraped} scraped, ${skipped} no content`);
  }

  await browser.close();
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\nTotal: ${totalScraped} scraped, ${totalSkipped} skipped`);
  console.log(`${results.length} codes saved to ${OUT_FILE}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
