import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { P2pVendor } from './database/entities/p2p-vendor.entity';
import { ErpVendor } from './database/entities/erp-vendor.entity';
import { ReconRun } from './database/entities/recon-run.entity';
import { ReconLedger } from './database/entities/recon-ledger.entity';
import { ReconCategorySummary } from './database/entities/recon-category-summary.entity';
import { ReconException } from './database/entities/recon-exception.entity';
import { AuditLog } from './database/entities/audit-log.entity';

import { VendorsModule } from './modules/vendors/vendors.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { ExceptionsModule } from './modules/exceptions/exceptions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SeedModule } from './modules/seed/seed.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const useSsl = (cfg.get<string>('DB_SSL') || 'true').toLowerCase() !== 'false';
        return {
          type: 'postgres' as const,
          host: cfg.get<string>('DB_HOST') || 'localhost',
          port: parseInt(cfg.get<string>('DB_PORT') || '5432', 10),
          username: cfg.get<string>('DB_USERNAME') || 'postgres',
          password: cfg.get<string>('DB_PASSWORD') || 'postgres',
          database: cfg.get<string>('DB_DATABASE') || 'vendor_recon',
          ssl: useSsl ? { rejectUnauthorized: false } : false,
          extra: useSsl ? { ssl: { rejectUnauthorized: false } } : undefined,
          entities: [
            P2pVendor,
            ErpVendor,
            ReconRun,  
            ReconLedger,
            ReconCategorySummary,
            ReconException,
            AuditLog,
          ],
          synchronize: true,
          logging:
            cfg.get('NODE_ENV') === 'development'
              ? (['error', 'warn'] as ('error' | 'warn')[])
              : (['error'] as ('error')[]),
        };
      },
    }),
    VendorsModule,
    ReconciliationModule,
    ExceptionsModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    SchedulerModule,
    SeedModule,
    UploadsModule,
    JobsModule,
  ],
})
export class AppModule {}