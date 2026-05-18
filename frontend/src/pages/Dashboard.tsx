import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, reconApi, reportsApi, DashboardData } from '../services/api';
import { Card, Button, PageHeader, StatusBadge, DashboardSkeleton } from '../components/ui';
import { Play, Download, TrendingUp, AlertTriangle, Users, GitCompare, Loader2 } from 'lucide-react';
import { useActiveJobs } from '../hooks/useActiveJobs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
  const qc = useQueryClient();
  const { activeJobs, recentlyCompleted } = useActiveJobs();
  const { data, isLoading } = useQuery<DashboardData>({ queryKey: ['dashboard'], queryFn: dashboardApi.get });

  useEffect(() => {
    if (recentlyCompleted.length > 0) {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [recentlyCompleted, qc]);

  const runMutation = useMutation({
    mutationFn: reconApi.triggerRun,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader eyebrow="P2P ↔ Oracle ERP" title="Reconciliation Dashboard" />
        <DashboardSkeleton />
      </div>
    );
  }
  const d = data!;
  const run = d.latestRun;
  const matchPct = run ? (run.matchRatePct / 100).toFixed(1) : '—';

  return (
    <div>
      <PageHeader eyebrow="P2P ↔ Oracle ERP" title="Reconciliation Dashboard">
        <Button variant="secondary" onClick={() => reportsApi.downloadLatest()} size="sm">
          <Download className="w-3.5 h-3.5" /> Report
        </Button>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} size="sm">
          <Play className="w-3.5 h-3.5" /> {runMutation.isPending ? 'Running...' : 'Run Recon'}
        </Button>
      </PageHeader>

      {activeJobs.length > 0 && (
        <Card className="mb-6 p-5 border-l-4 border-l-[#f25a14]/80 bg-white">
          <h2 className="text-sm font-semibold text-ink-800 mb-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[#f25a14] animate-spin" />
            Active ingestion jobs
          </h2>
          <ul className="space-y-3">
            {activeJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm pb-3 border-b border-ink-100 last:border-0 last:pb-0"
              >
                <span className="font-medium text-ink-800 truncate max-w-[min(100%,280px)] flex-1 min-w-[120px]" title={j.filename}>
                  {j.filename}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{j.status}</span>
                <span className="font-mono text-ink-700">{j.rowsProcessed.toLocaleString()} rows</span>
                <span className="font-mono text-[#f25a14]">
                  {j.percentComplete > 0 ? `${j.percentComplete}%` : '—'}
                </span>
                <Link to="/runs" className="text-xs font-semibold text-[#f25a14] hover:underline">
                  Run history →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiTile label="P2P Vendors" value={run?.totalP2pVendors ?? 0} icon={<Users className="w-4 h-4" />} />
        <KpiTile label="ERP Vendors" value={run?.totalErpVendors ?? 0} icon={<Users className="w-4 h-4" />} />
        <KpiTile label="Common" value={run?.commonVendors ?? 0} icon={<GitCompare className="w-4 h-4" />} />
        <KpiTile label="Match Rate" value={`${matchPct}%`} icon={<TrendingUp className="w-4 h-4" />} accent />
        <KpiTile label="Open Exceptions" value={d.openExceptions} icon={<AlertTriangle className="w-4 h-4" />} alert={d.openExceptions > 0} />
      </div>

      {/* Missing count breakdown */}
      {run && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <Card className="px-4 py-3">
            <div className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase mb-1">Missing in ERP</div>
            <div className="text-xl font-display font-semibold text-red-600">{run.missingInErpCount}</div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase mb-1">Missing in P2P</div>
            <div className="text-xl font-display font-semibold text-orange-600">{run.missingInP2pCount}</div>
          </Card>
          <Card className="px-4 py-3">
            <div className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase mb-1">Last Run</div>
            <div className="text-sm font-medium text-ink-700">{run.startedAt ? format(new Date(run.startedAt), 'dd MMM yyyy, HH:mm') : '—'}</div>
            <StatusBadge status={run.status} />
          </Card>
        </div>
      )}

      {/* Category Matrix — mirrors Excel Dashboard sheet */}
      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-800">Category-wise Reconciliation Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-950 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                <th className="px-4 py-2.5 text-right font-semibold">Mismatches</th>
                <th className="px-4 py-2.5 text-right font-semibold">Matched</th>
                <th className="px-4 py-2.5 text-right font-semibold">P2P Unique</th>
                <th className="px-4 py-2.5 text-right font-semibold">ERP Unique</th>
                <th className="px-4 py-2.5 text-right font-semibold">P2P Missing</th>
                <th className="px-4 py-2.5 text-right font-semibold">ERP Missing</th>
              </tr>
            </thead>
            <tbody>
              {d.categorySummary.map((s, i) => (
                <tr key={s.category} className={i % 2 === 0 ? 'bg-white' : 'bg-cream-50'}>
                  <td className="px-4 py-2.5 font-medium text-ink-800">{s.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={s.missingCount > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                      {s.missingCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-600">{s.matched}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-500">{s.p2pUnique}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-500">{s.erpUnique}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-orange-500">{s.p2pMissing}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-orange-500">{s.erpMissing}</td>
                </tr>
              ))}
              {d.categorySummary.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-400">No reconciliation data yet. Upload vendor files or run a reconciliation.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trend chart */}
      {d.trend.length > 1 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-800 mb-4">Exception Trend (last 14 runs)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'dd/MM')} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(v) => format(new Date(v as string), 'dd MMM yyyy HH:mm')} />
              <Line type="monotone" dataKey="exceptions" stroke="#f25a14" strokeWidth={2} dot={{ r: 3 }} name="Exceptions" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

function KpiTile({ label, value, icon, accent, alert }: {
  label: string; value: number | string; icon: React.ReactNode; accent?: boolean; alert?: boolean;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-ink-400">{icon}</span>
        <span className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">{label}</span>
      </div>
      <div className={`text-xl font-display font-semibold ${accent ? 'text-accent-500' : alert ? 'text-red-600' : 'text-ink-900'}`}>
        {value}
      </div>
    </Card>
  );
}
