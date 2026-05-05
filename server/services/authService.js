const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('./db');

const SALT_ROUNDS = 10;

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    role: row.role,
    subscribed: row.subscribed,
    sessionActive: row.session_active,
    token: row.token,
    resetToken: row.reset_token,
    resetExpiry: row.reset_expiry,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

async function findUserByEmail(email) {
  if (!email) return null;
  const { rows } = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  return toUser(rows[0]);
}

async function findUserByToken(token) {
  if (!token) return null;
  const { rows } = await query('SELECT * FROM users WHERE token = $1', [token]);
  return toUser(rows[0]);
}

async function createUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) throw new Error('An account with this email already exists');

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (email, password, role, subscribed, session_active)
     VALUES ($1, $2, 'tech', false, false) RETURNING *`,
    [email, hashedPassword]
  );
  return toUser(rows[0]);
}

async function loginUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('Invalid email or password');

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid email or password');

  // Auto-clear session if last login was over 24 hours ago
  if (user.sessionActive && user.lastLoginAt) {
    const sessionAge = Date.now() - new Date(user.lastLoginAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (sessionAge > twentyFourHours) {
      await query('UPDATE users SET session_active = false, token = NULL WHERE id = $1', [user.id]);
      user.sessionActive = false;
    }
  }

  const singleSessionEnabled = process.env.SINGLE_SESSION !== 'false';
  if (singleSessionEnabled && user.sessionActive) {
    throw new Error('This account is already active on another device');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `UPDATE users SET token = $1, session_active = true, last_login_at = now()
     WHERE id = $2 RETURNING *`,
    [token, user.id]
  );
  return toUser(rows[0]);
}

async function logLogin(userId, ipAddress, userAgent) {
  await query(
    'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES ($1, $2, $3)',
    [userId, ipAddress || null, userAgent || null]
  ).catch(() => {});
}

async function logoutUser(token) {
  await query(
    'UPDATE users SET token = NULL, session_active = false WHERE token = $1',
    [token]
  );
}

async function subscribeUser(token) {
  const { rows } = await query(
    'UPDATE users SET subscribed = true WHERE token = $1 RETURNING *',
    [token]
  );
  if (!rows.length) throw new Error('Invalid session');
  return toUser(rows[0]);
}

async function createPasswordResetToken(email) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await query(
    'UPDATE users SET reset_token = $1, reset_expiry = $2 WHERE id = $3',
    [resetToken, resetExpiry, user.id]
  );
  return resetToken;
}

async function resetPassword(resetToken, newPassword) {
  const { rows } = await query(
    'SELECT * FROM users WHERE reset_token = $1 AND reset_expiry > now()',
    [resetToken]
  );
  if (!rows.length) throw new Error('Invalid or expired reset link');

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(
    `UPDATE users SET password = $1, reset_token = NULL, reset_expiry = NULL,
     token = NULL, session_active = false WHERE id = $2`,
    [hashedPassword, rows[0].id]
  );
}

module.exports = {
  findUserByEmail,
  findUserByToken,
  createUser,
  loginUser,
  logLogin,
  logoutUser,
  subscribeUser,
  createPasswordResetToken,
  resetPassword,
};
