const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { applyMarkup, getWorkshopSettings } = require('../services/partsService');
const { sendQuoteToCustomer, sendQuickQuote } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const { s3Available, uploadToS3, deleteFromS3 } = require('../services/mediaService');
const { generateInvoicePdf } = require('../services/pdfService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
    quoteItemId: row.quote_item_id || null,
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
  const q = qRows[0];

  const [{ rows: itemRows }, { rows: lRows }, { rows: custRows }] = await Promise.all([
    query('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort_order, created_at', [quoteId]),
    query('SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at', [quoteId]),
    q.customer_id
      ? query('SELECT id, email, name, phone FROM users WHERE id=$1', [q.customer_id])
      : Promise.resolve({ rows: [] }),
  ]);

  const allLines = lRows.map(formatLine);
  const vatRate = parseFloat(q.vat_rate);

  const items = itemRows.map((item) => {
    const lines = allLines.filter((l) => l.quoteItemId === item.id);
    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    return {
      id: item.id,
      title: item.title,
      description: item.description || '',
      notes: item.notes || '',
      sortOrder: item.sort_order,
      lines,
      subtotal,
    };
  });

  const ungroupedLines = allLines.filter((l) => !l.quoteItemId);
  const customer = custRows[0] || null;

  return {
    id: q.id,
    reference: q.reference || null,
    title: q.title || null,
    projectId: q.project_id,
    status: q.status,
    notes: q.notes || '',
    diagnosticSummary: q.diagnostic_summary || '',
    vatRate,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    sentAt: q.sent_at || null,
    customer: customer ? { id: customer.id, email: customer.email, name: customer.name || null, phone: customer.phone || null } : null,
    items,
    ungroupedLines,
    lines: allLines,
    totals: calcTotals(allLines, vatRate),
  };
}

async function nextReference() {
  const { rows } = await query(`
    SELECT 'Q-' || LPAD(
      (COALESCE(MAX(CAST(SUBSTRING(reference FROM 3) AS INTEGER)), 0) + 1)::text,
      4, '0'
    ) AS ref FROM quotes WHERE reference ~ '^Q-[0-9]+$'
  `);
  return rows[0].ref;
}

