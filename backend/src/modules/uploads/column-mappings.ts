/**
 * Verified canonical-field → column-name aliases for P2P and ERP files.
 * Primary alias = actual column name in current Indira IVF exports.
 * Fallback aliases = forward compatibility against minor renames.
 */

export type CanonicalField =
  | 'vendorCode'
  | 'vendorName'
  | 'city'
  | 'state'
  | 'pan'
  | 'gstin'
  | 'msme'
  | 'bankAccount'
  | 'bankName'
  | 'ifscCode'
  | 'tdsSection';

export const ALL_CANONICAL_FIELDS: CanonicalField[] = [
  'vendorCode',
  'vendorName',
  'city',
  'state',
  'pan',
  'gstin',
  'msme',
  'bankAccount',
  'bankName',
  'ifscCode',
  'tdsSection',
];

export const P2P_COLUMN_ALIASES: Record<CanonicalField, string[]> = {
  vendorCode: ['Vendor Code', 'VendorCode', 'Supplier Code'],
  vendorName: ['Vendor Name', 'VendorName', 'Supplier Name'],
  city: ['City', 'Cityname', 'CITY'],
  state: ['State', 'STATE'],
  pan: ['PAN No.', 'PAN', 'PAN Number'],
  gstin: ['GST No.', 'GSTIN', 'GST Number'],
  msme: ['MSME No.', 'MSME', 'Udyam', 'MSME Number'],
  bankAccount: ['Bank Ref', 'Bank Reference', 'BankRef', 'Bank Account'],
  bankName: ['Bank Name', 'BankName'],
  ifscCode: ['IFSCCode', 'IFSC Code', 'IFSC'],
  tdsSection: ['TDS\nSection', 'TDS Section', 'TDSSection', 'TDS'],
};

export const ERP_COLUMN_ALIASES: Record<CanonicalField, string[]> = {
  vendorCode: ['VENDOR_NUMBER', 'Vendor Code', 'Vendor Number', 'Supplier Number'],
  vendorName: ['VENDOR_NAME', 'Vendor Name', 'Supplier Name'],
  city: ['CITY', 'City'],
  state: ['STATE', 'State'],
  pan: ['PAN_NUMBER', 'Pan No.', 'PAN No.', 'PAN'],
  gstin: ['SUPPLIER_GSTIN', 'GST No.', 'GSTIN', 'GST Number'],
  // MSME_CODE = Udyam registration; plain 'MSME' is size category (Micro/Small/Medium) — not used for msmeNumber.
  msme: ['MSME_CODE', 'MSME_CODE_S', 'MSME NO.', 'MSME No.', 'MSME Number', 'Udyam'],
  bankAccount: ['BANK_ACCOUNT_NUM_S', 'BANK_ACCOUNT_NUM', 'Bank Account Number', 'Account Number'],
  bankName: ['BANK_NAME_S', 'BANK_NAME', 'Bank Name'],
  ifscCode: ['BRANCH_NUM_S', 'BRANCH_NUMBER', 'IFSC', 'IFSC Code'],
  tdsSection: ['WITHHOLD_TAX_GRP', 'TDS Section', 'TDS Group'],
};

/** Lowercase, trim, collapse whitespace (incl. newlines) to single spaces. */
export function normalizeHeaderLabel(s: unknown): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveColumnIndex(header: unknown[], aliases: string[]): number {
  const normalizedHeader = header.map(normalizeHeaderLabel);
  for (const alias of aliases) {
    const idx = normalizedHeader.indexOf(normalizeHeaderLabel(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

export type ResolveAllColumnsOptions = { skipFields?: readonly CanonicalField[] };

export function resolveAllColumns(
  header: string[],
  aliasMap: Record<CanonicalField, string[]>,
  sourceLabel: string,
  logger?: { log: (s: string) => void; warn: (s: string) => void },
  options?: ResolveAllColumnsOptions,
): Record<CanonicalField, number> {
  const result = {} as Record<CanonicalField, number>;
  for (const f of ALL_CANONICAL_FIELDS) {
    result[f] = -1;
  }
  const skip = new Set(options?.skipFields ?? []);

  for (const field of ALL_CANONICAL_FIELDS) {
    if (skip.has(field)) continue;
    const aliases = aliasMap[field];
    const idx = resolveColumnIndex(header, aliases);
    result[field] = idx;
    if (idx >= 0) {
      const colName = String(header[idx] ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const colOneBased = String(idx + 1).padStart(3);
      logger?.log(
        `[${sourceLabel}] ${field.padEnd(12)} → col ${colOneBased} ("${colName}")`,
      );
    } else {
      logger?.warn(
        `[${sourceLabel}] ${field.padEnd(12)} → NOT FOUND. Tried: ${aliases.join(' | ')}`,
      );
    }
  }
  return result;
}

/** P2P statutory matrix: Statutory Name cell matches a known PAN/GST/MSME label. */
export function matchesStatutoryP2p(statNameRaw: string, field: 'pan' | 'gstin' | 'msme'): boolean {
  const n = normalizeHeaderLabel(statNameRaw);
  for (const a of P2P_COLUMN_ALIASES[field]) {
    if (normalizeHeaderLabel(a) === n) return true;
  }
  return false;
}
