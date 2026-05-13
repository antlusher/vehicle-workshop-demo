const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');

const router = express.Router();

async function requireSysAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const user = await findUserByToken(token);
    if (!user || user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'System admin access required' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: 'System admin access required' });
  }
}

router.use(requireSysAdmin);

// ── Bootstrap — create the very first sysadmin (only works when none exist) ──

router.post('/bootstrap', async (req, res) => {
  // This middleware runs AFTER requireSysAdmin, so override for bootstrap only
  res.status(404).json({ error: 'Not found' });
});

// ── Workshops ───────────────────────────────────────────────────────────────

router.get('/workshops', async (req, res) => {
  const { rows } = await query(
    `SELECT w.*,
            COUNT(DISTINCT u.id) FILTER (WHERE u.role IN ('owner','admin','tech'))::int AS staff_count,
            COUNT(DISTINCT p.id)::int AS project_count,
            COUNT(DISTINCT u2.id) FILTER (WHERE u2.role = 'customer')::int AS customer_count,
            (SELECT MAX(ai.created_at) FROM ai_requests ai WHERE ai.workshop_id = w.id) AS last_ai_at
     FROM workshops w
     LEFT JOIN users u ON u.workshop_id = w.id
     LEFT JOIN projects p ON p.workshop_id = w.id
     LEFT JOIN users u2 ON u2.workshop_id = w.id
     GROUP BY w.id
     ORDER BY w.created_at DESC`
  );
  return res.json(rows);
});

const PLAN_SEATS = { starter: 3, professional: 10, enterprise: 0 };

