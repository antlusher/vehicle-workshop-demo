const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { sendCustomerActivation } = require('../services/emailService');

const router = express.Router();

// POST /api/customer/activate — set password via magic token (first login / password reset)
router.post('/activate', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { rows } = await query(
    `SELECT * FROM users WHERE magic_token = $1 AND magic_token_expires_at > now() AND role = 'customer'`,
    [token]
  );
  if (!rows.length) return res.status(401).json({ error: 'Activation link has expired or already been used' });

  const user = rows[0];
  const hashed = await bcrypt.hash(password, 10);
  const sessionToken = crypto.randomBytes(32).toString('hex');

  await query(
    `UPDATE users SET password=$1, magic_token=NULL, magic_token_expires_at=NULL,
     token=$2, session_active=true, last_seen_at=now() WHERE id=$3`,
    [hashed, sessionToken, user.id]
  );

  return res.json({ token: sessionToken, role: user.role, email: user.email, name: user.name });
});

// POST /api/customer/login — email + password login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { rows } = await query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = 'customer' ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`,
    [email]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

  const user = rows[0];
  if (!user.password) return res.status(401).json({ error: 'Account not yet activated — check your email for an activation link' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await query(
    `UPDATE users SET token=$1, session_active=true, last_seen_at=now() WHERE id=$2`,
    [sessionToken, user.id]
  );

  return res.json({ token: sessionToken, role: user.role, email: user.email, name: user.name });
});

