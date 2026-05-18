import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'QUEUED' | 'PARSING' | 'INGESTING' | 'COMPLETED' | 'FAILED';

/**
 * Sprint 4 — single pass after full parse (before DB flush).
 * Helps Finance/IT spot data quality issues BEFORE reconciliation runs.
 */
export interface IngestionInsights {
  totalAnalysed: number;
  missingCity: number;
  missingState: number;
  topCities: Array<{ value: string; count: number }>;
  topStates: Array<{ value: string; count: number }>;

  // Field completeness (count of vendors where field is empty)
  missingVendorName: number;
  missingPan: number;
  missingGst: number;
  missingMsme: number;
  missingIfsc: number;
  missingBankAccount: number;
  missingBankName: number;
  missingTds: number;

  // Format validation failures
  invalidPan: number;
  invalidGst: number;
  invalidIfsc: number;

  duplicateVendorCodes: number;
  duplicateCodesWithConflictingName: number;

  topVendorGroups: Array<{ value: string; count: number }>;
  topBankNames: Array<{ value: string; count: number }>;
  topPaymentTerms: Array<{ value: string; count: number }>;

  invalidPanSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
  invalidGstSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
  invalidIfscSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
}

export interface JobState {
  id: string;
  source: 'P2P' | 'ERP' | 'AUTO';
  status: JobStatus;

  // Progress
  rowsProcessed: number;
  uniqueVendors: number;
  saved: number;
  chunksCompleted: number;
  totalChunks?: number;       // unknown for streaming; estimated post-parse
  percentComplete: number;    // 0–100

  /** Transient UX text during ingestion (e.g. analysis / save phases). */
  message?: string;

  // Insights (computed once after full parse)
  insights: IngestionInsights;

  // Lifecycle
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;

  // Audit
  filename: string;
  fileSizeMB: number;

  // Optional reconciliation linkage
  triggeredReconRunId?: string;

  /** Unmatched essential Excel columns (ingest still proceeds; those fields stay empty). */
  columnWarnings?: string[];

  /** Verified canonical column indices (0-based) from column-mappings.ts; pan/gstin/msme = -1 for P2P (matrix). */
  p2pColumnMapping?: Record<string, number>;
  erpColumnMapping?: Record<string, number>;
}

const emptyInsights = (): IngestionInsights => ({
  totalAnalysed: 0,
  missingCity: 0,
  missingState: 0,
  topCities: [],
  topStates: [],
  missingVendorName: 0, missingPan: 0, missingGst: 0, missingMsme: 0,
  missingIfsc: 0, missingBankAccount: 0, missingBankName: 0, missingTds: 0,
  invalidPan: 0, invalidGst: 0, invalidIfsc: 0,
  duplicateVendorCodes: 0, duplicateCodesWithConflictingName: 0,
  topVendorGroups: [], topBankNames: [], topPaymentTerms: [],
  invalidPanSamples: [], invalidGstSamples: [], invalidIfscSamples: [],
});

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobs = new Map<string, JobState>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Auto-cleanup stale jobs (older than TTL) on each access.
   * Simple approach — for production, replace with a scheduled task.
   */
  private gc() {
    const now = Date.now();
    for (const [id, j] of this.jobs.entries()) {
      const age = now - j.startedAt.getTime();
      if (age > this.TTL_MS) this.jobs.delete(id);
    }
  }

  create(opts: { source: 'P2P' | 'ERP' | 'AUTO'; filename: string; fileSizeMB: number }): JobState {
    this.gc();
    const job: JobState = {
      id: uuidv4(),
      source: opts.source,
      status: 'QUEUED',
      rowsProcessed: 0,
      uniqueVendors: 0,
      saved: 0,
      chunksCompleted: 0,
      percentComplete: 0,
      insights: emptyInsights(),
      startedAt: new Date(),
      filename: opts.filename,
      fileSizeMB: opts.fileSizeMB,
    };
    this.jobs.set(job.id, job);
    this.logger.log(`📝 Job ${job.id.slice(0, 8)} created for ${opts.filename} (${opts.fileSizeMB.toFixed(1)} MB)`);
    return job;
  }

  get(id: string): JobState | null {
    return this.jobs.get(id) || null;
  }

  list(limit = 20): JobState[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /** Patch progress after a chunk is processed. */
  updateProgress(id: string, patch: Partial<JobState>) {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
  }

  /** Merge insights from a chunk into the running aggregate. */
  mergeInsights(id: string, chunkInsights: Partial<IngestionInsights>) {
    const job = this.jobs.get(id);
    if (!job) return;
    const ins = job.insights;
    for (const [k, v] of Object.entries(chunkInsights)) {
      if (typeof v === 'number') {
        (ins as any)[k] = ((ins as any)[k] || 0) + v;
      }
    }
  }

  /** Append example bad records (capped at 10 per category). */
  appendSamples(id: string, samples: {
    invalidPan?: Array<{ vendorCode: string; value: string; vendorName?: string }>;
    invalidGst?: Array<{ vendorCode: string; value: string; vendorName?: string }>;
    invalidIfsc?: Array<{ vendorCode: string; value: string; vendorName?: string }>;
  }) {
    const job = this.jobs.get(id);
    if (!job) return;
    const ins = job.insights;
    const mapPan = (s: { vendorCode: string; value: string; vendorName?: string }) => ({
      vendorCode: s.vendorCode,
      vendorName: s.vendorName ?? '',
      value: s.value,
    });
    if (samples.invalidPan) {
      ins.invalidPanSamples = [...ins.invalidPanSamples, ...samples.invalidPan.map(mapPan)].slice(0, 10);
    }
    if (samples.invalidGst) {
      ins.invalidGstSamples = [...ins.invalidGstSamples, ...samples.invalidGst.map(mapPan)].slice(0, 10);
    }
    if (samples.invalidIfsc) {
      ins.invalidIfscSamples = [...ins.invalidIfscSamples, ...samples.invalidIfsc.map(mapPan)].slice(0, 10);
    }
  }

  complete(id: string, finalState: Partial<JobState>) {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, finalState, {
      status: 'COMPLETED' as JobStatus,
      completedAt: new Date(),
      durationMs: Date.now() - job.startedAt.getTime(),
      percentComplete: 100,
      message: undefined,
    });
    this.logger.log(`✅ Job ${id.slice(0, 8)} completed: ${job.uniqueVendors} vendors, ${job.saved} saved`);
  }

  fail(id: string, error: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, {
      status: 'FAILED' as JobStatus,
      completedAt: new Date(),
      durationMs: Date.now() - job.startedAt.getTime(),
      error,
    });
    this.logger.error(`❌ Job ${id.slice(0, 8)} failed: ${error}`);
  }
}
