require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Choose DB adapter: Turso/libSQL if TURSO_URL set, else local sqlite.
let db;
if (process.env.TURSO_URL || process.env.LIBSQL_URL || process.env.DATABASE_URL) {
  try {
    db = require('./db/turso');
    console.log('Using Turso/libSQL adapter (TURSO_URL detected)');
  } catch (e) {
    console.warn('TURSO adapter not available, falling back to sqlite:', e && e.message);
    db = require('./db/sqlite');
  }
} else {
  db = require('./db/sqlite');
}
const admins = require('./config/admins');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

// initialize DB (creates users table if needed)
db.init().then(() => console.log('DB initialized')).catch(err => console.error('DB init error', err));

// Email transporter (use env vars). If not configured, we'll fallback to logging the code
let transporter = null;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  transporter.verify().then(() => console.log('Email transporter ready')).catch(err => console.error('Email transporter error', err));
} else {
  console.log('Email transporter not configured — codes will be logged to console');
}

function generateCode(len = 6) {
  const chars = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function sendCodeByEmail(email, code, purpose) {
  const subject = purpose === 'forgot' ? 'Your password reset code' : 'Your sign-in code';
  const text = `Your ${purpose} code is: ${code}\nIt expires in 10 minutes.`;
  if (transporter) {
    await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to: email, subject, text });
  } else {
    console.log(`(dev) sending email to ${email}: ${text}`);
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || req.cookies.token;
  if (!auth) return res.status(401).json({ error: 'Missing auth' });
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    const email = req.user && req.user.email;
    if (!email || !admins.includes(email)) return res.status(403).json({ error: 'admin only' });
    next();
  });
}

// Signup
// Signup: create user, send 2FA code to email. Client must call /api/verify-code to get token.
app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const exists = await db.findUserByEmail(email);
    if (exists) return res.status(409).json({ error: 'User already exists' });
    const user = await db.createUser({ email, password, name });
    // create and send code
    const code = generateCode(6);
    await db.createAuthCode({ user_id: user.id, email, code, type: 'signup', ttlSeconds: 600 });
    await sendCodeByEmail(email, code, 'signup');
    res.json({ ok: true, message: 'verification code sent to email' , debugCode: process.env.EMAIL_HOST ? undefined : code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Signin
// Signin: verify password, then send 2FA code to email. Client must call /api/verify-code to get token.
app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await db.verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const code = generateCode(6);
    await db.createAuthCode({ user_id: user.id, email, code, type: 'signin', ttlSeconds: 600 });
    await sendCodeByEmail(email, code, 'signin');
    res.json({ ok: true, message: 'verification code sent to email', debugCode: process.env.EMAIL_HOST ? undefined : code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Verify code and exchange for token (used for signup/signin)
app.post('/api/verify-code', async (req, res) => {
  const { email, code, type } = req.body;
  if (!email || !code || !type) return res.status(400).json({ error: 'email, code and type required' });
  try {
    const row = await db.findValidAuthCode({ email, code, type });
    if (!row) return res.status(400).json({ error: 'Invalid or expired code' });
    await db.markAuthCodeUsed(row.id);
    // find user and sign token
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const uid = user.id;
    // record login event
    try { await db.recordLoginEvent(uid, email, 'login'); } catch (e) { console.error('recordLoginEvent failed', e); }
    const token = signToken({ id: uid, email: user.email });
    res.json({ user: { id: uid, email: user.email, name: user.name }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Forgot password: request/reset
app.post('/api/forgot-request', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(200).json({ ok: true, message: 'If an account exists, a reset code was sent' });
    const code = generateCode(6);
    await db.createAuthCode({ user_id: user.id, email, code, type: 'forgot', ttlSeconds: 600 });
    await sendCodeByEmail(email, code, 'forgot');
    res.json({ ok: true, message: 'reset code sent', debugCode: process.env.EMAIL_HOST ? undefined : code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'email, code, newPassword required' });
  try {
    const row = await db.findValidAuthCode({ email, code, type: 'forgot' });
    if (!row) return res.status(400).json({ error: 'Invalid or expired code' });
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'user not found' });
    await db.setPassword(user.id, newPassword);
    await db.markAuthCodeUsed(row.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Get current user
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'not found' });
    // normalize id
    const id = user._id ? (user._id.toString ? user._id.toString() : user._id) : user.id;
    res.json({ id, email: user.email, name: user.name, data: user.data || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Save user data
app.post('/api/me/data', authMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const updated = await db.updateUserData(req.user.id, data);
    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: list users
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  try {
    const users = await db.findAllUsers();
    // normalize result shape
    const out = [];
    for (const u of users) {
      const last = await db.getLastLogin(u.id);
      out.push({ id: u.id, email: u.email, name: u.name, data: u.data || {}, passwordHash: u.password || u.password_hash || null, legacyId: u.legacyId || u.id || null, role: u.role || 'user', last_login: last });
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: get login history for a user
app.get('/api/admin/users/:id/history', adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const events = await db.getLoginEvents(id);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: delete user
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    await db.deleteUser(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: change role
app.put('/api/admin/users/:id/role', adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role required' });
    const u = await db.setRole(id, role);
    res.json({ ok: true, user: u });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: update user fields (email, name, data)
app.put('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const updated = await db.updateUser(id, req.body);
    res.json({ ok: true, user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: reset/set password for user
app.post('/api/admin/users/:id/password', adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    await db.setPassword(id, password);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: export all users as JSON (for migration/export)
app.get('/api/admin/export', adminMiddleware, async (req, res) => {
  try {
    const users = await db.findAllUsers();
    // normalize and return
    const out = users.map(u => ({ id: u.id || (u._id ? (u._id.toString ? u._id.toString() : u._id) : null), email: u.email, name: u.name, data: u.data || {}, passwordHash: u.password || u.password_hash || null, legacyId: u.legacyId || u.id || null }));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

// Projects API
// List projects for current user
app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await db.getProjectsByUser(userId);
    // parse data
    const out = (rows || []).map(r => ({ id: r.id, name: r.name, data: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data), created_at: r.created_at, updated_at: r.updated_at }));
    res.json(out);
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

// Create project
app.post('/api/projects', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const project = req.body;
    if (!project || !project.files) return res.status(400).json({ error: 'project with files required' });
    const created = await db.createProject(userId, project);
    res.json({ ok: true, project: created });
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

// Get single project
app.get('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const p = await db.getProjectById(id);
    if (!p) return res.status(404).json({ error: 'not found' });
    if (p.user_id != req.user.id) return res.status(403).json({ error: 'forbidden' });
    res.json(p);
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

// Update project
app.put('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const project = req.body;
    const existing = await db.getProjectById(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.user_id != req.user.id) return res.status(403).json({ error: 'forbidden' });
    const updated = await db.updateProject(id, project);
    res.json({ ok: true, project: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

// Delete project
app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await db.getProjectById(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.user_id != req.user.id) return res.status(403).json({ error: 'forbidden' });
    await db.deleteProject(id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// AI proxy endpoint — forwards chat messages to OpenAI-compatible API using server-side key
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'AI API key not configured on server (set OPENAI_API_KEY)' });
  const body = req.body || {};
  const messages = body.messages || [];
  const model = body.model || process.env.AI_MODEL || 'gpt-4o-mini';

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({ model, messages, max_tokens: body.max_tokens || 1200 })
    });
    const data = await resp.json();
    return res.json(data);
  } catch (err) {
    console.error('AI proxy error', err && err.message);
    return res.status(500).json({ error: 'AI proxy error' });
  }
});
