/**
 * Single source of truth for category-label <-> ExceptionType mappings used by:
 *  - Dashboard.tsx (category-summary row → /exceptions?type=...)
 *  - Exceptions.tsx (filter dropdown + URL param sync)
 *
 * Keep in sync with backend reconciliation.service.ts RULES[].category and
 * recon-exception.entity.ts ExceptionType union.
 */

export type ExceptionTypeValue =
  | ''
  | 'VENDOR_NAME_MISMATCH'
  | 'PAN_MISMATCH'
  | 'GST_MISMATCH'
  | 'MSME_MISMATCH'
  | 'IFSC_MISMATCH'
  | 'BANK_ACCOUNT_MISMATCH'
  | 'BANK_NAME_MISMATCH'
  | 'TDS_MISMATCH'
  | 'PAYMENT_TERM_MISMATCH'
  | 'MISSING_IN_ERP'
  | 'MISSING_IN_P2P';

export interface MismatchCategoryOption {
  label: string;
  value: ExceptionTypeValue;
  hint?: string;
  /** Whether this category appears as a clickable row in the Dashboard summary table. */
  inDashboardSummary?: boolean;
}

export const MISMATCH_CATEGORIES: MismatchCategoryOption[] = [
  { label: 'All categories', value: '' },
  { label: 'Vendor Name',  value: 'VENDOR_NAME_MISMATCH',  inDashboardSummary: true },
  { label: 'PAN',          value: 'PAN_MISMATCH',          inDashboardSummary: true },
  { label: 'GST',          value: 'GST_MISMATCH',          inDashboardSummary: true },
  { label: 'MSME',         value: 'MSME_MISMATCH',         inDashboardSummary: true },
  { label: 'IFSC',         value: 'IFSC_MISMATCH',         inDashboardSummary: true },
  { label: 'Bank Account', value: 'BANK_ACCOUNT_MISMATCH', inDashboardSummary: true },
  { label: 'Bank Name',    value: 'BANK_NAME_MISMATCH',    inDashboardSummary: true },
  { label: 'TDS',          value: 'TDS_MISMATCH',          inDashboardSummary: true },
  { label: 'Payment Term', value: 'PAYMENT_TERM_MISMATCH', inDashboardSummary: true },
  { label: 'Missing in ERP (vendor)', value: 'MISSING_IN_ERP', hint: 'Vendor in P2P only' },
  { label: 'Missing in P2P (vendor)', value: 'MISSING_IN_P2P', hint: 'Vendor in ERP only' },
];

const LABEL_TO_TYPE: Record<string, ExceptionTypeValue> = MISMATCH_CATEGORIES.reduce(
  (acc, c) => {
    if (c.value) acc[c.label] = c.value;
    return acc;
  },
  {} as Record<string, ExceptionTypeValue>,
);

const TYPE_TO_LABEL: Record<string, string> = MISMATCH_CATEGORIES.reduce(
  (acc, c) => {
    if (c.value) acc[c.value] = c.label;
    return acc;
  },
  {} as Record<string, string>,
);

const DRILLABLE_TYPES = new Set(
  MISMATCH_CATEGORIES.filter((c) => c.inDashboardSummary).map((c) => c.value),
);

/** Returns the ExceptionType string for a dashboard category label, or null if not drillable. */
export function labelToType(label: string): ExceptionTypeValue | null {
  return LABEL_TO_TYPE[label] ?? null;
}

/** Returns the human label for an ExceptionType, falling back to the raw value. */
export function typeToLabel(type: string): string {
  return TYPE_TO_LABEL[type] ?? type.replace(/_/g, ' ');
}

/** True when the given type matches one of the 10 mismatch categories shown in the Dashboard summary. */
export function isDrillableType(type: string | null | undefined): type is ExceptionTypeValue {
  if (!type) return false;
  return DRILLABLE_TYPES.has(type as ExceptionTypeValue);
}
