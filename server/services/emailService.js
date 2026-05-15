const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');

const FROM_EMAIL = process.env.SES_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;

function createSmtpTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth,
  });
}

function createSesClient() {
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

const smtpTransport = createSmtpTransport();
const sesClient = smtpTransport ? null : createSesClient();

function getTransportStatus() {
  if (smtpTransport) {
    return {
      transport: 'smtp',
      configured: true,
      from: FROM_EMAIL || null,
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
    };
  }
  if (sesClient) {
    return { transport: 'ses', configured: true, from: FROM_EMAIL || null };
  }
  return { transport: 'none', configured: false, from: FROM_EMAIL || null };
}

async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject) {
    throw new Error('Recipient and subject are required');
  }
  if (!html && !text) {
    throw new Error('Email body (html or text) is required');
  }

  if (smtpTransport) {
    if (!FROM_EMAIL) throw new Error('SMTP_FROM_EMAIL (or SES_FROM_EMAIL) must be set');
    const info = await smtpTransport.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });
    return { transport: 'smtp', messageId: info.messageId };
  }

  if (sesClient) {
    if (!FROM_EMAIL) throw new Error('SES_FROM_EMAIL must be set');
    const body = {};
    if (html) body.Html = { Data: html };
    if (text) body.Text = { Data: text };
    const result = await sesClient.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: subject }, Body: body },
    }));
    return { transport: 'ses', messageId: result.MessageId };
  }

  console.log(`[email] No transport configured — would have sent to ${to}: ${subject}`);
  return { transport: 'none', messageId: null };
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

module.exports = {
  sendEmail,
  getTransportStatus,
  sendSubscriptionConfirmation,
  sendPasswordReset,
};
