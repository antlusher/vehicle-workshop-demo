const axios = require('axios');
const { chromium } = require('playwright');
const { query } = require('./db');
const { vectorSearch } = require('./embeddingService');

async function resolveEngineId(engine_code) {
  if (!engine_code) return null;
  const { rows } = await query('SELECT id FROM engines WHERE LOWER(code) = LOWER($1)', [engine_code]);
  return rows[0]?.id || null;
}

async function resolveTransmissionId(transmission_code) {
  if (!transmission_code) return null;
  const { rows } = await query('SELECT id FROM transmissions WHERE LOWER(code) = LOWER($1)', [transmission_code]);
  return rows[0]?.id || null;
}

async function getVehicleSpecs({ make, model, year, engine_code }) {
  const { rows } = await query(
    `SELECT * FROM vehicles
     WHERE LOWER(make) = LOWER($1) AND LOWER(model) = LOWER($2)
     AND ($3::varchar IS NULL OR year = $3)
     LIMIT 1`,
    [make, model, year || null]
  );

  if (rows.length) {
    const v = rows[0];
    return {
      make: v.make,
      model: v.model,
      year: v.year,
      engineCode: v.engine_code,
      fuelType: v.fuel_type,
      trim: v.trim,
      bodyType: v.body_type,
      source: v.source,
    };
  }

  return { message: `No detailed specs found for ${make} ${model} ${year || ''}. Use general knowledge for this vehicle.` };
}

async function searchKnowledgeBase({ make, model, year, symptom, engine_code, transmission_code }) {
  const engineId = await resolveEngineId(engine_code);
  const transmissionId = await resolveTransmissionId(transmission_code);

  // Run confirmed-fixes query and semantic + FTS KB queries in parallel
  const [csRows, vecRows, ftsRows] = await Promise.all([
    // Confirmed fixes: match by engine_code directly or make/model
    query(
      `SELECT cs.text, p.make, p.model, p.year, p.engine_code,
              COUNT(*) OVER (PARTITION BY cs.text) as frequency
       FROM confirmed_suggestions cs
       JOIN projects p ON cs.project_id = p.id
       WHERE (
         ($1::text IS NOT NULL AND LOWER(p.engine_code) = LOWER($1))
         OR (LOWER(p.make) = LOWER($2) AND LOWER(p.model) = LOWER($3))
       )
       AND ($4::varchar IS NULL OR p.year = $4)
       AND cs.text ILIKE $5
       ORDER BY frequency DESC
       LIMIT 5`,
      [engine_code || null, make, model, year || null, `%${symptom}%`]
    ),
    // Semantic vector search — returns null if OPENAI_API_KEY not set or pgvector unavailable
    vectorSearch(symptom, { engineId }),
    // FTS fallback — always runs
    query(
      `SELECT title, content, category, fault_code, source,
              CASE WHEN ($1::uuid IS NOT NULL AND engine_id = $1) THEN 0
                   WHEN ($2::uuid IS NOT NULL AND transmission_id = $2) THEN 0
                   ELSE 1 END as relevance
       FROM knowledge_base
       WHERE (
         ($1::uuid IS NOT NULL AND engine_id = $1)
         OR ($2::uuid IS NOT NULL AND transmission_id = $2)
         OR search_vector @@ plainto_tsquery('english', $5)
       )
       ORDER BY relevance,
         CASE WHEN search_vector IS NOT NULL THEN ts_rank(search_vector, plainto_tsquery('english', $5)) ELSE 0 END DESC,
         updated_at DESC
       LIMIT 6`,
      [engineId, transmissionId, make || null, model || null, symptom]
    ),
  ]);

  // Prefer vector results (semantically ranked) when available; fall back to FTS
  const kbSource = vecRows && vecRows.length > 0 ? vecRows : ftsRows.rows;

  const results = [];
  if (csRows.rows.length) {
    results.push(...csRows.rows.map((r) => ({
      source: 'confirmed_fix',
      answer: r.text,
      make: r.make, model: r.model, year: r.year,
      confirmedCount: parseInt(r.frequency),
    })));
  }
  if (kbSource.length) {
    results.push(...kbSource.map((r) => ({
      source: r.source || 'knowledge_base',
      title: r.title,
      answer: r.content,
      category: r.category,
      faultCode: r.fault_code,
    })));
  }

  if (!results.length) {
    return { message: 'No confirmed fixes found in the knowledge base for this vehicle and symptom yet.' };
  }
  return { results };
}

async function getCommonFixes({ make, model, year, engine_code, transmission_code }) {
  const { rows } = await query(
    `SELECT cs.text, COUNT(*) as confirmed_count
     FROM confirmed_suggestions cs
     JOIN projects p ON cs.project_id = p.id
     WHERE (
       ($1::text IS NOT NULL AND LOWER(p.engine_code) = LOWER($1))
       OR (LOWER(p.make) = LOWER($2) AND LOWER(p.model) = LOWER($3))
     )
     AND ($4::varchar IS NULL OR p.year = $4)
     GROUP BY cs.text
     ORDER BY confirmed_count DESC
     LIMIT 10`,
    [engine_code || null, make, model, year || null]
  );

  if (!rows.length) {
    return { message: `No common fixes recorded yet for ${make} ${model} ${year || ''}.` };
  }

  return {
    commonFixes: rows.map((r) => ({
      answer: r.text,
      confirmedCount: parseInt(r.confirmed_count),
    })),
  };
}

