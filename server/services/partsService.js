const { query } = require('./db');

// Provider interface — swap in eBay/TecDoc here later
async function searchProvider(q, filters) {
  return searchSeeded(q, filters);
}

async function resolveEngineFamily(engineCode) {
  // Given an individual 4-letter code (e.g. CRKB), find its engine family names/codenames.
  // Needed because parts_catalogue stores family names (EA288) not individual codes.
  const { rows } = await query(
    `SELECT ef.family_name, ef.codename, ef.also_known_as
     FROM engine_codes ec
     JOIN engine_families ef ON ef.id = ec.family_id
     WHERE UPPER(ec.code) = UPPER($1)
     LIMIT 1`,
    [engineCode]
  );
  if (!rows.length) return [];
  const r = rows[0];
  const names = new Set();
  if (r.family_name) names.add(r.family_name);
  if (r.codename && r.codename !== r.family_name) names.add(r.codename);
  (r.also_known_as || []).forEach(n => names.add(n));
  return [...names];
}

async function searchSeeded(q, { make, model, engineCode } = {}) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hasText = terms.length > 0;
  if (!hasText && !make && !engineCode) return [];

  // Resolve individual engine code → family names for catalogue matching
  let engineCodesToMatch = engineCode ? [engineCode.toUpperCase()] : [];
  if (engineCode) {
    const familyNames = await resolveEngineFamily(engineCode);
    engineCodesToMatch.push(...familyNames.map(n => n.toUpperCase()));
    engineCodesToMatch = [...new Set(engineCodesToMatch)];
  }

  const params = [];
  const textConditions = [];
  const compatConditions = [];

  if (hasText) {
    terms.forEach((t) => {
      params.push(`%${t}%`);
      textConditions.push(`(LOWER(title) LIKE $${params.length} OR LOWER(part_number) LIKE $${params.length} OR LOWER(brand) LIKE $${params.length} OR LOWER(category) LIKE $${params.length})`);
    });
  }

  if (engineCodesToMatch.length) {
    // Match any of the individual code OR its family names
    engineCodesToMatch.forEach(code => {
      params.push(code);
      compatConditions.push(`$${params.length} = ANY(compatible_engine_codes)`);
    });
  }
  if (make) {
    params.push(make);
    compatConditions.push(`$${params.length} ILIKE ANY(compatible_makes)`);
  }

  // When text is supplied: text match required, compat used only for sorting
  // When no text: compat required (browsing compatible parts)
  const where = hasText
    ? `WHERE ${textConditions.join(' AND ')}`
    : compatConditions.length ? `WHERE (${compatConditions.join(' OR ')})` : '';

  if (!where) return [];

  // Boost compatible parts to the top when searching by text
  const compatBoost = compatConditions.length
    ? `CASE WHEN (${compatConditions.join(' OR ')}) THEN 0 ELSE 1 END`
    : null;

  const orderBy = [compatBoost, 'category', 'brand', 'title'].filter(Boolean).join(', ');

  const { rows } = await query(
    `SELECT * FROM parts_catalogue ${where} ORDER BY ${orderBy} LIMIT 30`,
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
    stockQty: row.stock_qty != null ? parseInt(row.stock_qty) : null,
    reservedQty: row.reserved_qty != null ? parseInt(row.reserved_qty) : null,
    availableQty: row.available_qty != null ? parseInt(row.available_qty) : null,
  };
}

function applyMarkup(costPrice, markupPct) {
  return Math.round(costPrice * (1 + markupPct / 100) * 100) / 100;
}

async function getWorkshopSettings() {
  const { rows } = await query('SELECT * FROM workshop_settings LIMIT 1');
  if (!rows.length) return { defaultMarkupPct: 30, labourRatePerHour: 75, vatRate: 20 };
  const r = rows[0];
  return {
    defaultMarkupPct: parseFloat(r.default_markup_pct),
    labourRatePerHour: parseFloat(r.labour_rate_per_hour),
    vatRate: parseFloat(r.vat_rate),
    workshopName: r.workshop_name || null,
    addressLine1: r.address_line1 || null,
    addressLine2: r.address_line2 || null,
    city: r.city || null,
    postcode: r.postcode || null,
    phone: r.phone || null,
    email: r.email || null,
    paymentNotes: r.payment_notes || null,
    aiEnabled: r.ai_enabled !== false,
    // Invoice template
    invoiceLogoUrl: r.invoice_logo_url || null,
    invoiceAccentColor: r.invoice_accent_color || '#1e40af',
    invoiceVatNumber: r.invoice_vat_number || null,
    invoiceFooterText: r.invoice_footer_text || null,
    invoiceShowBankDetails: r.invoice_show_bank_details || false,
    invoiceBankName: r.invoice_bank_name || null,
    invoiceAccountName: r.invoice_account_name || null,
    invoiceAccountNumber: r.invoice_account_number || null,
    invoiceSortCode: r.invoice_sort_code || null,
    invoiceCompanyReg: r.invoice_company_reg || null,
    invoicePaymentTerms: r.invoice_payment_terms || 'Due on receipt',
  };
}

// ── Gates fitment lookup ──────────────────────────────────────────────────────
// Returns Gates parts for a given engine code, optionally filtered by year.
// Groups results by part_type so the AI gets a clean summary.
async function lookupGatesFitment(engineCode, vehicleYear) {
  if (!engineCode) return [];

  // Resolve individual code → family names (same as searchSeeded does)
  let codesToMatch = [engineCode.toUpperCase()];
  const familyNames = await resolveEngineFamily(engineCode);
  codesToMatch.push(...familyNames.map(n => n.toUpperCase()));
  codesToMatch = [...new Set(codesToMatch)];

  // Build year filter: include rows where the year falls within the range,
  // or where no range is specified.
  const yearFilter = vehicleYear
    ? `AND (gf.year_from_year IS NULL OR gf.year_from_year <= $2)
       AND (gf.year_to_year   IS NULL OR gf.year_to_year   >= $2)`
    : '';

  const params = [codesToMatch];
  if (vehicleYear) params.push(vehicleYear);

  const { rows } = await query(
    `SELECT gf.article_no, gf.part_type, gf.article_group, gf.brand,
            gf.model, gf.engine_codes, gf.powered_units, gf.comments,
            gf.year_from_year, gf.year_from_month, gf.year_to_year, gf.year_to_month
     FROM gates_fitment gf
     WHERE gf.engine_codes && $1::text[]
     ${yearFilter}
     ORDER BY gf.part_type, gf.article_no`,
    params
  );

  // Group by part_type, deduplicate article_no within each group
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.part_type]) grouped[row.part_type] = [];
    const existing = grouped[row.part_type].find(p => p.articleNo === row.article_no);
    if (!existing) {
      grouped[row.part_type].push({
        articleNo:    row.article_no,
        brand:        row.brand,
        partType:     row.part_type,
        articleGroup: row.article_group,
        poweredUnits: row.powered_units || null,
        comments:     row.comments || null,
        yearFrom:     row.year_from_year ? `${String(row.year_from_month).padStart(2,'0')}/${row.year_from_year}` : null,
        yearTo:       row.year_to_year   ? `${String(row.year_to_month).padStart(2,'0')}/${row.year_to_year}`   : 'present',
      });
    }
  }

  return grouped;
}

module.exports = { searchProvider, applyMarkup, getWorkshopSettings, formatPart, lookupGatesFitment };
