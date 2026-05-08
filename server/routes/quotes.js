const express = require('express');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { searchProvider, applyMarkup, getWorkshopSettings } = require('../services/partsService');

const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

function formatLine(row) {
  const unitCost = parseFloat(row.unit_cost);
  const markupPct = parseFloat(row.markup_pct);
  const qty = parseFloat(row.qty);
  const unitPrice = applyMarkup(unitCost, markupPct);
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    qty,
    unitCost,
    markupPct,
    unitPrice,
    lineTotal: Math.round(unitPrice * qty * 100) / 100,
    partId: row.part_id || null,
    partNumber: row.part_number || null,
    sortOrder: row.sort_order,
  };
}

function calcTotals(lines, vatRate) {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat,
    total: Math.round((subtotal + vat) * 100) / 100,
    vatRate,
  };
}

async function getQuoteWithLines(quoteId) {
  const { rows: qRows } = await query('SELECT * FROM quotes WHERE id=$1', [quoteId]);
  if (!qRows.length) return null;
  const { rows: lRows } = await query(
    'SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at',
    [quoteId]
  );
  const lines = lRows.map(formatLine);
  const vatRate = parseFloat(qRows[0].vat_rate);
  return {
    id: qRows[0].id,
    projectId: qRows[0].project_id,
    status: qRows[0].status,
    notes: qRows[0].notes || '',
    diagnosticSummary: qRows[0].diagnostic_summary || '',
    vatRate,
    createdAt: qRows[0].created_at,
    updatedAt: qRows[0].updated_at,
    lines,
    totals: calcTotals(lines, vatRate),
  };
}

// ── Parts search ─────────────────────────────────────────────────────────────

router.get('/parts/search', requireAuth, async (req, res) => {
  try {
    const { q = '', make, model, engine_code } = req.query;
    const results = await searchProvider(q, { make, model, engineCode: engine_code });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Workshop settings ────────────────────────────────────────────────────────

router.get('/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getWorkshopSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings', requireAuth, async (req, res) => {
  try {
    const { defaultMarkupPct, labourRatePerHour, vatRate } = req.body;
    const existing = await query('SELECT id FROM workshop_settings LIMIT 1');
    if (existing.rows.length) {
      await query(
        `UPDATE workshop_settings SET
           default_markup_pct=COALESCE($1,default_markup_pct),
           labour_rate_per_hour=COALESCE($2,labour_rate_per_hour),
           vat_rate=COALESCE($3,vat_rate), updated_at=now()`,
        [defaultMarkupPct ?? null, labourRatePerHour ?? null, vatRate ?? null]
      );
    } else {
      await query(
        'INSERT INTO workshop_settings (default_markup_pct, labour_rate_per_hour, vat_rate) VALUES ($1,$2,$3)',
        [defaultMarkupPct ?? 30, labourRatePerHour ?? 75, vatRate ?? 20]
      );
    }
    res.json(await getWorkshopSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quotes ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const { rows } = await query(
      'SELECT * FROM quotes WHERE project_id=$1 ORDER BY created_at DESC',
      [project_id]
    );
    const quotes = await Promise.all(rows.map((r) => getQuoteWithLines(r.id)));
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { project_id, notes, diagnostic_summary } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const settings = await getWorkshopSettings();
    const { rows } = await query(
      `INSERT INTO quotes (project_id, notes, diagnostic_summary, vat_rate)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [project_id, notes || null, diagnostic_summary || null, settings.vatRate]
    );
    res.status(201).json(await getQuoteWithLines(rows[0].id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const quote = await getQuoteWithLines(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes, diagnostic_summary } = req.body;
    await query(
      `UPDATE quotes SET
         status=COALESCE($1,status),
         notes=COALESCE($2,notes),
         diagnostic_summary=COALESCE($3,diagnostic_summary),
         updated_at=now()
       WHERE id=$4`,
      [status || null, notes ?? null, diagnostic_summary ?? null, req.params.id]
    );
    const quote = await getQuoteWithLines(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quote lines ───────────────────────────────────────────────────────────────

router.post('/:id/lines', requireAuth, async (req, res) => {
  try {
    const { type = 'part', description, qty = 1, unitCost, markupPct, partId, partNumber } = req.body;
    if (!description || unitCost == null) {
      return res.status(400).json({ error: 'description and unitCost required' });
    }
    const settings = await getWorkshopSettings();
    const markup = markupPct != null ? markupPct : settings.defaultMarkupPct;
    await query(
      `INSERT INTO quote_lines (quote_id, type, description, qty, unit_cost, markup_pct, part_id, part_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.params.id, type, description, qty, unitCost, markup, partId || null, partNumber || null]
    );
    res.status(201).json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/lines/:lineId', requireAuth, async (req, res) => {
  try {
    const { description, qty, unitCost, markupPct } = req.body;
    await query(
      `UPDATE quote_lines SET
         description=COALESCE($1,description),
         qty=COALESCE($2,qty),
         unit_cost=COALESCE($3,unit_cost),
         markup_pct=COALESCE($4,markup_pct)
       WHERE id=$5 AND quote_id=$6`,
      [description || null, qty ?? null, unitCost ?? null, markupPct ?? null,
       req.params.lineId, req.params.id]
    );
    res.json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/lines/:lineId', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM quote_lines WHERE id=$1 AND quote_id=$2',
      [req.params.lineId, req.params.id]);
    res.json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
