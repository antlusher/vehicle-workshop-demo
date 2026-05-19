#!/usr/bin/env node
/**
 * Load the correct PIM product URLs discovered from sidebar navigation,
 * capture product cards with OE refs.
 */

const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VEHICLE = 'volkswagen/golf/golf-vii-5g1-bq1-be1-be2/volks-golf-317';

async function acceptCookies(page) {
  try {
    await page.waitForSelector('button:has-text("Allow All")', { timeout: 5000 });
    await page.click('button:has-text("Allow All")');
    await sleep(600);
  } catch {}
}

async function loadAndAnalyse(browser, url, label) {
  const page = await browser.newPage();

  // Capture ALL ajax/json responses
  const ajaxData = [];
  page.on('response', async res => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && !u.includes('google') && !u.includes('zendesk')) {
      const body = await res.json().catch(() => null);
      if (body) ajaxData.push({ url: u.substring(0, 120), body });
    }
  });

  try {
    console.log(`\n=== ${label} ===`);
    console.log('URL:', url);
    await page.goto(url, { timeout: 25000, waitUntil: 'domcontentloaded' });
    await acceptCookies(page);
    await sleep(5000); // wait for AJAX

    // Get the full page HTML to search for product data
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);

    // Look for OE ref patterns in the page
    const oeMatches = [
      ...html.matchAll(/OE\s*(?:Ref|Number|#|:)[:\s]*([A-Z0-9\s\-\.]{6,40})/gi),
      ...html.matchAll(/oe_number[^>]*>([^<]{6,40})</gi),
      ...html.matchAll(/"oe_number"\s*:\s*"([^"]+)"/g),
      ...html.matchAll(/data-oe[^=]*="([^"]{5,40})"/g),
      ...html.matchAll(/class="[^"]*oe[^"]*"[^>]*>([^<]{5,40})</gi),
    ];
    const oeRefs = [...new Set(oeMatches.map(m => m[1].trim()))].filter(r => r.length > 4).slice(0, 20);
    console.log('OE refs found:', oeRefs);

    // Look for part numbers in known formats
    const partPatterns = [
      { brand: 'Gates',     regex: /K\d{6}[A-Z]{0,3}/g },
      { brand: 'SKF',       regex: /VKMA\d{5}/g },
      { brand: 'Dayco',     regex: /KTB\d{3,4}/g },
      { brand: 'INA',       regex: /530\d{4}[A-Z]?\d*/g },
      { brand: 'Contitech', regex: /CT\d{4}[A-Z]?\d*/g },
      { brand: 'Mann',      regex: /(HU|WK|W)\s?\d{3,5}[\/x]?\d*\s?[A-Z]*/g },
    ];
    let parts = [];
    for (const { brand, regex } of partPatterns) {
      const m = [...text.matchAll(regex)];
      parts.push(...m.map(x => ({ brand, num: x[0].replace(/\s+/g,'') })));
    }
    console.log('Part numbers:', [...new Set(parts.map(p => `${p.brand}:${p.num}`))].slice(0, 15));

    // Look for any JavaScript variables containing product data
    const scriptMatches = [
      ...html.matchAll(/var\s+\w+\s*=\s*(\[.{20,500}?\])/gs),
      ...html.matchAll(/"products"\s*:\s*(\[.{20,500}?\])/gs),
    ];
    if (scriptMatches.length > 0) {
      console.log('JS product arrays found:', scriptMatches.length);
      scriptMatches.slice(0, 2).forEach(m => console.log(' ', m[1].substring(0, 300)));
    }

    // Get page title and key text
    const title = await page.title();
    console.log('Title:', title);
    const hasPrices = /£\d+\.\d{2}/.test(text);
    const hasNoResults = /no search results/i.test(text);
    console.log(`Has prices: ${hasPrices} | No results: ${hasNoResults}`);

    // Print relevant text sections
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    // Find lines near price-like content
    const priceLineIdxs = lines.reduce((acc, l, i) => {
      if (/£\d/.test(l) || /add to basket/i.test(l) || /part number/i.test(l.toLowerCase())) acc.push(i);
      return acc;
    }, []);
    if (priceLineIdxs.length > 0) {
      console.log('Product-related text lines:');
      priceLineIdxs.slice(0, 5).forEach(i => {
        const ctx = lines.slice(Math.max(0, i-2), i+5).join(' | ');
        console.log(' ', ctx.substring(0, 200));
      });
    }

    console.log('AJAX responses:', ajaxData.length);
    ajaxData.slice(0, 5).forEach(d => console.log(' ', d.url, JSON.stringify(d.body).substring(0, 150)));

    await page.screenshot({ path: `/tmp/pim-${label.replace(/\W+/g,'_')}.png` });

    // Try clicking on the first available product link in the main content area
    const mainLinks = await page.evaluate(() => {
      const main = document.querySelector('#vmMainPage, main, .view-category, .category-view, [role="main"]');
      if (!main) return [];
      return [...main.querySelectorAll('a[href]')]
        .map(a => ({ href: a.href, text: a.innerText.trim() }))
        .filter(l => l.text.length > 5 && !l.href.includes('/car-parts/') && l.href.includes('partsinmotion'));
    });
    console.log('Main content links:', mainLinks.slice(0, 10));

    return { hasProducts: hasPrices && !hasNoResults };
  } catch(e) {
    console.log('Error:', e.message);
    return null;
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Use the CORRECT URLs from the sidebar investigation
  const tests = [
    { url: `https://www.partsinmotion.co.uk/car-parts/engine-parts/timing-belt-kits/vehicle/${VEHICLE}`, label: 'Timing Belt Kits (engine-parts)' },
    { url: `https://www.partsinmotion.co.uk/car-parts/eng-belts-chains-tensioners/timing-belts/vehicle/${VEHICLE}`, label: 'Timing Belts (eng-belts)' },
    { url: `https://www.partsinmotion.co.uk/car-parts/eng-belts-chains-tensioners/drive-belt-kits/vehicle/${VEHICLE}`, label: 'Drive Belt Kits' },
    { url: `https://www.partsinmotion.co.uk/car-parts/filters/oil-filters/vehicle/${VEHICLE}`, label: 'Oil Filters (hyphen)' },
    { url: `https://www.partsinmotion.co.uk/car-parts/filters/air-filters/vehicle/${VEHICLE}`, label: 'Air Filters (hyphen)' },
  ];

  try {
    for (const { url, label } of tests) {
      await loadAndAnalyse(browser, url, label);
      await sleep(2000);
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
