import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('latest.xlsx')
  async latest(@Res() res: Response) {
    const { buffer, filename } = await this.svc.generateLatestReport();
    this.send(res, buffer, filename);
  }

  @Get('runs/:id.xlsx')
  async byRun(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.svc.generateRunReport(id);
    this.send(res, buffer, filename);
  }

  private send(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
