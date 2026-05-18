import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  @Post('run')
  triggerRun(@Body() body: { triggeredBy?: string }) {
    return this.svc.runReconciliation({ trigger: 'MANUAL', triggeredBy: body?.triggeredBy || 'manual-user' });
  }

  @Get('runs')
  listRuns(@Query('limit') limit?: string) {
    return this.svc.listRuns(limit ? parseInt(limit, 10) : 50);
  }

  @Get('runs/latest')
  latest() { return this.svc.getLatestRun(); }

  @Get('runs/:id')
  getRun(@Param('id') id: string) { return this.svc.getRun(id); }

  @Get('runs/:id/summary')
  getSummary(@Param('id') id: string) { return this.svc.getRunSummary(id); }

  @Get('runs/:id/ledger')
  getLedger(
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('onlyMismatches') onlyMismatches?: string,
  ) {
    return this.svc.getRunLedger(
      id, q,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 100,
      onlyMismatches === 'true',
    );
  }

  @Get('dashboard')
  dashboard() { return this.svc.dashboardSummary(); }
}
