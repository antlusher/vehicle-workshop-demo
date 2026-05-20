const { chromium } = require('playwright');

function buildInvoiceHtml({ workshopName, reference, title, status, registration, vehicle, date, items, ungroupedLines, subtotal, vat, total, vatRate, notes }) {
  const fmt = (v) => v == null ? '—' : `£${parseFloat(v).toFixed(2)}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const docType = status === 'approved' ? 'Invoice' : 'Estimate';
  const badgeClass = status === 'approved' ? 'badge--approved' : 'badge--sent';

  const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };

  const renderLine = (l) => `
    <tr>
      <td>${TYPE_LABELS[l.type] || l.type || ''}</td>
      <td>${l.description || ''}</td>
      <td class="right">×${l.qty}</td>
      <td class="right">${fmt(l.lineTotal)}</td>
    </tr>`;

  const renderItems = () => {
    let rows = '';
    (items || []).forEach((item) => {
      if (item.title) rows += `<tr><td colspan="4" class="section-label">${item.title}</td></tr>`;
      (item.lines || []).forEach((l) => { rows += renderLine(l); });
    });
    (ungroupedLines || []).forEach((l) => { rows += renderLine(l); });
    return rows;
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${docType} ${reference}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; }
  .page { max-width: 720px; margin: 0 auto; padding: 48px 40px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #1e40af; }
  .workshop { font-size: 20px; font-weight: 800; color: #1e293b; }
  .doc-block { text-align: right; }
  .doc-type { font-size: 26px; font-weight: 800; color: #1e40af; line-height: 1; }
  .doc-ref { font-size: 12px; color: #64748b; margin-top: 5px; }
  .meta-row { display: flex; gap: 48px; margin-bottom: 28px; }
  .meta-block label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 3px; }
  .meta-block strong { font-size: 13px; color: #1e293b; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 6px; }
  .badge--approved { background: #dcfce7; color: #15803d; }
  .badge--sent { background: #fef9c3; color: #a16207; }
  .badge--draft { background: #f1f5f9; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; }
  thead tr { background: #f1f5f9; }
  th { text-align: left; padding: 9px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; }
  th.right { text-align: right; }
  td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12.5px; color: #1e293b; }
  td.right { text-align: right; }
  .section-label { font-weight: 700; font-size: 12px; color: #374151; background: #f8fafc; padding: 7px 12px; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totals-table { width: 280px; }
  .totals-table td { border: none; padding: 5px 12px; font-size: 13px; }
  .totals-table .total-row td { border-top: 2px solid #1e293b; font-weight: 700; font-size: 15px; padding-top: 10px; }
  .notes { margin-top: 24px; padding: 14px 16px; background: #f8fafc; border-radius: 6px; font-size: 12px; color: #374151; line-height: 1.6; }
  .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div>
      ${workshopName ? `<div class="workshop">${workshopName}</div>` : ''}
    </div>
    <div class="doc-block">
      <div class="doc-type">${docType}</div>
      <div class="doc-ref">${reference}${title ? ` — ${title}` : ''}</div>
      <span class="badge ${badgeClass}">${status}</span>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-block">
      <label>Date</label>
      <strong>${fmtDate(date)}</strong>
    </div>
    <div class="meta-block">
      <label>Vehicle</label>
      <strong>${registration || '—'}${vehicle ? ` · ${vehicle}` : ''}</strong>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Description</th>
        <th class="right">Qty</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${renderItems()}
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals-table">
      <tbody>
        <tr><td>Subtotal</td><td class="right">${fmt(subtotal)}</td></tr>
        <tr><td>VAT (${vatRate}%)</td><td class="right">${fmt(vat)}</td></tr>
        <tr class="total-row"><td>Total</td><td class="right">${fmt(total)}</td></tr>
      </tbody>
    </table>
  </div>

  ${notes ? `<div class="notes"><div class="notes-label">Notes</div>${notes}</div>` : ''}

  <div class="footer">Generated by Your Gofer Workshop Management</div>
</div>
</body>
</html>`;
}

async function generateInvoicePdf(invoiceData) {
  const html = buildInvoiceHtml(invoiceData);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoicePdf };
