import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExceptionsService } from './exceptions.service';
import { ExceptionStatus, ExceptionType, ExceptionSeverity } from '../../database/entities/recon-exception.entity';

@ApiTags('exceptions')
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly svc: ExceptionsService) {}

  @Get()
  list(
    @Query('runId') runId?: string,
    @Query('status') status?: ExceptionStatus,
    @Query('type') type?: ExceptionType,
    @Query('severity') severity?: ExceptionSeverity,
    @Query('vendorCode') vendorCode?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.list({
      runId, status, type, severity, vendorCode, q,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
  }

  @Get('counts')
  counts(@Query('runId') runId?: string) { return this.svc.severityCounts(runId); }

  @Get('grouped')
  grouped(
    @Query('runId') runId?: string,
    @Query('status') status?: ExceptionStatus,
    @Query('type') type?: ExceptionType,
    @Query('severity') severity?: ExceptionSeverity,
    @Query('vendorCode') vendorCode?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.getGrouped({
      runId, status, type, severity, vendorCode, q,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
  }

  @Get(':id')
  one(@Param('id') id: string) { return this.svc.getOne(id); }

  @Patch(':id/status')
  patchStatus(
    @Param('id') id: string,
    @Body() body: { status: ExceptionStatus; resolutionNotes?: string; resolvedBy?: string },
  ) {
    return this.svc.updateStatus(id, body);
  }
}