// POST /api/customer/forgot-password — send new activation link
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const { rows } = await query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = 'customer' ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`,
    [email]
  );
  // Always return success — avoid email enumeration
  if (!rows.length) return res.json({ ok: true });

  const user = rows[0];
  const magicToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await query(
    `UPDATE users SET magic_token=$1, magic_token_expires_at=$2 WHERE id=$3`,
    [magicToken, expires, user.id]
  );

  const { rows: wsRows } = await query('SELECT name FROM workshops WHERE id=$1', [user.workshop_id]);
  const customerOrigin = process.env.CUSTOMER_PORTAL_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  sendCustomerActivation({
    to: user.email,
    customerName: user.name,
    workshopName: wsRows[0]?.name || '',
    activationUrl: `${customerOrigin}/?activate=${magicToken}`,
    isReset: true,
  }).catch((err) => console.error('[forgot-password email]', err.message));

  return res.json({ ok: true });
});

// POST /api/customer/magic-login — exchange a magic token for a session token
router.post('/magic-login', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const { rows } = await query(
    `SELECT * FROM users WHERE magic_token = $1 AND magic_token_expires_at > now()`,
    [token]
  );
  if (!rows.length) return res.status(401).json({ error: 'Link expired or invalid' });

  const user = rows[0];
  // Generate a session token and burn the magic token in one update
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await query(
    `UPDATE users SET magic_token = NULL, magic_token_expires_at = NULL,
     token = $2, session_active = true, last_seen_at = now() WHERE id = $1`,
    [user.id, sessionToken]
  );

  return res.json({ token: sessionToken, role: user.role, email: user.email, name: user.name });
});

function requireCustomer(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user || user.role !== 'customer') {
      return res.status(403).json({ error: 'Customer access required' });
    }
    req.user = user;
    next();
  }).catch(() => res.status(403).json({ error: 'Customer access required' }));
}

// GET /api/customer/notifications — recent reports + quotes (last 60 days)
router.get('/notifications', requireCustomer, async (req, res) => {
  const { rows } = await query(
    `SELECT
       'report' AS type,
       p.id AS project_id,
       COALESCE(p.registration_snapshot, p.registration) AS registration,
       COALESCE(p.make, v.make) AS make,
       COALESCE(p.model, v.model) AS model,
       jr.published_at AS event_at
     FROM job_reports jr
     JOIN projects p ON p.id = jr.project_id
     LEFT JOIN vehicles v ON v.id = p.vehicle_id
     JOIN customer_vehicles cv ON cv.vehicle_id = p.vehicle_id AND cv.customer_id = $1
     WHERE jr.status = 'published'
       AND jr.published_at > now() - interval '60 days'
     UNION ALL
     SELECT
       'quote' AS type,
       p.id AS project_id,
       COALESCE(p.registration_snapshot, p.registration) AS registration,
       COALESCE(p.make, v.make) AS make,
       COALESCE(p.model, v.model) AS model,
       q.sent_at AS event_at
     FROM quotes q
     JOIN projects p ON p.id = q.project_id
     LEFT JOIN vehicles v ON v.id = p.vehicle_id
     JOIN customer_vehicles cv ON cv.vehicle_id = p.vehicle_id AND cv.customer_id = $1
     WHERE q.status IN ('sent','approved')
       AND q.sent_at IS NOT NULL
       AND q.sent_at > now() - interval '60 days'
     ORDER BY event_at DESC
     LIMIT 20`,
    [req.user.id]
  );
  return res.json(rows.map((r) => ({
    type: r.type,
    projectId: r.project_id,
    registration: r.registration,
    vehicle: [r.make, r.model].filter(Boolean).join(' '),
    eventAt: r.event_at,
  })));
});

// GET /api/customer/vehicles — list all vehicles linked to this customer
router.get('/vehicles', requireCustomer, async (req, res) => {
  const { rows } = await query(
    `SELECT v.*, cv.created_at as linked_at,
            COUNT(DISTINCT p.id) FILTER (
              WHERE EXISTS (SELECT 1 FROM job_reports jr WHERE jr.project_id = p.id AND jr.status = 'published')
            ) as published_job_count,
            MAX(p.created_at) as last_job_at
     FROM customer_vehicles cv
     JOIN vehicles v ON v.id = cv.vehicle_id
     LEFT JOIN projects p ON p.vehicle_id = v.id
     WHERE cv.customer_id = $1
     GROUP BY v.id, cv.created_at
     ORDER BY last_job_at DESC NULLS LAST`,
    [req.user.id]
  );
  return res.json(rows.map((r) => ({
    id: r.id,
    registration: r.registration,
    make: r.make,
    model: r.model,
    year: r.year,
    fuelType: r.fuel_type,
    linkedAt: r.linked_at,
    publishedJobCount: parseInt(r.published_job_count) || 0,
    lastJobAt: r.last_job_at,
  })));
});

// GET /api/customer/vehicles/:vehicleId/jobs — list published jobs + jobs with sent quotes
router.get('/vehicles/:vehicleId/jobs', requireCustomer, async (req, res) => {
  // Verify customer is linked to this vehicle
  const { rows: link } = await query(
    'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
    [req.user.id, req.params.vehicleId]
  );
  if (!link.length) return res.status(403).json({ error: 'Not authorised' });

  const { rows } = await query(
    `SELECT p.id, p.registration_snapshot, p.registration, p.make, p.model, p.year,
            p.created_at, p.closed,
            jr.id as report_id, jr.diagnosis, jr.cost_total, jr.published_at,
            (SELECT q.id   FROM quotes q WHERE q.project_id = p.id AND q.status IN ('sent','approved') ORDER BY q.updated_at DESC LIMIT 1) AS quote_id,
            (SELECT q.status FROM quotes q WHERE q.project_id = p.id AND q.status IN ('sent','approved') ORDER BY q.updated_at DESC LIMIT 1) AS quote_status
     FROM projects p
     LEFT JOIN job_reports jr ON jr.project_id = p.id AND jr.status = 'published'
     WHERE p.vehicle_id = $1
       AND (jr.id IS NOT NULL
            OR EXISTS (SELECT 1 FROM quotes q WHERE q.project_id = p.id AND q.status IN ('sent','approved')))
     ORDER BY p.created_at DESC`,
    [req.params.vehicleId]
  );
  return res.json(rows.map((r) => ({
    id: r.id,
    registration: r.registration_snapshot || r.registration,
    make: r.make,
    model: r.model,
    year: r.year,
    openedAt: r.created_at,
    closed: r.closed,
    reportId: r.report_id,
    diagnosisSummary: r.diagnosis ? r.diagnosis.slice(0, 120) + (r.diagnosis.length > 120 ? '…' : '') : null,
    costTotal: r.cost_total ? parseFloat(r.cost_total) : null,
    quoteId: r.quote_id || null,
    quoteStatus: r.quote_status || null,
    publishedAt: r.published_at,
  })));
});

// GET /api/customer/jobs/:projectId — full published report + images + confirmed fixes
router.get('/jobs/:projectId', requireCustomer, async (req, res) => {
  // Verify customer is linked to the vehicle this project belongs to
  const { rows: proj } = await query(
    `SELECT p.*, v.make as v_make, v.model as v_model, v.year as v_year
     FROM projects p
     LEFT JOIN vehicles v ON v.id = p.vehicle_id
     WHERE p.id = $1`,
    [req.params.projectId]
  );
  if (!proj.length) return res.status(404).json({ error: 'Job not found' });
  const project = proj[0];

  if (project.vehicle_id) {
    const { rows: link } = await query(
      'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
      [req.user.id, project.vehicle_id]
    );
    if (!link.length) return res.status(403).json({ error: 'Not authorised' });
  } else {
    return res.status(403).json({ error: 'Not authorised' });
  }

  const [{ rows: reportRows }, { rows: imageRows }, { rows: fixRows }] = await Promise.all([
    query('SELECT * FROM job_reports WHERE project_id=$1 AND status=$2', [req.params.projectId, 'published']),
    query('SELECT * FROM job_images WHERE project_id=$1 ORDER BY created_at ASC', [req.params.projectId]),
    query('SELECT * FROM confirmed_suggestions WHERE project_id=$1 ORDER BY created_at ASC', [req.params.projectId]),
  ]);

  if (!reportRows.length) return res.status(404).json({ error: 'Report not published' });
  const report = reportRows[0];

  return res.json({
    job: {
      id: project.id,
      registration: project.registration_snapshot || project.registration,
      make: project.make || project.v_make,
      model: project.model || project.v_model,
      year: project.year || project.v_year,
      openedAt: project.created_at,
      closed: project.closed,
    },
    report: {
      diagnosis: report.diagnosis || '',
      workCarriedOut: report.work_carried_out || '',
      technicianNotes: report.technician_notes || '',
      costParts: report.cost_parts ? parseFloat(report.cost_parts) : null,
      costLabour: report.cost_labour ? parseFloat(report.cost_labour) : null,
      costTotal: report.cost_total ? parseFloat(report.cost_total) : null,
      publishedAt: report.published_at,
    },
    images: imageRows.map((img) => ({
      id: img.id,
      filename: img.filename,
      caption: img.caption || '',
    })),
    confirmedFixes: fixRows.map((f) => ({ id: f.id, text: f.text, createdAt: f.created_at })),
  });
});

// GET /api/customer/jobs/:projectId/quote — sent/approved quote visible to customer
router.get('/jobs/:projectId/quote', requireCustomer, async (req, res) => {
  const { rows: proj } = await query('SELECT vehicle_id FROM projects WHERE id=$1', [req.params.projectId]);
  if (!proj.length) return res.status(404).json({ error: 'Not found' });

  if (proj[0].vehicle_id) {
    const { rows: link } = await query(
      'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
      [req.user.id, proj[0].vehicle_id]
    );
    if (!link.length) return res.status(403).json({ error: 'Not authorised' });
  } else {
    return res.status(403).json({ error: 'Not authorised' });
  }

  const { rows } = await query(
    `SELECT * FROM quotes WHERE project_id=$1 AND status IN ('sent','approved')
     ORDER BY updated_at DESC LIMIT 1`,
    [req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'No quote available' });
  const quote = rows[0];

  const { rows: itemRows } = await query(
    'SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort_order, created_at',
    [quote.id]
  );
  const { rows: lineRows } = await query(
    'SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at',
    [quote.id]
  );

  const formatLine = (row) => {
    const unitCost = parseFloat(row.unit_cost);
    const markupPct = parseFloat(row.markup_pct);
    const qty = parseFloat(row.qty);
    const unitPrice = Math.round(unitCost * (1 + markupPct / 100) * 100) / 100;
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    return { id: row.id, type: row.type, description: row.description, qty, unitPrice, lineTotal, quoteItemId: row.quote_item_id || null };
  };

  const allLines = lineRows.map(formatLine);
  const vatRate = parseFloat(quote.vat_rate);

  const items = itemRows.map((item) => {
    const lines = allLines.filter((l) => l.quoteItemId === item.id);
    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    return {
      id: item.id,
      title: item.title,
      description: item.description || '',
      notes: item.notes || '',
      lines,
      subtotal,
    };
  });

  const ungroupedLines = allLines.filter((l) => !l.quoteItemId);
  const subtotal = Math.round(allLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

  return res.json({
    id: quote.id,
    status: quote.status,
    notes: quote.notes || '',
    diagnosticSummary: quote.diagnostic_summary || '',
    vatRate,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    items,
    ungroupedLines,
    lines: allLines,
    totals: { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100, vatRate },
  });
});

// GET /api/customer/vehicles/:vehicleId/mot — MOT history + vehicle meta for customer
router.get('/vehicles/:vehicleId/mot', requireCustomer, async (req, res) => {
  const { rows: link } = await query(
    'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
    [req.user.id, req.params.vehicleId]
  );
  if (!link.length) return res.status(403).json({ error: 'Not authorised' });

  const { rows } = await query(
    'SELECT mot_tests, mot_vehicle_meta, make, model, year, fuel_type, registration FROM vehicles WHERE id=$1',
    [req.params.vehicleId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Vehicle not found' });
  const v = rows[0];
  return res.json({
    make: v.make,
    model: v.model,
    year: v.year,
    fuelType: v.fuel_type,
    registration: v.registration,
    motTests: v.mot_tests || [],
    motMeta: v.mot_vehicle_meta || {},
  });
});

// GET /api/customer/vehicles/:vehicleId/gallery — all media across all jobs
router.get('/vehicles/:vehicleId/gallery', requireCustomer, async (req, res) => {
  const { rows: link } = await query(
    'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
    [req.user.id, req.params.vehicleId]
  );
  if (!link.length) return res.status(403).json({ error: 'Not authorised' });

  const { rows } = await query(
    `SELECT ji.id, ji.filename, ji.original_name, ji.caption, ji.media_type, ji.created_at,
            p.registration_snapshot, p.registration, p.created_at as job_date
     FROM job_images ji
     JOIN projects p ON p.id = ji.project_id
     WHERE p.vehicle_id = $1
     ORDER BY ji.created_at DESC`,
    [req.params.vehicleId]
  );
  return res.json(rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    caption: r.caption || '',
    mediaType: r.media_type || 'image',
    createdAt: r.created_at,
    jobRegistration: r.registration_snapshot || r.registration,
    jobDate: r.job_date,
  })));
});

// GET /api/customer/vehicles/:vehicleId/invoices — all approved quotes (invoices)
router.get('/vehicles/:vehicleId/invoices', requireCustomer, async (req, res) => {
  const { rows: link } = await query(
    'SELECT id FROM customer_vehicles WHERE customer_id=$1 AND vehicle_id=$2',
    [req.user.id, req.params.vehicleId]
  );
  if (!link.length) return res.status(403).json({ error: 'Not authorised' });

  const { rows } = await query(
    `SELECT q.id, q.reference, q.title, q.status, q.vat_rate, q.updated_at, q.sent_at,
            p.registration_snapshot, p.registration, p.make, p.model, p.year,
            (SELECT SUM(ql.qty * (ql.unit_cost * (1 + ql.markup_pct/100)))
             FROM quote_lines ql WHERE ql.quote_id = q.id) AS subtotal
     FROM quotes q
     JOIN projects p ON p.id = q.project_id
     WHERE p.vehicle_id = $1
       AND q.status IN ('approved', 'sent')
       AND q.customer_id = $2
     ORDER BY q.updated_at DESC`,
    [req.params.vehicleId, req.user.id]
  );
  return res.json(rows.map((r) => {
    const subtotal = parseFloat(r.subtotal) || 0;
    const vat = Math.round(subtotal * (parseFloat(r.vat_rate) / 100) * 100) / 100;
    return {
      id: r.id,
      reference: r.reference,
      title: r.title || null,
      status: r.status,
      subtotal: Math.round(subtotal * 100) / 100,
      vat,
      total: Math.round((subtotal + vat) * 100) / 100,
      vatRate: parseFloat(r.vat_rate),
      date: r.updated_at,
      registration: r.registration_snapshot || r.registration,
      vehicle: [r.make, r.model, r.year].filter(Boolean).join(' '),
    };
  }));
});

// GET /api/customer/invoices/:quoteId — full invoice detail (line items + totals)
router.get('/invoices/:quoteId', requireCustomer, async (req, res) => {
  // Verify customer owns this quote
  const { rows: quoteRows } = await query(
    `SELECT q.*, p.vehicle_id, p.registration_snapshot, p.registration, p.make, p.model, p.year
     FROM quotes q
     JOIN projects p ON p.id = q.project_id
     WHERE q.id = $1 AND q.customer_id = $2 AND q.status IN ('sent','approved')`,
    [req.params.quoteId, req.user.id]
  );
  if (!quoteRows.length) return res.status(404).json({ error: 'Invoice not found' });
  const quote = quoteRows[0];

  const { rows: itemRows } = await query(
    'SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort_order, created_at',
    [quote.id]
  );
  const { rows: lineRows } = await query(
    'SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at',
    [quote.id]
  );

  const formatLine = (row) => {
    const unitCost = parseFloat(row.unit_cost);
    const markupPct = parseFloat(row.markup_pct);
    const qty = parseFloat(row.qty);
    const unitPrice = Math.round(unitCost * (1 + markupPct / 100) * 100) / 100;
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    return { id: row.id, type: row.type, description: row.description, qty, unitPrice, lineTotal, quoteItemId: row.quote_item_id || null };
  };

  const allLines = lineRows.map(formatLine);
  const vatRate = parseFloat(quote.vat_rate);
  const items = itemRows.map((item) => {
    const lines = allLines.filter((l) => l.quoteItemId === item.id);
    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    return { id: item.id, title: item.title, description: item.description || '', notes: item.notes || '', lines, subtotal };
  });
  const ungroupedLines = allLines.filter((l) => !l.quoteItemId);
  const subtotal = Math.round(allLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

  return res.json({
    id: quote.id,
    reference: quote.reference,
    title: quote.title || null,
    status: quote.status,
    notes: quote.notes || '',
    diagnosticSummary: quote.diagnostic_summary || '',
    vatRate,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    registration: quote.registration_snapshot || quote.registration,
    vehicle: [quote.make, quote.model, quote.year].filter(Boolean).join(' '),
    items,
    ungroupedLines,
    lines: allLines,
    totals: { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100, vatRate },
  });
});

// ── Public quick-quote routes (no auth required) ──────────────────────────────

// GET /api/customer/quick-quote/:token — view quote details by token
router.get('/quick-quote/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT q.id, q.reference, q.title, q.notes, q.diagnostic_summary,
              q.vat_rate, q.status, q.quote_email, q.created_at,
              p.id as project_id, p.make, p.model, p.year,
              p.registration, p.registration_snapshot,
              w.name as workshop_name, w.id as workshop_id
       FROM quotes q
       JOIN projects p ON p.id = q.project_id
       JOIN workshops w ON w.id = p.workshop_id
       WHERE q.quote_token = $1 AND q.quote_token_expires_at > now()`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Quote not found or link has expired' });
    const q = rows[0];

    const { rows: itemRows } = await query(
      'SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort_order, created_at',
      [q.id]
    );
    const { rows: lineRows } = await query(
      'SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at',
      [q.id]
    );

    const formatLine = (row) => {
      const unitCost = parseFloat(row.unit_cost);
      const markupPct = parseFloat(row.markup_pct);
      const qty = parseFloat(row.qty);
      const unitPrice = Math.round(unitCost * (1 + markupPct / 100) * 100) / 100;
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;
      return { id: row.id, type: row.type, description: row.description, qty, unitPrice, lineTotal, quoteItemId: row.quote_item_id || null };
    };

    const allLines = lineRows.map(formatLine);
    const vatRate = parseFloat(q.vat_rate);
    const items = itemRows.map((item) => {
      const lines = allLines.filter((l) => l.quoteItemId === item.id);
      const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
      return { id: item.id, title: item.title, description: item.description || '', notes: item.notes || '', lines, subtotal };
    });
    const ungroupedLines = allLines.filter((l) => !l.quoteItemId);
    const subtotal = Math.round(allLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

    return res.json({
      id: q.id,
      reference: q.reference,
      title: q.title || null,
      notes: q.notes || '',
      diagnosticSummary: q.diagnostic_summary || '',
      status: q.status,
      quoteEmail: q.quote_email,
      workshopName: q.workshop_name,
      workshopId: q.workshop_id,
      projectId: q.project_id,
      vehicle: [q.year, q.make, q.model].filter(Boolean).join(' ') || q.registration_snapshot || q.registration || '',
      registration: q.registration_snapshot || q.registration || '',
      createdAt: q.created_at,
      items,
      ungroupedLines,
      totals: { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100, vatRate },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/customer/quick-quote/:token/accept — accept quote, create customer
router.post('/quick-quote/:token/accept', async (req, res) => {
  try {
    const { name, phone, email: bodyEmail } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await query(
      `SELECT q.id, q.project_id, q.quote_email, q.customer_id,
              p.vehicle_id, p.customer_id as project_customer_id,
              w.id as workshop_id, w.name as workshop_name
       FROM quotes q
       JOIN projects p ON p.id = q.project_id
       JOIN workshops w ON w.id = p.workshop_id
       WHERE q.quote_token = $1 AND q.quote_token_expires_at > now()`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Quote not found or link has expired' });
    const q = rows[0];

    const customerEmail = q.quote_email || bodyEmail;
    if (!customerEmail) return res.status(400).json({ error: 'Email address is required' });

    // Find or create customer scoped to this workshop
    let customerId;
    const { rows: existing } = await query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND workshop_id = $2 AND role = 'customer'`,
      [customerEmail, q.workshop_id]
    );

    if (existing.length) {
      customerId = existing[0].id;
      await query(
        `UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone) WHERE id=$3`,
        [name || null, phone || null, customerId]
      );
    } else {
      const magicToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const { rows: created } = await query(
        `INSERT INTO users (email, password, role, subscribed, name, phone, workshop_id, magic_token, magic_token_expires_at)
         VALUES ($1,$2,'customer',true,$3,$4,$5,$6,$7) RETURNING id`,
        [customerEmail, placeholderPassword, name || null, phone || null, q.workshop_id, magicToken, expires]
      );
      customerId = created[0].id;

      const customerOrigin = process.env.CUSTOMER_PORTAL_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      sendCustomerActivation({
        to: customerEmail,
        customerName: name,
        workshopName: q.workshop_name,
        activationUrl: `${customerOrigin}/?activate=${magicToken}`,
      }).catch((err) => console.error('[quick-quote activation email]', err.message));
    }

    // Link customer to project + vehicle
    await query(`UPDATE projects SET customer_id=$1 WHERE id=$2 AND customer_id IS NULL`, [customerId, q.project_id]);
    if (q.vehicle_id) {
      await query(
        `INSERT INTO customer_vehicles (customer_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [customerId, q.vehicle_id]
      );
    }

    // Mark quote approved + clear token
    await query(
      `UPDATE quotes SET status='approved', customer_id=$1, quote_token=NULL, quote_token_expires_at=NULL WHERE id=$2`,
      [customerId, q.id]
    );

    return res.json({ accepted: true, email: q.quote_email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