async function getDtcInfo({ code }) {
  const cleaned = code.trim().toUpperCase();
  try {
    const response = await axios.get(
      `https://www.obd-codes.com/api/v1/codes/${encodeURIComponent(cleaned)}`,
      { timeout: 5000 }
    );
    return response.data;
  } catch {
    const prefix = cleaned.charAt(0);
    const systems = { P: 'Powertrain', B: 'Body', C: 'Chassis', U: 'Network' };
    return {
      code: cleaned,
      system: systems[prefix] || 'Unknown',
      message: `${cleaned} is a ${systems[prefix] || 'diagnostic'} fault code. No additional data available from external API — use general OBD knowledge to advise on this code.`,
    };
  }
}

// Singleton browser — launched once, reused across all tool calls
let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
}

async function withPage(fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

async function webSearch({ query, max_results = 5 }) {
  const limit = Math.min(max_results, 10);
  return withPage(async (page) => {
    await page.goto(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kl=wt-wt`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    // Wait for results or a CAPTCHA challenge
    await page.waitForSelector('[data-testid="result"], .result__title, form#challenge-form', { timeout: 10000 })
      .catch(() => {});

    const results = await page.evaluate((limit) => {
      const items = document.querySelectorAll('[data-testid="result"]');
      const out = [];
      for (const item of items) {
        if (out.length >= limit) break;
        const titleEl = item.querySelector('h2 a, [data-testid="result-title-a"]');
        const snippetEl = item.querySelector('[data-testid="result-snippet"]');
        const title = titleEl?.textContent?.trim() || '';
        const url = titleEl?.href || '';
        const content = snippetEl?.textContent?.trim() || '';
        if (title && url) out.push({ title, url, content });
      }
      return out;
    }, limit);

    if (!results.length) return { message: 'No results found for that query.' };
    return { results };
  });
}

async function webFetch({ url }) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const title = await page.title();

    // Strip non-content elements then extract readable text
    await page.evaluate(() => {
      const remove = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript'];
      remove.forEach((tag) => document.querySelectorAll(tag).forEach((el) => el.remove()));
    });

    const content = await page.evaluate(() => {
      const main = document.querySelector('article, [role="main"], main, .content, #content')
        || document.body;
      return (main.innerText || main.textContent || '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 4000);
    });

    return { title, content, url };
  });
}

const toolDefinitions = [
  {
    name: 'get_vehicle_specs',
    description: 'Look up vehicle specifications from the workshop database including engine code, fuel type, trim and body type.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string', description: 'Vehicle manufacturer e.g. Ford' },
        model: { type: 'string', description: 'Vehicle model e.g. Focus' },
        year: { type: 'string', description: 'Model year e.g. 2019' },
        engine_code: { type: 'string', description: 'Engine code if known' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Search the workshop knowledge base for confirmed fixes from other technicians for this vehicle and symptom. Matches by engine code across all makes sharing the same engine (e.g. R9M in Renault, Nissan, Fiat, Mercedes).',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'string' },
        symptom: { type: 'string', description: 'The symptom or fault description to search for' },
        engine_code: { type: 'string', description: 'Engine code to cross-reference fixes from all vehicles sharing this engine' },
        transmission_code: { type: 'string', description: 'Transmission code to cross-reference fixes from all vehicles sharing this transmission' },
      },
      required: ['make', 'model', 'symptom'],
    },
  },
  {
    name: 'get_common_fixes',
    description: 'Get the most commonly confirmed fixes for this vehicle across all technicians in the workshop network. Pass engine_code to include fixes from all makes sharing the same engine.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'string' },
        engine_code: { type: 'string', description: 'Engine code to find fixes across all vehicles with this engine' },
        transmission_code: { type: 'string', description: 'Transmission code to find fixes across all vehicles with this transmission' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'get_dtc_info',
    description: 'Look up information about an OBD-II diagnostic trouble code (DTC) such as P0300, P0171 etc.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The DTC code e.g. P0300' },
      },
      required: ['code'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the internet for up-to-date information. Use this for TSBs, recall notices, labour times, torque specs, fault code details, and known issues. Prefer specific queries e.g. "Ford Focus 1.6 TDCi timing belt replacement torque specs" over generic ones.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: { type: 'number', description: 'Number of results to return (default 5, max 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and read the full content of a specific webpage. Use this to read a TSB, recall notice, or technical article found via web_search.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to fetch' },
      },
      required: ['url'],
    },
  },
];

const toolHandlers = {
  get_vehicle_specs: getVehicleSpecs,
  search_knowledge_base: searchKnowledgeBase,
  get_common_fixes: getCommonFixes,
  get_dtc_info: getDtcInfo,
  web_search: webSearch,
  web_fetch: webFetch,
};

module.exports = { toolDefinitions, toolHandlers };
