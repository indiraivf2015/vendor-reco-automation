import clsx from 'clsx';
import React from 'react';

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-xl border border-ink-100 shadow-soft', className)}>{children}</div>;
}

export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, className, type,
}: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md'; disabled?: boolean; className?: string; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50',
        variant === 'secondary' && 'bg-ink-100 text-ink-700 hover:bg-ink-200',
        variant === 'ghost' && 'text-ink-500 hover:bg-ink-50 hover:text-ink-700',
        disabled && 'cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  LOW: 'bg-green-100 text-green-700 border-green-200',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', SEV_COLORS[severity] || 'bg-ink-100 text-ink-600')}>
      {severity}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-50 text-red-600',
  IN_REVIEW: 'bg-yellow-50 text-yellow-600',
  RESOLVED: 'bg-green-50 text-green-600',
  IGNORED: 'bg-ink-50 text-ink-400',
  COMPLETED: 'bg-green-50 text-green-600',
  FAILED: 'bg-red-50 text-red-600',
  RUNNING: 'bg-blue-50 text-blue-600',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', STATUS_COLORS[status] || 'bg-ink-50 text-ink-500')}>
      {status}
    </span>
  );
}

export function MatchBadge({ match }: { match: boolean }) {
  return (
    <span className={clsx('inline-flex w-5 h-5 items-center justify-center rounded text-[10px] font-bold',
      match ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
    )}>
      {match ? '✓' : '✗'}
    </span>
  );
}

/** Matches paginated data tables — fixed viewport scroll area */
export const TABLE_SCROLL_MAX_H_CLASS = 'max-h-[min(70vh,560px)]';

/** Pulse bar for skeleton layouts */
export function SkeletonBar({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-ink-200/90', className)} />;
}

/**
 * Table-shaped skeleton inside the same Card + max-height as real tables.
 * Add to index.css: @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } } or use animate-pulse fallback below.
 */
export function TableSkeleton({
  rows = 12,
  columns = 10,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <Card className={clsx('overflow-hidden p-0 mb-4', className)}>
      <div className={`${TABLE_SCROLL_MAX_H_CLASS} overflow-hidden p-3`}>
        <table className="w-full text-xs border-separate border-spacing-y-2">
          <thead>
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="p-1.5 text-left align-bottom">
                  <div className="h-3 w-full animate-pulse rounded bg-ink-200/90" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri}>
                {Array.from({ length: columns }).map((_, ci) => (
                  <td key={ci} className="p-1.5">
                    <div className="h-8 w-full animate-pulse rounded bg-ink-100" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** KPI row + large panel placeholder for dashboard */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-ink-200" />
          <div className="h-8 w-64 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-ink-100" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-ink-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="px-4 py-3">
            <div className="h-3 w-20 mb-2 animate-pulse rounded bg-ink-200" />
            <div className="h-8 w-16 animate-pulse rounded bg-ink-100" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="h-20 px-4 py-3">
            <div className="h-3 w-28 mb-2 animate-pulse rounded bg-ink-200" />
            <div className="h-6 w-12 animate-pulse rounded bg-ink-100" />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="h-10 border-b border-ink-100 bg-ink-50/50" />
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-ink-50" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent-200 border-t-accent-500 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ink-400">
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <p className="eyebrow mb-1">{eyebrow}</p>
        <h1 className="text-2xl font-display font-semibold text-ink-900">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
