import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';
import { ReconRun } from '../../database/entities/recon-run.entity';
import { ReconLedger } from '../../database/entities/recon-ledger.entity';
import { ReconCategorySummary } from '../../database/entities/recon-category-summary.entity';
import { ReconException } from '../../database/entities/recon-exception.entity';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([P2pVendor, ErpVendor, ReconRun, ReconLedger, ReconCategorySummary, ReconException]),
    NotificationsModule, AuditModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
