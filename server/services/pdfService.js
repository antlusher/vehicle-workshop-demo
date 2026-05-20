const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { s3Available, getPresignedUrl } = require('./mediaService');

const uploadsDir = path.join(__dirname, '..', 'uploads');

async function getLogoDataUri(logoUrl) {
  if (!logoUrl) return null;
  if (s3Available()) {
    try {
      return await getPresignedUrl(logoUrl);
    } catch { return null; }
  }
  const localPath = path.join(uploadsDir, logoUrl);
  if (!fs.existsSync(localPath)) return null;
  const data = fs.readFileSync(localPath);
  const ext = path.extname(logoUrl).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
}

function buildInvoiceHtml({
  workshopName, address, phone, email,
  logoUri, accentColor,
  vatNumber, reference, title, status,
  registration, vehicle, date,
  items, ungroupedLines,
  subtotal, vat, total, vatRate,
  notes, footerText,
  showBankDetails, bankName, accountName, accountNumber, sortCode,
}) {
  const accent = accentColor || '#1e40af';
  const fmt = (v) => v == null ? '—' : `£${parseFloat(v).toFixed(2)}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const docType = status === 'approved' ? 'Invoice' : 'Estimate';

  const TYPE_LABELS = { part: 'Part', labour: 'Labour', other: 'Other' };
  const renderLine = (l) => `
    <tr>
      <td>${TYPE_LABELS[l.type] || l.type || ''}</td>
      <td>${l.description || ''}</td>
      <td class="right">×${parseFloat(l.qty)}</td>
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

  const addressLines = (address || []).filter(Boolean);

  const bankSection = showBankDetails && (bankName || accountNumber) ? `
    <div class="bank-section">
      <div class="bank-title">Bank details</div>
      ${bankName ? `<div class="bank-row"><span>Bank</span><strong>${bankName}</strong></div>` : ''}
      ${accountName ? `<div class="bank-row"><span>Account name</span><strong>${accountName}</strong></div>` : ''}
      ${sortCode ? `<div class="bank-row"><span>Sort code</span><strong>${sortCode}</strong></div>` : ''}
      ${accountNumber ? `<div class="bank-row"><span>Account number</span><strong>${accountNumber}</strong></div>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${docType} ${reference}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; }
  .page { max-width: 740px; margin: 0 auto; padding: 44px 40px; }

  /* Header */
  .top { display: flex; justify-content: space-between; align-items: flex-start;
         margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid ${accent}; }
  .ws-logo { max-height: 60px; max-width: 180px; object-fit: contain; display: block; margin-bottom: 6px; }
  .ws-name { font-size: 18px; font-weight: 800; color: #1e293b; }
  .ws-address { font-size: 11px; color: #64748b; line-height: 1.6; margin-top: 3px; }
  .ws-contact { font-size: 11px; color: #64748b; line-height: 1.6; }
  .doc-block { text-align: right; }
  .doc-type { font-size: 28px; font-weight: 800; color: ${accent}; line-height: 1; }
  .doc-ref { font-size: 12px; color: #64748b; margin-top: 5px; }
  .doc-vat { font-size: 11px; color: #94a3b8; margin-top: 3px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 8px; }
  .badge--approved { background: #dcfce7; color: #15803d; }
  .badge--sent { background: #fef9c3; color: #a16207; }
  .badge--draft { background: #f1f5f9; color: #64748b; }

  /* Meta row */
  .meta-row { display: flex; gap: 48px; margin-bottom: 24px; }
  .meta-block label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 3px; }
  .meta-block strong { font-size: 13px; color: #1e293b; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin: 4px 0 20px; }
  thead tr { background: ${accent}15; }
  th { text-align: left; padding: 9px 12px; font-size: 11px; font-weight: 700;
       text-transform: uppercase; letter-spacing: 0.04em; color: ${accent}; border-bottom: 2px solid ${accent}30; }
  th.right { text-align: right; }
  td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12.5px; color: #1e293b; }
  td.right { text-align: right; }
  .section-label { font-weight: 700; font-size: 12px; color: #374151; background: #f8fafc; padding: 7px 12px; }

  /* Totals */
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 4px; }
  .totals-table { width: 280px; }
  .totals-table td { border: none; padding: 5px 12px; font-size: 13px; }
  .totals-table .total-row td { border-top: 2px solid #1e293b; font-weight: 700; font-size: 15px; padding-top: 10px; }

  /* Notes & bank */
  .notes { margin-top: 20px; padding: 12px 14px; background: #f8fafc; border-left: 3px solid ${accent};
           border-radius: 0 6px 6px 0; font-size: 12px; color: #374151; line-height: 1.6; }
  .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; }
  .bank-section { margin-top: 16px; padding: 12px 14px; background: #f8fafc; border-radius: 6px; }
  .bank-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; }
  .bank-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; border-bottom: 1px solid #e5e7eb; }
  .bank-row:last-child { border: none; }
  .bank-row span { color: #64748b; }
  .bank-row strong { color: #1e293b; }

  /* Footer */
  .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div>
      ${logoUri ? `<img src="${logoUri}" class="ws-logo" alt="logo" />` : ''}
      ${workshopName ? `<div class="ws-name">${workshopName}</div>` : ''}
      ${addressLines.length ? `<div class="ws-address">${addressLines.join('<br>')}</div>` : ''}
      ${(phone || email) ? `<div class="ws-contact">${[phone, email].filter(Boolean).join(' · ')}</div>` : ''}
    </div>
    <div class="doc-block">
      <div class="doc-type">${docType}</div>
      <div class="doc-ref">${reference}${title ? ` — ${title}` : ''}</div>
      ${vatNumber ? `<div class="doc-vat">VAT Reg: ${vatNumber}</div>` : ''}
      <span class="badge badge--${status}">${status}</span>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-block"><label>Date</label><strong>${fmtDate(date)}</strong></div>
    <div class="meta-block"><label>Vehicle</label><strong>${registration || '—'}${vehicle ? ` · ${vehicle}` : ''}</strong></div>
  </div>

  <table>
    <thead>
      <tr><th>Type</th><th>Description</th><th class="right">Qty</th><th class="right">Total</th></tr>
    </thead>
    <tbody>${renderItems()}</tbody>
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
  ${bankSection}

  <div class="footer">${footerText || 'Generated by Your Gofer Workshop Management'}</div>
</div>
</body>
</html>`;
}

async function generateInvoicePdf(invoiceData) {
  const logoUri = await getLogoDataUri(invoiceData.logoUrl).catch(() => null);
  const html = buildInvoiceHtml({ ...invoiceData, logoUri });
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
