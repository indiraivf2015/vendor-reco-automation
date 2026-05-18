import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

// Use the @nestjs/schedule-bundled cron to avoid version mismatch with the
// project's `cron` dep. @nestjs/schedule wraps cron internally; we instantiate
// it via the SchedulerRegistry pattern using its own CronJob.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CronJob } = require('@nestjs/schedule/node_modules/cron');

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly recon: ReconciliationService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const expr = this.cfg.get<string>('RECON_CRON') || '0 6 * * *';
    const job = new CronJob(expr, async () => {
      this.logger.log(`Daily recon firing (${expr})...`);
      try {
        await this.recon.runReconciliation({ trigger: 'SCHEDULED', triggeredBy: 'cron' });
      } catch (e: any) {
        this.logger.error(`Scheduled run failed: ${e.message}`);
      }
    });
    this.registry.addCronJob('daily-recon', job);
    job.start();
    this.logger.log(`Scheduled daily reconciliation: ${expr}`);
  }
}
