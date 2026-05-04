const axios = require('axios');
const { query } = require('./db');

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

async function searchKnowledgeBase({ make, model, year, symptom }) {
  const { rows } = await query(
    `SELECT cs.text, p.make, p.model, p.year, p.engine_code,
            COUNT(*) OVER (PARTITION BY cs.text) as frequency
     FROM confirmed_suggestions cs
     JOIN projects p ON cs.project_id = p.id
     WHERE LOWER(p.make) = LOWER($1)
       AND LOWER(p.model) = LOWER($2)
       AND ($3::varchar IS NULL OR p.year = $3)
       AND cs.text ILIKE $4
     ORDER BY frequency DESC
     LIMIT 5`,
    [make, model, year || null, `%${symptom}%`]
  );

  if (!rows.length) {
    return { message: 'No confirmed fixes found in the knowledge base for this vehicle and symptom yet.' };
  }

  return {
    confirmedFixes: rows.map((r) => ({
      answer: r.text,
      make: r.make,
      model: r.model,
      year: r.year,
      engineCode: r.engine_code,
      confirmedCount: parseInt(r.frequency),
    })),
  };
}

async function getCommonFixes({ make, model, year }) {
  const { rows } = await query(
    `SELECT cs.text, COUNT(*) as confirmed_count, p.make, p.model, p.year
     FROM confirmed_suggestions cs
     JOIN projects p ON cs.project_id = p.id
     WHERE LOWER(p.make) = LOWER($1)
       AND LOWER(p.model) = LOWER($2)
       AND ($3::varchar IS NULL OR p.year = $3)
     GROUP BY cs.text, p.make, p.model, p.year
     ORDER BY confirmed_count DESC
     LIMIT 5`,
    [make, model, year || null]
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
    description: 'Search the workshop knowledge base for confirmed fixes from other technicians for this vehicle and symptom.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'string' },
        symptom: { type: 'string', description: 'The symptom or fault description to search for' },
      },
      required: ['make', 'model', 'symptom'],
    },
  },
  {
    name: 'get_common_fixes',
    description: 'Get the most commonly confirmed fixes for this vehicle across all technicians in the workshop network.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'string' },
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
];

const toolHandlers = {
  get_vehicle_specs: getVehicleSpecs,
  search_knowledge_base: searchKnowledgeBase,
  get_common_fixes: getCommonFixes,
  get_dtc_info: getDtcInfo,
};

module.exports = { toolDefinitions, toolHandlers };
