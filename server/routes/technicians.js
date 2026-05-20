const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

function fmt(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role || null,
    email: row.email || null,
    phone: row.phone || null,
    hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
    active: row.active,
    createdAt: row.created_at,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM technicians ORDER BY name ASC');
  res.json(rows.map(fmt));
});

router.post('/', requireAuth, async (req, res) => {
  const { name, role, email, phone, hourlyRate } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const { rows } = await query(
    'INSERT INTO technicians (name, role, email, phone, hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name.trim(), role || null, email || null, phone || null, hourlyRate ?? null]
  );
  res.status(201).json(fmt(rows[0]));
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { name, role, email, phone, hourlyRate, active } = req.body;
  const { rows } = await query(
    `UPDATE technicians SET
       name=COALESCE($1,name), role=COALESCE($2,role), email=COALESCE($3,email),
       phone=COALESCE($4,phone), hourly_rate=COALESCE($5,hourly_rate),
       active=COALESCE($6,active)
     WHERE id=$7 RETURNING *`,
    [name ?? null, role ?? null, email ?? null, phone ?? null,
     hourlyRate ?? null, active ?? null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(fmt(rows[0]));
});

router.delete('/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM technicians WHERE id=$1', [req.params.id]);
  res.json({ deleted: true });
});

module.exports = router;
