const { query } = require('./db');

// Provider interface — swap in eBay/TecDoc here later
async function searchProvider(q, filters) {
  return searchSeeded(q, filters);
}

async function searchSeeded(q, { make, model, engineCode } = {}) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length && !make && !engineCode) return [];

  const params = [];
  const conditions = [];

  if (terms.length) {
    const likeConditions = terms.map((t) => {
      params.push(`%${t}%`);
      return `(LOWER(title) LIKE $${params.length} OR LOWER(part_number) LIKE $${params.length} OR LOWER(brand) LIKE $${params.length} OR LOWER(category) LIKE $${params.length})`;
    });
    conditions.push(`(${likeConditions.join(' AND ')})`);
  }

  if (engineCode) {
    params.push(engineCode.toUpperCase());
    conditions.push(`$${params.length} = ANY(compatible_engine_codes)`);
  } else if (make) {
    params.push(make);
    conditions.push(`$${params.length} ILIKE ANY(compatible_makes)`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM parts_catalogue ${where} ORDER BY category, brand, title LIMIT 30`,
    params
  );
  return rows.map(formatPart);
}

function formatPart(row) {
  return {
    id: row.id,
    partNumber: row.part_number,
    brand: row.brand,
    title: row.title,
    category: row.category,
    compatibleMakes: row.compatible_makes || [],
    compatibleModels: row.compatible_models || [],
    compatibleEngineCodes: row.compatible_engine_codes || [],
    costPrice: parseFloat(row.cost_price) || 0,
    listPrice: parseFloat(row.list_price) || 0,
    inStock: row.in_stock,
    source: row.source,
    url: row.url || null,
  };
}

function applyMarkup(costPrice, markupPct) {
  return Math.round(costPrice * (1 + markupPct / 100) * 100) / 100;
}

async function getWorkshopSettings() {
  const { rows } = await query('SELECT * FROM workshop_settings LIMIT 1');
  if (!rows.length) return { defaultMarkupPct: 30, labourRatePerHour: 75, vatRate: 20 };
  return {
    defaultMarkupPct: parseFloat(rows[0].default_markup_pct),
    labourRatePerHour: parseFloat(rows[0].labour_rate_per_hour),
    vatRate: parseFloat(rows[0].vat_rate),
  };
}

module.exports = { searchProvider, applyMarkup, getWorkshopSettings, formatPart };
