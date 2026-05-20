const { query } = require('../db');
const { lookupGatesFitment } = require('../partsService');

async function lookupGatesParts({ engine_code, vehicle_year }) {
  if (!engine_code) return { message: 'engine_code is required.' };
  const grouped = await lookupGatesFitment(engine_code, vehicle_year || null);
  if (!Object.keys(grouped).length) {
    return { message: `No Gates fitment data found for engine code ${engine_code.toUpperCase()}.` };
  }
  return { engine_code: engine_code.toUpperCase(), vehicle_year: vehicle_year || null, parts: grouped };
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
    const { rows } = await query(
      `SELECT ef.id, ef.make, ef.family_name, ef.codename, ef.also_known_as,
              ef.wiki_title, ef.wiki_url, ef.engine_codes, ef.notes
       FROM engine_families ef
       WHERE ef.id = (SELECT family_id FROM engine_codes WHERE UPPER(code) = UPPER($1) AND family_id IS NOT NULL LIMIT 1)
          OR ef.engine_codes::text ILIKE $2`,
      [code, `%"${code.toUpperCase()}"%`]
    );
    if (!rows.length) return { message: `No engine family found containing code ${code}` };
    familyRows = rows.slice(0, 1);
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
  if (year)  {
    params.push(year);
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

const lookupToolDefinitions = [
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
];

const lookupToolHandlers = {
  lookup_gates_parts:   lookupGatesParts,
  lookup_dtc_code:      lookupDtcCode,
  lookup_engine_code:   lookupEngineCode,
  lookup_vehicle_specs: lookupVehicleSpecs,
  lookup_engine_family: lookupEngineFamily,
};

module.exports = { lookupToolDefinitions, lookupToolHandlers };
