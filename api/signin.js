const db = require('../server/db/sqlite');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await db.init();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await db.verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    // sqlite user has numeric id; normalize
    const uid = user.id || (user._id ? user._id.toString() : null);
    const token = jwt.sign({ id: uid, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: uid, email: user.email, name: user.name }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal' });
  }
};
