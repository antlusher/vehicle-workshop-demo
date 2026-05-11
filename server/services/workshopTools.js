const { query } = require('./db');
const { applyMarkup, getWorkshopSettings, searchProvider } = require('./partsService');

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

async function createQuote({ project_id, notes, diagnostic_summary, lines }) {
  if (!project_id || !lines?.length) return { error: 'project_id and lines are required' };

  const settings = await getWorkshopSettings();
  const { rows: qRows } = await query(
    `INSERT INTO quotes (project_id, notes, diagnostic_summary, vat_rate)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [project_id, notes || null, diagnostic_summary || null, settings.vatRate]
  );
  const quote = qRows[0];

  for (const [i, line] of lines.entries()) {
    const markup = line.markup_pct != null ? line.markup_pct
      : line.type === 'labour' ? 0 : settings.defaultMarkupPct;
    await query(
      `INSERT INTO quote_lines (quote_id, type, description, qty, unit_cost, markup_pct, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [quote.id, line.type || 'part', line.description, line.qty || 1, line.unit_cost, markup, i]
    );
  }

  const { rows: lineRows } = await query(
    'SELECT * FROM quote_lines WHERE quote_id = $1 ORDER BY sort_order',
    [quote.id]
  );
  const formatted = lineRows.map((l) => {
    const unitPrice = applyMarkup(parseFloat(l.unit_cost), parseFloat(l.markup_pct));
    return {
      type: l.type,
      description: l.description,
      qty: parseFloat(l.qty),
      unitPrice: Math.round(unitPrice * 100) / 100,
      lineTotal: Math.round(unitPrice * parseFloat(l.qty) * 100) / 100,
    };
  });

  const subtotal = formatted.reduce((s, l) => s + l.lineTotal, 0);
  const vatRate = parseFloat(settings.vatRate);
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

  return {
    quoteId: quote.id,
    created: true,
    lines: formatted,
    totals: {
      subtotal: Math.round(subtotal * 100) / 100,
      vat,
      total: Math.round((subtotal + vat) * 100) / 100,
      vatRate,
    },
    message: 'Quote created. It will appear in the Quote tab — review and adjust before sending to the customer.',
  };
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
    name: 'create_quote',
    description: 'Create a quote for the current project with line items. ALWAYS show the proposed lines and costs to the technician and get confirmation BEFORE calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        diagnostic_summary: { type: 'string', description: 'Customer-facing reason for the work' },
        notes: { type: 'string', description: 'Internal notes' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['part', 'labour', 'other'] },
              description: { type: 'string' },
              qty: { type: 'number' },
              unit_cost: { type: 'number', description: 'Cost price (ex markup)' },
              markup_pct: { type: 'number', description: 'Markup % — omit to use workshop default' },
            },
            required: ['type', 'description', 'qty', 'unit_cost'],
          },
        },
      },
      required: ['project_id', 'lines'],
    },
  },
];

const workshopToolHandlers = {
  query_workshop_stats: queryWorkshopStats,
  get_mot_summary: getMotSummary,
  get_project_specs: getProjectSpecs,
  search_parts_catalogue: searchPartsCatalogue,
  create_quote: createQuote,
};

module.exports = { workshopToolDefinitions, workshopToolHandlers };
