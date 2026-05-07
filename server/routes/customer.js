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

// GET /api/customer/vehicles/:vehicleId/jobs — list published jobs for a vehicle
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
            jr.id as report_id, jr.diagnosis, jr.cost_total, jr.published_at, jr.status
     FROM projects p
     JOIN job_reports jr ON jr.project_id = p.id
     WHERE p.vehicle_id = $1 AND jr.status = 'published'
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

module.exports = router;
