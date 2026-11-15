import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { errMsg, fileUrl } from '../api';
import { Badge, Empty, Field, fmtDate, fmtDateTime, Modal, PageHeader, ScoreChip, Spinner, Stat, StatusBadge, Table, useLoad, useToast } from '../components/ui';

/* ================= Dashboard ================= */
export function TpoDashboard() {
  const [s, loading] = useLoad(() => api.get('/tpo/stats').then(r => r.data));
  if (loading) return <Spinner />;
  const t = s.totals;
  const funnel = [
    { stage: 'Applicants', n: t.applicants }, { stage: 'Shortlisted', n: t.shortlisted },
    { stage: 'Offered', n: t.offered }, { stage: 'Accepted', n: t.accepted }, { stage: 'Declined', n: t.declined },
  ];
  return (
    <>
      <PageHeader title="TPO Dashboard" subtitle="Overview of campus placement activity" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Students" value={t.students} hint={`${t.verified} verified`} />
        <Stat label="Companies" value={t.companies} hint={`${t.companiesAccepted} accepted`} tone="blue" />
        <Stat label="Live drives" value={t.drives} tone="green" />
        <Stat label="Placed students" value={t.placedStudents} tone="green" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Link to="/tpo/students" className="card flex items-center justify-between p-4 hover:border-brand-500">
          <div><div className="text-sm font-medium">Profiles awaiting verification</div><div className="text-xs text-slate-500">New and updated academic records</div></div>
          <Badge tone={t.pendingVerification ? 'amber' : 'gray'}>{t.pendingVerification}</Badge>
        </Link>
        <Link to="/tpo/drives" className="card flex items-center justify-between p-4 hover:border-brand-500">
          <div><div className="text-sm font-medium">Drives awaiting approval</div><div className="text-xs text-slate-500">Submitted by companies</div></div>
          <Badge tone={t.pendingDrives ? 'amber' : 'gray'}>{t.pendingDrives}</Badge>
        </Link>
      </div>
      <div className="card mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Placement funnel</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b822" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip /><Bar dataKey="n" name="Count" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ================= Companies ================= */
export function TpoCompanies() {
  const toast = useToast();
  const [rows, loading, reload] = useLoad(() => api.get('/tpo/companies').then(r => r.data));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', hr_name: '', message: '' });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const invite = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/tpo/companies/invite', f);
      setCreated(data); setF({ name: '', email: '', hr_name: '', message: '' }); reload();
    } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };
  const close = () => { setOpen(false); setCreated(null); };
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Companies" subtitle="Send placement invitations and track responses">
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Invite company</button>
      </PageHeader>
      <Table head={['Company', 'HR contact', 'Email', 'Invitation', 'Invited on']} empty={rows.length === 0 && 'No companies invited yet'}>
        {rows.map(c => (
          <tr key={c.id}>
            <td className="td font-medium">{c.name}</td>
            <td className="td">{c.hr_name || '—'}</td>
            <td className="td">{c.email}</td>
            <td className="td"><StatusBadge status={c.invitation_status} /></td>
            <td className="td">{fmtDate(c.created_at)}</td>
          </tr>
        ))}
      </Table>
      <Modal open={open} onClose={close} title={created ? 'Invitation sent' : 'Invite a company'}>
        {created ? (
          <div className="space-y-3 text-sm">
            <p>The company has been notified. Share these login details with them (shown only once):</p>
            <div className="rounded-lg bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800">Email: {created.email}<br />Temporary password: {created.temp_password}</div>
            <button className="btn-primary w-full" onClick={close}>Done</button>
          </div>
        ) : (
          <form onSubmit={invite} className="space-y-3">
            <Field label="Company name"><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HR contact name"><input className="input" value={f.hr_name} onChange={e => setF({ ...f, hr_name: e.target.value })} /></Field>
              <Field label="HR email"><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
            </div>
            <Field label="Invitation message"><textarea className="input" rows={3} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder="We invite you to participate in campus placements 2026-27…" /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ================= Drives ================= */
export function TpoDrives() {
  const toast = useToast();
  const [rows, loading, reload] = useLoad(() => api.get('/tpo/drives').then(r => r.data));
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');

  const decide = async decision => {
    try { await api.post(`/tpo/drives/${sel.id}/decision`, { decision, note }); toast(`Drive ${decision}`); setSel(null); setNote(''); reload(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  const close = async d => {
    if (!confirm(`Close "${d.title}"? Students will no longer be able to apply.`)) return;
    try { await api.post(`/tpo/drives/${d.id}/close`); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Placement drives" subtitle="Review company submissions and manage live drives" />
      <Table head={['Drive', 'Company', 'CTC', 'Criteria', 'Deadline', 'Status', 'Applicants', '']} empty={rows.length === 0 && 'No drives submitted yet'}>
        {rows.map(d => (
          <tr key={d.id}>
            <td className="td font-medium">{d.title}<div className="text-xs font-normal text-slate-500">{d.job_role}</div></td>
            <td className="td">{d.company_name}</td>
            <td className="td">{d.ctc} LPA</td>
            <td className="td text-xs">CGPA ≥ {d.min_cgpa} · Active ≤ {d.max_backlogs}{d.max_dead_backlogs < 99 ? ` · Dead ≤ ${d.max_dead_backlogs}` : ''}<br />{d.branches || 'All branches'}</td>
            <td className="td">{fmtDate(d.deadline)}</td>
            <td className="td"><StatusBadge status={d.status} /></td>
            <td className="td">{d.applicants}</td>
            <td className="td space-x-2 whitespace-nowrap">
              {d.status === 'submitted' && <button className="btn-primary !py-1" onClick={() => { setSel(d); setNote(''); }}>Review</button>}
              {(d.status === 'approved' || d.status === 'closed') && <Link to={`/tpo/drives/${d.id}`} className="btn-ghost !py-1">Applicants</Link>}
              {d.status === 'approved' && <button className="btn-ghost !py-1" onClick={() => close(d)}>Close</button>}
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Review drive" wide>
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              {[['Company', sel.company_name], ['Title', sel.title], ['Job role', sel.job_role], ['CTC', `${sel.ctc} LPA`], ['Bond terms', sel.bond_terms || 'None'],
                ['Visit date', fmtDate(sel.visit_date)], ['Apply by', fmtDate(sel.deadline)], ['Branches', sel.branches || 'All'],
                ['Min CGPA', sel.min_cgpa], ['Max active backlogs', sel.max_backlogs], ['Max dead backlogs', sel.max_dead_backlogs >= 99 ? 'No limit' : sel.max_dead_backlogs], ['Required skills', sel.required_skills || '-'], ['Documents', [sel.resume_required && 'Resume', sel.marksheet_required && 'Marksheet'].filter(Boolean).join(' + ') || 'Not mandatory'], ['Other criteria', sel.other_criteria || '-'], ['Min 10th %', sel.min_tenth], ['Min 12th %', sel.min_twelfth]]
                .map(([k, v]) => <div key={k}><div className="label">{k}</div><div>{v ?? '—'}</div></div>)}
            </div>
            {sel.description && <div><div className="label">Description</div><p className="whitespace-pre-wrap">{sel.description}</p></div>}
            <Field label="Note to company (optional)"><textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
            <div className="flex gap-2">
              <button className="btn-success flex-1" onClick={() => decide('approved')}>Approve &amp; publish</button>
              <button className="btn-danger flex-1" onClick={() => decide('rejected')}>Reject</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ================= Drive applicants ================= */
export function TpoDriveApplicants() {
  const { id } = useParams();
  const toast = useToast();
  const [data, loading, reload] = useLoad(() => api.get(`/tpo/drives/${id}/applications`).then(r => r.data), [id]);
  const set = async (appId, status) => {
    try { await api.post(`/tpo/applications/${appId}/status`, { status }); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const publish = async () => {
    try { const { data: r } = await api.post(`/tpo/drives/${id}/publish-offers`); toast(`${r.published} offer(s) published`); reload(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  const { drive, applications: apps } = data;
  const pendingFinal = apps.filter(a => a.status === 'selected_pending').length;
  return (
    <>
      <PageHeader title={drive.title} subtitle={`${apps.length} applicant(s) · CGPA ≥ ${drive.min_cgpa}, backlogs ≤ ${drive.max_backlogs}`}>
        <Link to="/tpo/drives" className="btn-ghost">← Back</Link>
        {pendingFinal > 0 && <button className="btn-primary" onClick={publish}>Publish {pendingFinal} offer(s)</button>}
      </PageHeader>
      <Table head={['Student', 'Roll no', 'Branch', 'CGPA', 'Backlogs (A/D)', 'Eligibility', 'Match', 'Status', 'Action']} empty={apps.length === 0 && 'No applications yet'}>
        {apps.map(a => (
          <tr key={a.id}>
            <td className="td font-medium">{a.name}<div className="text-xs font-normal text-slate-500">{a.email}</div></td>
            <td className="td">{a.roll_no}</td><td className="td">{a.branch}</td><td className="td">{a.cgpa}</td><td className="td">{a.backlogs ?? 0} / {a.dead_backlogs ?? 0}</td>
            <td className="td">{a.eligible ? <Badge tone="green">Eligible</Badge> : <span title={a.reasons.join('\n')}><Badge tone="red">Ineligible</Badge></span>}</td>
            <td className="td"><ScoreChip value={a.placement_probability} label={a.match_label} /></td>
            <td className="td"><StatusBadge status={a.status} /></td>
            <td className="td space-x-1.5 whitespace-nowrap">
              {a.status === 'applied' && <>
                <button className="btn-success !py-1" onClick={() => set(a.id, 'shortlisted')}>Shortlist</button>
                <button className="btn-ghost !py-1" onClick={() => set(a.id, 'rejected')}>Reject</button></>}
              {a.status === 'shortlisted' && <button className="btn-ghost !py-1" onClick={() => set(a.id, 'rejected')}>Reject</button>}
              {a.status === 'selected_pending' && <button className="btn-primary !py-1" onClick={() => set(a.id, 'offered')}>Publish offer</button>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

/* ================= Students ================= */
const FILTERS = [['', 'All'], ['pending', 'Pending'], ['reverify_requested', 'Re-verify'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['unverified', 'Incomplete']];
export function TpoStudents() {
  const [f, setF] = useState('');
  const [rows, loading] = useLoad(() => api.get('/tpo/students', { params: { status: f || undefined } }).then(r => r.data), [f]);
  const [q, setQ] = useState('');
  const list = (rows || []).filter(s => `${s.name} ${s.roll_no} ${s.branch}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Students" subtitle="Verify academic details and documents">
        <input className="input !w-56" placeholder="Search name / roll no" value={q} onChange={e => setQ(e.target.value)} />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([v, l]) => <button key={v} onClick={() => setF(v)} className={f === v ? 'btn-primary !py-1' : 'btn-ghost !py-1'}>{l}</button>)}
      </div>
      {loading ? <Spinner /> : (
        <Table head={['Student', 'Roll no', 'Branch', 'CGPA', 'Backlogs', 'Status', 'Updated', '']} empty={list.length === 0 && 'No students found'}>
          {list.map(s => (
            <tr key={s.id}>
              <td className="td font-medium">{s.name}<div className="text-xs font-normal text-slate-500">{s.email}</div></td>
              <td className="td">{s.roll_no || '—'}</td><td className="td">{s.branch || '—'}</td>
              <td className="td">{s.cgpa ?? '—'}</td><td className="td">{s.backlogs ?? 0}</td>
              <td className="td"><StatusBadge status={s.verification_status} /></td>
              <td className="td">{fmtDateTime(s.updated_at)}</td>
              <td className="td"><Link to={`/tpo/students/${s.id}`} className="btn-ghost !py-1">Open</Link></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function TpoStudentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [d, loading, reload] = useLoad(() => api.get(`/tpo/students/${id}`).then(r => r.data), [id]);
  const [form, setForm] = useState(null);
  if (loading) return <Spinner />;
  const { student: s, marksheets, history } = d;
  const f = form || { cgpa: s.cgpa ?? '', backlogs: s.backlogs ?? 0, dead_backlogs: s.dead_backlogs ?? 0, note: '' };
  const decide = async decision => {
    try { await api.post(`/tpo/students/${id}/verify`, { decision, ...f }); toast('Updated'); setForm(null); reload(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.email} · ${s.roll_no || 'no roll no'} · ${s.branch || 'no branch'}`}>
        <Link to="/tpo/students" className="btn-ghost">← Back</Link><StatusBadge status={s.verification_status} />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Academic details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[['CGPA', s.cgpa], ['Active backlogs', s.backlogs], ['Dead backlogs', s.dead_backlogs], ['10th %', s.tenth_pct], ['12th %', s.twelfth_pct], ['Phone', s.phone], ['Skills', s.skills]].map(([k, v]) =>
              <div key={k}><div className="label">{k}</div><div className="font-medium">{v ?? '—'}</div></div>)}
            <div><div className="label">Resume</div>{s.resume_path ? <a className="font-medium text-brand-600" href={fileUrl(s.resume_path)} target="_blank" rel="noreferrer">View ↗</a> : '—'}</div>
          </div>
          <h2 className="mb-2 mt-6 text-sm font-semibold">Marksheets &amp; OCR extraction</h2>
          {marksheets.length === 0 ? <Empty>No marksheets uploaded</Empty> : (
            <div className="space-y-2">
              {marksheets.map(m => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-medium">{m.semester || 'Marksheet'}</span> <span className="text-xs text-slate-500">· {fmtDateTime(m.created_at)}</span></div>
                    <a className="text-brand-600" href={fileUrl(m.file_path)} target="_blank" rel="noreferrer">Open file ↗</a>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Badge tone={m.ocr_status === 'done' ? 'blue' : 'gray'}>OCR {m.ocr_status}</Badge>
                    <Badge tone="indigo">Extracted CGPA: {m.extracted_cgpa ?? 'not found'}</Badge>
                    <Badge tone="indigo">Active backlogs: {m.extracted_backlogs ?? 'not found'}</Badge>
                    <Badge tone="indigo">Dead backlogs: {m.extracted_dead_backlogs ?? 'not found'}</Badge>
                    {m.extracted_cgpa != null && Number(m.extracted_cgpa) !== Number(s.cgpa) && <Badge tone="amber">Differs from profile CGPA</Badge>}
                  </div>
                  {m.subject_marks && (
                    <div className="mt-2 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                      {JSON.parse(m.subject_marks).map((x, i) => <div key={i} className="flex justify-between border-b border-slate-100 py-0.5 dark:border-slate-800"><span>{x.subject}</span><span className="tabular-nums">{x.marks}{x.grade ? ` · ${x.grade}` : ''}</span></div>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Verification</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Confirmed CGPA"><input className="input" type="number" step="0.01" min="0" max="10" value={f.cgpa} onChange={e => setForm({ ...f, cgpa: e.target.value })} /></Field>
                <Field label="Active backlogs"><input className="input" type="number" min="0" value={f.backlogs} onChange={e => setForm({ ...f, backlogs: e.target.value })} /></Field>
                <Field label="Dead backlogs"><input className="input" type="number" min="0" value={f.dead_backlogs} onChange={e => setForm({ ...f, dead_backlogs: e.target.value })} /></Field>
              </div>
              <Field label="Note to student"><textarea className="input" rows={2} value={f.note} onChange={e => setForm({ ...f, note: e.target.value })} /></Field>
              <button className="btn-success w-full" onClick={() => decide('verified')}>Verify</button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={() => decide('reverify')}>Request re-verify</button>
                <button className="btn-danger" onClick={() => decide('rejected')}>Reject</button>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">History</h2>
            {history.length === 0 ? <div className="text-sm text-slate-500">No activity</div> : history.map(h => (
              <div key={h.id} className="border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
                <StatusBadge status={h.action} /> <span className="text-slate-500">{fmtDateTime(h.created_at)}</span>
                {h.note && <div className="mt-0.5 text-slate-600 dark:text-slate-400">{h.note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= Reports ================= */
export function TpoReports() {
  const toast = useToast();
  const [s, loading] = useLoad(() => api.get('/tpo/stats').then(r => r.data));
  const download = async () => {
    try {
      const { data } = await api.get('/tpo/report.csv', { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = 'placement-report.csv'; a.click();
    } catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  const t = s.totals;
  return (
    <>
      <PageHeader title="Placement reports" subtitle="Applicants, shortlists, offers and decisions">
        <button className="btn-primary" onClick={download}>⬇ Download CSV</button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Applicants" value={t.applicants} />
        <Stat label="Shortlisted" value={t.shortlisted} tone="blue" />
        <Stat label="Offers" value={t.offered} tone="amber" />
        <Stat label="Accepted" value={t.accepted} tone="green" />
        <Stat label="Declined" value={t.declined} tone="red" />
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Drive-wise statistics</h2>
      {s.perDrive.length > 0 && (
        <div className="card mb-4 h-72 p-4">
          <ResponsiveContainer>
            <BarChart data={s.perDrive}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b822" />
              <XAxis dataKey="company" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip /><Legend />
              <Bar dataKey="applicants" name="Applicants" fill="#94a3b8" /><Bar dataKey="shortlisted" name="Shortlisted" fill="#38bdf8" />
              <Bar dataKey="accepted" name="Accepted" fill="#10b981" /><Bar dataKey="declined" name="Declined" fill="#f43f5e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Table head={['Drive', 'Company', 'CTC', 'Applicants', 'Shortlisted', 'Offered', 'Accepted', 'Declined']} empty={s.perDrive.length === 0 && 'No approved drives yet'}>
        {s.perDrive.map(d => (
          <tr key={d.id}><td className="td font-medium">{d.title}</td><td className="td">{d.company}</td><td className="td">{d.ctc} LPA</td>
            <td className="td">{d.applicants}</td><td className="td">{d.shortlisted}</td><td className="td">{d.offered}</td><td className="td">{d.accepted}</td><td className="td">{d.declined}</td></tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Branch-wise placement</h2>
      <Table head={['Branch', 'Students', 'Placed', 'Placement %']}>
        {s.byBranch.map(b => (
          <tr key={b.branch}><td className="td font-medium">{b.branch}</td><td className="td">{b.total}</td><td className="td">{b.placed}</td>
            <td className="td">{b.total ? Math.round((b.placed / b.total) * 100) : 0}%</td></tr>
        ))}
      </Table>
    </>
  );
}
