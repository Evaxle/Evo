const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const path = require('path');

let db;
let tableCols = null;
let origTableCols = null;

async function init() {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'evo.db');
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
  const originalCols = [...colNames];
  origTableCols = originalCols;
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
}

async function createUser({ email, password, name }) {
  const hashed = await bcrypt.hash(password, 10);
  // choose the password column name used by the DB
  // prefer existing password_hash column if it already existed (NOT NULL constraint may be present)
  const pwdCol = (originalCols && originalCols.includes('password_hash')) ? 'password_hash' : ((tableCols && tableCols.includes('password')) ? 'password' : ((tableCols && tableCols.includes('password_hash')) ? 'password_hash' : 'password'));
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

async function findUserByEmail(email) {
  return await db.get('SELECT * FROM users WHERE email = ?', email);
}

async function findUserById(id) {
  return await db.get('SELECT * FROM users WHERE id = ?', id);
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

module.exports = { init, createUser, findUserByEmail, verifyPassword, findUserById, updateUserData };
