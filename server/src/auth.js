import jwt from 'jsonwebtoken';
export const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });
export function auth(...roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    try {
      req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    } catch { return res.status(401).json({ error: 'Not authenticated' }); }
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