// Get customers linked to a project's vehicle (for the customer picker)
router.get('/project-customers/:projectId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.phone
       FROM users u
       WHERE u.role = 'customer' AND u.workshop_id = $1
       ORDER BY u.name, u.email`,
      [req.user.workshopId]
    );
    res.json(rows.map((r) => ({ id: r.id, email: r.email, name: r.name || null, phone: r.phone || null })));
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
    const {
      defaultMarkupPct, labourRatePerHour, vatRate,
      workshopName, addressLine1, addressLine2, city, postcode,
      phone, email, paymentNotes, aiEnabled,
      invoiceAccentColor, invoiceVatNumber, invoiceFooterText,
      invoiceShowBankDetails, invoiceBankName, invoiceAccountName, invoiceAccountNumber, invoiceSortCode,
    } = req.body;
    const existing = await query('SELECT id FROM workshop_settings LIMIT 1');
    if (existing.rows.length) {
      await query(
        `UPDATE workshop_settings SET
           default_markup_pct=COALESCE($1,default_markup_pct),
           labour_rate_per_hour=COALESCE($2,labour_rate_per_hour),
           vat_rate=COALESCE($3,vat_rate),
           workshop_name=COALESCE($4,workshop_name),
           address_line1=COALESCE($5,address_line1),
           address_line2=COALESCE($6,address_line2),
           city=COALESCE($7,city),
           postcode=COALESCE($8,postcode),
           phone=COALESCE($9,phone),
           email=COALESCE($10,email),
           payment_notes=COALESCE($11,payment_notes),
           ai_enabled=COALESCE($12,ai_enabled),
           invoice_accent_color=COALESCE($13,invoice_accent_color),
           invoice_vat_number=$14,
           invoice_footer_text=$15,
           invoice_show_bank_details=COALESCE($16,invoice_show_bank_details),
           invoice_bank_name=$17,
           invoice_account_name=$18,
           invoice_account_number=$19,
           invoice_sort_code=$20,
           updated_at=now()`,
        [
          defaultMarkupPct ?? null, labourRatePerHour ?? null, vatRate ?? null,
          workshopName ?? null, addressLine1 ?? null, addressLine2 ?? null,
          city ?? null, postcode ?? null, phone ?? null, email ?? null, paymentNotes ?? null,
          aiEnabled ?? null,
          invoiceAccentColor || null, invoiceVatNumber || null, invoiceFooterText || null,
          invoiceShowBankDetails ?? null,
          invoiceBankName || null, invoiceAccountName || null, invoiceAccountNumber || null, invoiceSortCode || null,
        ]
      );
    } else {
      await query(
        `INSERT INTO workshop_settings
           (default_markup_pct, labour_rate_per_hour, vat_rate,
            workshop_name, address_line1, address_line2, city, postcode, phone, email, payment_notes, ai_enabled,
            invoice_accent_color, invoice_vat_number, invoice_footer_text,
            invoice_show_bank_details, invoice_bank_name, invoice_account_name, invoice_account_number, invoice_sort_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          defaultMarkupPct ?? 30, labourRatePerHour ?? 75, vatRate ?? 20,
          workshopName ?? null, addressLine1 ?? null, addressLine2 ?? null,
          city ?? null, postcode ?? null, phone ?? null, email ?? null, paymentNotes ?? null, true,
          invoiceAccentColor || '#1e40af', invoiceVatNumber || null, invoiceFooterText || null,
          invoiceShowBankDetails ?? false,
          invoiceBankName || null, invoiceAccountName || null, invoiceAccountNumber || null, invoiceSortCode || null,
        ]
      );
    }
    res.json(await getWorkshopSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quotes/settings/logo — upload workshop logo
router.post('/settings/logo', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: 'Only image files are accepted' });

    // Delete old logo if present
    const { rows: existing } = await query('SELECT invoice_logo_url FROM workshop_settings LIMIT 1');
    const oldLogo = existing[0]?.invoice_logo_url;
    if (oldLogo) {
      if (s3Available()) {
        deleteFromS3(oldLogo).catch(() => {});
      } else {
        const oldPath = path.join(uploadsDir, oldLogo);
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
      }
    }

    let filename;
    if (s3Available()) {
      filename = await uploadToS3(req.file.buffer, `logos/${Date.now()}-${req.file.originalname}`, req.file.mimetype);
    } else {
      filename = `logo-${Date.now()}${path.extname(req.file.originalname)}`;
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
    }

    if (existing.length) {
      await query('UPDATE workshop_settings SET invoice_logo_url=$1, updated_at=now()', [filename]);
    } else {
      await query('INSERT INTO workshop_settings (invoice_logo_url) VALUES ($1)', [filename]);
    }

    res.json({ logoUrl: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/quotes/settings/logo — remove workshop logo
router.delete('/settings/logo', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT invoice_logo_url FROM workshop_settings LIMIT 1');
    const logo = rows[0]?.invoice_logo_url;
    if (logo) {
      if (s3Available()) deleteFromS3(logo).catch(() => {});
      else { const p = path.join(uploadsDir, logo); if (fs.existsSync(p)) fs.unlink(p, () => {}); }
      await query('UPDATE workshop_settings SET invoice_logo_url=NULL, updated_at=now()');
    }
    res.json({ ok: true });
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
    const { project_id, notes, diagnostic_summary, title, customer_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const [settings, ref] = await Promise.all([getWorkshopSettings(), nextReference()]);
    const { rows } = await query(
      `INSERT INTO quotes (project_id, notes, diagnostic_summary, vat_rate, reference, title, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [project_id, notes || null, diagnostic_summary || null, settings.vatRate, ref, title || null, customer_id || null]
    );
    res.status(201).json(await getQuoteWithLines(rows[0].id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM quotes WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Quote not found' });
    res.json({ deleted: true });
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
    const { status, notes, diagnostic_summary, title, customer_id } = req.body;

    // Handle stock deduction when transitioning to/from 'approved'
    if (status) {
      const { rows: cur } = await query(
        'SELECT status, stock_deducted FROM quotes WHERE id=$1', [req.params.id]
      );
      if (cur.length) {
        const { status: prevStatus, stock_deducted } = cur[0];
        const goingApproved  = status === 'approved' && !stock_deducted;
        const leavingApproved = status !== 'approved' && prevStatus === 'approved' && stock_deducted;

        if (goingApproved || leavingApproved) {
          const { rows: partLines } = await query(
            `SELECT part_id, SUM(qty)::int AS total_qty
             FROM quote_lines WHERE quote_id=$1 AND part_id IS NOT NULL
             GROUP BY part_id`,
            [req.params.id]
          );
          for (const line of partLines) {
            if (goingApproved) {
              await query(
                `UPDATE parts_catalogue SET stock_qty = GREATEST(0, stock_qty - $1) WHERE id=$2`,
                [line.total_qty, line.part_id]
              );
            } else {
              await query(
                `UPDATE parts_catalogue SET stock_qty = stock_qty + $1 WHERE id=$2`,
                [line.total_qty, line.part_id]
              );
            }
          }
          await query(
            `UPDATE quotes SET stock_deducted=$1 WHERE id=$2`,
            [goingApproved, req.params.id]
          );
        }
      }
    }

    // When publishing or approving: inherit customer from project and ensure vehicle is linked
    let resolvedCustomerId = customer_id ?? null;
    if ((status === 'published' || status === 'approved') && !resolvedCustomerId) {
      const { rows: projRows } = await query(
        `SELECT p.customer_id, p.vehicle_id
         FROM quotes q JOIN projects p ON p.id = q.project_id
         WHERE q.id = $1 AND q.customer_id IS NULL`,
        [req.params.id]
      );
      if (projRows.length && projRows[0].customer_id) {
        resolvedCustomerId = projRows[0].customer_id;
        if (projRows[0].vehicle_id) {
          await query(
            `INSERT INTO customer_vehicles (customer_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [resolvedCustomerId, projRows[0].vehicle_id]
          );
        }
      }
    }

    await query(
      `UPDATE quotes SET
         status=COALESCE($1,status),
         notes=COALESCE($2,notes),
         diagnostic_summary=COALESCE($3,diagnostic_summary),
         title=COALESCE($4,title),
         customer_id=COALESCE($5,customer_id),
         updated_at=now()
       WHERE id=$6`,
      [status || null, notes ?? null, diagnostic_summary ?? null,
       title ?? null, resolvedCustomerId, req.params.id]
    );
    const quote = await getQuoteWithLines(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send quote to customer via email
router.post('/:id/send', requireAuth, async (req, res) => {
  try {
    const quote = await getQuoteWithLines(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (!quote.customer) return res.status(400).json({ error: 'No customer attached to this quote' });

    const { rows: projRows } = await query(
      'SELECT make, model, year, registration FROM projects WHERE id=$1',
      [quote.projectId]
    );
    const proj = projRows[0] || {};
    const vehicleDesc = [proj.make, proj.model, proj.year, proj.registration].filter(Boolean).join(' ');

    const settings = await getWorkshopSettings();
    const customerOrigin = process.env.CUSTOMER_PORTAL_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173';

    // Generate a single-use magic link token (24h expiry)
    const magicToken = crypto.randomBytes(32).toString('hex');
    await query(
      `UPDATE users SET magic_token = $1, magic_token_expires_at = now() + interval '24 hours' WHERE id = $2`,
      [magicToken, quote.customer.id]
    );
    const portalUrl = `${customerOrigin}/portal?magic=${magicToken}&project=${quote.projectId}`;

    await sendQuoteToCustomer({
      to: quote.customer.email,
      customerName: quote.customer.name,
      workshopName: settings.workshopName,
      vehicleDesc,
      quoteRef: quote.reference,
      quoteTitle: quote.title,
      total: quote.totals.total.toFixed(2),
      portalUrl,
    });

    await query(
      `UPDATE quotes SET status='sent', sent_at=now(), updated_at=now() WHERE id=$1`,
      [req.params.id]
    );

    res.json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quote items ───────────────────────────────────────────────────────────────

router.post('/:id/items', requireAuth, async (req, res) => {
  try {
    const { title, description, notes, sortOrder } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows: existing } = await query('SELECT id FROM quotes WHERE id=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Quote not found' });
    const { rows: countRows } = await query(
      'SELECT COUNT(*) as cnt FROM quote_items WHERE quote_id=$1',
      [req.params.id]
    );
    const nextOrder = sortOrder ?? parseInt(countRows[0].cnt);
    await query(
      'INSERT INTO quote_items (quote_id, title, description, notes, sort_order) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, title, description || null, notes || null, nextOrder]
    );
    res.status(201).json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { title, description, notes } = req.body;
    await query(
      `UPDATE quote_items SET
         title=COALESCE($1,title),
         description=COALESCE($2,description),
         notes=COALESCE($3,notes)
       WHERE id=$4 AND quote_id=$5`,
      [title || null, description ?? null, notes ?? null, req.params.itemId, req.params.id]
    );
    res.json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM quote_items WHERE id=$1 AND quote_id=$2',
      [req.params.itemId, req.params.id]);
    res.json(await getQuoteWithLines(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quote lines ───────────────────────────────────────────────────────────────

router.post('/:id/lines', requireAuth, async (req, res) => {
  try {
    const {
      type = 'part', description, qty = 1, unitCost, markupPct,
      partId, partNumber, quote_item_id,
    } = req.body;
    if (!description || unitCost == null) {
      return res.status(400).json({ error: 'description and unitCost required' });
    }
    const settings = await getWorkshopSettings();
    const markup = markupPct != null ? markupPct : settings.defaultMarkupPct;
    await query(
      `INSERT INTO quote_lines
         (quote_id, quote_item_id, type, description, qty, unit_cost, markup_pct, part_id, part_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id, quote_item_id || null, type, description, qty, unitCost, markup,
       partId || null, partNumber || null]
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

// POST /:id/quick-send — generate shareable quote link, optionally send via email/SMS
router.post('/:id/quick-send', requireAuth, async (req, res) => {
  try {
    const { email, phone } = req.body;
    const quote = await getQuoteWithLines(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // Generate / refresh token (30-day expiry)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      `UPDATE quotes SET quote_token=$1, quote_token_expires_at=$2, quote_email=$3 WHERE id=$4`,
      [token, expires, email || null, quote.id]
    );

    const customerOrigin = process.env.CUSTOMER_PORTAL_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const quoteUrl = `${customerOrigin}/?quote=${token}`;

    // Fetch project + workshop for context
    const { rows: projRows } = await query(
      `SELECT p.make, p.model, p.year, p.registration, p.registration_snapshot, w.name as workshop_name
       FROM projects p JOIN workshops w ON w.id = p.workshop_id WHERE p.id = $1`,
      [quote.projectId]
    );
    const proj = projRows[0] || {};
    const vehicleDesc = [proj.year, proj.make, proj.model].filter(Boolean).join(' ') || proj.registration_snapshot || proj.registration || '';
    const workshopName = proj.workshop_name || '';

    // Fire email if address provided
    if (email) {
      sendQuickQuote({
        to: email,
        workshopName,
        vehicleDesc,
        quoteRef: quote.reference,
        total: quote.totals.total.toFixed(2),
        quoteUrl,
      }).catch((err) => console.error('[quick-send email]', err.message));
    }

    // Fire SMS if phone provided
    if (phone) {
      const smsMsg = `${workshopName ? workshopName + ': ' : ''}Your quote${vehicleDesc ? ' for ' + vehicleDesc : ''} — £${quote.totals.total.toFixed(2)}. View & accept: ${quoteUrl}`;
      sendSMS(phone, smsMsg).catch((err) => console.error('[quick-send sms]', err.message));
    }

    return res.json({ quoteUrl, token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /:id/pdf — download invoice/quote as PDF (admin)
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const { rows: quoteRows } = await query(
      `SELECT q.*, p.registration_snapshot, p.registration, p.make, p.model, p.year
       FROM quotes q
       JOIN projects p ON p.id = q.project_id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (!quoteRows.length) return res.status(404).json({ error: 'Quote not found' });
    const quote = quoteRows[0];

    const [{ rows: itemRows }, { rows: lineRows }, tmpl] = await Promise.all([
      query('SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY sort_order, created_at', [quote.id]),
      query('SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort_order, created_at', [quote.id]),
      getWorkshopSettings(),
    ]);

    const fmtLine = (row) => {
      const unitCost = parseFloat(row.unit_cost);
      const markupPct = parseFloat(row.markup_pct);
      const qty = parseFloat(row.qty);
      const unitPrice = Math.round(unitCost * (1 + markupPct / 100) * 100) / 100;
      return { id: row.id, type: row.type, description: row.description, qty, lineTotal: Math.round(unitPrice * qty * 100) / 100, quoteItemId: row.quote_item_id || null };
    };

    const allLines = lineRows.map(fmtLine);
    const vatRate = parseFloat(quote.vat_rate);
    const items = itemRows.map((item) => ({ id: item.id, title: item.title, lines: allLines.filter((l) => l.quoteItemId === item.id) }));
    const ungroupedLines = allLines.filter((l) => !l.quoteItemId);
    const subtotal = Math.round(allLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100;

    const pdf = await generateInvoicePdf({
      workshopName: tmpl.workshopName || '',
      address: [tmpl.addressLine1, tmpl.addressLine2, tmpl.city, tmpl.postcode].filter(Boolean),
      phone: tmpl.phone || null,
      email: tmpl.email || null,
      logoUrl: tmpl.invoiceLogoUrl || null,
      accentColor: tmpl.invoiceAccentColor || '#1e40af',
      vatNumber: tmpl.invoiceVatNumber || null,
      footerText: tmpl.invoiceFooterText || null,
      showBankDetails: tmpl.invoiceShowBankDetails || false,
      bankName: tmpl.invoiceBankName || null,
      accountName: tmpl.invoiceAccountName || null,
      accountNumber: tmpl.invoiceAccountNumber || null,
      sortCode: tmpl.invoiceSortCode || null,
      reference: quote.reference,
      title: quote.title || null,
      status: quote.status,
      registration: quote.registration_snapshot || quote.registration,
      vehicle: [quote.make, quote.model, quote.year].filter(Boolean).join(' '),
      date: quote.updated_at,
      items,
      ungroupedLines,
      subtotal,
      vat,
      total: Math.round((subtotal + vat) * 100) / 100,
      vatRate,
      notes: quote.notes || null,
    });

    const filename = `invoice-${(quote.reference || 'invoice').replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  } catch (err) {
    console.error('[admin pdf]', err.message);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
