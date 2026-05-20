#!/usr/bin/env node
/**
 * fetch-dtc-codes.js — downloads and cleans the OBD trouble code dataset
 * Source: https://github.com/mytrile/obd-trouble-codes
 * Output: server/data/dtc-codes.json
 *
 * Usage: node server/scripts/fetch-dtc-codes.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const URL = 'https://raw.githubusercontent.com/mytrile/obd-trouble-codes/master/obd-trouble-codes.json';
const OUT = path.join(__dirname, '../data/dtc-codes.json');

const FAMILY = { P: 'Powertrain', B: 'Body', C: 'Chassis', U: 'Network' };

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => resolve(raw));
    }).on('error', reject);
  });
}

(async () => {
  console.log('Fetching OBD trouble codes...');
  const raw = await fetch(URL);
  const data = JSON.parse(raw);

  const codes = data
    .map((record) => {
      const vals = Object.values(record);
      if (vals.length < 2) return null;
      const code = vals[0]?.trim();
      const description = vals[1]?.trim();
      if (!code || !description || !/^[PBCU]\d/.test(code)) return null;
      return {
        code,
        description,
        system: FAMILY[code[0]] || 'Unknown',
      };
    })
    .filter(Boolean)
    // Deduplicate — keep first occurrence of each code
    .filter((item, idx, arr) => arr.findIndex(x => x.code === item.code) === idx)
    .sort((a, b) => a.code.localeCompare(b.code));

  const summary = {
    total: codes.length,
    byFamily: Object.fromEntries(
      Object.entries(FAMILY).map(([k, v]) => [v, codes.filter(c => c.code.startsWith(k)).length])
    ),
  };

  fs.writeFileSync(OUT, JSON.stringify(codes, null, 2));

  console.log(`Done. ${summary.total} codes saved to ${OUT}`);
  console.log('Breakdown:', summary.byFamily);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
