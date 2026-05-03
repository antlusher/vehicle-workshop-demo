const crypto = require('crypto');
const { loadData, saveData } = require('./storage');

const USERS_FILE = 'users.json';

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

function createUser(email, password) {
  const users = getUsers();
  const existing = findUserByEmail(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    password,
    subscribed: false,
    token: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function loginUser(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    throw new Error('Invalid email or password');
  }
  return user;
}

function subscribeUser(token) {
  const users = getUsers();
  const user = users.find((item) => item.token === token);
  if (!user) {
    throw new Error('Invalid token');
  }
  user.subscribed = true;
  saveUsers(users);
  return user;
}

module.exports = {
  getUsers,
  saveUsers,
  findUserByEmail,
  findUserByToken,
  createUser,
  loginUser,
  subscribeUser,
};
