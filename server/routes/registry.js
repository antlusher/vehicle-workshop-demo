const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');

const router = express.Router();

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.admin = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

// ── Engines ──────────────────────────────────────────────────────────────────

router.get('/engines', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM engines ORDER BY code ASC');
  return res.json(rows);
});

router.get('/engines/:id', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM engines WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Engine not found' });
  const { rows: vtRows } = await query(
    'SELECT id, make, model, year_from, year_to, body_type FROM vehicle_types WHERE engine_id = $1 ORDER BY make, model',
    [req.params.id]
  );
  return res.json({ ...rows[0], vehicleTypes: vtRows });
});

router.post('/engines', requireAdmin, async (req, res) => {
  const { code, name, fuel_type, displacement, aspiration, known_makes, notes } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  try {
    const { rows } = await query(
      `INSERT INTO engines (code, name, fuel_type, displacement, aspiration, known_makes, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name || null, fuel_type || null, displacement || null, aspiration || null,
       known_makes?.length ? known_makes : null, notes || null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.message.includes('unique')) return res.status(409).json({ error: `Engine code '${code}' already exists` });
    throw err;
  }
});

router.put('/engines/:id', requireAdmin, async (req, res) => {
  const { code, name, fuel_type, displacement, aspiration, known_makes, notes } = req.body;
  const { rows } = await query(
    `UPDATE engines SET code=$1, name=$2, fuel_type=$3, displacement=$4, aspiration=$5,
     known_makes=$6, notes=$7, updated_at=now() WHERE id=$8 RETURNING *`,
    [code, name || null, fuel_type || null, displacement || null, aspiration || null,
     known_makes?.length ? known_makes : null, notes || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Engine not found' });
  return res.json(rows[0]);
});

router.delete('/engines/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM engines WHERE id = $1', [req.params.id]);
  return res.json({ deleted: true });
});

// ── Transmissions ─────────────────────────────────────────────────────────────

router.get('/transmissions', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM transmissions ORDER BY code ASC');
  return res.json(rows);
});

router.get('/transmissions/:id', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM transmissions WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Transmission not found' });
  const { rows: vtRows } = await query(
    'SELECT id, make, model, year_from, year_to FROM vehicle_types WHERE transmission_id = $1 ORDER BY make, model',
    [req.params.id]
  );
  return res.json({ ...rows[0], vehicleTypes: vtRows });
});

router.post('/transmissions', requireAdmin, async (req, res) => {
  const { code, name, type, speeds, known_makes, notes } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  try {
    const { rows } = await query(
      `INSERT INTO transmissions (code, name, type, speeds, known_makes, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, name || null, type || null, speeds || null,
       known_makes?.length ? known_makes : null, notes || null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.message.includes('unique')) return res.status(409).json({ error: `Transmission code '${code}' already exists` });
    throw err;
  }
});

router.put('/transmissions/:id', requireAdmin, async (req, res) => {
  const { code, name, type, speeds, known_makes, notes } = req.body;
  const { rows } = await query(
    `UPDATE transmissions SET code=$1, name=$2, type=$3, speeds=$4,
     known_makes=$5, notes=$6, updated_at=now() WHERE id=$7 RETURNING *`,
    [code, name || null, type || null, speeds || null,
     known_makes?.length ? known_makes : null, notes || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Transmission not found' });
  return res.json(rows[0]);
});

router.delete('/transmissions/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM transmissions WHERE id = $1', [req.params.id]);
  return res.json({ deleted: true });
});

// ── Vehicle Types ─────────────────────────────────────────────────────────────

router.get('/vehicle-types', requireAuth, async (req, res) => {
  const { make, model, engine_code } = req.query;
  let sql = `
    SELECT vt.*, e.code as resolved_engine_code, e.name as engine_name,
           t.code as resolved_tx_code, t.name as tx_name
    FROM vehicle_types vt
    LEFT JOIN engines e ON vt.engine_id = e.id
    LEFT JOIN transmissions t ON vt.transmission_id = t.id
    WHERE 1=1
  `;
  const params = [];
  if (make) { params.push(make); sql += ` AND LOWER(vt.make) = LOWER($${params.length})`; }
  if (model) { params.push(model); sql += ` AND LOWER(vt.model) = LOWER($${params.length})`; }
  if (engine_code) { params.push(engine_code); sql += ` AND LOWER(vt.engine_code) = LOWER($${params.length})`; }
  sql += ' ORDER BY vt.make, vt.model, vt.year_from';
  const { rows } = await query(sql, params);
  return res.json(rows);
});

router.get('/vehicle-types/:id', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT vt.*, e.code as resolved_engine_code, e.name as engine_name,
            t.code as resolved_tx_code, t.name as tx_name
     FROM vehicle_types vt
     LEFT JOIN engines e ON vt.engine_id = e.id
     LEFT JOIN transmissions t ON vt.transmission_id = t.id
     WHERE vt.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Vehicle type not found' });
  return res.json(rows[0]);
});

router.post('/vehicle-types', requireAdmin, async (req, res) => {
  const { make, model, year_from, year_to, body_type, fuel_type, engine_id, engine_code, transmission_id, transmission_code, notes } = req.body;
  if (!make || !model) return res.status(400).json({ error: 'make and model are required' });
  const { rows } = await query(
    `INSERT INTO vehicle_types
       (make, model, year_from, year_to, body_type, fuel_type, engine_id, engine_code, transmission_id, transmission_code, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [make, model, year_from || null, year_to || null, body_type || null, fuel_type || null,
     engine_id || null, engine_code || null, transmission_id || null, transmission_code || null, notes || null]
  );
  return res.status(201).json(rows[0]);
});

router.put('/vehicle-types/:id', requireAdmin, async (req, res) => {
  const { make, model, year_from, year_to, body_type, fuel_type, engine_id, engine_code, transmission_id, transmission_code, notes } = req.body;
  const { rows } = await query(
    `UPDATE vehicle_types SET make=$1, model=$2, year_from=$3, year_to=$4, body_type=$5, fuel_type=$6,
     engine_id=$7, engine_code=$8, transmission_id=$9, transmission_code=$10, notes=$11, updated_at=now()
     WHERE id=$12 RETURNING *`,
    [make, model, year_from || null, year_to || null, body_type || null, fuel_type || null,
     engine_id || null, engine_code || null, transmission_id || null, transmission_code || null, notes || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Vehicle type not found' });
  return res.json(rows[0]);
});

router.delete('/vehicle-types/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM vehicle_types WHERE id = $1', [req.params.id]);
  return res.json({ deleted: true });
});

module.exports = router;
