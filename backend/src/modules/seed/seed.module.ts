import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([P2pVendor, ErpVendor])],
  providers: [SeedService],
})
export class SeedModule {}
