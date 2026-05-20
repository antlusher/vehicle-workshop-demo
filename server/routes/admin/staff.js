const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../../services/db');

const OWNER_ROLES = ['owner', 'sysadmin'];

const router = express.Router();

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

router.get('/role-permissions', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const { rows } = await query(
    `SELECT role, feature, allowed FROM workshop_role_permissions WHERE workshop_id = $1 ORDER BY role, feature`,
    [req.workshopId]
  );
  return res.json(rows);
});

router.patch('/role-permissions', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const { role, feature, allowed } = req.body;
  if (!role || !feature || allowed === undefined) {
    return res.status(400).json({ error: 'role, feature and allowed are required' });
  }
  const { rows } = await query(
    `INSERT INTO workshop_role_permissions (workshop_id, role, feature, allowed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workshop_id, role, feature) DO UPDATE SET allowed = $4
     RETURNING role, feature, allowed`,
    [req.workshopId, role, feature, allowed]
  );
  return res.json(rows[0]);
});

router.get('/staff', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const [staffResult, seatResult] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              (SELECT MAX(created_at) FROM login_history WHERE user_id = u.id) AS last_login,
              (SELECT COUNT(*)::int FROM projects WHERE user_id = u.id) AS project_count
       FROM users u
       WHERE u.workshop_id = $1 AND u.role IN ('owner','admin','tech')
       ORDER BY u.created_at ASC`,
      [req.workshopId]
    ),
    query(`SELECT seat_limit FROM workshops WHERE id = $1`, [req.workshopId]),
  ]);
  return res.json({
    staff: staffResult.rows,
    seat_limit: seatResult.rows[0]?.seat_limit ?? 10,
    seat_used: staffResult.rows.length,
  });
});

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
  const existing = await query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role != 'customer'`, [email]
  );
  if (existing.rows.length) return res.status(409).json({ error: 'Email already in use by a staff account' });
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

router.delete('/staff/:id', async (req, res) => {
  if (!OWNER_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  await query(
    `DELETE FROM users WHERE id=$1 AND workshop_id=$2 AND role IN ('owner','admin','tech')`,
    [req.params.id, req.workshopId]
  );
  return res.json({ deleted: true });
});

module.exports = router;
