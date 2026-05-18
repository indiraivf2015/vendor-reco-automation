import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async log(data: Partial<AuditLog>) {
    return this.repo.save(this.repo.create(data));
  }

  async list(limit = 200) {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
