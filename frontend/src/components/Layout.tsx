import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Upload, GitCompare, AlertTriangle, Users, History, Menu, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useActiveJobs } from '../hooks/useActiveJobs';
import { toast } from './Toast';

const NAV = [
  { to: '/',           label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/upload',     label: 'Upload Data',   icon: Upload },
  { to: '/ledger',     label: 'Vendor Master', icon: GitCompare },
  { to: '/exceptions', label: 'Exceptions',    icon: AlertTriangle },
  { to: '/vendors',    label: 'Vendor List',   icon: Users },
  { to: '/runs',       label: 'Run History',   icon: History },
];

function truncateFilename(name: string, max = 22) {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  const short = base.slice(0, Math.max(4, max - ext.length - 3)) + '…';
  return short + ext;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { activeJobs, recentlyCompleted } = useActiveJobs();
  const toastedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const j of recentlyCompleted) {
      if (toastedIds.current.has(j.id)) continue;
      toastedIds.current.add(j.id);
      const secs = ((j.durationMs ?? 0) / 1000).toFixed(1);
      const src = j.source === 'AUTO' ? 'Vendor' : j.source;
      toast.success(
        <span>
          {src} ingestion complete — {j.uniqueVendors.toLocaleString()} vendors loaded in {secs}s.{' '}
          <Link to="/" className="font-semibold underline decoration-[#f25a14] text-[#f25a14]">
            View Dashboard
          </Link>
        </span>,
      );
    }
  }, [recentlyCompleted]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-56 bg-ink-950 flex flex-col transition-transform lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
            <GitCompare className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-accent-500 uppercase">Indira IVF</div>
            <div className="text-sm font-semibold text-white leading-tight">Vendor Recon</div>
          </div>
        </div>

        {activeJobs.length > 0 && (
          <div className="mx-3 mb-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold tracking-wider text-accent-500 uppercase mb-2">
              Background Jobs
            </div>
            <ul className="space-y-2">
              {activeJobs.map((j) => (
                <li key={j.id} className="text-xs">
                  <div className="flex items-start gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-accent-400 animate-spin flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white/90 truncate" title={j.filename}>
                        {truncateFilename(j.filename)}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5 text-ink-500">
                        <span>{j.status}</span>
                        <span className="font-mono text-accent-400">
                          {j.percentComplete > 0 ? `${j.percentComplete}%` : `${j.rowsProcessed.toLocaleString()} rows`}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent-500/10 text-accent-400'
                    : 'text-ink-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/5">
          <p className="text-[10px] text-ink-500">P2P ↔ Oracle ERP</p>
          <p className="text-[10px] text-ink-600">GenAI Department</p>
        </div>
      </aside>

      {/* Overlay on mobile */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-6 py-3 border-b border-ink-100 bg-white/70 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-ink-100">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-sm font-semibold text-ink-900">Vendor Recon</span>
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
