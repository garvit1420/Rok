import { Router } from 'express';
import db from '../db.js';
import { auth } from '../auth.js';
import { notifyRole } from '../utils/notify.js';
const r = Router();
r.use(auth('company'));
const me = req => db.prepare('SELECT * FROM companies WHERE user_id=?').get(req.user.id);

r.get('/profile', (req, res) => res.json(me(req)));
r.put('/profile', (req, res) => {
  const { hr_name, phone, website, about } = req.body;
  db.prepare('UPDATE companies SET hr_name=?, phone=?, website=?, about=? WHERE user_id=?').run(hr_name || null, phone || null, website || null, about || null, req.user.id);
  res.json(me(req));
});
r.post('/invitation', (req, res) => {
  const { decision } = req.body; // accepted | declined
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
  const c = me(req);
  db.prepare('UPDATE companies SET invitation_status=? WHERE id=?').run(decision, c.id);
  notifyRole('tpo', `Invitation ${decision}`, `${c.name} has ${decision} the placement invitation.`);
  res.json({ ok: true });
});

const fields = b => [b.title, b.job_role || null, Number(b.ctc) || 0, b.bond_terms || null, b.visit_date || null, b.deadline || null,
  Number(b.min_cgpa) || 0, Number(b.max_backlogs) || 0, Number(b.min_tenth) || 0, Number(b.min_twelfth) || 0, b.branches || '', b.description || null,
  b.max_dead_backlogs === '' || b.max_dead_backlogs == null ? 99 : Number(b.max_dead_backlogs) || 0, b.required_skills || null, b.resume_required ? 1 : 0, b.marksheet_required ? 1 : 0, b.other_criteria || null];

r.get('/drives', (req, res) => {
  res.json(db.prepare('SELECT d.*, (SELECT COUNT(*) FROM applications a WHERE a.drive_id=d.id) applicants FROM drives d WHERE company_id=? ORDER BY id DESC').all(me(req).id));
});
r.post('/drives', (req, res) => {
  const c = me(req);
  if (c.invitation_status !== 'accepted') return res.status(403).json({ error: 'Accept the invitation first' });
  if (!req.body.title) return res.status(400).json({ error: 'Title required' });
  db.prepare(`INSERT INTO drives(company_id,title,job_role,ctc,bond_terms,visit_date,deadline,min_cgpa,max_backlogs,min_tenth,min_twelfth,branches,description,max_dead_backlogs,required_skills,resume_required,marksheet_required,other_criteria) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.id, ...fields(req.body));
  notifyRole('tpo', 'New drive submitted', `${c.name} submitted "${req.body.title}" for approval.`);
  res.json({ ok: true });
});
r.put('/drives/:id', (req, res) => {
  const c = me(req);
  const d = db.prepare('SELECT * FROM drives WHERE id=? AND company_id=?').get(req.params.id, c.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status === 'approved' || d.status === 'closed') return res.status(400).json({ error: 'Approved drives cannot be edited' });
  db.prepare(`UPDATE drives SET title=?,job_role=?,ctc=?,bond_terms=?,visit_date=?,deadline=?,min_cgpa=?,max_backlogs=?,min_tenth=?,min_twelfth=?,branches=?,description=?,max_dead_backlogs=?,required_skills=?,resume_required=?,marksheet_required=?,other_criteria=?,status='submitted' WHERE id=?`).run(...fields(req.body), d.id);
  notifyRole('tpo', 'Drive resubmitted', `${c.name} updated "${req.body.title}".`);
  res.json({ ok: true });
});

// Candidates the TPO has shortlisted for a drive
r.get('/drives/:id/candidates', (req, res) => {
  const c = me(req);
  const d = db.prepare('SELECT * FROM drives WHERE id=? AND company_id=?').get(req.params.id, c.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare(`SELECT a.id, a.status, a.stage_note, u.name, u.email, s.roll_no, s.branch, s.cgpa, s.backlogs, s.resume_path
    FROM applications a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id
    WHERE a.drive_id=? AND a.status IN ('shortlisted','selected_pending','offered','accepted','declined') ORDER BY u.name`).all(d.id);
  res.json({ drive: d, candidates: rows });
});
// Submit final selection list to TPO
r.post('/drives/:id/final-list', (req, res) => {
  const c = me(req);
  const d = db.prepare('SELECT * FROM drives WHERE id=? AND company_id=?').get(req.params.id, c.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const ids = Array.isArray(req.body.application_ids) ? req.body.application_ids : [];
  const up = db.prepare("UPDATE applications SET status='selected_pending', updated_at=CURRENT_TIMESTAMP WHERE id=? AND drive_id=? AND status='shortlisted'");
  let n = 0; for (const id of ids) n += up.run(id, d.id).changes;
  notifyRole('tpo', 'Final selection submitted', `${c.name} submitted ${n} selected candidate(s) for "${d.title}". Review and publish offers.`);
  res.json({ submitted: n });
});
export default r;
