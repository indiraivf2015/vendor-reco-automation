import { nPan } from '../../common/normalize.util';
import { ReconException } from '../../database/entities/recon-exception.entity';

/** JSON-safe shape returned from list/getOne/patch for clients */
export type ReconExceptionResponse = Record<string, unknown>;

function toPlain(e: ReconException): ReconExceptionResponse {
  return {
    id: e.id,
    vendorCode: e.vendorCode,
    city: e.city,
    vendorName: e.vendorName,
    type: e.type,
    severity: e.severity,
    status: e.status,
    fieldName: e.fieldName,
    p2pValue: e.p2pValue,
    erpValue: e.erpValue,
    description: e.description,
    resolutionNotes: e.resolutionNotes,
    resolvedBy: e.resolvedBy,
    resolvedAt: e.resolvedAt,
    runId: e.runId,
    createdAt: e.createdAt,
  };
}

/** Adds PAN comparison context (same rules as reconciliation `nPan`). */
export function enrichExceptionResponse(e: ReconException): ReconExceptionResponse {
  const base = toPlain(e);
  if (e.type !== 'PAN_MISMATCH') return base;

  const p2pRaw = e.p2pValue != null ? String(e.p2pValue) : '';
  const erpRaw = e.erpValue != null ? String(e.erpValue) : '';
  const p2n = nPan(p2pRaw);
  const ern = nPan(erpRaw);

  return {
    ...base,
    p2pValueNormalized: p2n || null,
    erpValueNormalized: ern || null,
    p2pContainsSpaces: /\s/.test(p2pRaw),
    erpContainsSpaces: /\s/.test(erpRaw),
    p2pIsEmpty: p2pRaw.trim() === '',
    erpIsEmpty: erpRaw.trim() === '',
    /** True when both sides normalize to the same non-empty PAN (e.g. legacy row before re-run). */
    normalizedPanMatch: Boolean(p2n && ern && p2n === ern),
  };
}
