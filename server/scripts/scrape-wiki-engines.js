#!/usr/bin/env node
/**
 * scrape-wiki-engines.js — scrapes engine data from Wikipedia category pages
 *
 * Strategy:
 *   1. Visit https://en.wikipedia.org/wiki/Category:{Make}_engines
 *   2. Collect all engine article links (skip subcategories)
 *   3. Scrape each engine article's infobox + intro summary
 *   4. Save to server/data/wiki/{make}_engines_wiki.json
 *
 * Usage:
 *   node server/scripts/scrape-wiki-engines.js              # all makes
 *   node server/scripts/scrape-wiki-engines.js --make=ford  # single make
 *   node server/scripts/scrape-wiki-engines.js --make=ford --rescrape
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../data/wiki');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const args      = process.argv.slice(2);
const makeArg   = args.find(a => a.startsWith('--make='))?.split('=')[1]?.toLowerCase();
const RESCRAPE  = args.includes('--rescrape');

// slug → Wikipedia Category name
const MAKES = [
  { slug: 'audi',          category: 'Audi_engines' },
  { slug: 'bmw',           category: 'BMW_engines' },
  { slug: 'ford',          category: 'Ford_engines' },
  { slug: 'vauxhall',      category: 'Vauxhall_engines' },
  { slug: 'volkswagen',    category: 'Volkswagen_engines' },
  { slug: 'toyota',        category: 'Toyota_engines' },
  { slug: 'honda',         category: 'Honda_engines' },
  { slug: 'renault',       category: 'Renault_engines' },
  { slug: 'peugeot',       category: 'PSA_engines' },
  { slug: 'citroen',       category: 'Citroën_engines' },
  { slug: 'nissan',        category: 'Nissan_engines' },
  { slug: 'mercedes-benz', category: 'Mercedes-Benz_engines' },
  { slug: 'land-rover',    category: 'Land_Rover_engines' },
  { slug: 'jaguar',        category: 'Jaguar_engines' },
  { slug: 'kia',           category: 'Kia_engines' },
  { slug: 'hyundai',       category: 'Hyundai_engines' },
  { slug: 'volvo',         category: 'Volvo_engines' },
  { slug: 'mazda',         category: 'Mazda_engines' },
  { slug: 'mitsubishi',    category: 'Mitsubishi_engines' },
  { slug: 'fiat',          category: 'Fiat_engines' },
  { slug: 'alfa-romeo',    category: 'Alfa_Romeo_engines' },
  { slug: 'porsche',       category: 'Porsche_engines' },
  { slug: 'subaru',        category: 'Subaru_engines' },
  { slug: 'suzuki',        category: 'Suzuki_engines' },
  { slug: 'skoda',         category: 'Škoda_engines' },
  { slug: 'saab',          category: 'Saab_engines' },
  { slug: 'lexus',         category: 'Lexus_engines' },
  { slug: 'chevrolet',     category: 'Chevrolet_engines' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const outPath = slug => path.join(OUT_DIR, `${slug}_engines_wiki.json`);

// ─── Step 1: Collect engine article links from category page(s) ──────────

async function collectCategoryLinks(page, category) {
  const links = [];
  let url = `https://en.wikipedia.org/wiki/Category:${category}`;

  while (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const { pageLinks, nextUrl } = await page.evaluate(() => {
      // Engine article links (not subcategories)
      const pageLinks = [...document.querySelectorAll('#mw-pages a')]
        .map(a => ({ title: a.innerText?.trim(), href: a.href }))
        .filter(l => l.title && l.href.includes('/wiki/') && !l.href.includes('Category:') && !l.href.includes('Special:'));

      // Next page link
      const nextEl = [...document.querySelectorAll('#mw-pages a')].find(a => a.innerText?.trim() === 'next page');
      const nextUrl = nextEl?.href || null;

      return { pageLinks, nextUrl };
    });

    links.push(...pageLinks);
    url = nextUrl;
    if (nextUrl) await sleep(300);
  }

  return links;
}

// ─── Step 2: Scrape individual engine article ──────────────────────────────

async function scrapeEngineArticle(page, { title, href }) {
  try {
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 });

    return await page.evaluate((articleTitle) => {
      const clean = s => s?.replace(/\[[\w\d]+\]/g, '').trim() || null;

      // ── Infobox ──────────────────────────────────────────────────────────
      const infobox = document.querySelector('table.infobox');
      const specs = {};
      if (infobox) {
        [...infobox.querySelectorAll('tr')].forEach(row => {
          const label = clean(row.querySelector('th')?.innerText);
          const value = clean(row.querySelector('td')?.innerText);
          if (label && value) specs[label] = value;
        });
      }

      // ── Intro summary ─────────────────────────────────────────────────────
      let intro = null;
      for (const el of document.querySelectorAll('.mw-parser-output p')) {
        const text = clean(el.innerText);
        if (text && text.length > 40) { intro = text; break; }
      }

      // ── Section tree ─────────────────────────────────────────────────────
      // Walk all children of the parser output in document order.
      // Wikipedia wraps headings in <div class="mw-heading mw-headingN">.
      const content = document.querySelector('.mw-parser-output');
      const sections = [];   // { level, heading, text, tableRows }
      let current = null;    // { level, heading, parts, tableRows }

      const pushCurrent = () => {
        if (!current) return;
        sections.push({
          level:   current.level,
          heading: current.heading,
          text:    current.parts.join('\n').trim() || null,
          tableRows: current.tableRows,
        });
        current = null;
      };

      const skip = new Set(['Contents', 'See also', 'References', 'External links', 'Notes']);

      for (const el of content.querySelectorAll(
        '.mw-heading, p, ul, ol, table.wikitable'
      )) {
        // Detect heading divs
        if (el.classList.contains('mw-heading')) {
          const h = el.querySelector('h2,h3,h4,h5');
          if (!h) continue;
          const level = parseInt(h.tagName[1]);
          const heading = clean(h.innerText);
          if (!heading || skip.has(heading)) continue;
          pushCurrent();
          current = { level, heading, parts: [], tableRows: [] };
          continue;
        }

        if (!current) continue;

        // Tables — extract rows as { label, value }
        if (el.tagName === 'TABLE') {
          [...el.querySelectorAll('tr')].forEach(row => {
            const cells = [...row.querySelectorAll('th,td')].map(c => clean(c.innerText));
            if (cells.filter(Boolean).length > 0) current.tableRows.push(cells);
          });
          continue;
        }

        // Text content
        const text = clean(el.innerText);
        if (text && text.length > 10) current.parts.push(text);
      }
      pushCurrent();

      // ── Reshape into named buckets ────────────────────────────────────────
      const variants  = [];
      let variantBuf  = null;

      const pushVariant = () => {
        if (variantBuf) variants.push(variantBuf);
        variantBuf = null;
      };

      for (const sec of sections) {
        if (sec.level === 2) {
          pushVariant();
          // Top-level sections: safety, family list etc.
          continue;
        }
        if (sec.level === 3) {
          pushVariant();
          variantBuf = { variant: sec.heading, text: sec.text, specs: {}, applications: null, issues: null, safetyRecalls: null };
          // Parse any spec table in this section
          sec.tableRows.forEach(row => {
            if (row.length >= 2 && row[0] && row[1]) variantBuf.specs[row[0]] = row[1];
          });
          continue;
        }
        if (sec.level === 4 && variantBuf) {
          const key = sec.heading.toLowerCase();
          if (key.includes('spec')) {
            sec.tableRows.forEach(row => {
              if (row.length >= 2 && row[0] && row[1]) variantBuf.specs[row[0]] = row[1];
            });
            if (sec.text) variantBuf.specsText = sec.text;
          } else if (key.includes('applic') || key.includes('model')) {
            variantBuf.applications = sec.text;
          } else if (key.includes('issue') || key.includes('problem') || key.includes('fault')) {
            variantBuf.issues = sec.text;
          } else if (key.includes('safety') || key.includes('recall')) {
            variantBuf.safetyRecalls = sec.text;
          }
        }
      }
      pushVariant();

      // Global safety section (H2-level)
      const globalSafety = sections.find(s => s.level === 2 &&
        (s.heading.toLowerCase().includes('safety') || s.heading.toLowerCase().includes('recall')));

      const h1 = document.getElementById('firstHeading')?.innerText?.trim();

      return {
        title: h1 || articleTitle,
        intro,
        specs,       // infobox
        variants,    // per-displacement variant detail
        globalSafetyIssues: globalSafety?.text || null,
      };
    }, title);

  } catch {
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function scrapeMake(page, { slug, category }) {
  console.log(`\n[${slug}] Category:${category}`);

  // Collect all engine article links
  let links;
  try {
    links = await collectCategoryLinks(page, category);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return null;
  }

  if (!links.length) {
    console.log(`  No engine articles found`);
    return { slug, category, engines: [] };
  }

  console.log(`  ${links.length} engine articles found — scraping...`);

  const engines = [];
  let i = 0;
  for (const link of links) {
    const data = await scrapeEngineArticle(page, link);
    if (data) {
      engines.push({ url: link.href, ...data });
      process.stdout.write('.');
    } else {
      process.stdout.write('x');
    }
    i++;
    if (i % 50 === 0) process.stdout.write(`(${i})`);
    await sleep(250);
  }

  console.log(`\n  Done — ${engines.length} engines scraped`);
  return { slug, category, totalArticles: links.length, engines };
}

(async () => {
  const targets = makeArg
    ? MAKES.filter(m => m.slug === makeArg)
    : MAKES;

  if (!targets.length) { console.error(`Unknown make: ${makeArg}`); process.exit(1); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

  let done = 0, skipped = 0;

  for (const make of targets) {
    if (!RESCRAPE && fs.existsSync(outPath(make.slug))) {
      const existing = JSON.parse(fs.readFileSync(outPath(make.slug)));
      if (existing.engines?.length > 0) {
        console.log(`[${make.slug}] Already scraped (${existing.engines.length} engines) — skipping`);
        skipped++;
        continue;
      }
    }

    const data = await scrapeMake(page, make);
    if (data) {
      fs.writeFileSync(outPath(make.slug), JSON.stringify(data, null, 2));
      done++;
    }
    await sleep(500);
  }

  await browser.close();
  console.log(`\nDone. ${done} makes scraped, ${skipped} skipped.`);
  console.log(`Files in ${OUT_DIR}`);
})().catch(err => { console.error(err); process.exit(1); });
