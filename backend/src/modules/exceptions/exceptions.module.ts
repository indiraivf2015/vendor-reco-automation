import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconException } from '../../database/entities/recon-exception.entity';
import { ExceptionsService } from './exceptions.service';
import { ExceptionsController } from './exceptions.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReconException]), AuditModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
