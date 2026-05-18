import { Card, StatusBadge } from './ui';
import type { JobState } from '../services/api';

function sourceLabel(source: JobState['source']): 'P2P' | 'ERP' {
  return source === 'P2P' ? 'P2P' : 'ERP';
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-ink-800">{value}</p>
    </div>
  );
}

export function JobInsights({ job }: { job: JobState }) {
  const { insights: ins } = job;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-800">Data quality & insights</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {sourceLabel(job.source)} · {job.filename}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <span className="text-xs font-medium text-ink-600 tabular-nums">{job.percentComplete}%</span>
        </div>
      </div>

      {job.message && (
        <p className="text-xs text-accent-600 mb-4 rounded-lg bg-accent-50 border border-accent-100 px-3 py-2">
          {job.message}
        </p>
      )}

      {job.error && (
        <p className="text-xs text-red-600 mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          {job.error}
        </p>
      )}

      {(job.p2pColumnMapping || job.erpColumnMapping) && (
        <details className="text-xs bg-ink-50 border border-ink-100 p-3 rounded-lg mb-4 text-ink-700">
          <summary className="cursor-pointer font-semibold text-ink-800">
            Column mapping (click to verify)
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 text-ink-600">
            {job.p2pColumnMapping && (
              <div>
                <p className="font-medium mb-1 text-ink-800">P2P columns</p>
                <ul className="space-y-0.5">
                  {Object.entries(job.p2pColumnMapping).map(([field, idx]) => (
                    <li key={field} className={Number(idx) < 0 ? 'text-red-600' : ''}>
                      {field}: {Number(idx) >= 0 ? `col ${Number(idx) + 1}` : '✗ not found'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {job.erpColumnMapping && (
              <div>
                <p className="font-medium mb-1 text-ink-800">ERP columns</p>
                <ul className="space-y-0.5">
                  {Object.entries(job.erpColumnMapping).map(([field, idx]) => (
                    <li key={field} className={Number(idx) < 0 ? 'text-red-600' : ''}>
                      {field}: {Number(idx) >= 0 ? `col ${Number(idx) + 1}` : '✗ not found'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
        <Stat label="Vendors analysed" value={ins.totalAnalysed} />
        <Stat label="Rows processed" value={job.rowsProcessed} />
        <Stat label="Unique vendors" value={job.uniqueVendors} />
        <Stat label="Saved" value={job.saved} />
        <Stat label="Missing city" value={ins.missingCity} />
        <Stat label="Missing state" value={ins.missingState} />
        <Stat label="Dup. codes (multi-row)" value={ins.duplicateVendorCodes} />
        <Stat label="Name conflicts" value={ins.duplicateCodesWithConflictingName} />
        <Stat label="Missing PAN" value={ins.missingPan} />
        <Stat label="Invalid PAN" value={ins.invalidPan} />
        <Stat label="Missing GST" value={ins.missingGst} />
        <Stat label="Invalid GST" value={ins.invalidGst} />
        <Stat label="Missing IFSC" value={ins.missingIfsc} />
        <Stat label="Invalid IFSC" value={ins.invalidIfsc} />
        <Stat label="Missing bank acct" value={ins.missingBankAccount} />
        <Stat label="Missing TDS" value={ins.missingTds} />
      </div>

      {(ins.topBankNames.length > 0 || ins.topVendorGroups.length > 0 || ins.topPaymentTerms.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {ins.topBankNames.length > 0 && (
            <TopList title="Top banks" items={ins.topBankNames} />
          )}
          {ins.topVendorGroups.length > 0 && (
            <TopList title="Top vendor groups" items={ins.topVendorGroups} />
          )}
          {ins.topPaymentTerms.length > 0 && (
            <TopList title="Top payment terms" items={ins.topPaymentTerms} />
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold text-ink-600 mb-2">Top cities</p>
          <ul className="text-xs space-y-1 max-h-36 overflow-y-auto">
            {ins.topCities.length === 0 ? (
              <li className="text-ink-400">—</li>
            ) : (
              ins.topCities.map((c) => (
                <li key={c.value} className="flex justify-between gap-2 border-b border-ink-50 py-1">
                  <span className="text-ink-700 truncate">{c.value}</span>
                  <span className="tabular-nums text-ink-500 shrink-0">{c.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-600 mb-2">Top states</p>
          <ul className="text-xs space-y-1 max-h-36 overflow-y-auto">
            {ins.topStates.length === 0 ? (
              <li className="text-ink-400">—</li>
            ) : (
              ins.topStates.map((c) => (
                <li key={c.value} className="flex justify-between gap-2 border-b border-ink-50 py-1">
                  <span className="text-ink-700 truncate">{c.value}</span>
                  <span className="tabular-nums text-ink-500 shrink-0">{c.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {(ins.invalidPanSamples.length > 0 || ins.invalidGstSamples.length > 0 || ins.invalidIfscSamples.length > 0) && (
        <div className="border-t border-ink-100 pt-4">
          <p className="text-xs font-semibold text-ink-600 mb-2">Sample format issues</p>
          <div className="grid md:grid-cols-3 gap-3 text-[11px]">
            {ins.invalidPanSamples.length > 0 && (
              <SampleList title="Invalid PAN" rows={ins.invalidPanSamples} />
            )}
            {ins.invalidGstSamples.length > 0 && (
              <SampleList title="Invalid GST" rows={ins.invalidGstSamples} />
            )}
            {ins.invalidIfscSamples.length > 0 && (
              <SampleList title="Invalid IFSC" rows={ins.invalidIfscSamples} />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function TopList({ title, items }: { title: string; items: Array<{ value: string; count: number }> }) {
  return (
    <Card className="p-4">
      <h4 className="text-[10px] font-semibold tracking-wider text-ink-500 uppercase mb-2">{title}</h4>
      <div className="space-y-1 text-xs max-h-36 overflow-y-auto">
        {items.slice(0, 10).map((it, i) => (
          <div key={`${it.value}-${i}`} className="flex items-center justify-between gap-2">
            <span className="truncate text-ink-700" title={it.value}>{it.value || '(empty)'}</span>
            <span className="font-mono text-ink-400 shrink-0">{it.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SampleList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ vendorCode: string; vendorName: string; value: string }>;
}) {
  return (
    <div className="rounded-lg border border-ink-100 overflow-hidden">
      <p className="bg-ink-50 px-2 py-1 font-semibold text-ink-600">{title}</p>
      <ul className="max-h-32 overflow-y-auto divide-y divide-ink-50">
        {rows.map((r, i) => (
          <li key={`${r.vendorCode}-${i}`} className="px-2 py-1">
            <span className="font-mono text-ink-800">{r.vendorCode}</span>
            {r.vendorName ? <span className="text-ink-500"> · {r.vendorName}</span> : null}
            <span className="block text-red-600 truncate" title={r.value}>
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
