const bcrypt = require('bcrypt');
const { query } = require('./db');
const { lookupVehicle } = require('./vehicleProviders');
const { findOrCreateVehicle } = require('./vehicleService');
const { fetchAndStoreMotHistory } = require('./motService');

async function searchVehicles({ registration, make, model }) {
  const conditions = [];
  const params = [];
  if (registration) {
    const reg = registration.replace(/\s+/g, '').toUpperCase();
    conditions.push(`REPLACE(UPPER(registration), ' ', '') = $${params.length + 1}`);
    params.push(reg);
  }
  if (make) { conditions.push(`LOWER(make) LIKE $${params.length + 1}`); params.push(`%${make.toLowerCase()}%`); }
  if (model) { conditions.push(`LOWER(model) LIKE $${params.length + 1}`); params.push(`%${model.toLowerCase()}%`); }

  if (!conditions.length) return { error: 'Provide at least one search term (registration, make, or model)' };

  const { rows } = await query(
    `SELECT id, registration, make, model, year, fuel_type, engine_code
     FROM vehicles WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 10`,
    params
  );
  return rows.length ? { vehicles: rows } : { message: 'No matching vehicles found.' };
}

async function searchCustomers({ name, email }) {
  const conditions = ["role = 'customer'"];
  const params = [];
  if (name) { conditions.push(`LOWER(name) LIKE $${params.length + 1}`); params.push(`%${name.toLowerCase()}%`); }
  if (email) { conditions.push(`LOWER(email) LIKE $${params.length + 1}`); params.push(`%${email.toLowerCase()}%`); }

  const { rows } = await query(
    `SELECT id, name, email, phone FROM users WHERE ${conditions.join(' AND ')} ORDER BY name LIMIT 20`,
    params
  );
  return rows.length ? { customers: rows } : { message: 'No matching customers found.' };
}

async function createCustomer({ name, email, phone }) {
  if (!email) return { error: 'email is required' };
  const { rows: existing } = await query('SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.length) {
    return { error: `A customer with that email already exists (${existing[0].name || email}).` };
  }
  const hashed = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
  const { rows } = await query(
    `INSERT INTO users (email, password, role, name, phone, subscribed, session_active)
     VALUES ($1, $2, 'customer', $3, $4, false, false) RETURNING id, name, email, phone`,
    [email.toLowerCase().trim(), hashed, name?.trim() || null, phone?.trim() || null]
  );
  return { created: true, customer: rows[0], message: `Customer ${rows[0].name || rows[0].email} created.` };
}

async function createProject({ registration, make, model, year, fuel_type, engine_code }, userId) {
  if (!registration && !(make && model)) {
    return { error: 'Provide a registration plate, or at least make and model.' };
  }

  let vehicleData;
  const reg = registration ? registration.trim().toUpperCase().replace(/\s+/g, '') : null;

  if (reg) {
    try {
      vehicleData = await lookupVehicle(reg);
    } catch {
      vehicleData = {
        registration: reg, make: make || null, model: model || null,
        year: year ? String(year) : null, fuelType: fuel_type || null,
        engineCode: engine_code || null, source: 'manual',
      };
    }
  } else {
    vehicleData = {
      registration: null, make, model, year: year ? String(year) : null,
      fuelType: fuel_type || null, engineCode: engine_code || null, source: 'manual',
    };
  }

  const vehicle = await findOrCreateVehicle(vehicleData);

  const { rows } = await query(
    `INSERT INTO projects
       (user_id, vehicle_id, registration_snapshot, registration, vin,
        make, model, year, engine_code, fuel_type, trim, body_type, source, active, closed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,false) RETURNING id`,
    [userId, vehicle.id,
     vehicleData.registration, vehicleData.registration, vehicleData.vin || null,
     vehicleData.make, vehicleData.model, vehicleData.year,
     vehicleData.engineCode || null, vehicleData.fuelType || null,
     vehicleData.trim || null, vehicleData.bodyType || null, vehicleData.source]
  );

  const projectId = rows[0].id;

  if (vehicle.id && vehicleData.registration) {
    fetchAndStoreMotHistory(vehicle.id, vehicleData.registration).catch(() => {});
  }

  const vehicleLabel = [vehicleData.year, vehicleData.make, vehicleData.model]
    .filter(Boolean).join(' ') || vehicleData.registration || 'vehicle';

  return {
    created: true,
    projectId,
    registration: vehicleData.registration,
    vehicle: vehicleLabel,
    message: `Project created for ${vehicleLabel}. It will appear in the project list — click it to open the job.`,
  };
}

async function listProjects({ status, limit = 10 }, userId) {
  const conditions = ['p.user_id = $1', 'p.archived_at IS NULL'];
  const params = [userId];
  if (status === 'active') conditions.push('p.closed = false');
  else if (status === 'closed') conditions.push('p.closed = true');

  const { rows } = await query(
    `SELECT p.id,
       COALESCE(p.registration_snapshot, p.registration) AS registration,
       COALESCE(p.make, v.mot_vehicle_meta->>'make') AS make,
       COALESCE(p.model, v.mot_vehicle_meta->>'model') AS model,
       COALESCE(p.year, SUBSTRING(COALESCE(v.mot_vehicle_meta->>'firstUsedDate', v.mot_vehicle_meta->>'manufactureDate'), 1, 4)) AS year,
       p.closed, p.updated_at
     FROM projects p
     LEFT JOIN vehicles v ON v.id = p.vehicle_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.updated_at DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  if (!rows.length) return { message: 'No projects found.' };

  return {
    projects: rows.map((r) => ({
      id: r.id,
      registration: r.registration || '—',
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(' ') || 'Unknown',
      status: r.closed ? 'closed' : 'active',
      updatedAt: new Date(r.updated_at).toLocaleDateString('en-GB'),
    })),
  };
}

const adminToolDefinitions = [
  {
    name: 'search_vehicles',
    description: 'Search for vehicles in the workshop database by registration plate, make, or model.',
    input_schema: {
      type: 'object',
      properties: {
        registration: { type: 'string', description: 'Registration plate' },
        make: { type: 'string', description: 'Vehicle make' },
        model: { type: 'string', description: 'Vehicle model' },
      },
    },
  },
  {
    name: 'search_customers',
    description: 'Search existing customers by name or email.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name (partial match)' },
        email: { type: 'string', description: 'Customer email (partial match)' },
      },
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer. ALWAYS confirm name, email and phone with the user before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name' },
        email: { type: 'string', description: 'Email address (required)' },
        phone: { type: 'string', description: 'Phone number' },
      },
      required: ['email'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new job/project for a vehicle. Providing a registration plate is preferred — the system looks up the vehicle automatically. ALWAYS confirm the details with the user before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        registration: { type: 'string', description: 'UK registration plate — triggers automatic vehicle lookup' },
        make: { type: 'string', description: 'Vehicle make (only if no registration)' },
        model: { type: 'string', description: 'Vehicle model' },
        year: { type: 'string', description: 'Year' },
        fuel_type: { type: 'string', description: 'Fuel type' },
        engine_code: { type: 'string', description: 'Engine code' },
      },
    },
  },
  {
    name: 'list_projects',
    description: 'List recent projects in the workshop.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'closed', 'all'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max number of results (default 10)' },
      },
    },
  },
];

function createAdminToolHandlers(userId) {
  return {
    search_vehicles: searchVehicles,
    search_customers: searchCustomers,
    create_customer: createCustomer,
    create_project: (input) => createProject(input, userId),
    list_projects: (input) => listProjects(input, userId),
  };
}

module.exports = { adminToolDefinitions, createAdminToolHandlers };
