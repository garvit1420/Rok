import db from '../db.js';
export function notify(userId, title, message) {
  db.prepare('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)').run(userId, title, message);
}
export function notifyRole(role, title, message) {
  for (const u of db.prepare('SELECT id FROM users WHERE role=?').all(role)) notify(u.id, title, message);
}
