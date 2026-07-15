import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reconApi, LedgerRow } from '../services/api';
import { Card, PageHeader, EmptyState, MatchBadge, Button, TableSkeleton } from '../components/ui';
import { Search, Filter } from 'lucide-react';
import clsx from 'clsx';

/** Rows per server page + scroll viewport height for wide ledger grid */
const PAGE_SIZE = 20;
const TABLE_MAX_H = 'max-h-[min(70vh,560px)]';

/** Shown between Code and In P2P in the main grid */
const VENDOR_NAME_FIELD = {
  label: 'Vendor Name',
  p2p: 'vendorNameP2p',
  erp: 'vendorNameErp',
  match: 'vendorNameMatch',
} as const;

const FIELDS = [
  { label: 'PAN', p2p: 'panP2p', erp: 'panErp', match: 'panMatch' },
  { label: 'GST', p2p: 'gstP2p', erp: 'gstErp', match: 'gstMatch' },
  { label: 'MSME', p2p: 'msmeP2p', erp: 'msmeErp', match: 'msmeMatch' },
  { label: 'IFSC', p2p: 'ifscP2p', erp: 'ifscErp', match: 'ifscMatch' },
  { label: 'Bank Account', p2p: 'bankAccountP2p', erp: 'bankAccountErp', match: 'bankAccountMatch' },
  { label: 'Bank Name', p2p: 'bankNameP2p', erp: 'bankNameErp', match: 'bankNameMatch' },
  { label: 'TDS', p2p: 'tdsP2p', erp: 'tdsErp', match: 'tdsMatch' },
  { label: 'Payment Term', p2p: 'paymentTermP2p', erp: 'paymentTermErp', match: 'paymentTermMatch' },
] as const;

const DETAIL_FIELDS = [VENDOR_NAME_FIELD, ...FIELDS] as const;

export default function VendorMaster() {
  const [q, setQ] = useState('');
  const [onlyMismatches, setOnlyMismatches] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: latest, isLoading: latestRunLoading } = useQuery({ queryKey: ['latestRun'], queryFn: reconApi.listRuns });
  const runId = latest?.[0]?.id;

  const { data, isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', runId, q, onlyMismatches, page],
    queryFn: () => reconApi.getLedger(runId!, { q, onlyMismatches: onlyMismatches.toString(), page, pageSize: PAGE_SIZE }),
    enabled: !!runId,
  });

  const tableCols = 5 + FIELDS.length; // code + vendor name + P2P + ERP + mismatches + field columns
  const showTableSkeleton = latestRunLoading || (!!runId && ledgerLoading);

  return (
    <div>
      <PageHeader eyebrow="Reconciliation Ledger" title="Vendor Master" />

      {/* Search & filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search by vendor code or name..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-ink-200 rounded-lg bg-white focus:border-accent-400 focus:outline-none"
          />
        </div>
        <Button
          variant={onlyMismatches ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => { setOnlyMismatches(!onlyMismatches); setPage(1); }}
        >
          <Filter className="w-3.5 h-3.5" /> {onlyMismatches ? 'Showing Mismatches' : 'All Vendors'}
        </Button>
      </div>

      {showTableSkeleton ? (
        <TableSkeleton rows={12} columns={tableCols} />
      ) : !runId ? (
        <EmptyState message="No reconciliation run yet. Upload vendor files and run a reconciliation first." />
      ) : (
        <>
          <Card className="overflow-hidden mb-4 p-0">
            <div className={`${TABLE_MAX_H} overflow-auto`}>
              <table className="w-full text-xs min-w-max">
                <thead className="sticky top-0 z-30">
                  <tr className="bg-ink-950 text-white shadow-sm">
                    <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-ink-950 z-40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]">Code · City</th>
                    <th className="px-3 py-2.5 text-left font-semibold min-w-[140px] max-w-[200px]">{VENDOR_NAME_FIELD.label}</th>
                    <th className="px-3 py-2.5 text-center font-semibold">In P2P</th>
                    <th className="px-3 py-2.5 text-center font-semibold">In ERP</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Mismatches</th>
                    {FIELDS.map((f) => (
                      <th key={f.label} className="px-3 py-2.5 text-center font-semibold">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((row, i) => (
                    <tr
                      key={row.id}
                      className={clsx(
                        'cursor-pointer transition-colors',
                        expanded === row.id ? 'bg-accent-50' : i % 2 === 0 ? 'bg-white' : 'bg-cream-50',
                        'hover:bg-accent-50/50',
                      )}
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      <td
                        className={clsx(
                          'px-3 py-2 font-mono font-medium text-ink-800 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]',
                          expanded === row.id ? 'bg-accent-50' : i % 2 === 0 ? 'bg-white' : 'bg-cream-50',
                        )}
                      >
                        <div>{row.vendorCode}</div>
                        <div className="text-[10px] font-sans text-ink-500 mt-0.5">{row.city || 'UNSPECIFIED'}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div
                          className="max-w-[200px] text-left text-ink-800 leading-snug"
                          title={row.vendorNameP2p && row.vendorNameErp && row.vendorNameP2p !== row.vendorNameErp
                            ? `P2P: ${row.vendorNameP2p}\nERP: ${row.vendorNameErp}`
                            : (row.vendorNameP2p || row.vendorNameErp || undefined)}
                        >
                          <p className="truncate text-[11px] font-medium">
                            {row.vendorNameP2p || row.vendorNameErp || '—'}
                          </p>
                          <div className="mt-1 flex justify-start">
                            <MatchBadge match={row.vendorNameMatch} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <MatchBadge match={row.presentInP2p} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <MatchBadge match={row.presentInErp} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={clsx(
                          'font-mono font-bold',
                          row.mismatchCount === 0 ? 'text-green-600' : 'text-red-600',
                        )}>
                          {row.mismatchCount}
                        </span>
                      </td>
                      {FIELDS.map((f) => (
                        <td key={f.label} className="px-3 py-2 text-center">
                          <MatchBadge match={(row as any)[f.match]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Expanded row detail */}
          {expanded && data?.items.find((r) => r.id === expanded) && (
            <RowDetail row={data.items.find((r) => r.id === expanded)!} />
          )}

          {/* Pagination */}
          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-ink-500">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
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

function RowDetail({ row }: { row: LedgerRow }) {
  return (
    <Card className="p-5 mb-4">
      <h3 className="text-sm font-semibold text-ink-800 mb-3">
        {row.vendorCode}
        <span className="text-ink-400 font-normal"> · {row.city || 'UNSPECIFIED'}</span>
        <span className="text-ink-500 font-normal"> — {row.vendorNameP2p || row.vendorNameErp}</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-ink-50">
              <th className="px-3 py-2 text-left font-semibold">Field</th>
              <th className="px-3 py-2 text-left font-semibold">P2P Value</th>
              <th className="px-3 py-2 text-left font-semibold">ERP Value</th>
              <th className="px-3 py-2 text-center font-semibold">Match</th>
            </tr>
          </thead>
          <tbody>
            {DETAIL_FIELDS.map((f) => {
              const match = (row as any)[f.match];
              return (
                <tr key={f.label} className={clsx(!match && 'bg-red-50/50')}>
                  <td className="px-3 py-2 font-medium">{f.label}</td>
                  <td className="px-3 py-2 font-mono text-ink-600">{(row as any)[f.p2p] || '—'}</td>
                  <td className="px-3 py-2 font-mono text-ink-600">{(row as any)[f.erp] || '—'}</td>
                  <td className="px-3 py-2 text-center"><MatchBadge match={match} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
