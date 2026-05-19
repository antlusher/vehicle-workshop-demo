const { query } = require('./db');
const { applyMarkup, getWorkshopSettings, searchProvider, lookupGatesFitment } = require('./partsService');

async function queryWorkshopStats({ stat_type, filters = {} }) {
  switch (stat_type) {
    case 'vehicles_by_make': {
      const { rows } = await query(
        `SELECT COALESCE(NULLIF(TRIM(p.make),''), NULLIF(TRIM(v.make),''), 'Unknown') AS make,
                COUNT(DISTINCT p.id) AS job_count
         FROM projects p
         LEFT JOIN vehicles v ON v.id = p.vehicle_id
         WHERE p.archived_at IS NULL
         GROUP BY 1 ORDER BY job_count DESC LIMIT 20`
      );
      return { stat_type, data: rows };
    }
    case 'jobs_by_period': {
      const { rows } = await query(
        `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
                COUNT(*) AS job_count
         FROM projects WHERE archived_at IS NULL
           AND created_at >= NOW() - INTERVAL '12 months'
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY DATE_TRUNC('month', created_at) DESC`
      );
      return { stat_type, data: rows };
    }
    case 'customer_count': {
      const { rows } = await query(
        `SELECT COUNT(*) FILTER (WHERE role = 'customer') AS customers,
                COUNT(*) FILTER (WHERE role != 'customer') AS staff
         FROM users`
      );
      return { stat_type, data: rows[0] };
    }
    case 'common_faults': {
      const make = filters.make || null;
      const { rows } = await query(
        `SELECT cs.text, COUNT(*) AS occurrences,
                ARRAY_AGG(DISTINCT p.make) AS makes
         FROM confirmed_suggestions cs
         JOIN projects p ON cs.project_id = p.id
         WHERE ($1::text IS NULL OR LOWER(p.make) = LOWER($1))
         GROUP BY cs.text ORDER BY occurrences DESC LIMIT 10`,
        [make]
      );
      return { stat_type, data: rows };
    }
    case 'service_types': {
      const { rows } = await query(
        `SELECT
           COUNT(DISTINCT p.id) AS total_jobs,
           COUNT(DISTINCT p.id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM confirmed_suggestions cs
               WHERE cs.project_id = p.id
                 AND (LOWER(cs.text) LIKE '%oil%' OR LOWER(cs.text) LIKE '%service%' OR LOWER(cs.text) LIKE '%filter%')
             )
           ) AS service_jobs,
           COUNT(DISTINCT p.id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM confirmed_suggestions cs
               WHERE cs.project_id = p.id AND LOWER(cs.text) LIKE '%brake%'
             )
           ) AS brake_jobs,
           COUNT(DISTINCT p.id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM confirmed_suggestions cs
               WHERE cs.project_id = p.id AND LOWER(cs.text) LIKE '%timing%'
             )
           ) AS timing_jobs,
           COUNT(DISTINCT p.id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM confirmed_suggestions cs
               WHERE cs.project_id = p.id
                 AND (LOWER(cs.text) LIKE '%tyre%' OR LOWER(cs.text) LIKE '%tire%' OR LOWER(cs.text) LIKE '%wheel%')
             )
           ) AS tyre_jobs
         FROM projects p
         WHERE p.archived_at IS NULL`
      );
      return { stat_type, data: rows[0] };
    }
    case 'revenue': {
      const { rows } = await query(
        `SELECT
           COUNT(*) AS total_quotes,
           COUNT(*) FILTER (WHERE status = 'invoiced') AS invoiced,
           COUNT(*) FILTER (WHERE status IN ('sent','approved')) AS pending
         FROM quotes`
      );
      const { rows: val } = await query(
        `SELECT COALESCE(SUM(ql.qty * (ql.unit_cost * (1 + ql.markup_pct / 100))), 0) AS revenue_ex_vat,
                COALESCE(SUM(ql.qty * (ql.unit_cost * (1 + ql.markup_pct / 100)) * (1 + q.vat_rate / 100)), 0) AS revenue_inc_vat
         FROM quote_lines ql
         JOIN quotes q ON ql.quote_id = q.id
         WHERE q.status = 'invoiced'`
      );
      return { stat_type, data: { ...rows[0], ...val[0] } };
    }
    case 'active_jobs': {
      const { rows } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE closed = false AND archived_at IS NULL) AS active,
           COUNT(*) FILTER (WHERE closed = true AND archived_at IS NULL) AS closed,
           COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS archived
         FROM projects`
      );
      return { stat_type, data: rows[0] };
    }
    default:
      return { error: `Unknown stat_type: ${stat_type}. Valid types: vehicles_by_make, jobs_by_period, customer_count, common_faults, service_types, revenue, active_jobs` };
  }
}

async function getMotSummary({ project_id }) {
  const { rows } = await query(
    `SELECT v.mot_tests, v.mot_vehicle_meta
     FROM projects p
     LEFT JOIN vehicles v ON v.id = p.vehicle_id
     WHERE p.id = $1`,
    [project_id]
  );
  if (!rows.length) return { error: 'Project not found' };

  const motTests = rows[0].mot_tests || [];
  const meta = rows[0].mot_vehicle_meta || {};
  const latest = motTests[0];
  const latestMileage = latest?.odometerValue && latest?.odometerResultType === 'READ'
    ? latest.odometerValue : null;

  return {
    latestMileage: latestMileage ? `${latestMileage.toLocaleString()} miles` : null,
    latestMotDate: latest?.testDate ? new Date(latest.testDate).toLocaleDateString('en-GB') : null,
    motDueDate: meta.motTestDueDate ? new Date(meta.motTestDueDate).toLocaleDateString('en-GB') : null,
    testCount: motTests.length,
    firstUsed: meta.firstUsedDate ? new Date(meta.firstUsedDate).toLocaleDateString('en-GB') : null,
    recentAdvisories: (latest?.defects || []).map((d) => `${d.type}: ${d.text}`).slice(0, 5),
  };
}

async function getProjectSpecs({ project_id }) {
  const { rows } = await query('SELECT specs FROM projects WHERE id = $1', [project_id]);
  if (!rows.length || !rows[0].specs) {
    return { message: 'No Quick Reference specs generated yet. Ask the technician to open the Quick Reference tab first.' };
  }
  return rows[0].specs;
}

async function lookupGatesParts({ engine_code, vehicle_year }) {
  if (!engine_code) return { message: 'engine_code is required.' };
  const grouped = await lookupGatesFitment(engine_code, vehicle_year || null);
  if (!Object.keys(grouped).length) {
    return { message: `No Gates fitment data found for engine code ${engine_code.toUpperCase()}.` };
  }
  return { engine_code: engine_code.toUpperCase(), vehicle_year: vehicle_year || null, parts: grouped };
}

async function searchPartsCatalogue({ query: q, make, model, engine_code }) {
  const results = await searchProvider(q || '', { make, model, engineCode: engine_code });
  if (!results.length) return { message: 'No matching parts found in the workshop parts catalogue.' };
  return {
    parts: results.map((p) => ({
      partNumber: p.partNumber,
      brand: p.brand,
      title: p.title,
      category: p.category,
      costPrice: p.costPrice,
      inStock: p.inStock,
    })),
  };
}

async function createQuote({ project_id, notes, diagnostic_summary, items, lines }) {
  if (!project_id) return { error: 'project_id is required' };

  // Normalise: if caller passed flat `lines`, wrap in a single item
  const itemList = items?.length
    ? items
    : lines?.length
      ? [{ title: 'Quote', description: diagnostic_summary || '', lines }]
      : null;

  if (!itemList) return { error: 'items (or lines) with at least one entry are required' };

  const settings = await getWorkshopSettings();

  const { rows: refRows } = await query(
    `SELECT 'Q-' || LPAD(
       (COALESCE(MAX(CAST(SUBSTRING(reference FROM 3) AS INTEGER)), 0) + 1)::text,
       4, '0'
     ) AS ref FROM quotes WHERE reference ~ '^Q-[0-9]+$'`
  );
  const { rows: qRows } = await query(
    `INSERT INTO quotes (project_id, notes, diagnostic_summary, vat_rate, reference)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [project_id, notes || null, diagnostic_summary || null, settings.vatRate, refRows[0].ref]
  );
  const quote = qRows[0];
  const sortBase = 0;

  const allFormatted = [];

  for (const [itemIdx, item] of itemList.entries()) {
    const { rows: itemRows } = await query(
      `INSERT INTO quote_items (quote_id, title, description, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [quote.id, item.title, item.description || null, item.notes || null, sortBase + itemIdx]
    );
    const quoteItem = itemRows[0];

    for (const [i, line] of (item.lines || []).entries()) {
      const markup = line.markup_pct != null ? line.markup_pct
        : line.type === 'labour' ? 0 : settings.defaultMarkupPct;
      await query(
        `INSERT INTO quote_lines
           (quote_id, quote_item_id, type, description, qty, unit_cost, markup_pct, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [quote.id, quoteItem.id, line.type || 'part', line.description, line.qty || 1,
         line.unit_cost, markup, i]
      );
      const unitPrice = applyMarkup(parseFloat(line.unit_cost), markup);
      allFormatted.push({
        item: item.title,
        type: line.type || 'part',
        description: line.description,
        qty: parseFloat(line.qty || 1),
        unitPrice: Math.round(unitPrice * 100) / 100,
        lineTotal: Math.round(unitPrice * parseFloat(line.qty || 1) * 100) / 100,
      });
    }
  }

  const subtotal = allFormatted.reduce((s, l) => s + l.lineTotal, 0);
  const vatRate = parseFloat(settings.vatRate);
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

  return {
    quoteId: quote.id,
    reference: quote.reference,
    created: true,
    items: itemList.map((it) => it.title),
    lines: allFormatted,
    totals: {
      subtotal: Math.round(subtotal * 100) / 100,
      vat,
      total: Math.round((subtotal + vat) * 100) / 100,
      vatRate,
    },
    message: `Quote ${quote.reference} created. It will appear in the Quote tab — review and send to the customer when ready.`,
  };
}

