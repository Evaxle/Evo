const db = require('../server/db/sqlite');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function getTokenFromHeader(req) {
  const auth = req.headers.authorization || req.cookies && req.cookies.token;
  if (!auth) return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
}

module.exports = async (req, res) => {
  try {
    await db.init();
    const token = getTokenFromHeader(req) || req.query.token;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (req.method === 'GET') {
      const user = await db.findUserById(decoded.id);
      if (!user) return res.status(404).json({ error: 'not found' });
      return res.json({ id: decoded.id, email: user.email, name: user.name, data: user.data || {} });
    }
    if (req.method === 'POST') {
      const newData = req.body;
      const updated = await db.updateUserData(decoded.id, newData);
      return res.json({ ok: true, data: updated });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal' });
  }
};
