#!/usr/bin/env node
/**
 * Load INA 530065010 detail page (has vehicle-specific data),
 * expand each make in Applicable Vehicles, capture the full vehicle list.
 */

const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function acceptCookies(page) {
  try {
    await page.waitForSelector('button:has-text("Allow All")', { timeout: 5000 });
    await page.click('button:has-text("Allow All")');
    await sleep(500);
  } catch {}
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('google') && !url.includes('zendesk') && !url.includes('paypal')
        && !url.includes('gstatic') && !url.includes('.jpg') && !url.includes('.png')
        && !url.includes('.css') && !url.includes('.js') && !url.includes('.woff')) {
      allRequests.push({ method: req.method(), url, post: req.postData()?.substring(0, 200) });
    }
  });

  try {
    // INA 530065010 - shown as "Great news! This part fits your VOLKSWAGEN GOLF"
    await page.goto(
      'https://www.partsinmotion.co.uk/car-parts/engine-parts/timing-belt-kits/inatimingbeltkit530065010-detail',
      { timeout: 25000, waitUntil: 'networkidle' }
    );
    await acceptCookies(page);
    await sleep(3000);

    // Get page title
    const h1 = await page.$eval('h1', el => el.innerText).catch(() => '');
    console.log('Product:', h1);

    // Find and scroll to Applicable Vehicles section
    const avHeadings = await page.$$('.user-vehicle.js_toggle2');
    console.log(`\nApplicable Vehicles make groups: ${avHeadings.length}`);

    // Print their current text
    for (const h of avHeadings) {
      const txt = await h.evaluate(el => el.querySelector('.make-name, strong, h4, span')?.innerText || el.innerText.split('\n')[0].trim());
      console.log(' -', txt);
    }

    // Try using keyboard to expand sections (Tab + Enter approach)
    // First scroll Applicable Vehicles into view
    const avSection = await page.$('h3:has-text("Applicable Vehicles")');
    if (avSection) {
      await avSection.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await sleep(1000);
      console.log('\nScrolled to Applicable Vehicles section');

      // Try clicking the H3 itself to expand
      await avSection.evaluate(el => { el.click(); });
      await sleep(2000);

      // Now try clicking each make heading
      for (const h of avHeadings.slice(0, 1)) { // just try Audi first
        const makeName = await h.evaluate(el => el.innerText.trim().split('\n')[0]);
        console.log(`\nAttempting to expand: ${makeName}`);

        // Use evaluate to click (bypasses visibility check)
        await h.evaluate(el => {
          el.scrollIntoView({ block: 'center' });
          // Find clickable child
          const clickable = el.querySelector('h4, strong, a, [onclick]') || el;
          clickable.click();
        });
        await sleep(4000);

        const afterText = await h.evaluate(el => el.innerText);
        console.log('After click text:', afterText.substring(0, 500));
      }
    }

    // Get page text around "Applicable Vehicles"
    const pageText = await page.evaluate(() => document.body.innerText);
    const avIdx = pageText.indexOf('Applicable Vehicles');
    if (avIdx >= 0) {
      console.log('\n=== Text around Applicable Vehicles ===');
      console.log(pageText.substring(avIdx, avIdx + 3000));
    }

    // Get HTML of Applicable Vehicles section
    const avHtml = await page.evaluate(() => {
      const avH3 = [...document.querySelectorAll('h3')].find(h => h.innerText.includes('Applicable Vehicles'));
      if (!avH3) return null;
      // Get the parent container
      let parent = avH3.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (parent.querySelectorAll('.user-vehicle').length > 0) break;
        parent = parent.parentElement;
      }
      return parent?.outerHTML?.substring(0, 10000) || null;
    });
    console.log('\n=== Applicable Vehicles HTML ===');
    console.log(avHtml?.substring(0, 3000) || 'NOT FOUND');

    console.log('\n=== All non-static requests ===');
    allRequests.forEach(r => {
      console.log(`[${r.method}] ${r.url}`);
      if (r.post) console.log('  POST:', r.post);
    });

    await page.screenshot({ path: '/tmp/pim-ina-detail.png' });

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
