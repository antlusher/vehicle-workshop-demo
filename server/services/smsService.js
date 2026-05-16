const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

function createClient() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  return new SNSClient({
    region: process.env.AWS_REGION || 'eu-west-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const client = createClient();

// Normalise to E.164 — assumes UK (+44) if no country code
function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('44')) return `+${digits}`;
  if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

async function sendSMS(phone, message) {
  const to = normalisePhone(phone);

  if (!client) {
    console.log(`[sms] SNS not configured — would have sent to ${to}: ${message}`);
    return { simulated: true };
  }

  await client.send(new PublishCommand({
    PhoneNumber: to,
    Message: message,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
    },
  }));

  return { sent: true, to };
}

module.exports = { sendSMS };
