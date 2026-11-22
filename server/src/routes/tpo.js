import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db.js';
import { auth } from '../auth.js';
import { notify } from '../utils/notify.js';
import { sendInvitationEmail } from '../utils/mail.js';
import { ruleScore } from '../utils/score.js';
const r = Router();
r.use(auth('tpo'));

// ---- Companies / invitations
r.get('/companies', (req, res) => {
  res.json(db.prepare('SELECT c.*, u.email FROM companies c JOIN users u ON u.id=c.user_id ORDER BY c.id DESC').all());
});
r.post('/companies/invite', async (req, res) => {
  const { name, email, hr_name, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Company name and email required' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return res.status(409).json({ error: 'Email already exists' });
  const temp = crypto.randomBytes(4).toString('hex');
  let companyId;
  db.transaction(() => {
    const u = db.prepare('INSERT INTO users(email,password_hash,role,name) VALUES(?,?,?,?)').run(email.toLowerCase(), bcrypt.hashSync(temp, 10), 'company', name);
    companyId = Number(db.prepare('INSERT INTO companies(user_id,name,hr_name,invitation_message) VALUES(?,?,?,?)').run(u.lastInsertRowid, name, hr_name || null, message || null).lastInsertRowid);
    notify(u.lastInsertRowid, 'Placement invitation', message || 'You are invited to participate in campus placements. Please accept or decline.');
  })();
  // Email the HR contact (free SMTP, optional). The temporary password is also shown once to the TPO as a fallback.
  const mail = await sendInvitationEmail({ to: email.toLowerCase(), company: name, companyId, hrName: hr_name, message });
  // Password is only shown to the TPO when the email could not be sent (otherwise it is emailed after the company accepts)
  res.json({ ok: true, email: email.toLowerCase(), temp_password: mail.sent ? null : temp, email_sent: mail.sent, email_error: mail.reason || null });
});

// Delete a company with its login, drives and their applications (cascade)
r.delete('/companies/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  db.prepare('DELETE FROM users WHERE id=?').run(c.user_id);
  res.json({ ok: true });
});