async function lookupDtcCode({ code, search }) {
  if (code) {
    const { rows } = await query(
      `SELECT code, description, system, fault_location, probable_cause,
              meaning, causes, symptoms, how_to, related_codes
       FROM dtc_codes WHERE UPPER(code) = UPPER($1)`,
      [code.trim()]
    );
    if (!rows.length) return { message: `No data found for DTC code ${code.toUpperCase()}` };
    return rows[0];
  }
  if (search) {
    const { rows } = await query(
      `SELECT code, description, system, fault_location, probable_cause
       FROM dtc_codes
       WHERE description ILIKE $1 OR causes ILIKE $1 OR symptoms ILIKE $1
       ORDER BY code LIMIT 10`,
      [`%${search}%`]
    );
    if (!rows.length) return { message: `No DTC codes found matching "${search}"` };
    return { results: rows };
  }
  return { error: 'Provide code (e.g. "P0300") or search term' };
}

async function lookupEngineCode({ make, code, search }) {
  if (make && code) {
    const { rows } = await query(
      `SELECT ec.make, ec.code, ec.fuel_type, ec.name, ec.specs,
              ec.compatible_vehicles, ec.reliability_summary, ec.reliability_issues,
              ec.faq_items, ec.related_engines, ec.url,
              ef.family_name, ef.codename AS family_codename,
              ef.also_known_as AS family_aliases,
              ef.wiki_url AS family_wiki_url,
              ef.engine_codes AS family_codes
       FROM engine_codes ec
       LEFT JOIN engine_families ef ON ef.id = ec.family_id
       WHERE LOWER(ec.make) = LOWER($1)
         AND (LOWER(ec.code) = LOWER($2) OR ec.code ILIKE $3)
       LIMIT 3`,
      [make, code, `%${code}%`]
    );
    if (!rows.length) return { message: `No engine data found for ${make} ${code}` };
    return rows.length === 1 ? rows[0] : { results: rows };
  }
  if (search) {
    const { rows } = await query(
      `SELECT ec.make, ec.code, ec.fuel_type, ec.name,
              ec.specs->>'Power output' AS power,
              ec.reliability_summary,
              ef.family_name
       FROM engine_codes ec
       LEFT JOIN engine_families ef ON ef.id = ec.family_id
       WHERE ec.name ILIKE $1 OR ec.code ILIKE $1
          OR ec.specs::text ILIKE $1
       ORDER BY ec.make, ec.code LIMIT 10`,
      [`%${search}%`]
    );
    if (!rows.length) return { message: `No engine codes found matching "${search}"` };
    return { results: rows };
  }
  return { error: 'Provide make + code, or a search term' };
}

