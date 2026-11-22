import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- Toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems(i => [...i, { id, msg, type }]);
    setTimeout(() => setItems(i => i.filter(x => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {items.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${t.type === 'err' ? 'bg-rose-600' : 'bg-emerald-600'}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Badges
const TONES = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
const STATUS_TONE = {
  verified: 'green', approved: 'green', accepted: 'green', offered: 'indigo', shortlisted: 'blue', selected_pending: 'indigo',
  pending: 'amber', submitted: 'amber', invited: 'amber', applied: 'gray', reverify_requested: 'amber', unverified: 'gray',
  rejected: 'red', declined: 'red', closed: 'gray',
};
export const Badge = ({ tone, children }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone] || TONES.gray}`}>{children}</span>
);
export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status]}>{(status || '').replace(/_/g, ' ')}</Badge>
);

// ---------- Layout bits
// Employment score / placement probability chip
export const ScoreChip = ({ value, label }) => {
  const tone = value >= 75 ? 'green' : value >= 55 ? 'blue' : value >= 35 ? 'amber' : 'red';
  return <span title={label}><Badge tone={tone}>{value}%</Badge></span>;
};
export const ScoreBar = ({ value }) => {
  const c = value >= 75 ? 'bg-emerald-500' : value >= 55 ? 'bg-sky-500' : value >= 35 ? 'bg-amber-500' : 'bg-rose-500';
  return <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full ${c}`} style={{ width: `${Math.max(2, value)}%` }} /></div>;
};

export const PageHeader =({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex gap-2">{children}</div>
  </div>
);
export const Stat = ({ label, value, hint, tone = 'indigo' }) => {
  const bar = { indigo: 'bg-indigo-500', green: 'bg-emerald-500', amber: 'bg-amber-500', blue: 'bg-sky-500', red: 'bg-rose-500' }[tone];
  return (
    <div className="card relative overflow-hidden p-4">
      <div className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
};
export const Empty = ({ children }) => <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
export const Spinner = () => <div className="py-16 text-center text-sm text-slate-500">Loading…</div>;

export const Table = ({ head, children, empty }) => (
  <div className="card overflow-x-auto">
    <table className="w-full min-w-[640px]">
      <thead className="border-b border-slate-200 dark:border-slate-800"><tr>{head.map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
    </table>
    {empty && <Empty>{empty}</Empty>}
  </div>
);

export const Field = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>
);

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Small hook for data loading
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try { setData(await fn()); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return [data, loading, reload, setData];
}

export const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = d => (d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// ---------- Dropdown that always opens downward (native <select> may open upward near the screen bottom)
export function Dropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen(o => !o)} onKeyDown={e => e.key === 'Escape' && setOpen(false)}>
        <span>{value}</span><span className="text-xs text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.map(o => (
            <li key={o}><button type="button" className={`block w-full px-3 py-1.5 text-left hover:bg-brand-500 hover:text-white ${o === value ? 'bg-slate-100 font-medium dark:bg-slate-700' : ''}`} onClick={() => { onChange(o); setOpen(false); }}>{o}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