// ---- Drives
r.get('/drives', (req, res) => {
  res.json(db.prepare(`SELECT d.*, c.name AS company_name,
    (SELECT COUNT(*) FROM applications a WHERE a.drive_id=d.id) AS applicants
    FROM drives d JOIN companies c ON c.id=d.company_id ORDER BY d.id DESC`).all());
});
r.post('/drives/:id/decision', (req, res) => {
  const { decision, note } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
  const d = db.prepare('SELECT d.*, c.user_id AS cuid FROM drives d JOIN companies c ON c.id=d.company_id WHERE d.id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE drives SET status=?, tpo_note=? WHERE id=?').run(decision, note || null, d.id);
  notify(d.cuid, `Drive ${decision}`, `Your drive "${d.title}" was ${decision}.${note ? ' Note: ' + note : ''}`);
  if (decision === 'approved') {
    for (const s of db.prepare('SELECT user_id FROM students').all())
      notify(s.user_id, 'New placement drive', `${d.title} is open. Deadline: ${d.deadline || 'TBA'}. Check your eligibility.`);
  }
  res.json({ ok: true });
});
r.post('/drives/:id/close', (req, res) => {
  db.prepare("UPDATE drives SET status='closed' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---- Applicants per drive
r.get('/drives/:id/applications', (req, res) => {
  const drive = db.prepare('SELECT * FROM drives WHERE id=?').get(req.params.id);
  if (!drive) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare(`SELECT a.*, s.roll_no, s.branch, s.cgpa, s.backlogs, s.dead_backlogs, s.tenth_pct, s.twelfth_pct, s.verification_status, s.resume_path, s.resume_text, s.skills, s.experience,
    (SELECT COUNT(*) FROM marksheets m WHERE m.student_id=s.id) AS marksheet_count, u.name, u.email
    FROM applications a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id WHERE a.drive_id=? ORDER BY a.id`).all(drive.id);
  res.json({ drive, applications: rows.map(({ resume_text, skills, experience, ...x }) => {
    const sc = ruleScore({ ...x, resume_text, skills, experience }, drive);
    return { ...x, eligible: sc.eligible, reasons: sc.reasons, employment_score: sc.score, placement_probability: sc.probability, match_label: sc.label };
  }) });
});
r.post('/applications/:id/status', (req, res) => {
  const { status, note } = req.body;
  if (!['shortlisted', 'rejected', 'applied', 'offered'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const a = db.prepare(`SELECT a.*, d.title, s.user_id AS suid FROM applications a JOIN drives d ON d.id=a.drive_id JOIN students s ON s.id=a.student_id WHERE a.id=?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (status === 'offered' && !['selected_pending', 'offered'].includes(a.status)) return res.status(400).json({ error: 'Only candidates in the company final list can be given offers' });
  db.prepare('UPDATE applications SET status=?, stage_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, note || null, a.id);
  const msg = { shortlisted: 'You have been shortlisted', rejected: 'Your application was not taken forward', offered: 'Congratulations! You have an offer. Accept or decline it from My Applications.', applied: 'Status reset' }[status];
  notify(a.suid, `${a.title}: ${status}`, msg + (note ? ` — ${note}` : ''));
  res.json({ ok: true });
});
// Publish all company-proposed selections for a drive as offers
r.post('/drives/:id/publish-offers', (req, res) => {
  const rows = db.prepare(`SELECT a.id, s.user_id AS suid, d.title FROM applications a JOIN students s ON s.id=a.student_id JOIN drives d ON d.id=a.drive_id WHERE a.drive_id=? AND a.status='selected_pending'`).all(req.params.id);
  const up = db.prepare("UPDATE applications SET status='offered', updated_at=CURRENT_TIMESTAMP WHERE id=?");
  for (const x of rows) { up.run(x.id); notify(x.suid, `${x.title}: offer`, 'Congratulations! You have been selected. Accept or decline your offer.'); }
  res.json({ published: rows.length });
});

// ---- Students & verification
r.get('/students', (req, res) => {
  const { status } = req.query;
  const sql = `SELECT s.*, u.name, u.email FROM students s JOIN users u ON u.id=s.user_id ${status ? 'WHERE s.verification_status=?' : ''} ORDER BY s.updated_at DESC`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});
r.get('/students/:id', (req, res) => {
  const s = db.prepare('SELECT s.*, u.name, u.email FROM students s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { resume_text, ...safe } = s;
  res.json({
    student: safe,
    marksheets: db.prepare('SELECT * FROM marksheets WHERE student_id=? ORDER BY id DESC').all(s.id),
    history: db.prepare('SELECT * FROM verification_history WHERE student_id=? ORDER BY id DESC').all(s.id),
  });
});
r.post('/students/:id/verify', (req, res) => {
  const { decision, note, cgpa, backlogs, dead_backlogs } = req.body; // verified | rejected | reverify
  const map = { verified: 'verified', rejected: 'rejected', reverify: 'reverify_requested' };
  if (!map[decision]) return res.status(400).json({ error: 'Invalid decision' });
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (decision === 'verified') {
    if (cgpa != null && cgpa !== '') db.prepare('UPDATE students SET cgpa=? WHERE id=?').run(Number(cgpa), s.id);
    if (backlogs != null && backlogs !== '') db.prepare('UPDATE students SET backlogs=? WHERE id=?').run(Number(backlogs), s.id);
    if (dead_backlogs != null && dead_backlogs !== '') db.prepare('UPDATE students SET dead_backlogs=? WHERE id=?').run(Number(dead_backlogs), s.id);
  }
  db.prepare('UPDATE students SET verification_status=?, verification_note=? WHERE id=?').run(map[decision], note || null, s.id);
  db.prepare('INSERT INTO verification_history(student_id,action,note) VALUES(?,?,?)').run(s.id, map[decision], note || null);
  notify(s.user_id, `Profile ${map[decision].replace('_', ' ')}`, note || 'Your profile status was updated by the TPO.');
  res.json({ ok: true });
});

// ---- Stats & reports
r.get('/stats', (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  const inFunnel = "('shortlisted','selected_pending','offered','accepted','declined')";
  const totals = {
    students: n('SELECT COUNT(*) n FROM students'),
    verified: n("SELECT COUNT(*) n FROM students WHERE verification_status='verified'"),
    pendingVerification: n("SELECT COUNT(*) n FROM students WHERE verification_status IN ('pending','reverify_requested')"),
    companies: n('SELECT COUNT(*) n FROM companies'),
    companiesAccepted: n("SELECT COUNT(*) n FROM companies WHERE invitation_status='accepted'"),
    drives: n("SELECT COUNT(*) n FROM drives WHERE status='approved'"),
    pendingDrives: n("SELECT COUNT(*) n FROM drives WHERE status='submitted'"),
    applicants: n('SELECT COUNT(*) n FROM applications'),
    shortlisted: n(`SELECT COUNT(*) n FROM applications WHERE status IN ${inFunnel}`),
    offered: n("SELECT COUNT(*) n FROM applications WHERE status IN ('offered','accepted','declined')"),
    accepted: n("SELECT COUNT(*) n FROM applications WHERE status='accepted'"),
    declined: n("SELECT COUNT(*) n FROM applications WHERE status='declined'"),
    placedStudents: n("SELECT COUNT(DISTINCT student_id) n FROM applications WHERE status='accepted'"),
  };
  const perDrive = db.prepare(`SELECT d.id, d.title, c.name AS company, d.ctc,
    COUNT(a.id) applicants,
    COALESCE(SUM(CASE WHEN a.status IN ${inFunnel} THEN 1 ELSE 0 END),0) shortlisted,
    COALESCE(SUM(CASE WHEN a.status IN ('offered','accepted','declined') THEN 1 ELSE 0 END),0) offered,
    COALESCE(SUM(CASE WHEN a.status='accepted' THEN 1 ELSE 0 END),0) accepted,
    COALESCE(SUM(CASE WHEN a.status='declined' THEN 1 ELSE 0 END),0) declined
    FROM drives d JOIN companies c ON c.id=d.company_id LEFT JOIN applications a ON a.drive_id=d.id
    WHERE d.status IN ('approved','closed') GROUP BY d.id ORDER BY d.id DESC`).all();
  const byBranch = db.prepare(`SELECT COALESCE(branch,'N/A') branch, COUNT(*) total,
    SUM(CASE WHEN EXISTS(SELECT 1 FROM applications a WHERE a.student_id=students.id AND a.status='accepted') THEN 1 ELSE 0 END) placed
    FROM students GROUP BY COALESCE(branch,'N/A')`).all();
  res.json({ totals, perDrive, byBranch });
});
r.get('/report.csv', (req, res) => {
  const rows = db.prepare(`SELECT u.name, s.roll_no, s.branch, s.cgpa, d.title drive, c.name company, d.ctc, a.status
    FROM applications a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id
    JOIN drives d ON d.id=a.drive_id JOIN companies c ON c.id=d.company_id ORDER BY d.id, u.name`).all();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=placement-report.csv');
  res.send(['Name,Roll No,Branch,CGPA,Drive,Company,CTC (LPA),Status',
    ...rows.map(x => [x.name, x.roll_no, x.branch, x.cgpa, x.drive, x.company, x.ctc, x.status].map(esc).join(','))].join('\n'));
});
export default r;
