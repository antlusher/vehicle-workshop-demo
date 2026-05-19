#!/usr/bin/env node
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture AJAX responses
  const ajaxCalls = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('com_ajax') || url.includes('index.php') && !url.includes('google')) {
      const ct = res.headers()['content-type'] || '';
      const text = await res.text().catch(() => '');
      if (text.length > 0 && text.length < 5000) {
        ajaxCalls.push({ url: url.substring(0, 150), ct, body: text.substring(0, 500) });
      }
    }
  });

  try {
    await page.goto(
      'https://www.partsinmotion.co.uk/car-parts/engine-parts/timing-belt-kits/inatimingbeltkit530065010-detail',
      { timeout: 30000, waitUntil: 'networkidle' }
    );
    // Accept cookies
    try {
      await page.waitForSelector('button:has-text("Allow All")', { timeout: 5000 });
      await page.click('button:has-text("Allow All")');
    } catch {}
    await sleep(2000);

    // Expand applicable vehicles section
    await page.evaluate(() => {
      const h3Links = [...document.querySelectorAll('a.js_activate')];
      const avLink = h3Links.find(a => (a.innerText || '').toLowerCase().includes('applicable vehicles'));
      if (avLink && !avLink.classList.contains('open')) avLink.click();
    });
    await sleep(1000);

    // Expand first make group (Audi)
    const makeGroups = await page.$$('li.user-vehicle.js_toggle2');
    console.log(`Make groups: ${makeGroups.length}`);
    if (makeGroups.length > 0) {
      await makeGroups[0].evaluate(el => {
        const trigger = el.querySelector('a.js_activate2');
        if (trigger) { trigger.scrollIntoView({ block: 'center' }); trigger.click(); }
      });
      await sleep(1000);
    }

    // Find vehicle links
    const vehicleLinks = await page.$$('a.applicablemodellink[data-ktypenr]');
    console.log(`Vehicle links: ${vehicleLinks.length}`);

    // Click the first 3 vehicle links and dump vehicleDetails content
    for (let i = 0; i < Math.min(3, vehicleLinks.length); i++) {
      const ktypenr = await vehicleLinks[i].getAttribute('data-ktypenr');
      const title   = await vehicleLinks[i].getAttribute('title');
      console.log(`\nClicking variant ${i+1}: ktypenr=${ktypenr} title="${title}"`);

      await vehicleLinks[i].evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
      
      await sleep(3000); // generous wait for AJAX

      // Dump the vehicleDetails div content
      const details = await page.evaluate((id) => {
        const el = document.getElementById(`vehicleDetails${id}`);
        if (!el) return `NOT FOUND: vehicleDetails${id}`;
        return { innerHTML: el.innerHTML.substring(0, 2000), innerText: el.innerText.substring(0, 500) };
      }, ktypenr);

      console.log('vehicleDetails content:');
      console.log(JSON.stringify(details, null, 2));
    }

    console.log(`\nAJAX calls captured: ${ajaxCalls.length}`);
    ajaxCalls.forEach(c => {
      console.log(`  [${c.ct}] ${c.url}`);
      console.log(`  body: ${c.body}`);
    });

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
