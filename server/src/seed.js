import bcrypt from 'bcryptjs';
import db from './db.js';

const hash = p => bcrypt.hashSync(p, 10);
const addUser = (email, role, name, pw) => {
  const ex = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (ex) return ex.id;
  return Number(db.prepare('INSERT INTO users(email,password_hash,role,name) VALUES(?,?,?,?)').run(email, hash(pw), role, name).lastInsertRowid);
};

addUser('tpo@mbm.ac.in', 'tpo', 'TPO Cell MBM', 'tpo123');

// Demo company (invitation accepted) with one approved drive
const cu = addUser('hr@techcorp.com', 'company', 'TechCorp Solutions', 'company123');
if (!db.prepare('SELECT 1 FROM companies WHERE user_id=?').get(cu)) {
  db.prepare("INSERT INTO companies(user_id,name,hr_name,website,about,invitation_status) VALUES(?,?,?,?,?,'accepted')")
    .run(cu, 'TechCorp Solutions', 'Anita Sharma', 'https://techcorp.example', 'Product engineering company hiring fresh graduates.');
}
const comp = db.prepare('SELECT id FROM companies WHERE user_id=?').get(cu);
if (!db.prepare('SELECT 1 FROM drives WHERE company_id=?').get(comp.id)) {
  db.prepare(`INSERT INTO drives(company_id,title,job_role,ctc,bond_terms,visit_date,deadline,min_cgpa,max_backlogs,min_tenth,min_twelfth,branches,description,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'approved')`)
    .run(comp.id, 'TechCorp Software Engineer 2027', 'Software Engineer', 8.5, '1 year service agreement', '2027-01-20', '2027-01-10', 7, 0, 60, 60, 'CSE,IT,ECE', 'Full-stack and backend roles.');
}

// Demo students
const students = [
  ['student@mbm.ac.in', 'Ronak Khakhil', '24UCSE4034', 'CSE', 8.2, 0, 85, 82, 'verified'],
  ['aman@mbm.ac.in', 'Aman Verma', '24UCSE4010', 'CSE', 6.4, 1, 70, 68, 'verified'],
  ['neha@mbm.ac.in', 'Neha Joshi', '24UECE4021', 'ECE', 7.6, 0, 78, 75, 'pending'],
];
for (const [email, name, roll, branch, cgpa, bl, t, tw, st] of students) {
  const uid = addUser(email, 'student', name, 'student123');
  if (!db.prepare('SELECT 1 FROM students WHERE user_id=?').get(uid))
    db.prepare('INSERT INTO students(user_id,roll_no,branch,cgpa,backlogs,tenth_pct,twelfth_pct,verification_status) VALUES(?,?,?,?,?,?,?,?)').run(uid, roll, branch, cgpa, bl, t, tw, st);
}
console.log('Seeded.\n  TPO:     tpo@mbm.ac.in / tpo123\n  Company: hr@techcorp.com / company123\n  Student: student@mbm.ac.in / student123');