async function lookupEngineFamily({ make, name, code }) {
  let familyRows;

  if (code) {
    // Find the family containing this code (via FK link first, then JSONB fallback)
    const { rows } = await query(
      `SELECT ef.id, ef.make, ef.family_name, ef.codename, ef.also_known_as,
              ef.wiki_title, ef.wiki_url, ef.engine_codes, ef.notes
       FROM engine_families ef
       WHERE ef.id = (SELECT family_id FROM engine_codes WHERE UPPER(code) = UPPER($1) AND family_id IS NOT NULL LIMIT 1)
          OR ef.engine_codes::text ILIKE $2`,
      [code, `%"${code.toUpperCase()}"%`]
    );
    if (!rows.length) return { message: `No engine family found containing code ${code}` };
    familyRows = rows.slice(0, 1); // prefer the FK-linked one
  } else {
    const conditions = [];
    const params = [];

    if (make) {
      params.push(make);
      conditions.push(`LOWER(ef.make) = LOWER($${params.length})`);
    }
    if (name) {
      params.push(`%${name}%`);
      conditions.push(
        `(ef.family_name ILIKE $${params.length} OR ef.codename ILIKE $${params.length} OR EXISTS (
           SELECT 1 FROM unnest(ef.also_known_as) a WHERE a ILIKE $${params.length}
         ))`
      );
    }

    if (!conditions.length) return { error: 'Provide make, name, or engine code to search' };

    const { rows } = await query(
      `SELECT ef.id, ef.make, ef.family_name, ef.codename, ef.also_known_as,
              ef.wiki_title, ef.wiki_url, ef.engine_codes, ef.notes
       FROM engine_families ef
       WHERE ${conditions.join(' AND ')}
       ORDER BY ef.make, ef.family_name
       LIMIT 5`,
      params
    );
    if (!rows.length) return { message: `No engine family found matching: ${[make, name].filter(Boolean).join(', ')}` };
    familyRows = rows;
  }

  // Enrich each family with linked engine_codes detail rows
  const enriched = await Promise.all(familyRows.map(async (fam) => {
    const { rows: codeDetails } = await query(
      `SELECT code, fuel_type, name,
              specs->>'Power output' AS power,
              specs->>'Torque'       AS torque,
              specs->>'Displacement' AS displacement,
              reliability_summary,
              url
       FROM engine_codes
       WHERE family_id = $1
       ORDER BY code`,
      [fam.id]
    );
    return { ...fam, linked_code_details: codeDetails };
  }));

  return { count: enriched.length, results: enriched };
}

