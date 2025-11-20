// Lightweight Turso (libSQL) adapter for the Evo project.
// This file provides a minimal wrapper around `@libsql/client` so the server
// can talk to a Turso-hosted SQLite-compatible database. It implements a
// few helper functions used commonly by the app. Extend as needed.

const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

let client = null;

function initFromEnv() {
  // Accept multiple common environment variable names (including the
  // specific ones you provided: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN).
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || process.env.LIBSQL_URL || process.env.DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || process.env.LIBSQL_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  if (!url) throw new Error('TURSO URL not set (set TURSO_DATABASE_URL or TURSO_URL)');
  client = createClient({
    url,
    auth: token ? { token } : undefined,
  });
}

async function init() {
  if (!client) initFromEnv();
  // Ensure tables exist — run a few CREATE TABLE IF NOT EXISTS statements.
  // Turso/libsql supports DDL; run the same tables the server expects.
  await execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    data TEXT,
    role TEXT DEFAULT 'user'
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    code TEXT,
    type TEXT,
    expires_at INTEGER,
    used INTEGER DEFAULT 0
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    event TEXT,
    ts INTEGER
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    data TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`);
}

// Generic execute helper. Returns rows for SELECT, otherwise metadata.
async function execute(sql, params = []) {
  if (!client) await init();
  const res = await client.execute(sql, params);
  // If libsql returns 'rows', return them; otherwise, return result as-is
  if (res && res.rows) return res.rows;
  return res;
}

async function findUserByEmail(email) {
  const rows = await execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows && rows.length ? rows[0] : null;
}

async function findUserById(id) {
  const rows = await execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length ? rows[0] : null;
}

async function findAllUsers() {
  return await execute('SELECT * FROM users');
}

// createUser accepts either a plaintext `password` (to be hashed) or
// `passwordHash` if already hashed. This matches sqlite.js behavior.
async function createUser({ email, password, passwordHash, name, data }) {
  const hash = passwordHash || (password ? await bcrypt.hash(password, 10) : null);
  const textData = data ? JSON.stringify(data) : JSON.stringify({});
  await execute('INSERT INTO users (email, password, name, data) VALUES (?, ?, ?, ?)', [email, hash, name || null, textData]);
  return await findUserByEmail(email);
}

async function createUserWithHashed({ email, hashedPassword, name, data }) {
  return await createUser({ email, passwordHash: hashedPassword, name, data });
}

// Auth code helpers
async function createAuthCode({ user_id, email, code, type, ttlSeconds = 600 }) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  await execute('INSERT INTO auth_codes (user_id, email, code, type, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)', [user_id || null, email, code, type, expires]);
  // Return a simple object — callers use id via findValidAuthCode
  return { user_id, email, code, type, expires_at: expires };
}

async function findValidAuthCode({ email, code, type }) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await execute('SELECT * FROM auth_codes WHERE email = ? AND code = ? AND type = ? AND used = 0 AND expires_at >= ? LIMIT 1', [email, code, type, now]);
  return rows && rows.length ? rows[0] : null;
}

async function markAuthCodeUsed(id) {
  await execute('UPDATE auth_codes SET used = 1 WHERE id = ?', [id]);
}

async function verifyPassword(user, password) {
  if (!user) return false;
  const hash = user.password || user.password_hash || user.passwordHash;
  return bcrypt.compare(password, hash || '');
}

async function updateUserData(id, data) {
  const text = JSON.stringify(data);
  await execute('UPDATE users SET data = ? WHERE id = ?', [text, id]);
  return data;
}

async function deleteUser(id) {
  await execute('DELETE FROM users WHERE id = ?', [id]);
  await execute('DELETE FROM auth_codes WHERE user_id = ?', [id]);
  await execute('DELETE FROM login_events WHERE user_id = ?', [id]);
}

async function setRole(id, role) {
  await execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return await findUserById(id);
}

async function recordLoginEvent(user_id, email, event) {
  const ts = Math.floor(Date.now() / 1000);
  await execute('INSERT INTO login_events (user_id, email, event, ts) VALUES (?, ?, ?, ?)', [user_id || null, email, event, ts]);
}

async function getLoginEvents(user_id) {
  return await execute('SELECT * FROM login_events WHERE user_id = ? ORDER BY ts DESC', [user_id]);
}

async function getLastLogin(user_id) {
  const rows = await execute('SELECT ts FROM login_events WHERE user_id = ? AND event = ? ORDER BY ts DESC LIMIT 1', [user_id, 'login']);
  return rows && rows.length ? rows[0].ts : null;
}

async function updateUser(id, fields) {
  const allowed = ['email', 'name', 'data'];
  const sets = [];
  const values = [];
  allowed.forEach(k => {
    if (k in fields) {
      if (k === 'data') {
        sets.push('data = ?');
        values.push(JSON.stringify(fields.data));
      } else {
        sets.push(`${k} = ?`);
        values.push(fields[k]);
      }
    }
  });
  if (sets.length === 0) return null;
  values.push(id);
  const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = ?`;
  await execute(sql, values);
  return await findUserById(id);
}

async function setPassword(id, newPassword) {
  const hashed = await bcrypt.hash(newPassword, 10);
  await execute('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
}

const crypto = require('crypto');

async function createProject(user_id, project) {
  const id = project.id || crypto.randomBytes(8).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const text = JSON.stringify(project);
  await execute('INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, user_id, project.name || null, text, now, now]);
  return { id, user_id, name: project.name, data: project };
}

async function getProjectsByUser(user_id) {
  return await execute('SELECT * FROM projects WHERE user_id = ?', [user_id]);
}

async function getProjectById(id) {
  const rows = await execute('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
  if (!rows || !rows.length) return null;
  const row = rows[0];
  try { row.data = JSON.parse(row.data); } catch (e) { row.data = null; }
  return row;
}

async function updateProject(id, project) {
  const now = Math.floor(Date.now() / 1000);
  const text = JSON.stringify(project);
  await execute('UPDATE projects SET name = ?, data = ?, updated_at = ? WHERE id = ?', [project.name || null, text, now, id]);
  return await getProjectById(id);
}

async function deleteProject(id) {
  await execute('DELETE FROM projects WHERE id = ?', [id]);
}

module.exports = {
  init,
  execute,
  findUserByEmail,
  findUserById,
  findAllUsers,
  createUser,
  createUserWithHashed,
  createAuthCode,
  findValidAuthCode,
  markAuthCodeUsed,
  verifyPassword,
  updateUserData,
  deleteUser,
  setRole,
  recordLoginEvent,
  getLoginEvents,
  getLastLogin,
  updateUser,
  setPassword,
  // project functions
  createProject,
  getProjectsByUser,
  getProjectById,
  updateProject,
  deleteProject,
};

module.exports = {
  init,
  execute,
  findUserByEmail,
  findUserById,
  findAllUsers,
  createUser,
  createUserWithHashed,
  createAuthCode,
  findValidAuthCode,
  markAuthCodeUsed,
  verifyPassword,
  updateUserData,
  deleteUser,
  setRole,
  recordLoginEvent,
  getLoginEvents,
  getLastLogin,
  updateUser,
  setPassword,
};
