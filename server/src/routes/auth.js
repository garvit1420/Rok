import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { sign, auth } from '../auth.js';
const r = Router();

r.post('/register', (req, res) => {
  const { name, email, password, roll_no, branch } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email and password (min 6 chars) required' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
  const info = db.prepare('INSERT INTO users(email,password_hash,role,name) VALUES(?,?,?,?)').run(email.toLowerCase(), bcrypt.hashSync(password, 10), 'student', name);
  db.prepare('INSERT INTO students(user_id,roll_no,branch) VALUES(?,?,?)').run(info.lastInsertRowid, roll_no || null, branch || null);
  const u = { id: Number(info.lastInsertRowid), role: 'student', name, email: email.toLowerCase() };
  res.json({ token: sign(u), user: u });
});

r.post('/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { id: u.id, role: u.role, name: u.name, email: u.email } });
});

r.get('/me', auth(), (req, res) => {
  const u = db.prepare('SELECT id,email,role,name FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(401).json({ error: 'User not found' });
  res.json(u);
});

r.post('/change-password', auth(), (req, res) => {
  const { current, next } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (!next || next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), u.id);
  res.json({ ok: true });
});

// Notifications (all roles)
r.get('/notifications', auth(), (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
});
r.post('/notifications/read', auth(), (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});
export default r;
