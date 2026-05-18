import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconException, ExceptionStatus } from '../../database/entities/recon-exception.entity';
import { AuditService } from '../audit/audit.service';
import { enrichExceptionResponse } from './exception-response.util';
import {
  applyListFilters, ExceptionListFilters, EXCEPTION_SEVERITY_ORDER_SQL,
} from './exceptions-filter.util';
import { groupExceptions } from './exception-grouping.util';

@Injectable()
export class ExceptionsService {
  constructor(
    @InjectRepository(ReconException) private readonly repo: Repository<ReconException>,
    private readonly audit: AuditService,
  ) {}

  async list(filters: ExceptionListFilters) {
    const qb = this.repo.createQueryBuilder('e');
    applyListFilters(qb, filters);
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(200, filters.pageSize || 50);
    qb.orderBy(EXCEPTION_SEVERITY_ORDER_SQL, 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((e) => enrichExceptionResponse(e)),
      total,
      page,
      pageSize,
    };
  }

  async getGrouped(filters: ExceptionListFilters) {
    const qb = this.repo.createQueryBuilder('e');
    applyListFilters(qb, filters);
    qb.orderBy(EXCEPTION_SEVERITY_ORDER_SQL, 'ASC').addOrderBy('e.createdAt', 'DESC');
    const items = await qb.getMany();
    const { groups: allGroups, totalGroups, totalExceptions } = groupExceptions(items);

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(200, filters.pageSize || 50);
    const groups = allGroups.slice((page - 1) * pageSize, page * pageSize);

    return {
      groups,
      totalGroups,
      totalExceptions,
      page,
      pageSize,
    };
  }

  async getOne(id: string) {
    const ex = await this.repo.findOne({ where: { id } });
    if (!ex) throw new NotFoundException(`Exception ${id} not found`);
    return enrichExceptionResponse(ex);
  }

  async updateStatus(id: string, payload: { status: ExceptionStatus; resolutionNotes?: string; resolvedBy?: string }) {
    const ex = await this.repo.findOne({ where: { id } });
    if (!ex) throw new NotFoundException(`Exception ${id} not found`);
    ex.status = payload.status;
    if (payload.resolutionNotes !== undefined) ex.resolutionNotes = payload.resolutionNotes;
    if (payload.status === 'RESOLVED' || payload.status === 'IGNORED') {
      ex.resolvedAt = new Date();
      ex.resolvedBy = payload.resolvedBy || 'user';
    }
    await this.repo.save(ex);
    await this.audit.log({
      action: 'EXCEPTION_UPDATED', entityType: 'ReconException', entityId: id,
      userIdentifier: payload.resolvedBy || 'user',
      details: `Status: ${payload.status}${payload.resolutionNotes ? ' | ' + payload.resolutionNotes : ''}`,
    });
    return enrichExceptionResponse(ex);
  }

  async severityCounts(runId?: string) {
    const where: Record<string, string> = {};
    if (runId) where.runId = runId;
    const all = await this.repo.find({ where });
    return {
      CRITICAL: all.filter((e) => e.severity === 'CRITICAL').length,
      HIGH: all.filter((e) => e.severity === 'HIGH').length,
      MEDIUM: all.filter((e) => e.severity === 'MEDIUM').length,
      LOW: all.filter((e) => e.severity === 'LOW').length,
      OPEN: all.filter((e) => e.status === 'OPEN').length,
      RESOLVED: all.filter((e) => e.status === 'RESOLVED').length,
      total: all.length,
    };
  }
}
