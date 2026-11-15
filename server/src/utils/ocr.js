import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const IMG = /\.(png|jpe?g|bmp|webp|tiff?)$/i;
const num = s => parseFloat(String(s).replace(',', '.'));

// Subject-wise marks: lines such as "Data Structures 78 A" or "CS301 Operating Systems 85 90 A+"
function parseSubjects(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 6 || /cgpa|sgpa|spi|cpi|percentage|total|result|semester|university|roll|name/i.test(line)) continue;
    const m = line.match(/^(?:[A-Z]{2,4}[- ]?\d{3,4}\s+)?([A-Za-z][A-Za-z &/().-]{3,50}?)\s+(\d{1,3}(?:\.\d+)?)(?:\s+\d{1,3}(?:\.\d+)?)*\s*([A-F][+]?|AB|F|P)?$/);
    if (!m) continue;
    const marks = num(m[2]);
    if (marks < 0 || marks > 100) continue;
    out.push({ subject: m[1].trim(), marks, grade: m[3] || null });
    if (out.length >= 15) break;
  }
  return out;
}

// Extract CGPA, backlogs (active / dead) and subject marks from marksheet text
export function parseMarksheet(text) {
  let cgpa = null, backlogs = null, deadBacklogs = null;
  // Prefer cumulative grade (CGPA/CPI) over semester grade (SGPA/SPI)
  for (const re of [/\b(?:CGPA|CPI)\s*[:=\-]?\s*(\d{1,2}(?:[.,]\d{1,2})?)/i, /\b(?:SGPA|SPI|GPA)\s*[:=\-]?\s*(\d{1,2}(?:[.,]\d{1,2})?)/i]) {
    const g = text.match(re);
    if (g) { const v = num(g[1]); if (v > 0 && v <= 10) { cgpa = v; break; } }
  }
  if (cgpa == null) {
    const p = text.match(/(?:percentage|%)\s*[:=\-]?\s*(\d{2}(?:\.\d{1,2})?)/i);
    if (p) cgpa = Math.round((num(p[1]) / 9.5) * 100) / 100; // approx conversion
  }
  const dead = text.match(/dead\s*backlogs?\s*[:=\-]?\s*(\d+)/i);
  if (dead) deadBacklogs = parseInt(dead[1], 10);
  const active = text.match(/(?:active\s*)?(?:backlogs?|arrears?|ATKT|fail(?:ed)?)\s*(?:subjects?|papers?)?\s*[:=\-]?\s*(\d+)/i);
  if (active && !/dead\s*backlog/i.test(active[0])) backlogs = parseInt(active[1], 10);
  else if (/\bpass(?:ed)?\b|\bresult\s*[:\-]?\s*pass/i.test(text)) backlogs = 0;
  const subjects = parseSubjects(text);
  if (backlogs == null && subjects.some(s => s.grade === 'F')) backlogs = subjects.filter(s => s.grade === 'F').length;
  return { cgpa, backlogs, deadBacklogs, subjects };
}

async function ocrImage(filePath) {
  const worker = await createWorker('eng');
  try { return (await worker.recognize(filePath)).data.text; } finally { await worker.terminate(); }
}

export async function runOcr(filePath) {
  if (!IMG.test(filePath)) return { status: 'skipped', text: '', cgpa: null, backlogs: null, deadBacklogs: null, subjects: [] };
  try {
    const text = await ocrImage(filePath);
    return { status: 'done', text, ...parseMarksheet(text) };
  } catch (e) {
    return { status: 'failed', text: String(e.message || e), cgpa: null, backlogs: null, deadBacklogs: null, subjects: [] };
  }
}

// Plain text of a resume (PDF text layer, or OCR for images) used for skill matching / AI analysis
export async function extractResumeText(filePath) {
  try {
    if (/\.pdf$/i.test(filePath)) return ((await pdfParse(fs.readFileSync(filePath))).text || '').slice(0, 20000);
    if (IMG.test(filePath)) return (await ocrImage(filePath)).slice(0, 20000);
  } catch (e) { console.error('Resume text extraction failed:', path.basename(filePath), e.message); }
  return '';
}
