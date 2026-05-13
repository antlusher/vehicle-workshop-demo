const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { searchProvider, formatPart } = require('../services/partsService');

const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

// Reserved qty = qty on quote_lines for this part in draft/sent quotes (not yet deducted)
const RESERVED_SQL = `
  COALESCE((
    SELECT SUM(ql.qty)::int
    FROM quote_lines ql
    JOIN quotes q ON q.id = ql.quote_id
    WHERE ql.part_id = p.id
      AND q.status IN ('draft', 'sent')
      AND q.stock_deducted = false
  ), 0) AS reserved_qty,
  p.stock_qty - COALESCE((
    SELECT SUM(ql.qty)::int
    FROM quote_lines ql
    JOIN quotes q ON q.id = ql.quote_id
    WHERE ql.part_id = p.id
      AND q.status IN ('draft', 'sent')
      AND q.stock_deducted = false
  ), 0) AS available_qty
`;

// List all parts with live stock / reserved / available
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, q } = req.query;
    const conditions = [];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`p.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const n = params.length;
      conditions.push(`(LOWER(p.title) LIKE $${n} OR LOWER(p.part_number) LIKE $${n} OR LOWER(p.brand) LIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT p.*, ${RESERVED_SQL} FROM parts_catalogue p ${where} ORDER BY p.category, p.brand, p.title`,
      params
    );
    res.json(rows.map(formatPart));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search (existing, now also includes stock fields)
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q = '', make, model, engine_code } = req.query;
    const results = await searchProvider(q, { make, model, engineCode: engine_code });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a part — stock_qty, cost_price, title etc.
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { stockQty, costPrice, listPrice, title, brand, partNumber, category } = req.body;
    await query(
      `UPDATE parts_catalogue SET
         stock_qty    = COALESCE($1, stock_qty),
         cost_price   = COALESCE($2, cost_price),
         list_price   = COALESCE($3, list_price),
         title        = COALESCE($4, title),
         brand        = COALESCE($5, brand),
         part_number  = COALESCE($6, part_number),
         category     = COALESCE($7, category)
       WHERE id = $8`,
      [stockQty ?? null, costPrice ?? null, listPrice ?? null,
       title ?? null, brand ?? null, partNumber ?? null, category ?? null,
       req.params.id]
    );
    const { rows } = await query(
      `SELECT p.*, ${RESERVED_SQL} FROM parts_catalogue p WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Part not found' });
    res.json(formatPart(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adjust stock by a delta (positive = receive stock, negative = manual correction)
router.post('/:id/adjust', requireAuth, async (req, res) => {
  try {
    const { delta, reason } = req.body;
    if (delta == null) return res.status(400).json({ error: 'delta required' });
    await query(
      `UPDATE parts_catalogue SET stock_qty = GREATEST(0, stock_qty + $1) WHERE id = $2`,
      [parseInt(delta), req.params.id]
    );
    const { rows } = await query(
      `SELECT p.*, ${RESERVED_SQL} FROM parts_catalogue p WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Part not found' });
    res.json(formatPart(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
