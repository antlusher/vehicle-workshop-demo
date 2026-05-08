const { query } = require('./db');

// Provider interface — swap in eBay/TecDoc here later
async function searchProvider(q, filters) {
  return searchSeeded(q, filters);
}

async function searchSeeded(q, { make, model, engineCode } = {}) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hasText = terms.length > 0;
  if (!hasText && !make && !engineCode) return [];

  const params = [];
  const textConditions = [];
  const compatConditions = [];

  if (hasText) {
    terms.forEach((t) => {
      params.push(`%${t}%`);
      textConditions.push(`(LOWER(title) LIKE $${params.length} OR LOWER(part_number) LIKE $${params.length} OR LOWER(brand) LIKE $${params.length} OR LOWER(category) LIKE $${params.length})`);
    });
  }

  if (engineCode) {
    params.push(engineCode.toUpperCase());
    compatConditions.push(`$${params.length} = ANY(compatible_engine_codes)`);
  }
  if (make) {
    params.push(make);
    compatConditions.push(`$${params.length} ILIKE ANY(compatible_makes)`);
  }

  // When text is supplied: text match required, compat used only for sorting
  // When no text: compat required (browsing compatible parts)
  const where = hasText
    ? `WHERE ${textConditions.join(' AND ')}`
    : `WHERE (${compatConditions.join(' OR ')})`;

  // Boost compatible parts to the top when searching by text
  const compatBoost = compatConditions.length
    ? `CASE WHEN (${compatConditions.join(' OR ')}) THEN 0 ELSE 1 END`
    : '0';

  const { rows } = await query(
    `SELECT * FROM parts_catalogue ${where} ORDER BY ${compatBoost}, category, brand, title LIMIT 30`,
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
