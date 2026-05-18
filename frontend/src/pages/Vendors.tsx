import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vendorsApi } from '../services/api';
import { Card, Button, PageHeader, EmptyState, TableSkeleton } from '../components/ui';
import { Search } from 'lucide-react';
import clsx from 'clsx';

const PAGE_SIZE = 20;
const TABLE_MAX_H = 'max-h-[min(70vh,560px)]';

export default function Vendors() {
  const [source, setSource] = useState<'P2P' | 'ERP'>('P2P');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({ queryKey: ['vendorStats'], queryFn: vendorsApi.stats });
  const { data, isLoading } = useQuery({
    queryKey: ['vendors', source, q, page],
    queryFn: () => vendorsApi.list(source, { q, page, pageSize: PAGE_SIZE }),
  });

  return (
    <div>
      <PageHeader eyebrow="Vendor Data" title="Vendor List" />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-ink-100 rounded-lg p-0.5">
          {(['P2P', 'ERP'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSource(s); setPage(1); }}
              className={clsx(
                'px-4 py-1.5 text-xs font-semibold rounded-md transition-all',
                source === s ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              {s} {stats && <span className="ml-1 text-ink-400">({s === 'P2P' ? stats.p2pCount : stats.erpCount})</span>}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search by code, name, PAN, GST..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-ink-200 rounded-lg bg-white focus:border-accent-400 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={12} columns={10} />
      ) : !data?.items.length ? (
        <EmptyState message={`No ${source} vendors found. Upload a ${source} vendor file first.`} />
      ) : (
        <>
          <Card className="overflow-hidden mb-4 p-0">
            <div className={`${TABLE_MAX_H} overflow-auto`}>
              <table className="w-full text-xs min-w-max">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-ink-950 text-white shadow-sm">
                    <th className="px-3 py-2.5 text-left font-semibold">Code</th>
                    <th className="px-3 py-2.5 text-left font-semibold">City</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Name</th>
                    <th className="px-3 py-2.5 text-left font-semibold">PAN</th>
                    <th className="px-3 py-2.5 text-left font-semibold">GST</th>
                    <th className="px-3 py-2.5 text-left font-semibold">MSME</th>
                    <th className="px-3 py-2.5 text-left font-semibold">IFSC</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Bank Acc</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Bank</th>
                    <th className="px-3 py-2.5 text-left font-semibold">TDS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v: any, i: number) => (
                    <tr
                      key={`${v.vendorCode}||${v.city}`}
                      className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-cream-50')}
                    >
                      <td className="px-3 py-2 font-mono font-medium">{v.vendorCode}</td>
                      <td className="px-3 py-2 text-[11px] text-ink-600">{v.city || 'UNSPECIFIED'}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{v.vendorName}</td>
                      <td className="px-3 py-2 font-mono">{v.panNumber || '—'}</td>
                      <td className="px-3 py-2 font-mono">{v.gstNumber || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{v.msmeNumber || v.msmeCode || '—'}</td>
                      <td className="px-3 py-2 font-mono">{v.ifscCode || '—'}</td>
                      <td className="px-3 py-2 font-mono">{v.bankAccount || '—'}</td>
                      <td className="px-3 py-2">{v.bankName || '—'}</td>
                      <td className="px-3 py-2 text-[10px]">{v.tdsSection || v.withholdTaxGroup || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-ink-500">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}>Prev</Button>
                <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)} disabled={page * PAGE_SIZE >= data.total}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
