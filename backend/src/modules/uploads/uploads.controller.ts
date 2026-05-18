import {
  Controller, Post, Query, UploadedFile, UseInterceptors, BadRequestException, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, statSync } from 'fs';
import { UploadsService } from './uploads.service';
import { JobsService } from '../jobs/jobs.service';

const uploadDir = join(process.cwd(), 'tmp-uploads');
try { mkdirSync(uploadDir, { recursive: true }); } catch {}

const storage = diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`;
    cb(null, unique);
  },
});

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Async upload. Returns 202 with { jobId } immediately.
   * Client polls GET /api/jobs/:jobId for progress + insights.
   */
  @Post('vendors')
  @HttpCode(202)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  }))
  async uploadVendors(
    @UploadedFile() file: any,
    @Query('source') source?: 'P2P' | 'ERP',
    @Query('runRecon') runRecon?: string,
    @Query('replaceDataset') replaceDataset?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');

    const stats = statSync(file.path);
    const fileSizeMB = stats.size / (1024 * 1024);

    const job = this.jobs.create({
      source: source || 'AUTO',
      filename: file.originalname,
      fileSizeMB,
    });

    // Fire-and-forget — never await; client polls /api/jobs/:id for status
    this.uploads.processInBackground({
      jobId: job.id,
      filePath: file.path,
      declaredSource: source,
      replaceDataset: replaceDataset === 'true',
      runRecon: runRecon === 'true',
    }).catch(() => {/* errors already captured in job state */});

    return {
      jobId: job.id,
      status: job.status,
      filename: file.originalname,
      fileSizeMB: Math.round(fileSizeMB * 10) / 10,
      pollUrl: `/api/jobs/${job.id}`,
      message: 'Upload queued. Poll the status URL for progress and insights.',
    };
  }
}
