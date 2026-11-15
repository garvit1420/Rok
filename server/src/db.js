import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(process.env.DB_PATH || path.join(dir, '..', 'placement.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('tpo','company','student')),
  name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roll_no TEXT, phone TEXT, branch TEXT, cgpa REAL, backlogs INTEGER DEFAULT 0,
  tenth_pct REAL, twelfth_pct REAL, resume_path TEXT,
  verification_status TEXT DEFAULT 'unverified',
  verification_note TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS marksheets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, semester TEXT, ocr_text TEXT,
  extracted_cgpa REAL, extracted_backlogs INTEGER, ocr_status TEXT DEFAULT 'done',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS verification_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  action TEXT NOT NULL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS companies(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, hr_name TEXT, phone TEXT, website TEXT, about TEXT,
  invitation_status TEXT DEFAULT 'invited',
  invitation_message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS drives(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL, job_role TEXT, ctc REAL, bond_terms TEXT, visit_date TEXT,
  deadline TEXT, min_cgpa REAL DEFAULT 0, max_backlogs INTEGER DEFAULT 0,
  min_tenth REAL DEFAULT 0, min_twelfth REAL DEFAULT 0, branches TEXT DEFAULT '',
  description TEXT, status TEXT DEFAULT 'submitted', tpo_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'applied', stage_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(drive_id, student_id));
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, message TEXT, is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// Lightweight migrations: add columns introduced after the first release
function addCol(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addCol('students', 'dead_backlogs', 'INTEGER DEFAULT 0');
addCol('students', 'skills', 'TEXT');
addCol('students', 'experience', 'TEXT');
addCol('students', 'resume_text', 'TEXT');
addCol('drives', 'max_dead_backlogs', 'INTEGER DEFAULT 99');
addCol('drives', 'required_skills', 'TEXT');
addCol('drives', 'resume_required', 'INTEGER DEFAULT 0');
addCol('drives', 'marksheet_required', 'INTEGER DEFAULT 0');
addCol('drives', 'other_criteria', 'TEXT');
addCol('marksheets', 'subject_marks', 'TEXT');
addCol('marksheets', 'extracted_dead_backlogs', 'INTEGER');

export default db;
