const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const FROM_EMAIL = process.env.SES_FROM_EMAIL;

function createClient() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  return new SESClient({
    region: process.env.AWS_REGION || 'eu-west-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const client = createClient();

async function sendEmail({ to, subject, html, text }) {
  if (!client) {
    console.log(`[email] SES not configured — would have sent to ${to}: ${subject}`);
    return;
  }

  await client.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
    },
  }));
}

async function sendSubscriptionConfirmation(email) {
  await sendEmail({
    to: email,
    subject: 'Welcome to Vehicle Workshop',
    html: `
      <h2>Subscription Activated</h2>
      <p>Your Vehicle Workshop subscription is now active.</p>
      <p>You can now log in and start creating projects.</p>
    `,
    text: 'Your Vehicle Workshop subscription is now active. Log in to get started.',
  });
}

async function sendPasswordReset(email, resetToken) {
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const resetUrl = `${clientOrigin}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: 'Reset your Vehicle Workshop password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, ignore this email.</p>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

async function sendQuoteToCustomer({ to, customerName, workshopName, vehicleDesc, quoteRef, quoteTitle, total, portalUrl }) {
  const displayName = customerName || to;
  const displayWorkshop = workshopName || 'Your Workshop';
  const titleLine = quoteTitle ? ` — ${quoteTitle}` : '';

  await sendEmail({
    to,
    subject: `Your estimate from ${displayWorkshop} (${quoteRef})`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
        <h2 style="color:#1e40af;">${displayWorkshop}</h2>
        <p>Hi ${displayName},</p>
        <p>We've prepared an estimate for your vehicle${vehicleDesc ? ` (${vehicleDesc})` : ''}.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr style="background:#f1f5f9;">
            <td style="padding:10px 14px;font-weight:600;">Reference</td>
            <td style="padding:10px 14px;">${quoteRef}${titleLine}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;">Total (inc. VAT)</td>
            <td style="padding:10px 14px;font-size:1.1em;font-weight:700;">£${total}</td>
          </tr>
        </table>
        <p>
          <a href="${portalUrl}" style="display:inline-block;background:#1e40af;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;">
            View your estimate
          </a>
        </p>
        <p style="color:#6b7280;font-size:0.85em;">
          If the button doesn't work, copy this link into your browser:<br>
          <a href="${portalUrl}">${portalUrl}</a>
        </p>
        <p style="color:#6b7280;font-size:0.85em;">
          Please accept or discuss this estimate before work begins.
        </p>
      </div>
    `,
    text: `Hi ${displayName},\n\nWe've prepared an estimate for your vehicle${vehicleDesc ? ` (${vehicleDesc})` : ''}.\n\nReference: ${quoteRef}${titleLine}\nTotal (inc. VAT): £${total}\n\nView your estimate: ${portalUrl}\n\nPlease accept or discuss this estimate before work begins.\n\n${displayWorkshop}`,
  });
}

module.exports = {
  sendSubscriptionConfirmation,
  sendPasswordReset,
  sendQuoteToCustomer,
};
