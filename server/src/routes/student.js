import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { auth } from '../auth.js';
import { notify, notifyRole } from '../utils/notify.js';
import { checkEligibility } from '../utils/eligibility.js';
import { ruleScore } from '../utils/score.js';
import { aiScore, aiEnabled } from '../utils/ai.js';
import { runOcr, extractResumeText } from '../utils/ocr.js';

const UPLOADS = process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(/\.(pdf|png|jpe?g|webp|bmp|tiff?)$/i.test(file.originalname) ? null : new Error('Only PDF or image files allowed'), true),
});

const r = Router();
r.use(auth('student'));
const MS_COUNT = '(SELECT COUNT(*) FROM marksheets m WHERE m.student_id=s.id) AS marksheet_count';
const me = req => db.prepare(`SELECT s.*, ${MS_COUNT} FROM students s WHERE s.user_id=?`).get(req.user.id);
const profile = req => db.prepare(`SELECT s.*, u.name, u.email, ${MS_COUNT} FROM students s JOIN users u ON u.id=s.user_id WHERE s.user_id=?`).get(req.user.id);

r.get('/profile', (req, res) => {
  const { resume_text, ...s } = profile(req);
  res.json({ ...s, has_resume_text: !!resume_text, marksheets: db.prepare('SELECT id,file_path,semester,extracted_cgpa,extracted_backlogs,extracted_dead_backlogs,subject_marks,ocr_status,created_at FROM marksheets WHERE student_id=? ORDER BY id DESC').all(s.id) });
});