async function lookupVehicleSpecs({ make, model, year, trim }) {
  const conditions = ['1=1'];
  const params = [];
  if (make)  { params.push(make);  conditions.push(`LOWER(make)  = LOWER($${params.length})`); }
  if (model) { params.push(model); conditions.push(`LOWER(model) = LOWER($${params.length})`); }
  if (year)  { params.push(year);
    conditions.push(`(year_from <= $${params.length} AND (year_to IS NULL OR year_to >= $${params.length}))`);
  }
  if (trim)  { params.push(`%${trim}%`); conditions.push(`trim ILIKE $${params.length}`); }

  const { rows } = await query(
    `SELECT make, model, body_type, year_from, year_to, trim, engine_size, bhp, specs
     FROM vehicle_specs
     WHERE ${conditions.join(' AND ')}
     ORDER BY year_from DESC NULLS LAST LIMIT 15`,
    params
  );
  if (!rows.length) return { message: `No vehicle specs found for ${[make, model, year].filter(Boolean).join(' ')}` };
  return { count: rows.length, results: rows };
}

const workshopToolDefinitions = [
  {
    name: 'query_workshop_stats',
    description: 'Query workshop analytics: vehicle counts by make, job history by month, customer count, common confirmed faults, service type breakdown, revenue from invoiced quotes, or active/closed job counts.',
    input_schema: {
      type: 'object',
      properties: {
        stat_type: {
          type: 'string',
          enum: ['vehicles_by_make', 'jobs_by_period', 'customer_count', 'common_faults', 'service_types', 'revenue', 'active_jobs'],
        },
        filters: {
          type: 'object',
          properties: { make: { type: 'string' } },
        },
      },
      required: ['stat_type'],
    },
  },
  {
    name: 'get_mot_summary',
    description: 'Get MOT history summary for the current project: latest mileage reading, MOT due date, recent advisories.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_project_specs',
    description: 'Get Quick Reference specs for the current project: oil grade, oil capacity, service intervals, tyre pressures, wheel torque.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
    },
  },
  {
    name: 'lookup_gates_parts',
    description: 'Look up Gates brand part numbers for timing belts, timing belt kits (with or without water pump), drive belts, drive belt kits, tensioners, idler pulleys, and water pumps for a specific engine code. Returns exact Gates article numbers grouped by part type. Use this when a technician asks which Gates timing belt or drive belt fits a vehicle, or when building a quote that includes belt/water pump work.',
    input_schema: {
      type: 'object',
      properties: {
        engine_code:  { type: 'string', description: 'Engine code to look up fitment for, e.g. "BJFA", "YLFA", "WLAA"' },
        vehicle_year: { type: 'number', description: 'Vehicle registration year to filter parts to the correct date range' },
      },
      required: ['engine_code'],
    },
  },
  {
    name: 'search_parts_catalogue',
    description: 'Search the workshop in-store parts catalogue. Use this before building a quote to find stocked parts with real part numbers and cost prices. Search by part type (e.g. "oil filter", "brake pads") and optionally filter by vehicle make or engine code.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part type or name to search for, e.g. "oil filter", "brake pads front"' },
        make: { type: 'string', description: 'Vehicle make to filter compatible parts' },
        model: { type: 'string', description: 'Vehicle model' },
        engine_code: { type: 'string', description: 'Engine code for compatibility matching' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_dtc_code',
    description: 'Look up an OBD fault code (DTC) to get its full diagnostic detail: meaning, fault location, probable cause, common causes, symptoms, and how-to troubleshoot. Use this whenever a customer or technician mentions a fault code like P0300, P0171, etc.',
    input_schema: {
      type: 'object',
      properties: {
        code:   { type: 'string', description: 'Exact DTC code to look up, e.g. "P0300"' },
        search: { type: 'string', description: 'Free-text search across DTC descriptions and symptoms if the exact code is unknown' },
      },
    },
  },
  {
    name: 'lookup_engine_code',
    description: 'Look up engine specs and known reliability issues for a specific engine code (e.g. "N47", "EA288", "2GR-FE"). Returns displacement, power, torque, fuel system, compatible vehicles, and documented reliability problems with symptoms, cause, and fix.',
    input_schema: {
      type: 'object',
      properties: {
        make:   { type: 'string', description: 'Vehicle manufacturer, e.g. "bmw", "audi"' },
        code:   { type: 'string', description: 'Engine code to look up, e.g. "N47", "B47"' },
        search: { type: 'string', description: 'Free-text search if exact make/code is unknown' },
      },
    },
  },
  {
    name: 'lookup_vehicle_specs',
    description: 'Look up trim-level vehicle specs from Parkers: horsepower, torque, fuel economy, dimensions, weight, engine size, transmission, towing capacity, insurance group, and more. Filter by make, model, year, and optional trim name.',
    input_schema: {
      type: 'object',
      properties: {
        make:  { type: 'string', description: 'Vehicle make, e.g. "Ford"' },
        model: { type: 'string', description: 'Vehicle model, e.g. "Focus"' },
        year:  { type: 'number', description: 'Model year to filter results' },
        trim:  { type: 'string', description: 'Optional trim name keyword, e.g. "Zetec", "ST-Line"' },
      },
    },
  },
  {
    name: 'lookup_engine_family',
    description: 'Look up an engine family by marketing name (e.g. "EcoBlue", "EcoBoost", "TDI"), internal codename (e.g. "Panther", "Fox", "EA288"), or a specific engine code (e.g. "BJFA", "YLFA"). Returns the full family details including all variant codes with drivetrain info, aliases used across manufacturers, and a link to the Wikipedia article for reliability/recall data.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string', description: 'Vehicle make to narrow the search, e.g. "ford"' },
        name: { type: 'string', description: 'Marketing name or codename to search for, e.g. "EcoBlue", "Panther", "EcoBoost"' },
        code: { type: 'string', description: 'Specific engine code to find its parent family, e.g. "BJFA", "YLFA"' },
      },
    },
  },
  {
    name: 'create_quote',
    description: 'Create a new quote for the project. Each call always creates a brand-new quote — never modifies an existing one. A project can have multiple quotes (e.g. one for a service, another for additional repairs found during the job). Organise work into named items (e.g. "Full Service", "Exhaust Replacement") each with their own parts and labour lines. ALWAYS show the proposed items and costs to the technician and get confirmation BEFORE calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        diagnostic_summary: { type: 'string', description: 'Customer-facing overview of the work' },
        notes: { type: 'string', description: 'Payment terms, lead times, or internal notes' },
        items: {
          type: 'array',
          description: 'Grouped work items. Each item is a named section with its own lines.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Item name e.g. "Full Service", "Exhaust Replacement"' },
              description: { type: 'string', description: 'Customer-facing description of this work item' },
              notes: { type: 'string', description: 'Internal notes for this item' },
              lines: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['part', 'labour', 'other'] },
                    description: { type: 'string' },
                    qty: { type: 'number' },
                    unit_cost: { type: 'number', description: 'Cost price excluding markup' },
                    markup_pct: { type: 'number', description: 'Markup % — omit to use workshop default' },
                  },
                  required: ['type', 'description', 'qty', 'unit_cost'],
                },
              },
            },
            required: ['title', 'lines'],
          },
        },
      },
      required: ['project_id', 'items'],
    },
  },
];

const workshopToolHandlers = {
  query_workshop_stats: queryWorkshopStats,
  get_mot_summary: getMotSummary,
  get_project_specs: getProjectSpecs,
  lookup_gates_parts: lookupGatesParts,
  search_parts_catalogue: searchPartsCatalogue,
  lookup_dtc_code: lookupDtcCode,
  lookup_engine_code: lookupEngineCode,
  lookup_vehicle_specs: lookupVehicleSpecs,
  lookup_engine_family: lookupEngineFamily,
  create_quote: createQuote,
};

module.exports = { workshopToolDefinitions, workshopToolHandlers };
