import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';

@Module({
  imports: [TypeOrmModule.forFeature([P2pVendor, ErpVendor])],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
