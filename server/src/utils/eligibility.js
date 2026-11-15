// Returns { eligible, reasons[] } comparing a student row with a drive row.
// student.marksheet_count should be supplied by the caller (SQL subselect).
export function checkEligibility(student, drive) {
  const reasons = [];
  if (student.verification_status !== 'verified') reasons.push('Profile not verified by TPO');
  if ((student.cgpa ?? 0) < (drive.min_cgpa ?? 0)) reasons.push(`CGPA ${student.cgpa ?? 'N/A'} is below required ${drive.min_cgpa}`);
  if ((student.backlogs ?? 0) > (drive.max_backlogs ?? 0)) reasons.push(`Active backlogs ${student.backlogs ?? 0} exceed allowed ${drive.max_backlogs}`);
  if ((student.dead_backlogs ?? 0) > (drive.max_dead_backlogs ?? 99)) reasons.push(`Dead backlogs ${student.dead_backlogs ?? 0} exceed allowed ${drive.max_dead_backlogs}`);
  if ((student.tenth_pct ?? 0) < (drive.min_tenth ?? 0)) reasons.push(`10th % below required ${drive.min_tenth}`);
  if ((student.twelfth_pct ?? 0) < (drive.min_twelfth ?? 0)) reasons.push(`12th % below required ${drive.min_twelfth}`);
  if (drive.resume_required && !student.resume_path) reasons.push('Resume is required — upload it in your profile');
  if (drive.marksheet_required && !(student.marksheet_count > 0)) reasons.push('Marksheet is required — upload it in your profile');
  const br = (drive.branches || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (br.length && !br.includes((student.branch || '').toLowerCase())) reasons.push(`Branch ${student.branch || 'N/A'} not in ${drive.branches}`);
  return { eligible: reasons.length === 0, reasons };
}
