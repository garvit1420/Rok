import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { errMsg } from '../api';
import { Dropdown, Field } from '../components/ui';
import { Shell } from './Login';

export const BRANCHES = ['CSE', 'IT', 'ECE', 'EE', 'EEE', 'ME', 'CE', 'CHE', 'Mining', 'AIDS', 'BCT', 'P&I', 'PE'];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', roll_no: '', branch: 'CSE' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await register(f); nav('/student/profile'); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Student registration" subtitle="Create your placement profile">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required value={f.email} onChange={set('email')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Roll number"><input className="input" value={f.roll_no} onChange={set('roll_no')} /></Field>
          <Field label="Branch"><Dropdown value={f.branch} onChange={b => setF({ ...f, branch: b })} options={BRANCHES} /></Field>
        </div>
        <Field label="Password (min 6 characters)"><input className="input" type="password" minLength={6} required value={f.password} onChange={set('password')} /></Field>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-medium text-brand-600">Sign in</Link></p>
      </form>
    </Shell>
  );
}
