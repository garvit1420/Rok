import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import { fmtDateTime } from './ui';

const NAV = {
  tpo: [['/tpo', 'Dashboard', '▦'], ['/tpo/companies', 'Companies', '🏢'], ['/tpo/drives', 'Drives', '📋'], ['/tpo/students', 'Students', '🎓'], ['/tpo/reports', 'Reports', '📈']],
  company: [['/company', 'Dashboard', '▦'], ['/company/drives', 'My Drives', '📋'], ['/company/profile', 'Company Profile', '🏢']],
  student: [['/student', 'Dashboard', '▦'], ['/student/profile', 'My Profile', '👤'], ['/student/drives', 'Placement Drives', '📋'], ['/student/applications', 'My Applications', '📨']],
};
const ROLE_LABEL = { tpo: 'TPO Cell', company: 'Company', student: 'Student' };

function Bell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const load = () => api.get('/auth/notifications').then(r => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = e => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = items.filter(i => !i.is_read).length;
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && unread) { await api.post('/auth/notifications/read'); setTimeout(load, 1200); }
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="btn-ghost relative !px-2.5" aria-label="Notifications">
        🔔{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 max-h-[70vh] w-80 overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-800">Notifications</div>
          {items.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Nothing yet</div>}
          {items.map(n => (
            <div key={n.id} className={`border-b border-slate-100 px-4 py-2.5 last:border-0 dark:border-slate-800 ${n.is_read ? '' : 'bg-brand-50 dark:bg-slate-800/60'}`}>
              <div className="text-sm font-medium">{n.title}</div>
              {n.message && <div className="text-xs text-slate-500">{n.message}</div>}
              <div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const links = NAV[user.role];
  return (
    <div className="min-h-screen lg:flex">
      {menu && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenu(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white p-4 transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">M</div>
          <div className="leading-tight"><div className="text-sm font-semibold">Placement Portal</div><div className="text-[11px] text-slate-500">MBM University</div></div>
        </div>
        <nav className="space-y-1">
          {links.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to.split('/').length === 2} onClick={() => setMenu(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
              <span className="w-5 text-center">{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <button className="btn-ghost lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
          <div className="hidden text-sm text-slate-500 lg:block">{ROLE_LABEL[user.role]} portal</div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost !px-2.5" onClick={() => setDark(d => !d)} aria-label="Toggle theme">{dark ? '☀️' : '🌙'}</button>
            <Bell />
            <div className="ml-1 hidden text-right leading-tight sm:block"><div className="text-sm font-medium">{user.name}</div><div className="text-[11px] text-slate-500">{ROLE_LABEL[user.role]}</div></div>
            <button className="btn-ghost" onClick={() => { logout(); nav('/login'); }}>Logout</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
