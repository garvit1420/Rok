import { checkEligibility } from './eligibility.js';

const norm = s => String(s || '').toLowerCase();
export const splitList = s => String(s || '').split(/[,;\n|]/).map(x => x.trim()).filter(Boolean);

// Does the skill appear in the student's declared skills or resume text?
function hasSkill(skill, declared, resumeText) {
  const k = norm(skill);
  if (!k) return false;
  if (declared.some(d => norm(d) === k || norm(d).includes(k) || k.includes(norm(d)) && norm(d).length > 2)) return true;
  // word-boundary match in resume text (handles "c++", "node.js")
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(resumeText || '');
}

/**
 * Rule-based Employment Score (0-100) + placement probability.
 * Weights: Skills 35 · CGPA 25 · Backlogs 10 · Branch 10 · School marks 10 · Profile completeness 10
 */
export function ruleScore(student, drive) {
  const breakdown = [], suggestions = [];
  const add = (label, got, max, note) => breakdown.push({ label, score: Math.round(got * 10) / 10, max, note });

  // Skills (35)
  const required = splitList(drive.required_skills);
  const declared = splitList(student.skills);
  const matched = required.filter(s => hasSkill(s, declared, student.resume_text));
  const missing = required.filter(s => !matched.includes(s));
  if (required.length) {
    add('Skills match', (matched.length / required.length) * 35, 35, `${matched.length}/${required.length} required skills found`);
    if (missing.length) suggestions.push(`Learn or add these skills to your profile/resume: ${missing.join(', ')}.`);
  } else add('Skills match', 35, 35, 'No specific skills required');

  // CGPA (25): full marks at requirement + 1.5, scaled below
  const cgpa = student.cgpa ?? 0, minC = drive.min_cgpa ?? 0;
  const cg = cgpa < minC ? Math.max(0, (cgpa / Math.max(minC, 1)) * 12) : 12 + Math.min(1, (cgpa - minC) / 1.5) * 13;
  add('Academic (CGPA)', cg, 25, `CGPA ${student.cgpa ?? 'N/A'} vs required ${minC}`);
  if (cgpa < minC) suggestions.push(`Your CGPA is ${(minC - cgpa).toFixed(2)} below the requirement.`);

  // Backlogs (10)
  const ab = student.backlogs ?? 0, db_ = student.dead_backlogs ?? 0;
  const maxA = drive.max_backlogs ?? 0, maxD = drive.max_dead_backlogs ?? 99;
  const bl = ab > maxA || db_ > maxD ? 0 : (ab === 0 && db_ === 0 ? 10 : 7);
  add('Backlogs', bl, 10, `Active ${ab}, dead ${db_}`);
  if (ab > maxA) suggestions.push('Clear your active backlogs.');

  // Branch (10)
  const branches = splitList(drive.branches).map(norm);
  const brOk = !branches.length || branches.includes(norm(student.branch));
  add('Branch fit', brOk ? 10 : 0, 10, brOk ? 'Branch accepted' : `${student.branch || 'N/A'} not accepted`);

  // School marks (10)
  const t = student.tenth_pct ?? 0, tw = student.twelfth_pct ?? 0;
  const okT = t >= (drive.min_tenth ?? 0), okW = tw >= (drive.min_twelfth ?? 0);
  const sm = (okT ? 5 : 0) + (okW ? 5 : 0);
  add('10th / 12th marks', sm, 10, `${t || 'N/A'}% / ${tw || 'N/A'}%`);

  // Profile completeness (10)
  let pc = 0;
  if (student.resume_path) pc += 4; else suggestions.push('Upload your resume.');
  if (student.marksheet_count > 0) pc += 3; else suggestions.push('Upload your marksheet.');
  if (declared.length >= 3) pc += 3; else suggestions.push('List at least 3 relevant skills in your profile.');
  add('Profile completeness', pc, 10, 'Resume, marksheet, skills');

  let score = breakdown.reduce((a, b) => a + b.score, 0);
  const el = checkEligibility(student, drive);
  // Hard-criteria failures cap the achievable probability
  const hardFail = el.reasons.filter(r => !/not verified/i.test(r)).length > 0;
  let probability = hardFail ? Math.min(score * 0.6, 45) : score;
  if (student.verification_status !== 'verified') suggestions.unshift('Get your profile verified by the TPO.');
  score = Math.round(score); probability = Math.round(probability);
  const label = probability >= 75 ? 'Strong match' : probability >= 55 ? 'Good match' : probability >= 35 ? 'Moderate match' : 'Low match';
  return { method: 'rule', score, probability, label, eligible: el.eligible, reasons: el.reasons, breakdown, matched_skills: matched, missing_skills: missing, suggestions, strengths: [], gaps: [] };
}
