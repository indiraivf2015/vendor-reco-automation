import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VendorsService, VendorSource } from './vendors.service';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly svc: VendorsService) {}

  @Get('stats')
  stats() { return this.svc.stats(); }

  @Get(':source')
  list(
    @Param('source') source: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.list(
      source.toUpperCase() as VendorSource,
      q,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
    );
  }

  @Get(':source/:code')
  byCode(
    @Param('source') source: string,
    @Param('code') code: string,
    @Query('city') city?: string,
  ) {
    const src = source.toUpperCase() as VendorSource;
    return city
      ? this.svc.getByCode(src, code, city)
      : this.svc.listByCode(src, code);
  }

  @Post(':source')
  upsert(@Param('source') source: string, @Body() dto: any) {
    return this.svc.upsertOne(source.toUpperCase() as VendorSource, dto);
  }

  @Post(':source/bulk')
  bulk(@Param('source') source: string, @Body() body: { vendors: any[] }) {
    return this.svc.bulkUpsert(source.toUpperCase() as VendorSource, body.vendors);
  }

  @Delete(':source')
  clear(@Param('source') source: string) {
    return this.svc.clearAll(source.toUpperCase() as VendorSource);
  }
}
