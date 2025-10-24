const express = require('express');
const db = require('../db');

const router = express.Router();

// auth middleware expects req.user set by main app
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

router.get('/', requireUser, (req, res) => {
  const stmt = db.prepare('SELECT id, name, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC');
  const rows = stmt.all(req.user.id);
  res.json({ projects: rows });
});

router.post('/', requireUser, (req, res) => {
  const { name, content } = req.body || {};
  if (!name) return res.status(400).json({ error: 'project name required' });
  const stored = typeof content === 'object' ? JSON.stringify(content) : (content || '');
  const stmt = db.prepare('INSERT INTO projects (user_id, name, content) VALUES (?, ?, ?)');
  const info = stmt.run(req.user.id, name, stored);
  const project = db.prepare('SELECT id, name, content, created_at, updated_at FROM projects WHERE id = ?').get(info.lastInsertRowid);
  // try to parse content as JSON for convenience
  try { project.content = JSON.parse(project.content); } catch (e) { /* leave as string */ }
  res.json({ project });
});

router.get('/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const stmt = db.prepare('SELECT id, name, content, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?');
  const row = stmt.get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  try { row.content = JSON.parse(row.content); } catch (e) { /* keep string */ }
  res.json({ project: row });
});

router.put('/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const { content, name } = req.body || {};
  const stored = typeof content === 'object' ? JSON.stringify(content) : (content || '');
  const update = db.prepare('UPDATE projects SET content = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  update.run(stored, name || null, id, req.user.id);
  const row = db.prepare('SELECT id, name, content, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  try { row.content = JSON.parse(row.content); } catch (e) { /* keep string */ }
  res.json({ project: row });
});

module.exports = router;