router.post('/workshops', async (req, res) => {
  const { name, slug, plan, aiModel, aiMonthlyTokenLimit } = req.body;
  if (!name) return res.status(400).json({ error: 'Workshop name is required' });

  const autoSlug = (slug || name)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const resolvedPlan = plan || 'professional';
  const seatLimit = PLAN_SEATS[resolvedPlan] ?? 10;

  // Ensure slug is unique by appending a counter if needed
  let finalSlug = autoSlug;
  let attempt = 0;
  let workshop;
  while (!workshop) {
    try {
      const { rows } = await query(
        `INSERT INTO workshops (name, slug, plan, ai_model, ai_monthly_token_limit, seat_limit)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, finalSlug, resolvedPlan, aiModel || 'claude-haiku-4-5-20251001',
         aiMonthlyTokenLimit || 100000, seatLimit]
      );
      workshop = rows[0];
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'workshops_slug_key') {
        attempt++;
        finalSlug = `${autoSlug}-${attempt}`;
      } else {
        throw err;
      }
    }
  }

  // Seed default role permissions for this new workshop
  await query(
    `INSERT INTO workshop_role_permissions (workshop_id, role, feature, allowed) VALUES
      ($1, 'tech', 'customers', false),
      ($1, 'tech', 'knowledge_base', true),
      ($1, 'tech', 'registry', false),
      ($1, 'tech', 'inventory', false),
      ($1, 'tech', 'financials', false),
      ($1, 'admin', 'users', false),
      ($1, 'admin', 'workshop_settings', false)
    ON CONFLICT DO NOTHING`,
    [workshop.id]
  );

  return res.status(201).json(workshop);
});

router.get('/workshops/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM workshops WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Workshop not found' });
  return res.json(rows[0]);
});

router.patch('/workshops/:id', async (req, res) => {
  const { name, slug, plan, aiModel, aiMonthlyTokenLimit, features, active } = req.body;
  const fields = [];
  const vals = [];
  let i = 1;
  if (name !== undefined)               { fields.push(`name = $${i++}`);                    vals.push(name); }
  if (slug !== undefined)               { fields.push(`slug = $${i++}`);                    vals.push(slug); }
  if (plan !== undefined)               { fields.push(`plan = $${i++}`);                    vals.push(plan); }
  if (aiModel !== undefined)            { fields.push(`ai_model = $${i++}`);                vals.push(aiModel); }
  if (aiMonthlyTokenLimit !== undefined){ fields.push(`ai_monthly_token_limit = $${i++}`);  vals.push(aiMonthlyTokenLimit); }
  if (features !== undefined)           { fields.push(`features = $${i++}`);                vals.push(JSON.stringify(features)); }
  if (active !== undefined)             { fields.push(`active = $${i++}`);                  vals.push(active); }
  // Auto-update seat_limit when plan changes
  if (plan !== undefined)               { fields.push(`seat_limit = $${i++}`);               vals.push(PLAN_SEATS[plan] ?? 10); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE workshops SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Workshop not found' });
  return res.json(rows[0]);
});

// ── Sysadmin user management ────────────────────────────────────────────────

router.get('/sysadmins', async (req, res) => {
  const { rows } = await query(
    `SELECT id, email, name, created_at,
            (SELECT MAX(created_at) FROM login_history WHERE user_id = users.id) AS last_login
     FROM users WHERE role = 'sysadmin' ORDER BY created_at ASC`
  );
  return res.json(rows);
});

router.post('/sysadmins', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Email already in use' });
  const hashed = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `INSERT INTO users (email, password, role, subscribed, name, token)
     VALUES ($1,$2,'sysadmin',true,$3,$4)
     RETURNING id, email, name, created_at`,
    [email, hashed, name || null, token]
  );
  return res.status(201).json(rows[0]);
});

router.delete('/sysadmins/:id', async (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const { rows } = await query(
    `SELECT id FROM users WHERE id = $1 AND role = 'sysadmin'`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Sysadmin not found' });
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  return res.json({ ok: true });
});

// ── Workshop users (from sysadmin perspective) ──────────────────────────────

router.get('/workshops/:id/users', async (req, res) => {
  const { rows } = await query(
    `SELECT id, email, name, role, created_at,
            (SELECT MAX(created_at) FROM login_history WHERE user_id = users.id) AS last_login
     FROM users WHERE workshop_id = $1 AND role IN ('owner','admin','tech')
     ORDER BY created_at ASC`,
    [req.params.id]
  );
  return res.json(rows);
});

router.post('/workshops/:id/users', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const userRole = role || 'owner';
  if (!['owner', 'admin', 'tech'].includes(userRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  // Check seat availability
  const seatCheck = await query(
    `SELECT w.seat_limit, COUNT(u.id)::int AS used
     FROM workshops w
     LEFT JOIN users u ON u.workshop_id = w.id AND u.role IN ('owner','admin','tech')
     WHERE w.id = $1 GROUP BY w.seat_limit`,
    [req.params.id]
  );
  if (seatCheck.rows.length) {
    const { seat_limit, used } = seatCheck.rows[0];
    if (seat_limit > 0 && used >= seat_limit) {
      return res.status(403).json({ error: `Seat limit reached (${used}/${seat_limit}). Upgrade the workshop plan to add more staff.` });
    }
  }
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Email already in use' });
  const hashed = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `INSERT INTO users (email, password, role, subscribed, name, workshop_id, token)
     VALUES ($1,$2,$3,true,$4,$5,$6)
     RETURNING id, email, name, role, created_at`,
    [email, hashed, userRole, name || null, req.params.id, token]
  );
  return res.status(201).json(rows[0]);
});

router.patch('/workshops/:wid/users/:uid', async (req, res) => {
  const { role } = req.body;
  if (!role || !['owner', 'admin', 'tech'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { rows } = await query(
    `UPDATE users SET role = $1 WHERE id = $2 AND workshop_id = $3
     RETURNING id, email, name, role, created_at`,
    [role, req.params.uid, req.params.wid]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found in this workshop' });
  return res.json(rows[0]);
});

router.delete('/workshops/:wid/users/:uid', async (req, res) => {
  const { rows } = await query(
    `SELECT id FROM users WHERE id = $1 AND workshop_id = $2 AND role IN ('owner','admin','tech')`,
    [req.params.uid, req.params.wid]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found in this workshop' });
  await query('DELETE FROM users WHERE id = $1', [req.params.uid]);
  return res.json({ ok: true });
});

// ── Global Knowledge Brain ──────────────────────────────────────────────────

router.get('/brain', async (req, res) => {
  const { category, search } = req.query;
  const conditions = ['kb.workshop_id IS NULL'];
  const values = [];
  let idx = 1;
  if (category) { conditions.push(`kb.category = $${idx++}`); values.push(category); }
  if (search) {
    conditions.push(`(kb.title ILIKE $${idx} OR kb.content ILIKE $${idx} OR kb.fault_code ILIKE $${idx})`);
    values.push(`%${search}%`); idx++;
  }
  const { rows } = await query(
    `SELECT kb.*, u.email AS created_by_email
     FROM knowledge_base kb LEFT JOIN users u ON u.id = kb.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY kb.updated_at DESC`,
    values
  );
  return res.json(rows);
});

router.post('/brain', async (req, res) => {
  const { category, make, model, year_from, year_to, fault_code, title, content, source, engine_id, transmission_id } = req.body;
  if (!category || !title || !content) return res.status(400).json({ error: 'category, title and content are required' });
  const { rows } = await query(
    `INSERT INTO knowledge_base (category, make, model, year_from, year_to, fault_code, title, content, source, engine_id, transmission_id, created_by, workshop_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)
     RETURNING *`,
    [category, make || null, model || null, year_from || null, year_to || null,
     fault_code || null, title, content, source || 'global_brain',
     engine_id || null, transmission_id || null, req.user.id]
  );
  return res.status(201).json(rows[0]);
});

router.patch('/brain/:id', async (req, res) => {
  const { category, make, model, year_from, year_to, fault_code, title, content, source } = req.body;
  const fields = []; const vals = []; let i = 1;
  if (category !== undefined)   { fields.push(`category = $${i++}`);   vals.push(category); }
  if (make !== undefined)       { fields.push(`make = $${i++}`);       vals.push(make); }
  if (model !== undefined)      { fields.push(`model = $${i++}`);      vals.push(model); }
  if (year_from !== undefined)  { fields.push(`year_from = $${i++}`);  vals.push(year_from); }
  if (year_to !== undefined)    { fields.push(`year_to = $${i++}`);    vals.push(year_to); }
  if (fault_code !== undefined) { fields.push(`fault_code = $${i++}`); vals.push(fault_code); }
  if (title !== undefined)      { fields.push(`title = $${i++}`);      vals.push(title); }
  if (content !== undefined)    { fields.push(`content = $${i++}`);    vals.push(content); }
  if (source !== undefined)     { fields.push(`source = $${i++}`);     vals.push(source); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  fields.push(`updated_at = now()`);
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE knowledge_base SET ${fields.join(', ')} WHERE id = $${i} AND workshop_id IS NULL RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Global brain entry not found' });
  return res.json(rows[0]);
});

router.delete('/brain/:id', async (req, res) => {
  const { rows } = await query('SELECT id FROM knowledge_base WHERE id = $1 AND workshop_id IS NULL', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Global brain entry not found' });
  await query('DELETE FROM knowledge_base WHERE id = $1', [req.params.id]);
  return res.json({ ok: true });
});

// Promote a workshop KB entry to the global brain
router.post('/brain/promote/:id', async (req, res) => {
  const { rows } = await query(
    `UPDATE knowledge_base SET workshop_id = NULL, source = 'global_brain', updated_at = now()
     WHERE id = $1 AND workshop_id IS NOT NULL RETURNING *`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Entry not found or already global' });
  return res.json(rows[0]);
});

// ── System stats ────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const [workshops, users, projects, ai, brain] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active)::int AS active FROM workshops`),
    query(`SELECT COUNT(*) FILTER (WHERE role IN ('owner','admin','tech'))::int AS staff,
                  COUNT(*) FILTER (WHERE role = 'customer')::int AS customers FROM users`),
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int AS this_week FROM projects`),
    query(`SELECT COUNT(*)::int AS requests, COALESCE(SUM(input_tokens+output_tokens),0)::int AS tokens,
                  COALESCE(SUM(input_tokens+output_tokens) FILTER (WHERE created_at > now()-interval '30 days'),0)::int AS tokens_30d
           FROM ai_requests`),
    query(`SELECT COUNT(*)::int AS total FROM knowledge_base WHERE workshop_id IS NULL`),
  ]);
  return res.json({
    workshops: workshops.rows[0],
    users: users.rows[0],
    projects: projects.rows[0],
    ai: ai.rows[0],
    brain: brain.rows[0],
  });
});

module.exports = router;
