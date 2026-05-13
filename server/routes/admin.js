const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { findUserByToken, createUser } = require('../services/authService');
const { query } = require('../services/db');
const admin = require('../services/adminService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router();

const WORKSHOP_ROLES = ['owner', 'admin', 'tech'];
const ADMIN_ROLES = ['owner', 'admin', 'sysadmin'];
const OWNER_ROLES = ['owner', 'sysadmin'];

const PLAN_SEATS = { starter: 3, professional: 10, enterprise: 0 };

async function checkSeatAvailability(workshopId) {
  const { rows } = await query(
    `SELECT w.seat_limit, COUNT(u.id)::int AS used
     FROM workshops w
     LEFT JOIN users u ON u.workshop_id = w.id AND u.role IN ('owner','admin','tech')
     WHERE w.id = $1
     GROUP BY w.seat_limit`,
    [workshopId]
  );
  if (!rows.length) throw new Error('Workshop not found');
  const { seat_limit, used } = rows[0];
  if (seat_limit > 0 && used >= seat_limit) {
    throw new Error(`Seat limit reached (${used}/${seat_limit}). Upgrade your plan to add more staff.`);
  }
  return { seat_limit, used };
}

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = user;
    req.workshopId = user.workshopId;
    next();
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}

router.use(requireAdmin);

// Dashboard
router.get('/dashboard', async (req, res) => {
  const stats = await admin.getDashboardStats(req.workshopId);
  return res.json(stats);
});

// Users
router.get('/users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const users = await admin.listUsers({ limit, offset, workshopId: req.workshopId });
  return res.json(users);
});

