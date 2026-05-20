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
  logoUri,
  vatNumber, reference, title, status,
  registration, vin, mileage, vehicle,
  customerName, customerAddress,
  date, paymentTerms, companyReg,
  items, ungroupedLines,
  subtotal, vat, total, vatRate,
  notes, footerText,
  showBankDetails, bankName, accountName, accountNumber, sortCode,
}) {
  const fmt = (v) => v == null ? '—' : `£${parseFloat(v).toFixed(2)}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const docType = (status === 'approved' || status === 'invoiced') ? 'INVOICE' : 'ESTIMATE';
  const invoiceNum = reference || '';

  const fmtQty = (l) => {
    const q = parseFloat(l.qty);
    if (l.type === 'labour') {
      const hrs = Math.floor(q);
      const mins = Math.round((q - hrs) * 60);
      return `${hrs}:${mins.toString().padStart(2, '0')} Hours`;
    }
    return String(q % 1 === 0 ? q : q.toFixed(2));
  };

  const renderLine = (l) => `
    <tr>
      <td class="qty">${fmtQty(l)}</td>
      <td class="desc">${l.description || ''}</td>
      <td class="right">${fmt(l.lineTotal / (parseFloat(l.qty) || 1))}</td>
      <td class="right bold">${fmt(l.lineTotal)}</td>
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

  const wsAddressLines = (address || []).filter(Boolean);
  const custAddressLines = (customerAddress || []).filter(Boolean);
  const terms = paymentTerms || 'Due on receipt';

  const vehicleMeta = [
    registration ? `REG: ${registration}` : null,
    vin ? `VIN: ${vin}` : null,
    vehicle ? `M/M: ${vehicle.replace(' ', '/')}` : null,
    mileage ? `Mileage: ${parseInt(mileage).toLocaleString()}` : null,
  ].filter(Boolean).join('&nbsp;&nbsp;&nbsp;');

  const hasOtherInfo = companyReg || vatNumber;
  const hasPaymentDetails = showBankDetails && (bankName || accountNumber);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${docType} ${invoiceNum}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5px; line-height: 1.45; }
  .page { max-width: 740px; margin: 0 auto; padding: 36px 44px 40px; }

  hr { border: none; border-top: 1.5px solid #111; margin: 18px 0; }
  hr.light { border-top-color: #ccc; }

  /* ── Top: logo left, workshop address right ── */
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
  .ws-logo { max-height: 70px; max-width: 200px; object-fit: contain; display: block; }
  .ws-name { font-size: 15px; font-weight: 700; }
  .ws-details { text-align: right; font-size: 11.5px; color: #333; line-height: 1.6; }

  /* ── Customer + Invoice details ── */
  .billing { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 0 10px; }
  .cust-name { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .cust-addr { font-size: 12px; color: #333; line-height: 1.6; }
  .inv-meta { text-align: right; }
  .inv-number { font-size: 20px; font-weight: 700; }
  .inv-date { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .inv-terms { font-size: 12px; color: #666; margin-top: 3px; }

  /* ── Line items table ── */
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  table.lines th { font-size: 10px; font-weight: 600; text-transform: uppercase;
                   letter-spacing: 0.06em; color: #444; padding: 7px 8px;
                   border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; }
  table.lines th.right { text-align: right; }
  table.lines td { padding: 9px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; color: #111; font-size: 12.5px; }
  table.lines td.qty { white-space: nowrap; width: 90px; }
  table.lines td.desc { }
  table.lines td.right { text-align: right; white-space: nowrap; }
  table.lines td.bold { font-weight: 700; }
  table.lines .section-label { font-weight: 700; font-size: 12px; background: #f5f5f5; padding: 6px 8px; color: #222; }
  table.lines tr:last-child td { border-bottom: 1.5px solid #111; }

  /* ── Total ── */
  .total-line { display: flex; justify-content: flex-end; align-items: baseline;
                gap: 24px; padding: 12px 8px 0; }
  .total-label { font-size: 14px; font-weight: 700; letter-spacing: 0.08em; }
  .total-amount { font-size: 20px; font-weight: 700; }

  /* ── Notes ── */
  .notes-block { margin-top: 16px; font-size: 12px; color: #444; line-height: 1.6; }

  /* ── Footer two-col ── */
  .footer-cols { display: flex; justify-content: space-between; gap: 32px; margin-top: 24px; padding-top: 16px; border-top: 1.5px solid #111; }
  .footer-col { flex: 1; }
  .footer-col-title { font-size: 11px; font-weight: 700; margin-bottom: 8px; }
  .footer-col p { font-size: 12px; line-height: 1.7; color: #222; }
  .footer-col strong { font-weight: 700; }

  /* ── Vehicle meta ── */
  .vehicle-meta { margin-top: 18px; font-size: 10.5px; color: #666; font-weight: 600; letter-spacing: 0.02em; }

  /* ── Page footer ── */
  .page-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd;
                 font-size: 10px; color: #aaa; text-align: center; }
</style>
</head>
<body>
<div class="page">

  <!-- Logo + workshop address -->
  <div class="top">
    <div>
      ${logoUri ? `<img src="${logoUri}" class="ws-logo" alt="logo" />` : (workshopName ? `<div class="ws-name">${workshopName}</div>` : '')}
    </div>
    <div class="ws-details">
      ${logoUri && workshopName ? `<div style="font-weight:700;font-size:13px;margin-bottom:2px;">${workshopName}</div>` : ''}
      ${wsAddressLines.join('<br>')}
      ${email ? `<br>${email}` : ''}
      ${phone ? `<br>${phone}` : ''}
    </div>
  </div>

  <hr>

  <!-- Customer + Invoice ref -->
  <div class="billing">
    <div>
      ${customerName ? `<div class="cust-name">${customerName}</div>` : ''}
      ${custAddressLines.length ? `<div class="cust-addr">${custAddressLines.join('<br>')}</div>` : ''}
    </div>
    <div class="inv-meta">
      <div class="inv-number">${docType} ${invoiceNum}</div>
      <div class="inv-date">${fmtDate(date)}</div>
      <div class="inv-terms">Payment Terms: ${terms}</div>
    </div>
  </div>

  <hr>

  <!-- Line items -->
  <table class="lines">
    <thead>
      <tr>
        <th>Quantity</th>
        <th>Details</th>
        <th class="right">Unit Price (£)</th>
        <th class="right">Subtotal (£)</th>
      </tr>
    </thead>
    <tbody>${renderItems()}</tbody>
  </table>

  <!-- Total -->
  <div class="total-line">
    <div class="total-label">GBP TOTAL</div>
    <div class="total-amount">${fmt(total)}</div>
  </div>

  ${notes ? `<div class="notes-block">${notes}</div>` : ''}

  <!-- Footer: payment details + other info -->
  ${(hasPaymentDetails || hasOtherInfo) ? `
  <div class="footer-cols">
    ${hasPaymentDetails ? `
    <div class="footer-col">
      <div class="footer-col-title">Payment Details</div>
      ${accountName ? `<p><strong>${accountName}</strong></p>` : (bankName ? `<p><strong>${bankName}</strong></p>` : '')}
      ${bankName && accountName ? `<p><strong>Bank/Sort Code:</strong> ${sortCode || '—'}</p>` : (sortCode ? `<p><strong>Bank/Sort Code:</strong> ${sortCode}</p>` : '')}
      ${accountNumber ? `<p><strong>Account Number:</strong> ${accountNumber}</p>` : ''}
      ${reference ? `<p><strong>Payment Reference:</strong> ${invoiceNum}</p>` : ''}
    </div>` : '<div class="footer-col"></div>'}
    ${hasOtherInfo ? `
    <div class="footer-col" style="text-align:right;">
      <div class="footer-col-title">Other Information</div>
      ${companyReg ? `<p><strong>Company Registration Number:</strong> ${companyReg}</p>` : ''}
      ${vatNumber ? `<p><strong>VAT Registration:</strong> ${vatNumber}</p>` : ''}
    </div>` : ''}
  </div>` : ''}

  ${vehicleMeta ? `<div class="vehicle-meta">${vehicleMeta}</div>` : ''}

  ${footerText ? `<div class="page-footer">${footerText}</div>` : ''}

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
