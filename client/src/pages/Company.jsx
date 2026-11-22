import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg, fileUrl } from '../api';
import { Badge, Field, fmtDate, Modal, PageHeader, Spinner, Stat, StatusBadge, Table, useLoad, useToast } from '../components/ui';
import { BRANCHES } from './Register';

const useCompany = () => useLoad(() => api.get('/company/profile').then(r => r.data));

/* ================= Dashboard (with invitation response) ================= */
export function CompanyDashboard() {
  const toast = useToast();
  const [c, loading, reload] = useCompany();
  const [drives] = useLoad(() => api.get('/company/drives').then(r => r.data));
  const respond = async decision => {
    try { await api.post('/company/invitation', { decision }); toast(`Invitation ${decision}`); reload(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  const list = drives || [];
  return (
    <>
      <PageHeader title={`Welcome, ${c.name}`} subtitle="Manage your campus recruitment with MBM University" />
      {c.invitation_status === 'invited' && (
        <div className="card mb-6 border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="font-semibold">You are invited to campus placements</h2>
          <p className="mt-1 text-sm">{c.invitation_message || 'The TPO Cell invites your company to participate in campus recruitment.'}</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-success" onClick={() => respond('accepted')}>Accept invitation</button>
            <button className="btn-danger" onClick={() => respond('declined')}>Decline</button>
          </div>
        </div>
      )}
      {c.invitation_status === 'accepted' && !(c.hr_name && c.phone && c.about) && (
        <div className="card mb-6 border-brand-300 bg-brand-50 p-5 dark:border-brand-700 dark:bg-brand-900/20">
          <h2 className="font-semibold">Complete your company details</h2>
          <p className="mt-1 text-sm">Add your HR contact, phone and a short description so the TPO and students know who you are.</p>
          <Link to="/company/profile" className="btn-primary mt-3">Fill in details →</Link>
        </div>
      )}
      {c.invitation_status === 'declined' && (
        <div className="card mb-6 p-4 text-sm">You declined the invitation. <button className="font-medium text-brand-600" onClick={() => respond('accepted')}>Accept instead</button></div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Invitation" value={<StatusBadge status={c.invitation_status} />} />
        <Stat label="Drives" value={list.length} tone="blue" />
        <Stat label="Approved" value={list.filter(d => d.status === 'approved').length} tone="green" />
        <Stat label="Total applicants" value={list.reduce((a, d) => a + d.applicants, 0)} tone="amber" />
      </div>
      {c.invitation_status === 'accepted' && <Link to="/company/drives" className="btn-primary mt-6">Manage drives →</Link>}
    </>
  );
}

/* ================= Profile ================= */
export function CompanyProfile() {
  const toast = useToast();
  const [c, loading, reload] = useCompany();
  const [f, setF] = useState(null);
  if (loading) return <Spinner />;
  const v = f || c;
  const set = k => e => setF({ ...v, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try { await api.put('/company/profile', v); toast('Profile saved'); setF(null); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  return (
    <>
      <PageHeader title="Company profile" subtitle={c.name} />
      <form onSubmit={save} className="card max-w-2xl space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="HR contact name"><input className="input" value={v.hr_name || ''} onChange={set('hr_name')} /></Field>
          <Field label="Phone"><input className="input" value={v.phone || ''} onChange={set('phone')} /></Field>
        </div>
        <Field label="Website"><input className="input" value={v.website || ''} onChange={set('website')} /></Field>
        <Field label="About the company"><textarea className="input" rows={4} value={v.about || ''} onChange={set('about')} /></Field>
        <button className="btn-primary">Save profile</button>
      </form>
    </>
  );
}

/* ================= Drives ================= */
const EMPTY = { title: '', job_role: '', ctc: '', bond_terms: '', visit_date: '', deadline: '', min_cgpa: 6, max_backlogs: 0, min_tenth: 0, min_twelfth: 0, branches: [], description: '', max_dead_backlogs: '', required_skills: '', resume_required: false, marksheet_required: false, other_criteria: '' };

export function CompanyDrives() {
  const toast = useToast();
  const [c] = useCompany();
  const [rows, loading, reload] = useLoad(() => api.get('/company/drives').then(r => r.data));
  const [form, setForm] = useState(null); // null | drive object
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const toggleBranch = b => setForm({ ...form, branches: form.branches.includes(b) ? form.branches.filter(x => x !== b) : [...form.branches, b] });

  const edit = d => setForm({ ...d, branches: d.branches ? d.branches.split(',').filter(Boolean) : [], max_dead_backlogs: d.max_dead_backlogs >= 99 ? '' : d.max_dead_backlogs, resume_required: !!d.resume_required, marksheet_required: !!d.marksheet_required });
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const body = { ...form, branches: form.branches.join(',') };
    try {
      if (form.id) await api.put(`/company/drives/${form.id}`, body); else await api.post('/company/drives', body);
      toast('Drive submitted for TPO approval'); setForm(null); reload();
    } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };
  if (loading || !c) return <Spinner />;
  const canCreate = c.invitation_status === 'accepted';
  return (
    <>
      <PageHeader title="My drives" subtitle="Submit recruitment details for TPO approval">
        <button className="btn-primary" disabled={!canCreate} title={canCreate ? '' : 'Accept the invitation first'} onClick={() => setForm({ ...EMPTY })}>+ New drive</button>
      </PageHeader>
      {!canCreate && <div className="card mb-4 p-4 text-sm">Accept the placement invitation on your dashboard to create drives.</div>}
      <Table head={['Drive', 'CTC', 'Criteria', 'Visit', 'Status', 'Applicants', '']} empty={rows.length === 0 && 'No drives yet'}>
        {rows.map(d => (
          <tr key={d.id}>
            <td className="td font-medium">{d.title}<div className="text-xs font-normal text-slate-500">{d.job_role}</div></td>
            <td className="td">{d.ctc} LPA</td>
            <td className="td text-xs">CGPA ≥ {d.min_cgpa} · Active ≤ {d.max_backlogs}{d.max_dead_backlogs < 99 ? ` · Dead ≤ ${d.max_dead_backlogs}` : ''}<br />{d.branches || 'All branches'}</td>
            <td className="td">{fmtDate(d.visit_date)}</td>
            <td className="td"><StatusBadge status={d.status} />{d.tpo_note && <div className="mt-1 max-w-[180px] text-xs text-slate-500">TPO: {d.tpo_note}</div>}</td>
            <td className="td">{d.applicants}</td>
            <td className="td space-x-2 whitespace-nowrap">
              {['submitted', 'rejected'].includes(d.status) && <button className="btn-ghost !py-1" onClick={() => edit(d)}>Edit</button>}
              {['approved', 'closed'].includes(d.status) && <Link to={`/company/drives/${d.id}`} className="btn-primary !py-1">Candidates</Link>}
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit drive' : 'New placement drive'} wide>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Drive title"><input className="input" required value={form.title} onChange={set('title')} placeholder="Software Engineer 2027" /></Field>
              <Field label="Job role"><input className="input" required value={form.job_role || ''} onChange={set('job_role')} /></Field>
              <Field label="CTC (LPA)"><input className="input" type="number" step="0.1" min="0" required value={form.ctc} onChange={set('ctc')} /></Field>
              <Field label="Bond terms"><input className="input" value={form.bond_terms || ''} onChange={set('bond_terms')} placeholder="None / 1 year" /></Field>
              <Field label="Campus visit date"><input className="input" type="date" value={form.visit_date || ''} onChange={set('visit_date')} /></Field>
              <Field label="Application deadline"><input className="input" type="date" value={form.deadline || ''} onChange={set('deadline')} /></Field>
            </div>
            <div>
              <div className="label">Eligibility criteria</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Min CGPA"><input className="input" type="number" step="0.1" min="0" max="10" value={form.min_cgpa} onChange={set('min_cgpa')} /></Field>
                <Field label="Max active backlogs"><input className="input" type="number" min="0" value={form.max_backlogs} onChange={set('max_backlogs')} /></Field>
                <Field label="Max dead backlogs"><input className="input" type="number" min="0" placeholder="no limit" value={form.max_dead_backlogs} onChange={set('max_dead_backlogs')} /></Field>
                <Field label="Min 10th %"><input className="input" type="number" min="0" max="100" value={form.min_tenth} onChange={set('min_tenth')} /></Field>
                <Field label="Min 12th %"><input className="input" type="number" min="0" max="100" value={form.min_twelfth} onChange={set('min_twelfth')} /></Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {BRANCHES.map(b => (
                  <button type="button" key={b} onClick={() => toggleBranch(b)} className={form.branches.includes(b) ? 'btn-primary !py-1' : 'btn-ghost !py-1'}>{b}</button>
                ))}
                <span className="self-center text-xs text-slate-500">{form.branches.length ? '' : 'None selected = all branches'}</span>
              </div>
            </div>
            <Field label="Required skills (comma separated) - used for the Employment Score shown to students"><input className="input" value={form.required_skills || ''} onChange={set('required_skills')} placeholder="Node.js, SQL, React" /></Field>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.resume_required} onChange={e => setForm({ ...form, resume_required: e.target.checked })} /> Resume required</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.marksheet_required} onChange={e => setForm({ ...form, marksheet_required: e.target.checked })} /> Marksheet required</label>
            </div>
            <Field label="Other eligibility criteria"><input className="input" value={form.other_criteria || ''} onChange={set('other_criteria')} placeholder="e.g. Good communication, relocation required" /></Field>
            <Field label="Description"><textarea className="input" rows={3} value={form.description || ''} onChange={set('description')} /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ================= Shortlisted candidates & final list ================= */
export function CompanyCandidates() {
  const { id } = useParams();
  const toast = useToast();
  const [data, loading, reload] = useLoad(() => api.get(`/company/drives/${id}/candidates`).then(r => r.data), [id]);
  const [picked, setPicked] = useState([]);
  const toggle = a => setPicked(p => (p.includes(a) ? p.filter(x => x !== a) : [...p, a]));
  const submit = async () => {
    try { const { data: r } = await api.post(`/company/drives/${id}/final-list`, { application_ids: picked }); toast(`${r.submitted} candidate(s) sent to TPO`); setPicked([]); reload(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  if (loading) return <Spinner />;
  const { drive, candidates } = data;
  return (
    <>
      <PageHeader title={drive.title} subtitle="Candidates shortlisted by the TPO Cell">
        <Link to="/company/drives" className="btn-ghost">← Back</Link>
        <button className="btn-primary" disabled={!picked.length} onClick={submit}>Submit final list ({picked.length})</button>
      </PageHeader>
      <Table head={['', 'Candidate', 'Roll no', 'Branch', 'CGPA', 'Backlogs', 'Resume', 'Status']} empty={candidates.length === 0 && 'No shortlisted candidates yet'}>
        {candidates.map(c => (
          <tr key={c.id}>
            <td className="td">{c.status === 'shortlisted' && <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />}</td>
            <td className="td font-medium">{c.name}<div className="text-xs font-normal text-slate-500">{c.email}</div></td>
            <td className="td">{c.roll_no}</td><td className="td">{c.branch}</td><td className="td">{c.cgpa}</td><td className="td">{c.backlogs}</td>
            <td className="td">{c.resume_path ? <a className="text-brand-600" href={fileUrl(c.resume_path)} target="_blank" rel="noreferrer">View ↗</a> : <Badge>none</Badge>}</td>
            <td className="td"><StatusBadge status={c.status} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
