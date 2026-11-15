import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, fileUrl } from '../api';
import { Badge, Empty, Field, fmtDate, Modal, PageHeader, ScoreBar, ScoreChip, Spinner, Stat, StatusBadge, Table, useLoad, useToast } from '../components/ui';
import { BRANCHES } from './Register';

/* ================= Dashboard ================= */
export function StudentDashboard() {
  const [p, l1] = useLoad(() => api.get('/student/profile').then(r => r.data));
  const [drives, l2] = useLoad(() => api.get('/student/drives').then(r => r.data));
  const [apps, l3] = useLoad(() => api.get('/student/applications').then(r => r.data));
  if (l1 || l2 || l3) return <Spinner />;
  const offers = apps.filter(a => a.status === 'offered');
  const missing = [!p.cgpa && 'CGPA', !p.resume_path && 'resume', p.marksheets.length === 0 && 'a marksheet'].filter(Boolean);
  return (
    <>
      <PageHeader title={`Hello, ${p.name}`} subtitle="Your placement overview" />
      {offers.length > 0 && (
        <Link to="/student/applications" className="card mb-4 block border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/20">
          🎉 You have {offers.length} pending offer(s). Review and respond →
        </Link>
      )}
      {(p.verification_status !== 'verified' || missing.length > 0) && (
        <Link to="/student/profile" className="card mb-4 block border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-900/20">
          Profile status: <b>{p.verification_status.replace(/_/g, ' ')}</b>.{missing.length > 0 && ` Please add ${missing.join(', ')}.`} You can apply only after TPO verification →
        </Link>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Verification" value={<StatusBadge status={p.verification_status} />} />
        <Stat label="Eligible drives" value={drives.filter(d => d.eligible && !d.applied && !d.deadline_passed).length} tone="green" />
        <Stat label="Applications" value={apps.length} tone="blue" />
        <Stat label="Offers" value={apps.filter(a => ['offered', 'accepted'].includes(a.status)).length} tone="amber" />
      </div>
    </>
  );
}

/* ================= Profile ================= */
export function StudentProfile() {
  const toast = useToast();
  const [p, loading, reload] = useLoad(() => api.get('/student/profile').then(r => r.data));
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState('');
  const [ocr, setOcr] = useState(null);
  const [sem, setSem] = useState('');
  if (loading) return <Spinner />;
  const v = f || { roll_no: p.roll_no || '', phone: p.phone || '', branch: p.branch || 'CSE', cgpa: p.cgpa ?? '', backlogs: p.backlogs ?? 0, dead_backlogs: p.dead_backlogs ?? 0, skills: p.skills || '', experience: p.experience || '', tenth_pct: p.tenth_pct ?? '', twelfth_pct: p.twelfth_pct ?? '' };
  const set = k => e => setF({ ...v, [k]: e.target.value });

  const save = async e => {
    e?.preventDefault(); setBusy('save');
    try { await api.put('/student/profile', v); toast('Profile saved'); setF(null); setOcr(null); reload(); }
    catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(''); }
  };
  const upload = async (kind, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); if (kind === 'marksheet') fd.append('semester', sem);
    setBusy(kind);
    try {
      const { data } = await api.post(`/student/${kind}`, fd);
      if (kind === 'marksheet') { setOcr(data); toast(data.ocr_status === 'done' ? 'Marksheet scanned' : 'Marksheet uploaded (no OCR for this file type)'); }
      else toast('Resume uploaded');
      reload();
    } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(''); }
  };
  return (
    <>
      <PageHeader title="My profile" subtitle="Reusable across all placement drives"><StatusBadge status={p.verification_status} /></PageHeader>
      {p.verification_note && <div className="card mb-4 p-3 text-sm"><b>TPO note:</b> {p.verification_note}</div>}
      {p.verification_status === 'verified' && <div className="mb-4 text-xs text-slate-500">Changing your CGPA, backlogs or marks, or uploading a new marksheet, will send your profile back to the TPO for re-verification.</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={save} className="card space-y-4 p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={p.name} disabled /></Field>
            <Field label="Email"><input className="input" value={p.email} disabled /></Field>
            <Field label="Roll number"><input className="input" value={v.roll_no} onChange={set('roll_no')} /></Field>
            <Field label="Phone"><input className="input" value={v.phone} onChange={set('phone')} /></Field>
            <Field label="Branch"><select className="input" value={v.branch} onChange={set('branch')}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select></Field>
            <Field label="CGPA (out of 10)"><input className="input" type="number" step="0.01" min="0" max="10" value={v.cgpa} onChange={set('cgpa')} /></Field>
            <Field label="Active backlogs"><input className="input" type="number" min="0" value={v.backlogs} onChange={set('backlogs')} /></Field>
            <Field label="Dead backlogs (cleared)"><input className="input" type="number" min="0" value={v.dead_backlogs} onChange={set('dead_backlogs')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="10th %"><input className="input" type="number" step="0.01" min="0" max="100" value={v.tenth_pct} onChange={set('tenth_pct')} /></Field>
              <Field label="12th %"><input className="input" type="number" step="0.01" min="0" max="100" value={v.twelfth_pct} onChange={set('twelfth_pct')} /></Field>
            </div>
          </div>
          <Field label="Skills (comma separated) — used for your Employment Score"><input className="input" value={v.skills} onChange={set('skills')} placeholder="Node.js, React, SQL, Python, Docker" /></Field>
          <Field label="Projects / experience / internships"><textarea className="input" rows={3} value={v.experience} onChange={set('experience')} /></Field>
          <button className="btn-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button>
        </form>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Resume</h2>
            {p.resume_path && !p.has_resume_text && <div className="mb-1 text-xs text-amber-600">Could not read text from this resume (scanned/unsupported). Add your skills above for a better score.</div>}
            {p.resume_path && <a className="mb-2 block text-sm text-brand-600" href={fileUrl(p.resume_path)} target="_blank" rel="noreferrer">View current resume ↗</a>}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="text-sm" disabled={busy === 'resume'} onChange={e => upload('resume', e.target.files[0])} />
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Upload marksheet (OCR)</h2>
            <Field label="Semester / exam"><input className="input mb-2" placeholder="e.g. Semester 5" value={sem} onChange={e => setSem(e.target.value)} /></Field>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="text-sm" disabled={busy === 'marksheet'} onChange={e => upload('marksheet', e.target.files[0])} />
            {busy === 'marksheet' && <div className="mt-2 text-xs text-slate-500">Scanning with OCR… this can take a few seconds.</div>}
            <p className="mt-2 text-xs text-slate-500">Images (JPG/PNG) are scanned automatically. PDFs are stored for manual TPO review.</p>
            {ocr && (
              <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <div className="mb-1 font-medium">Extracted values</div>
                <div>CGPA: <b>{ocr.extracted_cgpa ?? 'not found'}</b> · Active backlogs: <b>{ocr.extracted_backlogs ?? 'not found'}</b> · Dead backlogs: <b>{ocr.extracted_dead_backlogs ?? 'not found'}</b></div>
                {ocr.subjects?.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-200 text-xs dark:border-slate-700">
                    {ocr.subjects.map((x, i) => <div key={i} className="flex justify-between border-b border-slate-100 px-2 py-1 last:border-0 dark:border-slate-700"><span>{x.subject}</span><span>{x.marks}{x.grade ? ` · ${x.grade}` : ''}</span></div>)}
                  </div>
                )}
                {(ocr.extracted_cgpa != null || ocr.extracted_backlogs != null || ocr.extracted_dead_backlogs != null) && (
                  <button className="btn-ghost mt-2 !py-1 text-xs" onClick={() => setF({ ...v, cgpa: ocr.extracted_cgpa ?? v.cgpa, backlogs: ocr.extracted_backlogs ?? v.backlogs, dead_backlogs: ocr.extracted_dead_backlogs ?? v.dead_backlogs })}>Use in form (then save)</button>
                )}
              </div>
            )}
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Uploaded marksheets</h2>
            {p.marksheets.length === 0 ? <div className="text-sm text-slate-500">None yet</div> : p.marksheets.map(m => (
              <div key={m.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                <span>{m.semester || 'Marksheet'} <span className="text-xs text-slate-500">{m.extracted_cgpa != null ? `· CGPA ${m.extracted_cgpa}` : ''}{m.subject_marks ? ` · ${JSON.parse(m.subject_marks).length} subjects` : ''}</span></span>
                <a className="text-brand-600" href={fileUrl(m.file_path)} target="_blank" rel="noreferrer">Open ↗</a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= Drives ================= */
export function StudentDrives() {
  const toast = useToast();
  const [rows, loading, reload] = useLoad(() => api.get('/student/drives').then(r => r.data));
  const [aiOn] = useLoad(() => api.get('/student/ai-status').then(r => r.data.available));
  const [sel, setSel] = useState(null);     // drive being analysed
  const [score, setScore] = useState(null); // current analysis
  const [busy, setBusy] = useState(false);
  const apply = async d => {
    try { await api.post(`/student/drives/${d.id}/apply`); toast('Application submitted'); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const open = async d => {
    setSel(d); setScore(null);
    try { setScore((await api.get(`/student/drives/${d.id}/score`)).data); } catch (x) { toast(errMsg(x), 'err'); setSel(null); }
  };
  const runAi = async () => {
    setBusy(true);
    try { setScore((await api.post(`/student/drives/${sel.id}/ai-score`)).data); }
    catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Placement drives" subtitle="Eligibility and your Employment Score are calculated from your profile" />
      {rows.length === 0 && <div className="card"><Empty>No drives are open right now</Empty></div>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(d => (
          <div key={d.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-semibold">{d.title}</h2><div className="text-sm text-slate-500">{d.company_name} · {d.job_role}</div></div>
              <Badge tone="green">{d.ctc} LPA</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <div>Min CGPA: <b>{d.min_cgpa}</b></div><div>Backlogs: <b>{d.max_backlogs} active{d.max_dead_backlogs < 99 ? ` / ${d.max_dead_backlogs} dead` : ''}</b></div>
              <div>10th / 12th: <b>{d.min_tenth}% / {d.min_twelfth}%</b></div><div>Branches: <b>{d.branches || 'All'}</b></div>
              <div>Bond: <b>{d.bond_terms || 'None'}</b></div><div>Visit: <b>{fmtDate(d.visit_date)}</b></div>
              {d.required_skills && <div className="col-span-2">Skills: <b>{d.required_skills}</b></div>}
              {!!(d.resume_required || d.marksheet_required) && <div className="col-span-2">Documents: <b>{[d.resume_required && 'Resume', d.marksheet_required && 'Marksheet'].filter(Boolean).join(' + ')}</b></div>}
              {d.other_criteria && <div className="col-span-2">Other: <b>{d.other_criteria}</b></div>}
              <div className="col-span-2">Apply by: <b>{fmtDate(d.deadline)}</b>{d.deadline_passed && <span className="text-rose-600"> (closed)</span>}</div>
            </div>
            {d.description && <p className="mt-3 text-sm">{d.description}</p>}
            <button onClick={() => open(d)} className="mt-3 rounded-lg border border-slate-200 p-3 text-left hover:border-brand-500 dark:border-slate-700">
              <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium">Placement compatibility · {d.match_label}</span><ScoreChip value={d.placement_probability} /></div>
              <ScoreBar value={d.placement_probability} />
              <div className="mt-1.5 text-[11px] text-brand-600">View breakdown &amp; improvement tips →</div>
            </button>
            <div className="mt-auto pt-4">
              {d.applied ? <div className="flex items-center gap-2 text-sm">Your application: <StatusBadge status={d.application_status} /></div>
                : d.eligible ? <button className="btn-primary w-full" disabled={d.deadline_passed} onClick={() => apply(d)}>{d.deadline_passed ? 'Deadline passed' : 'Apply now'}</button>
                : (
                  <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                    <b>Not eligible</b><ul className="mt-1 list-disc pl-4">{d.reasons.map(r => <li key={r}>{r}</li>)}</ul>
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Employment Score — ${sel.title}` : ''} wide>
        {!score ? <Spinner /> : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4">
              <div className="text-center"><div className="text-4xl font-semibold tabular-nums">{score.probability}%</div><div className="text-xs text-slate-500">placement probability</div></div>
              <div className="flex-1"><ScoreBar value={score.probability} /><div className="mt-1 flex justify-between text-xs text-slate-500"><span>{score.label}</span><span>Employment score {score.score}/100 · {score.method === 'ai' ? `AI analysis (${score.model})` : 'Rule-based'}</span></div></div>
            </div>
            {score.summary && <p className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">{score.summary}</p>}
            {score.breakdown?.length > 0 && (
              <div>
                <div className="label">Score breakdown</div>
                <div className="space-y-1.5">
                  {score.breakdown.map(b => (
                    <div key={b.label}>
                      <div className="flex justify-between text-xs"><span>{b.label} <span className="text-slate-500">— {b.note}</span></span><span className="tabular-nums">{b.score}/{b.max}</span></div>
                      <ScoreBar value={(b.score / b.max) * 100} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="label">Matched skills</div><div className="flex flex-wrap gap-1.5">{score.matched_skills?.length ? score.matched_skills.map(x => <Badge key={x} tone="green">{x}</Badge>) : <span className="text-xs text-slate-500">None found</span>}</div></div>
              <div><div className="label">Missing skills</div><div className="flex flex-wrap gap-1.5">{score.missing_skills?.length ? score.missing_skills.map(x => <Badge key={x} tone="red">{x}</Badge>) : <span className="text-xs text-slate-500">None</span>}</div></div>
            </div>
            {score.strengths?.length > 0 && <div><div className="label">Strengths</div><ul className="list-disc pl-5">{score.strengths.map(x => <li key={x}>{x}</li>)}</ul></div>}
            {score.gaps?.length > 0 && <div><div className="label">Gaps</div><ul className="list-disc pl-5">{score.gaps.map(x => <li key={x}>{x}</li>)}</ul></div>}
            {score.suggestions?.length > 0 && <div><div className="label">How to improve</div><ul className="list-disc pl-5">{score.suggestions.map(x => <li key={x}>{x}</li>)}</ul></div>}
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              {aiOn ? (
                <>
                  <button className="btn-primary" disabled={busy} onClick={runAi}>{busy ? 'Analysing resume…' : score.method === 'ai' ? '↻ Re-run AI analysis' : '✨ Deep AI analysis of my resume'}</button>
                  <p className="mt-1.5 text-xs text-slate-500">Sends your resume text, skills and this drive's requirements to Claude (Anthropic) for analysis. Shown only to you.</p>
                </>
              ) : <p className="text-xs text-slate-500">Deep AI resume analysis is not enabled on this server. The score above uses the rule-based method.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ================= Applications & offers ================= */
export function StudentApplications() {
  const toast = useToast();
  const [rows, loading, reload] = useLoad(() => api.get('/student/applications').then(r => r.data));
  const respond = async (a, decision) => {
    if (!confirm(`${decision === 'accepted' ? 'Accept' : 'Decline'} the offer from ${a.company_name}? This cannot be undone.`)) return;
    try { await api.post(`/student/applications/${a.id}/offer`, { decision }); toast(`Offer ${decision}`); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="My applications" subtitle="Track progress and respond to offers" />
      <Table head={['Company', 'Role', 'CTC', 'Applied', 'Status', '']} empty={rows.length === 0 && 'You have not applied to any drive yet'}>
        {rows.map(a => (
          <tr key={a.id}>
            <td className="td font-medium">{a.company_name}<div className="text-xs font-normal text-slate-500">{a.title}</div></td>
            <td className="td">{a.job_role}</td><td className="td">{a.ctc} LPA</td><td className="td">{fmtDate(a.created_at)}</td>
            <td className="td"><StatusBadge status={a.status === 'selected_pending' ? 'shortlisted' : a.status} />{a.stage_note && <div className="text-xs text-slate-500">{a.stage_note}</div>}</td>
            <td className="td space-x-2 whitespace-nowrap">
              {a.status === 'offered' && <>
                <button className="btn-success !py-1" onClick={() => respond(a, 'accepted')}>Accept</button>
                <button className="btn-danger !py-1" onClick={() => respond(a, 'declined')}>Decline</button></>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
