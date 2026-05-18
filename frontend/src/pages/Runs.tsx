import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reconApi, reportsApi, ReconRun } from '../services/api';
import { Card, PageHeader, EmptyState, StatusBadge, Button, TableSkeleton } from '../components/ui';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

const PAGE_SIZE = 20;
const TABLE_MAX_H = 'max-h-[min(70vh,560px)]';

export default function Runs() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<ReconRun[]>({
    queryKey: ['runs'],
    queryFn: reconApi.listRuns,
  });

  const rows = data ?? [];
  const total = rows.length;
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    if (total > 0 && page > maxPage) setPage(maxPage);
  }, [total, page]);

  return (
    <div>
      <PageHeader eyebrow="History" title="Reconciliation Runs" />

      {isLoading ? (
        <TableSkeleton rows={12} columns={12} />
      ) : !data?.length ? (
        <EmptyState message="No reconciliation runs yet." />
      ) : (
        <>
        <Card className="overflow-hidden p-0 mb-4">
          <div className={`${TABLE_MAX_H} overflow-auto`}>
          <table className="w-full text-sm min-w-max">
            <thead className="sticky top-0 z-20">
              <tr className="bg-ink-950 text-white text-xs shadow-sm">
                <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5 text-center font-semibold">Trigger</th>
                <th className="px-4 py-2.5 text-right font-semibold">P2P</th>
                <th className="px-4 py-2.5 text-right font-semibold">ERP</th>
                <th className="px-4 py-2.5 text-right font-semibold">Common</th>
                <th className="px-4 py-2.5 text-right font-semibold">Missing ERP</th>
                <th className="px-4 py-2.5 text-right font-semibold">Missing P2P</th>
                <th className="px-4 py-2.5 text-right font-semibold">Exceptions</th>
                <th className="px-4 py-2.5 text-right font-semibold">Match %</th>
                <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
                <th className="px-4 py-2.5 text-center font-semibold">Report</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-cream-50', 'hover:bg-accent-50/30')}>
                  <td className="px-4 py-2.5 text-xs">
                    {r.startedAt ? format(new Date(r.startedAt), 'dd MMM yyyy, HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-center text-xs text-ink-500">{r.trigger}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.totalP2pVendors}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.totalErpVendors}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.commonVendors}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-red-600">{r.missingInErpCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-orange-600">{r.missingInP2pCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">{r.totalExceptions}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-600">{(r.matchRatePct / 100).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right text-xs text-ink-400">
                    {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.status === 'COMPLETED' && (
                      <Button variant="ghost" size="sm" onClick={() => reportsApi.downloadRun(r.id)}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-ink-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= total}>Next</Button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
