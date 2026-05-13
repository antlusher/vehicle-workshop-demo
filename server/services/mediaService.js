const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const BUCKET = process.env.S3_MEDIA_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-west-2';

function createClient() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !BUCKET) return null;
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const s3 = createClient();

function s3Available() {
  return !!s3;
}

function makeKey(projectId, originalName) {
  const ext = path.extname(originalName) || '';
  return `projects/${projectId}/${uuidv4()}${ext}`;
}

async function uploadToS3(buffer, key, mimetype) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return key;
}

async function deleteFromS3(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // best effort
  }
}

// Returns a pre-signed URL valid for 1 hour
async function getPresignedUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

module.exports = { s3Available, makeKey, uploadToS3, deleteFromS3, getPresignedUrl };
