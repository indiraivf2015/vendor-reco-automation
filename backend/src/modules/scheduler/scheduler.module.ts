import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReconciliationModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
