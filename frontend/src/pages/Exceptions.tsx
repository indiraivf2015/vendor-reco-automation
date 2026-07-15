import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  exceptionsApi, ReconException, reconApi, reportsApi,
  GroupedExceptionVendorBlock, GroupedExceptionMismatch,
} from '../services/api';
import { MISMATCH_CATEGORIES, isDrillableType, typeToLabel } from '../services/categoryTypes';
import { Card, Button, PageHeader, EmptyState, SeverityBadge, StatusBadge, TableSkeleton } from '../components/ui';
import { Search, X, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { toast } from '../components/Toast';

const SEVERITIES = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['', 'OPEN', 'IN_REVIEW', 'RESOLVED', 'IGNORED'];

/** Query-string key used for deep-linking the category filter from the Dashboard. */
const TYPE_PARAM = 'type';

const PAGE_SIZE = 20;
const GROUP_PAGE_SIZE = 50;
const TABLE_MAX_H = 'max-h-[min(70vh,560px)]';

type ViewMode = 'flat' | 'grouped';

function blockKey(g: GroupedExceptionVendorBlock) {
  return `${g.vendorCode}||${g.city}`;
}

function blockPillClass(mismatches: GroupedExceptionMismatch[]) {
  if (mismatches.some((m) => m.severity === 'CRITICAL')) return 'bg-red-100 text-red-800';
  if (mismatches.some((m) => m.severity === 'HIGH')) return 'bg-amber-100 text-amber-900';
  return 'bg-ink-100 text-ink-600';
}

function mismatchToException(
  block: GroupedExceptionVendorBlock,
  m: GroupedExceptionMismatch,
): ReconException {
  return {
    id: m.id,
    vendorCode: block.vendorCode,
    city: block.city,
    vendorName: block.vendorName,
    type: m.type,
    severity: m.severity,
    status: m.status,
    fieldName: m.field,
    p2pValue: m.p2pValue,
    erpValue: m.erpValue,
    description: m.description ?? '',
    resolutionNotes: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '',
  };
}

function panRawLabel(v: string | null | undefined): { text: string; muted: boolean } {
  if (v === undefined || v === null) return { text: '(missing)', muted: true };
  if (v === '') return { text: '(empty)', muted: true };
  return { text: v, muted: false };
}

function panCellTitle(ex: ReconException, side: 'p2p' | 'erp'): string | undefined {
  if (ex.type !== 'PAN_MISMATCH') return undefined;
  const raw = side === 'p2p' ? ex.p2pValue : ex.erpValue;
  const norm = side === 'p2p' ? ex.p2pValueNormalized : ex.erpValueNormalized;
  const rawDesc = raw === null ? 'null' : raw === '' ? 'empty string' : String(raw);
  return `Stored: ${rawDesc}\nCompared (trim, remove spaces, uppercase): ${norm ?? '—'}`;
}

function PanMismatchDrawerPanel({ ex }: { ex: ReconException }) {
  const p2p = panRawLabel(ex.p2pValue);
  const erp = panRawLabel(ex.erpValue);
  const hints: string[] = [];
  if (ex.p2pContainsSpaces) hints.push('P2P contains spaces');
  if (ex.erpContainsSpaces) hints.push('ERP contains spaces');
  if (ex.p2pIsEmpty) hints.push('P2P is empty after trim');
  if (ex.erpIsEmpty) hints.push('ERP is empty after trim');

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-ink-400 uppercase">PAN — stored vs compared</p>
      <p className="text-xs text-ink-600">
        Compared values use the same rule as reconciliation: trim, remove all whitespace, then uppercase.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">P2P (stored)</p>
          <p className={clsx('text-xs font-mono break-all', p2p.muted && 'text-ink-500')}>{p2p.text}</p>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">ERP (stored)</p>
          <p className={clsx('text-xs font-mono break-all', erp.muted && 'text-ink-500')}>{erp.text}</p>
        </div>
      </div>
      <div className="bg-ink-50 p-3 rounded-lg border border-ink-100">
        <p className="text-[10px] font-bold text-ink-600 uppercase mb-1">Compared for reconciliation</p>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <span className="text-ink-500">P2P</span>
          <span className="break-all">{ex.p2pValueNormalized ?? '—'}</span>
          <span className="text-ink-500">ERP</span>
          <span className="break-all">{ex.erpValueNormalized ?? '—'}</span>
        </div>
      </div>
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hints.map((h) => (
            <span key={h} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium">
              {h}
            </span>
          ))}
        </div>
      )}
      {ex.normalizedPanMatch && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Compared PAN values match. If you still see this exception, it may be from an older run or the data may have changed since the exception was created.
        </p>
      )}
    </div>
  );
}

