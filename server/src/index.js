import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import tpoRoutes from './routes/tpo.js';
import companyRoutes from './routes/company.js';
import studentRoutes from './routes/student.js';
import { auth } from './auth.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = process.env.UPLOAD_DIR || path.join(dir, '..', 'uploads');
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/tpo', tpoRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/student', studentRoutes);

// Uploaded documents: any logged-in user may fetch via ?token= (used by links/img tags)
app.get('/api/files/:name', (req, res, next) => {
  req.headers.authorization = req.headers.authorization || 'Bearer ' + (req.query.token || '');
  next();
}, auth(), (req, res) => {
  const f = path.join(UPLOADS, path.basename(req.params.name));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(f);
});

// Serve built React app in production
const dist = path.join(dir, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
