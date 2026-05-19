#!/usr/bin/env node
/**
 * scrape-parts.js
 *
 * Enriches engine_codes.common_parts with real part numbers by:
 *   1. Querying SearXNG (via EC2 SSH tunnel or direct if running locally) for
 *      "{engine_code} {make} {part_type}" to find product pages
 *   2. Fetching those pages and extracting part numbers using brand patterns
 *      (Gates, SKF, INA, Dayco, Contitech, Bosch, Mann, NGK, Delphi etc.)
 *   3. Upserting results into engine_codes.common_parts
 *
 * Requires SearXNG accessible at SEARXNG_URL (default: http://localhost:8080)
 * Set SEARXNG_URL=http://16.60.247.187:PORT or use SSH tunnel first.
 *
 * Usage:
 *   node server/scripts/scrape-parts.js --make=volkswagen
 *   node server/scripts/scrape-parts.js --code=CRKB
 *   node server/scripts/scrape-parts.js --limit=100 --make=bmw
 *   node server/scripts/scrape-parts.js --rescrape
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const https  = require('https');
const http   = require('http');
const { pool } = require('../services/db');

const args      = process.argv.slice(2);
const makeArg   = args.find(a => a.startsWith('--make='))?.split('=')[1];
const codeArg   = args.find(a => a.startsWith('--code='))?.split('=')[1]?.toUpperCase();
const limitArg  = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const RESCRAPE  = args.includes('--rescrape');

// SearXNG URL — set env var or SSH tunnel to EC2 first:
// ssh -L 8080:localhost:8080 ubuntu@16.60.247.187 -i "~/.ssh/Test server for auto app.pem" -N &
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080';

// ── Part types by fuel type ───────────────────────────────────────────────────

const PART_TYPES = {
  petrol: [
    { type: 'timing_belt_kit', query: 'timing belt kit cambelt kit' },
    { type: 'oil_filter',      query: 'oil filter' },
    { type: 'air_filter',      query: 'air filter' },
    { type: 'spark_plugs',     query: 'spark plugs' },
  ],
  diesel: [
    { type: 'timing_belt_kit', query: 'timing belt kit cambelt kit' },
    { type: 'oil_filter',      query: 'oil filter' },
    { type: 'air_filter',      query: 'air filter' },
    { type: 'glow_plugs',      query: 'glow plugs' },
    { type: 'fuel_filter',     query: 'fuel filter diesel' },
  ],
};

// ── Known part number patterns (European aftermarket brands) ─────────────────

const PART_PATTERNS = [
  // Timing kits
  { brand: 'Gates',       regex: /\bK\d{6}[A-Z]{0,3}\b/g },
  { brand: 'SKF',         regex: /\bVKMA\d{5}\b/g },
  { brand: 'INA',         regex: /\b530\s?\d{4}\s?[A-Z]?\d*\b/g },
  { brand: 'Dayco',       regex: /\bKTB\d{3,4}\b/g },
  { brand: 'Contitech',   regex: /\bCT\d{4}[A-Z]?\d*[A-Z]?\b/g },
  // Filters
  { brand: 'Mann',        regex: /\b(HU|W|C|WK|H|PU)\s?\d{3,5}[\/\s]?\d*\s?[A-Z]*\b/g },
  { brand: 'Bosch',       regex: /\b(F\s?026\s?\d{3}\s?\d{3}|0\s?986\s?\d{3}\s?\d{3})\b/g },
  { brand: 'NGK',         regex: /\b[A-Z]{2,4}\d[A-Z]?\-[A-Z]?\d{1,2}[A-Z]?\b/g },  // spark plugs
  { brand: 'Denso',       regex: /\b(VKJ|VK\d{2}|IK\d{2})\d{1,3}\b/g },
  { brand: 'Febi',        regex: /\b\d{5}\b/g },  // Febi uses 5-digit numbers
  { brand: 'LuK',         regex: /\b(538|119)\s?\d{4}\s?\d{2}\b/g },
  // Generic OEM-style numbers (last resort)
  { brand: 'OEM',         regex: /\b[0-9]{2,3}[\s\-]?[0-9]{3}[\s\-]?[0-9]{3}[A-Z]?\b/g },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function fetchHtml(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = new URL(url);
    lib.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: {
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
    }, timeout: 10000 }, (res) => {
      // Follow one redirect
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

// ── SearXNG search ────────────────────────────────────────────────────────────

async function searxSearch(query) {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en-GB`;
  const data = await fetchJson(url);
  if (!data?.results) return [];
  return data.results
    .filter(r => r.url && !r.url.includes('youtube') && !r.url.includes('google') && !r.url.includes('facebook'))
    .slice(0, 5)
    .map(r => ({ title: r.title, url: r.url, snippet: r.content }));
}

// ── Extract part numbers from HTML ────────────────────────────────────────────

function extractPartNumbers(html, partType) {
  const found = [];
  const seen  = new Set();

  // Strip script/style tags
  const clean = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ');

  for (const { brand, regex } of PART_PATTERNS) {
    const matches = [...clean.matchAll(new RegExp(regex.source, regex.flags))];
    for (const m of matches) {
      const num = m[0].replace(/\s/g, '').toUpperCase();
      if (num.length < 4 || num.length > 20) continue;
      if (seen.has(num)) continue;
      seen.add(num);
      found.push({ brand, part_number: num, part_type: partType });
      if (found.length >= 5) break;
    }
    if (found.length >= 5) break;
  }

  return found;
}

// ── Price extraction ──────────────────────────────────────────────────────────

function extractPrice(html) {
  const clean = html.replace(/<[^>]+>/g, ' ');
  const m = clean.match(/£\s?([\d,]+\.?\d{0,2})/);
  return m ? parseFloat(m[1].replace(',', '')) : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  let sql = `SELECT id, make, code, fuel_type FROM engine_codes WHERE 1=1`;
  const params = [];

  if (codeArg) {
    params.push(codeArg);
    sql += ` AND UPPER(code) = $${params.length}`;
  } else if (makeArg) {
    params.push(makeArg);
    sql += ` AND LOWER(make) = LOWER($${params.length})`;
  }

  if (!RESCRAPE && !codeArg) {
    sql += ` AND (common_parts IS NULL OR jsonb_array_length(common_parts) = 0)`;
  }

  sql += ` ORDER BY make, code`;
  if (limitArg) sql += ` LIMIT ${limitArg}`;

  const { rows: codes } = await pool.query(sql, params);
  console.log(`Processing ${codes.length} engine codes via SearXNG at ${SEARXNG_URL}...\n`);

  let processed = 0, enriched = 0;

  for (const ec of codes) {
    const fuelKey  = (ec.fuel_type || '').toLowerCase().includes('diesel') ? 'diesel' : 'petrol';
    const partDefs = PART_TYPES[fuelKey];
    const allParts = [];

    for (const { type, query } of partDefs) {
      const searchQ = `${ec.code.toUpperCase()} ${ec.make.replace(/-/g,' ')} ${query} part number`;
      const results = await searxSearch(searchQ);

      for (const result of results) {
        const html   = await fetchHtml(result.url);
        if (!html || html.length < 200) continue;

        const parts  = extractPartNumbers(html, type);
        const price  = extractPrice(html);

        if (parts.length) {
          // Tag the first part with source/price, rest with just brand+number
          parts[0].source = new URL(result.url).hostname.replace('www.', '');
          parts[0].price  = price;
          parts[0].url    = result.url;
          allParts.push(...parts);
          break; // got parts from this result — move to next part type
        }
        await sleep(300);
      }

      await sleep(500);
    }

    if (allParts.length) {
      await pool.query(
        `UPDATE engine_codes SET common_parts = $1 WHERE id = $2`,
        [JSON.stringify(allParts), ec.id]
      );
      enriched++;
      process.stdout.write('✓');
    } else {
      process.stdout.write('·');
    }

    processed++;
    if (processed % 20 === 0) process.stdout.write(`(${processed})`);
    await sleep(800);
  }

  await pool.end();
  console.log(`\n\nDone. ${processed} codes processed, ${enriched} enriched with part numbers.`);
})().catch(err => { console.error(err); process.exit(1); });
