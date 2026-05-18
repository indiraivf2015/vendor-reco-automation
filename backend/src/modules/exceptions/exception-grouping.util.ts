import { ExceptionSeverity } from '../../database/entities/recon-exception.entity';

/** Minimal fields required for grouping (entity or API row). */
export interface GroupableException {
  id: string;
  vendorCode: string;
  city: string;
  vendorName: string | null;
  type: string;
  severity: ExceptionSeverity | string;
  fieldName: string | null;
  p2pValue: string | null;
  erpValue: string | null;
  status?: string;
  description?: string | null;
}

export interface GroupedMismatch {
  id: string;
  field: string;
  severity: string;
  p2pValue: string | null;
  erpValue: string | null;
  type: string;
  status: string;
  description: string | null;
}

export interface GroupedVendorBlock {
  vendorCode: string;
  city: string;
  vendorName: string;
  issueCount: number;
  mismatches: GroupedMismatch[];
}

export interface GroupedExceptionsResult {
  groups: GroupedVendorBlock[];
  totalGroups: number;
  totalExceptions: number;
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function humanizeType(type: string): string {
  return type.replace(/_/g, ' ');
}

export function displayField(e: Pick<GroupableException, 'fieldName' | 'type'>): string {
  return e.fieldName?.trim() || humanizeType(e.type);
}

export function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity] ?? 4;
}

export function groupKey(vendorCode: string, city: string): string {
  return `${vendorCode}||${city}`;
}

export function formatGroupHeader(
  vendorName: string,
  city: string,
  vendorCode: string,
  issueCount: number,
): string {
  return `${vendorName} · ${city} (${vendorCode}) — ${issueCount} issue${issueCount === 1 ? '' : 's'}`;
}

function toMismatch(e: GroupableException): GroupedMismatch {
  return {
    id: e.id,
    field: displayField(e),
    severity: e.severity,
    p2pValue: e.p2pValue,
    erpValue: e.erpValue,
    type: e.type,
    status: e.status ?? 'OPEN',
    description: e.description ?? null,
  };
}

/** Group by (vendorCode, city); sort mismatches by severity; blocks worst-first. */
export function groupExceptions(items: GroupableException[]): GroupedExceptionsResult {
  const buckets = new Map<string, GroupableException[]>();

  for (const e of items) {
    const key = groupKey(e.vendorCode, e.city);
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  const groups: GroupedVendorBlock[] = [];

  for (const [, rows] of buckets) {
    const first = rows[0];
    const sorted = [...rows].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );
    groups.push({
      vendorCode: first.vendorCode,
      city: first.city,
      vendorName: first.vendorName?.trim() || first.vendorCode,
      issueCount: sorted.length,
      mismatches: sorted.map(toMismatch),
    });
  }

  groups.sort((a, b) => {
    if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
    return a.vendorCode.localeCompare(b.vendorCode);
  });

  return {
    groups,
    totalGroups: groups.length,
    totalExceptions: items.length,
  };
}
