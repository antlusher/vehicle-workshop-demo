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

module.exports = {
  sendSubscriptionConfirmation,
  sendPasswordReset,
};
