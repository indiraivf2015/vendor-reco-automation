import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { VendorsModule } from '../vendors/vendors.module';
import { AuditModule } from '../audit/audit.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [VendorsModule, AuditModule, ReconciliationModule, JobsModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
