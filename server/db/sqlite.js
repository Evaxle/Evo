const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let db;
let tableCols = null;
let origTableCols = null;

async function init() {
  // Determine DB path. Prefer environment override. If the bundled DB is
  // present but read-only (common in some containers), create a writable copy
  // at the repo root called `evo_local.db` and use that instead.
  const bundled = path.join(__dirname, '..', 'data', 'evo.db');
  const fallback = path.resolve(__dirname, '..', '..', 'evo_local.db');
  let dbPath = process.env.SQLITE_DB_PATH || bundled;

  if (!process.env.SQLITE_DB_PATH) {
    try {
      // check writability of chosen path
      await fs.promises.access(dbPath, fs.constants.W_OK);
      // writable, continue
    } catch (err) {
      // not writable or doesn't exist. If bundled exists, copy it to fallback
      try {
        await fs.promises.access(bundled, fs.constants.F_OK);
        // copy bundled -> fallback if fallback missing
        try {
          await fs.promises.access(fallback, fs.constants.F_OK);
        } catch (_) {
          // copy file (if bundled is read-only, copy will still read it)
          await fs.promises.copyFile(bundled, fallback);
          // make sure fallback is writable
          try { await fs.promises.chmod(fallback, 0o664); } catch (e) { /* ignore */ }
        }
        dbPath = fallback;
      } catch (e) {
        // bundled doesn't exist; use fallback (will be created on open)
        dbPath = fallback;
      }
    }
  }

  db = await open({ filename: dbPath, driver: sqlite3.Database });
  // Create table if missing. If table exists but is missing columns, attempt simple migration by adding columns.
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE
  )`);

  // Inspect columns and add the ones we expect if missing
  const cols = await db.all("PRAGMA table_info('users')");
  const colNames = cols.map(c => c.name);
  // remember original columns before we add any
  origTableCols = [...colNames];
  tableCols = colNames;
  if (!colNames.includes('password')) {
    await db.run("ALTER TABLE users ADD COLUMN password TEXT");
    tableCols.push('password');
  }
  if (!colNames.includes('name')) {
    await db.run("ALTER TABLE users ADD COLUMN name TEXT");
    tableCols.push('name');
  }
  if (!colNames.includes('data')) {
    await db.run("ALTER TABLE users ADD COLUMN data TEXT");
    tableCols.push('data');
  }
  if (!colNames.includes('role')) {
    await db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    tableCols.push('role');
  }

  // create auth_codes table for 2FA / password reset codes
  await db.run(`CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    code TEXT,
    type TEXT,
    expires_at INTEGER,
    used INTEGER DEFAULT 0
  )`);
  // login events
  await db.run(`CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    event TEXT,
    ts INTEGER
  )`);
}

async function createUser({ email, password, name }) {
  const hashed = await bcrypt.hash(password, 10);
  // choose the password column name used by the DB
  // prefer existing password_hash column if it already existed (NOT NULL constraint may be present)
  const pwdCol = (origTableCols && origTableCols.includes('password_hash')) ? 'password_hash' : ((tableCols && tableCols.includes('password')) ? 'password' : ((tableCols && tableCols.includes('password_hash')) ? 'password_hash' : 'password'));
  const dataCol = (tableCols && tableCols.includes('data')) ? 'data' : null;
  const cols = ['email', pwdCol, 'name'].concat(dataCol ? [dataCol] : []);
  const placeholders = cols.map(_ => '?').join(',');
  const values = [email, hashed, name || null];
  if (dataCol) values.push(JSON.stringify({}));
  const sql = `INSERT INTO users (${cols.join(',')}) VALUES (${placeholders})`;
  const res = await db.run(sql, values);
  const id = res.lastID;
  return { id, email, name: name || null };
}

async function createUserWithHashed({ email, hashedPassword, name, data, legacyId }) {
  const dataCol = (tableCols && tableCols.includes('data')) ? 'data' : null;
  const cols = ['email', 'password', 'name'].concat(dataCol ? [dataCol] : []);
  const placeholders = cols.map(_ => '?').join(',');
  const values = [email, hashedPassword, name || null];
  if (dataCol) values.push(JSON.stringify(data || {}));
  const sql = `INSERT INTO users (${cols.join(',')}) VALUES (${placeholders})`;
  const res = await db.run(sql, values);
  const id = res.lastID;
  return { id, email, name: name || null };
}

async function findUserByEmail(email) {
  return await db.get('SELECT * FROM users WHERE email = ?', email);
}

async function findUserById(id) {
  return await db.get('SELECT * FROM users WHERE id = ?', id);
}

async function findAllUsers() {
  return await db.all('SELECT * FROM users');
}

// auth codes helpers
async function createAuthCode({ user_id, email, code, type, ttlSeconds = 600 }) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const res = await db.run('INSERT INTO auth_codes (user_id, email, code, type, expires_at, used) VALUES (?,?,?,?,?,0)', [user_id || null, email, code, type, expires]);
  return { id: res.lastID, user_id, email, code, type, expires_at: expires };
}

async function findValidAuthCode({ email, code, type }) {
  const now = Math.floor(Date.now() / 1000);
  return await db.get('SELECT * FROM auth_codes WHERE email = ? AND code = ? AND type = ? AND used = 0 AND expires_at >= ?', [email, code, type, now]);
}

async function markAuthCodeUsed(id) {
  await db.run('UPDATE auth_codes SET used = 1 WHERE id = ?', [id]);
}

async function verifyPassword(user, password) {
  if (!user) return false;
  const hash = user.password || user.password_hash || user.passwordHash;
  return bcrypt.compare(password, hash || '');
}

async function updateUserData(id, data) {
  const text = JSON.stringify(data);
  await db.run('UPDATE users SET data = ? WHERE id = ?', [text, id]);
  return data;
}

async function deleteUser(id) {
  await db.run('DELETE FROM users WHERE id = ?', [id]);
  await db.run('DELETE FROM auth_codes WHERE user_id = ?', [id]);
  await db.run('DELETE FROM login_events WHERE user_id = ?', [id]);
}

async function setRole(id, role) {
  await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return await findUserById(id);
}

async function recordLoginEvent(user_id, email, event) {
  const ts = Math.floor(Date.now() / 1000);
  await db.run('INSERT INTO login_events (user_id, email, event, ts) VALUES (?,?,?,?)', [user_id || null, email, event, ts]);
}

async function getLoginEvents(user_id) {
  return await db.all('SELECT * FROM login_events WHERE user_id = ? ORDER BY ts DESC', [user_id]);
}

async function getLastLogin(user_id) {
  const row = await db.get('SELECT ts FROM login_events WHERE user_id = ? AND event = ? ORDER BY ts DESC LIMIT 1', [user_id, 'login']);
  return row ? row.ts : null;
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
  await db.run(sql, values);
  return await findUserById(id);
}

async function setPassword(id, newPassword) {
  const hashed = await bcrypt.hash(newPassword, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
}

module.exports = {
  init, createUser, createUserWithHashed, findUserByEmail, verifyPassword, findUserById, findAllUsers,
  updateUserData, updateUser, setPassword, createAuthCode, findValidAuthCode, markAuthCodeUsed,
  deleteUser, setRole, recordLoginEvent, getLoginEvents, getLastLogin
};
