import { SelectQueryBuilder } from 'typeorm';
import {
  ReconException, ExceptionStatus, ExceptionType, ExceptionSeverity,
} from '../../database/entities/recon-exception.entity';

export interface ExceptionListFilters {
  runId?: string;
  status?: ExceptionStatus | ExceptionStatus[];
  type?: ExceptionType;
  severity?: ExceptionSeverity;
  vendorCode?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function applyListFilters(
  qb: SelectQueryBuilder<ReconException>,
  filters: Omit<ExceptionListFilters, 'page' | 'pageSize'>,
): void {
  if (filters.runId) qb.andWhere('e.runId = :rid', { rid: filters.runId });
  if (filters.type) qb.andWhere('e.type = :t', { t: filters.type });
  if (filters.severity) qb.andWhere('e.severity = :s', { s: filters.severity });
  if (filters.vendorCode) qb.andWhere('e.vendorCode = :vc', { vc: filters.vendorCode });
  if (filters.status) {
    const arr = Array.isArray(filters.status) ? filters.status : [filters.status];
    qb.andWhere('e.status IN (:...st)', { st: arr });
  }
  if (filters.q) {
    qb.andWhere(
      '(e.vendorCode LIKE :q OR e.vendorName LIKE :q OR e.description LIKE :q)',
      { q: `%${filters.q}%` },
    );
  }
}

export const EXCEPTION_SEVERITY_ORDER_SQL = `CASE e.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`;
