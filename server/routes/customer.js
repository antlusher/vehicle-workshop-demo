const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');

const router = express.Router();

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

module.exports = router;