r.put('/profile', (req, res) => {
  const s = me(req);
  const b = req.body;
  const num = v => (v === '' || v == null ? null : Number(v));
  const cgpa = num(b.cgpa), backlogs = num(b.backlogs) ?? 0, dead = num(b.dead_backlogs) ?? 0;
  for (const [k, v] of Object.entries({ cgpa, tenth_pct: num(b.tenth_pct), twelfth_pct: num(b.twelfth_pct) })) {
    if (v != null && (Number.isNaN(v) || v < 0 || v > (k === 'cgpa' ? 10 : 100))) return res.status(400).json({ error: `Invalid value for ${k}` });
  }
  if (backlogs < 0 || dead < 0 || Number.isNaN(backlogs) || Number.isNaN(dead)) return res.status(400).json({ error: 'Backlogs must be 0 or more' });
  const academicChanged = cgpa !== s.cgpa || backlogs !== (s.backlogs ?? 0) || dead !== (s.dead_backlogs ?? 0) || num(b.tenth_pct) !== s.tenth_pct || num(b.twelfth_pct) !== s.twelfth_pct;
  let status = s.verification_status;
  if (academicChanged && cgpa != null) status = s.verification_status === 'verified' ? 'reverify_requested' : 'pending';
  db.prepare(`UPDATE students SET roll_no=?, phone=?, branch=?, cgpa=?, backlogs=?, dead_backlogs=?, tenth_pct=?, twelfth_pct=?, skills=?, experience=?, verification_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(b.roll_no || null, b.phone || null, b.branch || null, cgpa, backlogs, dead, num(b.tenth_pct), num(b.twelfth_pct), (b.skills || '').slice(0, 1000) || null, (b.experience || '').slice(0, 3000) || null, status, s.id);
  if (status !== s.verification_status) {
    db.prepare('INSERT INTO verification_history(student_id,action,note) VALUES(?,?,?)').run(s.id, status, 'Academic details updated by student');
    notifyRole('tpo', 'Re-verification needed', `${req.user.name} updated academic details and needs verification.`);
  }
  res.json(profile(req));
});

r.post('/resume', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const text = await extractResumeText(req.file.path); // used for skill matching / AI score
  db.prepare('UPDATE students SET resume_path=?, resume_text=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(req.file.filename, text, req.user.id);
  res.json({ resume_path: req.file.filename, text_extracted: text.length > 0 });
});

// Upload marksheet -> OCR -> suggested values. Student confirms values via PUT /profile.
r.post('/marksheet', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const s = me(req);
  const ocr = await runOcr(req.file.path);
  const info = db.prepare('INSERT INTO marksheets(student_id,file_path,semester,ocr_text,extracted_cgpa,extracted_backlogs,extracted_dead_backlogs,subject_marks,ocr_status) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(s.id, req.file.filename, req.body.semester || null, ocr.text, ocr.cgpa, ocr.backlogs, ocr.deadBacklogs, ocr.subjects.length ? JSON.stringify(ocr.subjects) : null, ocr.status);
  // New document -> TPO must (re)verify
  const status = s.verification_status === 'verified' ? 'reverify_requested' : 'pending';
  db.prepare('UPDATE students SET verification_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, s.id);
  db.prepare('INSERT INTO verification_history(student_id,action,note) VALUES(?,?,?)').run(s.id, status, 'New marksheet uploaded');
  notifyRole('tpo', 'Marksheet uploaded', `${req.user.name} uploaded a marksheet for verification.`);
  res.json({ id: Number(info.lastInsertRowid), ocr_status: ocr.status, extracted_cgpa: ocr.cgpa, extracted_backlogs: ocr.backlogs, extracted_dead_backlogs: ocr.deadBacklogs, subjects: ocr.subjects });
});

const removeFile = name => { if (name) fs.unlink(path.join(UPLOADS, path.basename(name)), () => {}); };

// Remove an uploaded marksheet (also deletes the file)
r.delete('/marksheet/:id', (req, res) => {
  const s = me(req);
  const m = db.prepare('SELECT * FROM marksheets WHERE id=? AND student_id=?').get(req.params.id, s.id);
  if (!m) return res.status(404).json({ error: 'Marksheet not found' });
  db.prepare('DELETE FROM marksheets WHERE id=?').run(m.id);
  removeFile(m.file_path);
  if (s.verification_status === 'verified') {
    db.prepare("UPDATE students SET verification_status='reverify_requested', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s.id);
    db.prepare('INSERT INTO verification_history(student_id,action,note) VALUES(?,?,?)').run(s.id, 'reverify_requested', 'Marksheet removed by student');
    notifyRole('tpo', 'Marksheet removed', `${req.user.name} removed a marksheet and needs re-verification.`);
  }
  res.json({ ok: true });
});

// Remove the current resume
r.delete('/resume', (req, res) => {
  const s = me(req);
  db.prepare('UPDATE students SET resume_path=NULL, resume_text=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(s.id);
  removeFile(s.resume_path);
  res.json({ ok: true });
});

// ---- Drives with eligibility
r.get('/drives', (req, res) => {
  const s = me(req);
  const drives = db.prepare(`SELECT d.*, c.name AS company_name, c.about AS company_about FROM drives d JOIN companies c ON c.id=d.company_id WHERE d.status='approved' ORDER BY d.id DESC`).all();
  const applied = new Map(db.prepare('SELECT drive_id, status FROM applications WHERE student_id=?').all(s.id).map(a => [a.drive_id, a.status]));
  const today = new Date().toISOString().slice(0, 10);
  res.json(drives.map(d => {
    const sc = ruleScore(s, d);
    return { ...d, eligible: sc.eligible, reasons: sc.reasons, employment_score: sc.score, placement_probability: sc.probability, match_label: sc.label,
      applied: applied.has(d.id), application_status: applied.get(d.id) || null, deadline_passed: !!d.deadline && d.deadline < today };
  }));
});

// Detailed Employment Score. Rule-based by default; ?ai=1 (POST) uses Claude if an API key is configured.
r.get('/ai-status', (req, res) => res.json({ available: aiEnabled() }));
r.get('/drives/:id/score', (req, res) => {
  const s = me(req);
  const d = db.prepare("SELECT d.*, c.name AS company_name FROM drives d JOIN companies c ON c.id=d.company_id WHERE d.id=? AND d.status IN ('approved','closed')").get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Drive not found' });
  res.json(ruleScore(s, d));
});
r.post('/drives/:id/ai-score', async (req, res) => {
  if (!aiEnabled()) return res.status(503).json({ error: 'AI analysis is not configured on this server (set ANTHROPIC_API_KEY).' });
  const s = me(req);
  const d = db.prepare("SELECT * FROM drives WHERE id=? AND status IN ('approved','closed')").get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Drive not found' });
  const rule = ruleScore(s, d);
  try {
    const ai = await aiScore(s, d, rule);
    // Hard criteria still cap the probability, whatever the AI says
    if (!rule.eligible && rule.reasons.some(x => !/not verified/i.test(x))) ai.probability = Math.min(ai.probability, 45);
    res.json({ ...ai, eligible: rule.eligible, reasons: rule.reasons, breakdown: rule.breakdown, rule_score: rule.score });
  } catch (e) {
    console.error('AI score failed:', e.message);
    res.status(502).json({ error: 'AI analysis failed: ' + (e.status ? `API error ${e.status}` : e.message), fallback: rule });
  }
});
r.post('/drives/:id/apply', (req, res) => {
  const s = me(req);
  const d = db.prepare("SELECT * FROM drives WHERE id=? AND status='approved'").get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Drive not available' });
  if (d.deadline && d.deadline < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'Application deadline has passed' });
  const el = checkEligibility(s, d);
  if (!el.eligible) return res.status(400).json({ error: 'Not eligible: ' + el.reasons.join('; ') });
  try { db.prepare('INSERT INTO applications(drive_id,student_id) VALUES(?,?)').run(d.id, s.id); }
  catch { return res.status(409).json({ error: 'Already applied' }); }
  notifyRole('tpo', 'New application', `${req.user.name} applied to ${d.title}.`);
  res.json({ ok: true });
});

// ---- My applications & offers
r.get('/applications', (req, res) => {
  const s = me(req);
  res.json(db.prepare(`SELECT a.*, d.title, d.job_role, d.ctc, d.bond_terms, d.visit_date, c.name AS company_name
    FROM applications a JOIN drives d ON d.id=a.drive_id JOIN companies c ON c.id=d.company_id WHERE a.student_id=? ORDER BY a.id DESC`).all(s.id));
});
r.post('/applications/:id/offer', (req, res) => {
  const { decision } = req.body; // accepted | declined
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
  const s = me(req);
  const a = db.prepare('SELECT a.*, d.title FROM applications a JOIN drives d ON d.id=a.drive_id WHERE a.id=? AND a.student_id=?').get(req.params.id, s.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (a.status !== 'offered') return res.status(400).json({ error: 'No pending offer' });
  db.prepare('UPDATE applications SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(decision, a.id);
  notifyRole('tpo', `Offer ${decision}`, `${req.user.name} ${decision} the offer for ${a.title}.`);
  res.json({ ok: true });
});

// Multer / route errors as JSON
r.use((err, req, res, next) => res.status(400).json({ error: err.message || 'Upload failed' }));
export default r;
