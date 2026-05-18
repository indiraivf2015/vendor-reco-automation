import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.jobs.list(limit ? parseInt(limit, 10) : 20);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found (may have expired after 1 hour).`);
    return job;
  }
}