export default function Exceptions() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReconException | null>(null);
  const [notes, setNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(() => new Set());

  // Initialize categoryType from URL ?type=... so deep links from the Dashboard work.
  const initialType = (() => {
    const raw = searchParams.get(TYPE_PARAM) || '';
    return MISMATCH_CATEGORIES.some((c) => c.value === raw) ? raw : '';
  })();
  const [categoryType, setCategoryType] = useState(initialType);
  const [scopeLatestRun, setScopeLatestRun] = useState(true);
  const [exportingCategory, setExportingCategory] = useState(false);

  const { data: runs, isFetched: runsFetched } = useQuery({
    queryKey: ['latestRun'],
    queryFn: reconApi.listRuns,
  });
  const latestRunId = runs?.[0]?.id;

  /**
   * Keep ?type=... in sync with the categoryType filter state so:
   *   - reloading preserves the view
   *   - sharing the URL works
   *   - the browser back/forward buttons navigate filter history naturally
   */
  useEffect(() => {
    const current = searchParams.get(TYPE_PARAM) || '';
    if (current === categoryType) return;
    const next = new URLSearchParams(searchParams);
    if (categoryType) next.set(TYPE_PARAM, categoryType);
    else next.delete(TYPE_PARAM);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryType]);

  /**
   * React to external URL changes (e.g. a fresh deep-link from the Dashboard
   * after the page is already mounted, or browser back/forward).
   */
  useEffect(() => {
    const raw = searchParams.get(TYPE_PARAM) || '';
    const next = MISMATCH_CATEGORIES.some((c) => c.value === raw) ? raw : '';
    if (next !== categoryType) {
      setCategoryType(next);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** Active run id used by the "Export this category" button. */
  const activeRunId = scopeLatestRun ? (latestRunId || 'latest') : 'latest';
  const canExportCategory = isDrillableType(categoryType);

  async function handleExportCategory() {
    if (!canExportCategory || exportingCategory) return;
    setExportingCategory(true);
    const label = typeToLabel(categoryType);
    toast.info(`Generating "${label}" worklist… large categories can take a few seconds.`);
    try {
      const filename = await reportsApi.exportCategory(activeRunId, categoryType);
      toast.success(`Downloaded ${filename}`);
    } catch (e: any) {
      toast.error(e?.message || 'Category export failed. Try again or check server logs.');
    } finally {
      setExportingCategory(false);
    }
  }

  const filterParams = {
    q: q || undefined,
    severity: severity || undefined,
    status: status || undefined,
    type: categoryType || undefined,
    runId: scopeLatestRun && latestRunId ? latestRunId : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['exceptions', 'flat', q, severity, status, categoryType, scopeLatestRun, latestRunId, page],
    queryFn: () =>
      exceptionsApi.list({ ...filterParams, page, pageSize: PAGE_SIZE }),
    enabled: viewMode === 'flat' && (!scopeLatestRun || runsFetched),
  });

  const { data: groupedData, isLoading: groupedLoading } = useQuery({
    queryKey: ['exceptions', 'grouped', q, severity, status, categoryType, scopeLatestRun, latestRunId, page],
    queryFn: () =>
      exceptionsApi.getGrouped({ ...filterParams, page, pageSize: GROUP_PAGE_SIZE }),
    enabled: viewMode === 'grouped' && (!scopeLatestRun || runsFetched),
  });

  const showTableSkeleton = (scopeLatestRun && !runsFetched)
    || (viewMode === 'flat' && isLoading)
    || (viewMode === 'grouped' && groupedLoading);

  const toggleBlock = (key: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resolveMut = useMutation({
    mutationFn: () => exceptionsApi.updateStatus(selected!.id, {
      status: newStatus, resolutionNotes: notes, resolvedBy: 'dashboard-user',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exceptions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSelected(null);
      setNotes('');
    },
  });

  return (
    <div>
      <PageHeader eyebrow="Exception Management" title="Reconciliation Exceptions">
        <div className="flex bg-ink-100 rounded-lg p-0.5">
          {([
            { id: 'flat' as const, label: 'Flat list' },
            { id: 'grouped' as const, label: 'Grouped by vendor' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setViewMode(id); setPage(1); }}
              className={clsx(
                'px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap',
                viewMode === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Vendor code, name, or description..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-ink-200 rounded-lg bg-white focus:border-accent-400 focus:outline-none"
          />
        </div>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white">
          <option value="">All Severities</option>
          {SEVERITIES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white">
          <option value="">All Statuses</option>
          {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4 p-4 rounded-xl border border-ink-100 bg-cream-50/80">
        <div className="flex flex-col gap-1 min-w-[220px] flex-1 max-w-md">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Mismatch category (same as dashboard summary)
          </label>
          <select
            value={categoryType}
            onChange={(e) => { setCategoryType(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white font-medium text-ink-800"
          >
            {MISMATCH_CATEGORIES.map((c) => (
              <option key={c.value || 'all'} value={c.value} title={c.hint}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none pb-0.5">
          <input
            type="checkbox"
            checked={scopeLatestRun}
            onChange={(e) => { setScopeLatestRun(e.target.checked); setPage(1); }}
            className="rounded border-ink-300 text-accent-500 focus:ring-accent-400"
          />
          Latest run only
        </label>
        {scopeLatestRun && latestRunId && (
          <span className="text-xs text-ink-500 pb-0.5 font-mono">
            Run <span className="text-ink-700">{latestRunId.slice(0, 8)}</span>…
          </span>
        )}
        {scopeLatestRun && runsFetched && !latestRunId && (
          <span className="text-xs text-amber-700 pb-0.5">No reconciliation run yet — showing all exceptions</span>
        )}
        {canExportCategory && (
          <span
            title={`Download an Excel worklist of "${typeToLabel(categoryType)}" mismatches for the active run`}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCategory}
              disabled={exportingCategory}
            >
              {exportingCategory ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {exportingCategory ? 'Generating…' : 'Export this category'}
            </Button>
          </span>
        )}
      </div>

      {showTableSkeleton ? (
        <TableSkeleton rows={viewMode === 'flat' ? 12 : 8} columns={viewMode === 'flat' ? 9 : 4} />
      ) : viewMode === 'flat' && !data?.items.length ? (
        <EmptyState
          message={
            categoryType
              ? 'No exceptions in this category for the current filters. Try "All categories" or clear status filters.'
              : 'No exceptions found.'
          }
        />
      ) : viewMode === 'grouped' && !groupedData?.groups.length ? (
        <EmptyState
          message={
            categoryType
              ? 'No vendor groups in this category for the current filters. Try "All categories" or clear status filters.'
              : 'No exceptions found.'
          }
        />
      ) : viewMode === 'flat' ? (
        <>
          <Card className="overflow-hidden mb-4 p-0">
            <div className={`${TABLE_MAX_H} overflow-auto`}>
            <table className="w-full text-sm min-w-max">
              <thead className="sticky top-0 z-20">
                <tr className="bg-ink-950 text-white text-xs shadow-sm">
                  <th className="px-4 py-2.5 text-left font-semibold">Vendor · City</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Severity</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Field</th>
                  <th className="px-4 py-2.5 text-left font-semibold">P2P</th>
                  <th className="px-4 py-2.5 text-left font-semibold">ERP</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((e, i) => (
                  <tr key={e.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-cream-50', 'hover:bg-accent-50/30')}>
                    <td className="px-4 py-2 font-mono text-xs">
                      <div>{e.vendorCode}</div>
                      <div className="text-[10px] font-sans text-ink-500 mt-0.5">{e.city || 'UNSPECIFIED'}</div>
                    </td>
                    <td className="px-4 py-2 text-xs max-w-[160px] truncate">{e.vendorName}</td>
                    <td className="px-4 py-2 text-xs text-ink-500">{e.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-center"><SeverityBadge severity={e.severity} /></td>
                    <td className="px-4 py-2 text-center"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-2 text-xs text-ink-500">{e.fieldName || '—'}</td>
                    <td
                      className="px-4 py-2 text-xs font-mono max-w-[140px]"
                      title={panCellTitle(e, 'p2p')}
                    >
                      {e.type === 'PAN_MISMATCH' ? (
                        <div>
                          <div className="truncate">{panRawLabel(e.p2pValue).text}</div>
                          {e.p2pContainsSpaces ? (
                            <div className="text-[10px] text-amber-700 font-sans">Contains spaces</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="truncate block max-w-[140px]">{e.p2pValue || '—'}</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-xs font-mono max-w-[140px]"
                      title={panCellTitle(e, 'erp')}
                    >
                      {e.type === 'PAN_MISMATCH' ? (
                        <div>
                          <div className="truncate">{panRawLabel(e.erpValue).text}</div>
                          {e.erpContainsSpaces ? (
                            <div className="text-[10px] text-amber-700 font-sans">Contains spaces</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="truncate block max-w-[140px]">{e.erpValue || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Button variant="ghost" size="sm" onClick={() => { setSelected(e); setNewStatus(e.status); setNotes(''); }}>
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

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
      ) : groupedData ? (
        <>
          <p className="text-xs text-ink-500 mb-3">
            {groupedData.totalExceptions} exceptions across {groupedData.totalGroups} vendor locations
            {groupedData.totalGroups > GROUP_PAGE_SIZE ? ` (page ${page})` : ''}
          </p>
          <div className="space-y-3 mb-4">
            {groupedData.groups.map((g) => {
              const key = blockKey(g);
              const open = expandedBlocks.has(key);
              return (
                <Card key={key} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => toggleBlock(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-cream-50/80 transition-colors"
                  >
                    {open ? (
                      <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-ink-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-ink-900">{g.vendorName}</span>
                      <span className="text-sm text-ink-400"> · {g.city}</span>
                      <span className="text-xs font-mono text-ink-500 ml-2">{g.vendorCode}</span>
                    </div>
                    <span
                      className={clsx(
                        'text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0',
                        blockPillClass(g.mismatches),
                      )}
                    >
                      {g.issueCount} issue{g.issueCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-ink-100 overflow-auto max-h-[min(50vh,400px)]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-ink-50 text-xs text-ink-600">
                            <th className="px-4 py-2 text-left font-semibold">Field</th>
                            <th className="px-4 py-2 text-center font-semibold">Severity</th>
                            <th className="px-4 py-2 text-left font-semibold">P2P value</th>
                            <th className="px-4 py-2 text-left font-semibold">ERP value</th>
                            <th className="px-4 py-2 text-center font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.mismatches.map((m, i) => (
                            <tr key={m.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-cream-50')}>
                              <td className="px-4 py-2 text-xs text-ink-700">{m.field}</td>
                              <td className="px-4 py-2 text-center">
                                <SeverityBadge severity={m.severity} />
                              </td>
                              <td className="px-4 py-2 text-xs font-mono max-w-[180px] truncate">
                                {m.p2pValue || '—'}
                              </td>
                              <td className="px-4 py-2 text-xs font-mono max-w-[180px] truncate">
                                {m.erpValue || '—'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const ex = mismatchToException(g, m);
                                    setSelected(ex);
                                    setNewStatus(ex.status);
                                    setNotes('');
                                  }}
                                >
                                  Resolve
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {groupedData.totalGroups > GROUP_PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-ink-500">
              <span>
                Showing {(page - 1) * GROUP_PAGE_SIZE + 1}–
                {Math.min(page * GROUP_PAGE_SIZE, groupedData.totalGroups)} of {groupedData.totalGroups} vendor blocks
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}>Prev</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page * GROUP_PAGE_SIZE >= groupedData.totalGroups}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Resolution drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <h3 className="text-sm font-semibold">Resolve Exception</h3>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-ink-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-ink-400 uppercase mb-1">Vendor · City</p>
                <p className="text-sm font-mono">
                  {selected.vendorCode}
                  <span className="text-ink-400 ml-2">· {selected.city || 'UNSPECIFIED'}</span>
                </p>
                <p className="text-xs text-ink-500 mt-0.5">{selected.vendorName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-ink-400 uppercase mb-1">Exception</p>
                <p className="text-sm">{selected.description}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-ink-400 uppercase mb-1">Severity</p>
                  <SeverityBadge severity={selected.severity} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-ink-400 uppercase mb-1">Field</p>
                  <p className="text-sm">{selected.fieldName || 'N/A'}</p>
                </div>
              </div>
              {selected.type === 'PAN_MISMATCH' ? (
                <PanMismatchDrawerPanel ex={selected} />
              ) : selected.p2pValue != null || selected.erpValue != null ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">P2P Value</p>
                    <p className="text-xs font-mono break-all">{selected.p2pValue ?? '—'}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">ERP Value</p>
                    <p className="text-xs font-mono break-all">{selected.erpValue ?? '—'}</p>
                  </div>
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-semibold text-ink-500 mb-1">New Status</label>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white">
                  {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-500 mb-1">Resolution Notes</label>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3} placeholder="Describe how this was resolved..."
                  className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white focus:border-accent-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-ink-100">
              <Button onClick={() => resolveMut.mutate()} disabled={resolveMut.isPending} className="w-full">
                {resolveMut.isPending ? 'Saving...' : 'Update Exception'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
