import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.svc.list(limit ? parseInt(limit, 10) : 200);
  }
}