router.get('/users/:id', async (req, res) => {
  const user = await admin.getUser(req.params.id, req.workshopId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

router.post('/users', async (req, res) => {
  const { email, password, role = 'tech', subscribed = false } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const user = await createUser(email, password);
    await query('UPDATE users SET role = $1, subscribed = $2 WHERE id = $3', [role, subscribed, user.id]);
    return res.status(201).json({ ...user, role, subscribed });
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
});

router.post('/users/:id/logout', async (req, res) => {
  await query('UPDATE users SET token = NULL, session_active = false WHERE id = $1', [req.params.id]);
  return res.json({ loggedOut: true });
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { role, subscribed } = req.body;
    const updated = await admin.updateUser(req.params.id, { role, subscribed });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// AI requests
router.get('/ai-requests', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId || null;
  const requests = await admin.listAiRequests({ limit, offset, userId, workshopId: req.workshopId });
  return res.json(requests);
});

router.get('/ai-requests/stats', async (req, res) => {
  const stats = await admin.getAiStats(req.workshopId);
  return res.json(stats);
});

// Conversations
router.get('/projects/:projectId/conversation', async (req, res) => {
  const convo = await admin.getProjectConversation(req.params.projectId, req.workshopId);
  if (!convo) return res.status(404).json({ error: 'Project not found' });
  return res.json(convo);
});

// Learning stats
router.get('/learning', async (req, res) => {
  const data = await admin.getLearningStats(req.workshopId);
  return res.json(data);
});

// Projects
router.get('/projects', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const projects = await admin.listProjects({ limit, offset, workshopId: req.workshopId });
  return res.json(projects);
});

// Knowledge base
router.get('/knowledge-base', async (req, res) => {
  const { category, make, search } = req.query;
  const entries = await admin.listKnowledgeBase({ category, make, search, workshopId: req.workshopId });
  return res.json(entries);
});

router.post('/knowledge-base', async (req, res) => {
  try {
    const entry = await admin.createKnowledgeBaseEntry(req.body, req.admin.id, req.workshopId);
    return res.status(201).json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/knowledge-base/:id', async (req, res) => {
  try {
    const entry = await admin.updateKnowledgeBaseEntry(req.params.id, req.body, req.workshopId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    return res.json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/knowledge-base/:id', async (req, res) => {
  await admin.deleteKnowledgeBaseEntry(req.params.id, req.workshopId);
  return res.json({ deleted: true });
});

// PDF knowledge import
router.post('/knowledge/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
  try {
    const { text } = await pdfParse(req.file.buffer);
    const chunks = chunkPdfText(text);
    return res.json({ chunks });
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse PDF: ' + err.message });
  }
});

router.post('/knowledge/import-chunks', async (req, res) => {
  const { chunks } = req.body;
  if (!Array.isArray(chunks) || !chunks.length) {
    return res.status(400).json({ error: 'chunks array is required' });
  }
  const saved = [];
  for (const chunk of chunks) {
    if (!chunk.title?.trim() || !chunk.content?.trim()) continue;
    const { rows } = await query(
      `INSERT INTO knowledge_base
         (category, make, model, year_from, year_to, fault_code, title, content, source, engine_id, transmission_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        chunk.category || 'General',
        chunk.make || null,
        chunk.model || null,
        chunk.year_from || null,
        chunk.year_to || null,
        chunk.fault_code || null,
        chunk.title.trim(),
        chunk.content.trim(),
        chunk.source || null,
        chunk.engine_id || null,
        chunk.transmission_id || null,
        req.admin.id,
      ]
    );
    saved.push(rows[0].id);
  }
  return res.json({ imported: saved.length });
});

function chunkPdfText(text) {
  // Normalise line endings, collapse 3+ newlines to 2
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paragraphs = normalised.split('\n\n').map((p) => p.trim()).filter(Boolean);

  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    // Skip page-number-only lines and very short noise
    if (/^\d+$/.test(para) || para.length < 40) continue;

    if (buffer.length === 0) {
      buffer = para;
    } else if (buffer.length + para.length < 1200) {
      buffer += '\n\n' + para;
    } else {
      chunks.push(makeChunk(buffer));
      buffer = para;
    }
  }
  if (buffer.length >= 40) chunks.push(makeChunk(buffer));

  return chunks;
}

function makeChunk(text) {
  const lines = text.split('\n');
  // First line is the title if it's short enough, otherwise truncate
  const firstLine = lines[0].trim();
  const title = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 117) + '…';
  return { title, content: text, category: 'General', make: '', model: '', year_from: '', year_to: '', fault_code: '', source: '', engine_id: '', transmission_id: '', included: true };
}

// ── Customer management ──────────────────────────────────────────────────────

function formatCustomer(r) {
  return {
    id: r.id, email: r.email, name: r.name || '', phone: r.phone || '',
    addressLine1: r.address_line1 || '', addressLine2: r.address_line2 || '',
    city: r.city || '', postcode: r.postcode || '',
    createdAt: r.created_at,
    vehicleCount: parseInt(r.vehicle_count) || 0,
    totalSpend: r.total_spend ? Math.round(parseFloat(r.total_spend) * 100) / 100 : 0,
    lastPortalAccess: r.last_seen_at || null,
  };
}

router.get('/customers', async (req, res) => {
  const wid = req.workshopId;
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.phone, u.address_line1, u.address_line2,
            u.city, u.postcode, u.created_at, u.last_seen_at,
            COUNT(DISTINCT cv.id) as vehicle_count,
            COALESCE((
              SELECT SUM(ql.qty * (ql.unit_cost * (1 + ql.markup_pct/100)) * (1 + q.vat_rate/100))
              FROM quotes q
              JOIN projects p ON p.id = q.project_id
              JOIN customer_vehicles cv2 ON cv2.vehicle_id = p.vehicle_id AND cv2.customer_id = u.id
              JOIN quote_lines ql ON ql.quote_id = q.id
              WHERE q.status = 'approved' AND q.customer_id = u.id
            ), 0) AS total_spend
     FROM users u
     LEFT JOIN customer_vehicles cv ON cv.customer_id = u.id
     WHERE u.role = 'customer' AND u.workshop_id = $1
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [wid]
  );
  return res.json(rows.map(formatCustomer));
});

router.post('/customers', async (req, res) => {
  const { email, password, name, phone, addressLine1, addressLine2, city, postcode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const bcrypt = require('bcrypt');
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password, role, subscribed, name, phone, address_line1, address_line2, city, postcode)
       VALUES ($1,$2,'customer',true,$3,$4,$5,$6,$7,$8)
       RETURNING id, email, name, phone, address_line1, address_line2, city, postcode, created_at`,
      [email, hashed, name || null, phone || null, addressLine1 || null, addressLine2 || null, city || null, postcode || null]
    );
    return res.status(201).json({ ...formatCustomer(rows[0]), vehicleCount: 0 });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/customers/:id', async (req, res) => {
  const { name, phone, addressLine1, addressLine2, city, postcode, email } = req.body;
  const { rows } = await query(
    `UPDATE users SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       address_line1 = COALESCE($3, address_line1),
       address_line2 = COALESCE($4, address_line2),
       city = COALESCE($5, city),
       postcode = COALESCE($6, postcode),
       email = COALESCE($7, email)
     WHERE id = $8 AND role = 'customer'
     RETURNING id, email, name, phone, address_line1, address_line2, city, postcode, created_at`,
    [name ?? null, phone ?? null, addressLine1 ?? null, addressLine2 ?? null,
     city ?? null, postcode ?? null, email ?? null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
  return res.json(formatCustomer(rows[0]));
});

router.get('/customers/:id/vehicles', async (req, res) => {
  const { rows } = await query(
    `SELECT v.id, v.registration, v.make, v.model, v.year, cv.created_at as linked_at
     FROM customer_vehicles cv JOIN vehicles v ON v.id = cv.vehicle_id
     WHERE cv.customer_id = $1 ORDER BY cv.created_at DESC`,
    [req.params.id]
  );
  return res.json(rows.map((r) => ({
    id: r.id, registration: r.registration, make: r.make,
    model: r.model, year: r.year, linkedAt: r.linked_at,
  })));
});

router.post('/customers/:id/vehicles', async (req, res) => {
  const { registration } = req.body;
  if (!registration) return res.status(400).json({ error: 'Registration is required' });
  const cleaned = registration.trim().toUpperCase().replace(/\s+/g, '');
  const { rows: vr } = await query(
    `SELECT v.* FROM vehicles v
     JOIN vehicle_registrations vr ON vr.vehicle_id = v.id
     WHERE vr.registration = $1 AND vr.assigned_to IS NULL
     LIMIT 1`,
    [cleaned]
  );
  if (!vr.length) {
    // Fallback: match by vehicles.registration directly
    const { rows: vd } = await query('SELECT * FROM vehicles WHERE registration = $1 LIMIT 1', [cleaned]);
    if (!vd.length) return res.status(404).json({ error: 'Vehicle not found — create a project for this registration first' });
    vr.push(vd[0]);
  }
  const vehicle = vr[0];
  try {
    await query('INSERT INTO customer_vehicles (customer_id, vehicle_id) VALUES ($1,$2)', [req.params.id, vehicle.id]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Vehicle already linked to this customer' });
    throw err;
  }
  return res.json({ id: vehicle.id, registration: cleaned, make: vehicle.make, model: vehicle.model, year: vehicle.year });
});

router.delete('/customers/:id/vehicles/:vehicleId', async (req, res) => {
  await query('DELETE FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2', [req.params.id, req.params.vehicleId]);
  return res.json({ deleted: true });
});

// GET /api/admin/customers/:id/stats — spend, activity, job history
router.get('/customers/:id/stats', async (req, res) => {
  const customerId = req.params.id;

  const [{ rows: userRows }, { rows: jobRows }, { rows: spendRows }] = await Promise.all([
    query(
      `SELECT id, email, name, created_at, last_seen_at,
              (SELECT MAX(created_at) FROM login_history WHERE user_id = $1) AS last_staff_login
       FROM users WHERE id = $1 AND role = 'customer'`,
      [customerId]
    ),
    query(
      `SELECT p.id, p.created_at, p.closed,
              COALESCE(p.registration_snapshot, p.registration) AS registration,
              COALESCE(p.make, v.make) AS make,
              COALESCE(p.model, v.model) AS model,
              COALESCE(p.year, v.year) AS year,
              jr.cost_total AS report_total,
              jr.published_at,
              q.id AS quote_id,
              q.reference AS quote_ref,
              q.status AS quote_status,
              q.vat_rate,
              q.updated_at AS quote_date,
              (SELECT SUM(ql.qty * (ql.unit_cost * (1 + ql.markup_pct / 100)))
               FROM quote_lines ql WHERE ql.quote_id = q.id) AS quote_subtotal
       FROM projects p
       JOIN customer_vehicles cv ON cv.vehicle_id = p.vehicle_id AND cv.customer_id = $1
       LEFT JOIN vehicles v ON v.id = p.vehicle_id
       LEFT JOIN job_reports jr ON jr.project_id = p.id AND jr.status = 'published'
       LEFT JOIN quotes q ON q.project_id = p.id AND q.customer_id = $1
                         AND q.status IN ('sent','approved')
       ORDER BY p.created_at DESC`,
      [customerId]
    ),
    query(
      `SELECT COALESCE(SUM(
         ql.qty * (ql.unit_cost * (1 + ql.markup_pct / 100)) * (1 + q.vat_rate / 100)
       ), 0) AS total_spend,
       COUNT(DISTINCT q.id) AS approved_count
       FROM quotes q
       JOIN projects p ON p.id = q.project_id
       JOIN customer_vehicles cv ON cv.vehicle_id = p.vehicle_id AND cv.customer_id = $1
       JOIN quote_lines ql ON ql.quote_id = q.id
       WHERE q.status = 'approved' AND q.customer_id = $1`,
      [customerId]
    ),
  ]);

  if (!userRows.length) return res.status(404).json({ error: 'Customer not found' });
  const u = userRows[0];
  const spend = spendRows[0];

  const jobs = jobRows.map((r) => {
    const subtotal = r.quote_subtotal ? parseFloat(r.quote_subtotal) : null;
    const vatRate = r.vat_rate ? parseFloat(r.vat_rate) : 20;
    const quoteTotal = subtotal != null ? Math.round(subtotal * (1 + vatRate / 100) * 100) / 100 : null;
    return {
      id: r.id,
      openedAt: r.created_at,
      closed: r.closed,
      registration: r.registration,
      vehicle: [r.make, r.model, r.year].filter(Boolean).join(' '),
      reportTotal: r.report_total ? parseFloat(r.report_total) : null,
      publishedAt: r.published_at,
      quoteId: r.quote_id || null,
      quoteRef: r.quote_ref || null,
      quoteStatus: r.quote_status || null,
      quoteTotal,
      quoteDate: r.quote_date || null,
    };
  });

  return res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.created_at,
    lastPortalAccess: u.last_seen_at || null,
    totalSpend: Math.round(parseFloat(spend.total_spend) * 100) / 100,
    approvedQuoteCount: parseInt(spend.approved_count) || 0,
    jobCount: jobs.length,
    jobs,
  });
});

// ── Role permissions (manager only) ────────────────────────────────────────

// GET /api/admin/role-permissions — list all permissions for this workshop
router.get('/role-permissions', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const wid = req.workshopId;
  const { rows } = await query(
    `SELECT role, feature, allowed FROM workshop_role_permissions WHERE workshop_id = $1 ORDER BY role, feature`,
    [wid]
  );
  return res.json(rows);
});

// PATCH /api/admin/role-permissions — update a specific permission
router.patch('/role-permissions', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const { role, feature, allowed } = req.body;
  if (!role || !feature || allowed === undefined) {
    return res.status(400).json({ error: 'role, feature and allowed are required' });
  }
  const wid = req.workshopId;
  const { rows } = await query(
    `INSERT INTO workshop_role_permissions (workshop_id, role, feature, allowed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workshop_id, role, feature) DO UPDATE SET allowed = $4
     RETURNING role, feature, allowed`,
    [wid, role, feature, allowed]
  );
  return res.json(rows[0]);
});

// ── Workshop staff management (manager only) ────────────────────────────────

// GET /api/admin/staff — list workshop users + seat usage
router.get('/staff', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const wid = req.workshopId;
  const [staffResult, seatResult] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              (SELECT MAX(created_at) FROM login_history WHERE user_id = u.id) AS last_login,
              (SELECT COUNT(*)::int FROM projects WHERE user_id = u.id) AS project_count
       FROM users u
       WHERE u.workshop_id = $1 AND u.role IN ('owner','admin','tech')
       ORDER BY u.created_at ASC`,
      [wid]
    ),
    query(`SELECT seat_limit FROM workshops WHERE id = $1`, [wid]),
  ]);
  return res.json({
    staff: staffResult.rows,
    seat_limit: seatResult.rows[0]?.seat_limit ?? 10,
    seat_used: staffResult.rows.length,
  });
});

// POST /api/admin/staff — create a workshop staff account
router.post('/staff', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const { email, password, name, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password and role are required' });
  }
  if (!['owner', 'admin', 'tech'].includes(role)) {
    return res.status(400).json({ error: 'Role must be owner, admin or tech' });
  }
  try { await checkSeatAvailability(req.workshopId); } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  const bcrypt = require('bcrypt');
  const crypto = require('crypto');
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Email already in use' });
  const hashed = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `INSERT INTO users (email, password, role, subscribed, name, workshop_id, token)
     VALUES ($1,$2,$3,true,$4,$5,$6)
     RETURNING id, email, name, role, created_at`,
    [email, hashed, role, name || null, req.workshopId, token]
  );
  return res.status(201).json(rows[0]);
});

// PATCH /api/admin/staff/:id — change role of a staff member
router.patch('/staff/:id', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const { role, name } = req.body;
  if (role && !['owner', 'admin', 'tech'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const fields = [];
  const vals = [];
  let i = 1;
  if (role) { fields.push(`role = $${i++}`); vals.push(role); }
  if (name !== undefined) { fields.push(`name = $${i++}`); vals.push(name); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id, req.workshopId);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i++} AND workshop_id = $${i} RETURNING id, email, name, role`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
  return res.json(rows[0]);
});

// DELETE /api/admin/staff/:id — remove a staff member
router.delete('/staff/:id', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  await query('DELETE FROM users WHERE id=$1 AND workshop_id=$2 AND role IN (\'owner\',\'admin\',\'tech\')',
    [req.params.id, req.workshopId]);
  return res.json({ deleted: true });
});

// Search vehicles for customer linking
router.get('/vehicles/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const term = q.trim().toUpperCase().replace(/\s+/g, '');
  const { rows } = await query(
    `SELECT DISTINCT v.id, v.registration, v.make, v.model, v.year
     FROM vehicles v
     LEFT JOIN vehicle_registrations vr ON vr.vehicle_id = v.id
     WHERE v.registration ILIKE $1 OR vr.registration ILIKE $1
        OR v.make ILIKE $2 OR v.model ILIKE $2
     LIMIT 10`,
    [`${term}%`, `%${q.trim()}%`]
  );
  return res.json(rows);
});

module.exports = router;
