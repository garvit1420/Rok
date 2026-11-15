import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { errMsg } from '../api';
import { Field } from '../components/ui';

const DEMO = [['TPO', 'tpo@mbm.ac.in', 'tpo123'], ['Company', 'hr@techcorp.com', 'company123'], ['Student', 'student@mbm.ac.in', 'student123']];

export function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">M</div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={`/${user.role}`} replace />;

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const u = await login(f.email, f.password); nav(`/${u.role}`); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Campus Placement Portal" subtitle="MBM University, Jodhpur — sign in to continue">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoFocus /></Field>
        <Field label="Password"><input className="input" type="password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-500">New student? <Link to="/register" className="font-medium text-brand-600">Create account</Link></p>
      </form>
      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="mb-2 text-xs font-medium text-slate-500">Demo accounts (click to fill)</div>
        <div className="flex flex-wrap gap-2">
          {DEMO.map(([l, email, password]) => <button key={l} type="button" className="btn-ghost !py-1 text-xs" onClick={() => setF({ email, password })}>{l}</button>)}
        </div>
      </div>
    </Shell>
  );
}
