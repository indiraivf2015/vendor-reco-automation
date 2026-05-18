import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconRun } from '../../database/entities/recon-run.entity';
import { ReconLedger } from '../../database/entities/recon-ledger.entity';
import { ReconCategorySummary } from '../../database/entities/recon-category-summary.entity';
import { ReconException } from '../../database/entities/recon-exception.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReconRun, ReconLedger, ReconCategorySummary, ReconException])],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
