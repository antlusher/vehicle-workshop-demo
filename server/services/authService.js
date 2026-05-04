const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { loadData, saveData } = require('./storage');

const USERS_FILE = 'users.json';
const SALT_ROUNDS = 10;

function getUsers() {
  return loadData(USERS_FILE, []);
}

function saveUsers(users) {
  saveData(USERS_FILE, users);
}

function findUserByEmail(email) {
  if (!email) return null;
  const users = getUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function findUserByToken(token) {
  if (!token) return null;
  const users = getUsers();
  return users.find((user) => user.token === token);
}

async function createUser(email, password) {
  const existing = findUserByEmail(email);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const users = getUsers();
  const user = {
    id: crypto.randomUUID(),
    email,
    password: hashedPassword,
    role: 'tech',
    subscribed: false,
    sessionActive: false,
    token: null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

async function loginUser(email, password) {
  const users = getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new Error('Invalid email or password');
  }

  if (user.sessionActive) {
    throw new Error('This account is already active on another device');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const index = users.findIndex((u) => u.id === user.id);
  users[index] = { ...user, token, sessionActive: true, lastLoginAt: new Date().toISOString() };
  saveUsers(users);

  return users[index];
}

function logoutUser(token) {
  const users = getUsers();
  const index = users.findIndex((u) => u.token === token);
  if (index === -1) return;
  users[index] = { ...users[index], token: null, sessionActive: false };
  saveUsers(users);
}

function createPasswordResetToken(email) {
  const users = getUsers();
  const index = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
  if (index === -1) return null;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  users[index] = { ...users[index], resetToken, resetExpiry };
  saveUsers(users);
  return resetToken;
}

async function resetPassword(resetToken, newPassword) {
  const users = getUsers();
  const index = users.findIndex((u) => u.resetToken === resetToken);
  if (index === -1) {
    throw new Error('Invalid or expired reset link');
  }
  if (new Date(users[index].resetExpiry) < new Date()) {
    throw new Error('Invalid or expired reset link');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  users[index] = {
    ...users[index],
    password: hashedPassword,
    resetToken: null,
    resetExpiry: null,
    token: null,
    sessionActive: false,
  };
  saveUsers(users);
}

function subscribeUser(token) {
  const users = getUsers();
  const index = users.findIndex((u) => u.token === token);
  if (index === -1) {
    throw new Error('Invalid session');
  }
  users[index].subscribed = true;
  saveUsers(users);
  return users[index];
}

module.exports = {
  getUsers,
  saveUsers,
  findUserByEmail,
  findUserByToken,
  createUser,
  loginUser,
  logoutUser,
  subscribeUser,
  createPasswordResetToken,
  resetPassword,
};
