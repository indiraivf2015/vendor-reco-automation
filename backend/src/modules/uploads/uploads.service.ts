import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { VendorsService } from '../vendors/vendors.service';
import { AuditService } from '../audit/audit.service';
import { JobsService, IngestionInsights } from '../jobs/jobs.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { n, nPan } from '../../common/normalize.util';
import {
  ALL_CANONICAL_FIELDS,
  ERP_COLUMN_ALIASES,
  P2P_COLUMN_ALIASES,
  matchesStatutoryP2p,
  normalizeHeaderLabel,
  resolveAllColumns,
} from './column-mappings';

// ─── Robust Excel column resolution (P2P / ERP) ─────────────────────────────

interface ColumnResolution {
  idx: number;
  matchedAs: string;
  strategy: 'exact' | 'suffix-strip' | 'partial' | 'unmatched';
}

/** Canonical key: uppercase + strip spaces, underscores, dashes, parens, dots, newlines, tabs. */
function canonicalKey(s: string): string {
  return String(s ?? '')
    .replace(/[_\s\-.\u0028\u0029\n\r\t]/g, '')
    .toUpperCase();
}

/** Strip common Oracle/ERP suffixes from the raw header label. */
function stripCommonSuffix(s: string): string {
  return String(s ?? '')
    .replace(/_S$/i, '')
    .replace(/_C$/i, '')
    .replace(/\(S\)$/i, '')
    .replace(/\(C\)$/i, '');
}

/** Exact canonical → suffix-stripped header → partial substring (alias length ≥ 5 to limit noise). */
function resolveColumn(headers: string[], aliases: string[]): ColumnResolution {
  const norm = headers.map((h, i) => ({
    idx: i,
    raw: h ?? '',
    canonical: canonicalKey(h),
    canonicalNoSuffix: canonicalKey(stripCommonSuffix(h)),
  }));

  for (const alias of aliases) {
    const k = canonicalKey(alias);
    const found = norm.find((h) => h.canonical === k);
    if (found) return { idx: found.idx, matchedAs: found.raw, strategy: 'exact' };
  }

  for (const alias of aliases) {
    const k = canonicalKey(alias);
    const found = norm.find((h) => h.canonicalNoSuffix === k);
    if (found) return { idx: found.idx, matchedAs: found.raw, strategy: 'suffix-strip' };
  }

  for (const alias of aliases) {
    const k = canonicalKey(alias);
    if (k.length < 5) continue;
    const found = norm.find(
      (h) => h.canonical.length >= 5
        && (h.canonical.includes(k) || k.includes(h.canonical)),
    );
    if (found) return { idx: found.idx, matchedAs: found.raw, strategy: 'partial' };
  }

  return { idx: -1, matchedAs: '', strategy: 'unmatched' };
}

/**
 * P2P columns not covered by verified `P2P_COLUMN_ALIASES` header map.
 * Core vendor / bank / city / state / TDS use column-mappings.ts (never "Bank Clearing No.").
 */
const P2P_LEGACY_ALIASES: Record<string, string[]> = {
  vendorType: ['Vendor Type', 'VendorType'],
  vendorCategory: ['Vendor Category'],
  vendorGroup: ['Vendor Group'],
  residentStatus: ['Resident Status'],
  applicantType: ['Applicant Type'],
  hold: ['Hold'],
  pincode: ['Pincode', 'Pin Code', 'Postal Code'],
  address: ['Address Line1', 'Address1', 'Address'],
  sname: ['Statutory Name', 'StatutoryName'],
  sval: ['Value', 'Statutory Value'],
  createdBy: ['Created By'],
  approvedBy: ['Approved By'],
  status: ['Approval Status', 'Status'],
  activeStatus: ['Active Status', 'ActiveStatus'],
};

/** ERP columns not covered by verified `ERP_COLUMN_ALIASES` (site-level bank/IFSC preferred there). */
const ERP_LEGACY_ALIASES: Record<string, string[]> = {
  vendorId: ['VENDOR_ID', 'VENDOR_ID_S'],
  partyId: ['PARTY_ID', 'PARTY_ID_S'],
  taxOrgType: ['TAX_ORG_TYPE', 'TAX_ORG_TYPE_S'],
  vendorTypeLookupCode: ['VENDOR_TYPE_LOOKUP_CODE', 'VENDOR_TYPE_LOOKUP_CODE_S'],
  status: ['STATUS', 'STATUS_S'],
  paymentMethodCode: ['PAYMENT_METHOD_CODE', 'PAYMENT_METHOD_CODE_S'],
  bankBranchName: ['BANK_BRANCH_NAME', 'BANK_BRANCH_NAME_S', 'BRANCH_NAME', 'BRANCH_NAME_S'],
  remitEmail: ['REMIT_ADVICE_EMAIL', 'REMIT_ADVICE_EMAIL_S', 'REMIT_MAIL', 'REMIT_MAIL_S'],
  supplierAddressName: ['Supplier_Address_Name', 'SUPPLIER_ADDRESS_NAME', 'SUPPLIER_ADDRESS_NAME_S'],
  address: ['ADDRESS1', 'ADDRESS1_S', 'ADDRESS', 'Address'],
  postalCode: ['POSTAL_CODE', 'POSTAL_CODE_S', 'PINCODE'],
  country: ['COUNTRY', 'COUNTRY_S'],
  email: ['EMAIL_ADDRESS', 'EMAIL_ADDRESS_S', 'EMAIL', 'Email'],
};

const ESSENTIAL_FIELDS: Record<'P2P' | 'ERP', readonly string[]> = {
  P2P: ['vendorCode', 'vendorName', 'bankAccount', 'bankName', 'ifscCode'],
  ERP: ['vendorCode', 'vendorName', 'bankAccount', 'bankName', 'ifscCode', 'panNumber', 'gstNumber'],
};

const CHUNK_SIZE = 2000;     // raw rows per chunk
const DB_BATCH_SIZE = 2000;  // vendors per DB upsert (COPY batch)

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Sprint 4.4: composite-PK city normalization. Empty → 'UNSPECIFIED'. */
function normCity(s: any): string {
  return String(s ?? '').trim().toUpperCase() || 'UNSPECIFIED';
}

const P2P_SIGNATURES = ['vendor code', 'vendorcode', 'vendor_code'];
const ERP_SIGNATURES = ['vendor_number', 'vendornumber', 'vendor number'];
const ANY_SIGNATURES = [...P2P_SIGNATURES, ...ERP_SIGNATURES];

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly vendors: VendorsService,
    private readonly audit: AuditService,
    private readonly jobsSvc: JobsService,
    private readonly recon: ReconciliationService,
  ) {}

  /**
   * Async background ingestion. Returns immediately; consumes chunks via
   * streaming reader; updates chunk progress during parse, then insights + DB flush.
   */
  async processInBackground(opts: {
    jobId: string;
    filePath: string;
    declaredSource?: 'P2P' | 'ERP';
    replaceDataset: boolean;
    runRecon: boolean;
  }) {
    const { jobId, filePath, declaredSource, replaceDataset, runRecon } = opts;

    try {
      this.jobsSvc.updateProgress(jobId, { status: 'PARSING' });

      // Phase 1: locate header row + detect source. dataSample is a small
      // buffer of the first data rows used downstream for content-sniff
      // column resolution (e.g. binding tdsSection by looking at actual values
      // when the header text is just "TDS" or otherwise ambiguous).
      const { headers, headerRowNum, sheetName, dataSample } = await this.findHeaders(filePath);
      this.logger.log(`📋 Job ${jobId.slice(0, 8)}: headers found on "${sheetName}" row ${headerRowNum}`);

      const source = declaredSource || this.detectSource(headers);
      if (!source) {
        throw new BadRequestException(
          `Could not auto-detect source. Headers: [${headers.slice(0, 8).join(', ')}...]. ` +
          `Pass source=P2P or source=ERP explicitly.`,
        );
      }
      this.jobsSvc.updateProgress(jobId, { source, status: 'INGESTING' });

      // Phase 2: optionally clear existing
      if (replaceDataset) {
        this.logger.log(`🗑️  Job ${jobId.slice(0, 8)}: replacing entire ${source} dataset`);
        await this.vendors.clearAll(source);
      }

      // Phase 3: chunked stream + progressive insights
      const { map: colMap, warnings: columnWarnings, verifiedCanonical } = this.resolveColumns(headers, source, dataSample);
      this.jobsSvc.updateProgress(jobId, {
        columnWarnings,
        ...(source === 'P2P'
          ? { p2pColumnMapping: verifiedCanonical }
          : { erpColumnMapping: verifiedCanonical }),
      });
      const result = await this.streamChunked(jobId, filePath, sheetName, headerRowNum, colMap, source);

      // Phase 4: optional reconciliation
      let reconRunId: string | undefined;
      if (runRecon) {
        this.logger.log(`🔄 Job ${jobId.slice(0, 8)}: triggering reconciliation`);
        const run = await this.recon.runReconciliation({
          trigger: 'UPLOAD',
          triggeredBy: `upload:${source}:${jobId.slice(0, 8)}`,
        });
        reconRunId = run.id;
      }

      this.jobsSvc.complete(jobId, {
        rowsProcessed: result.rawRows,
        uniqueVendors: result.uniqueVendors,
        saved: result.saved,
        triggeredReconRunId: reconRunId,
        columnWarnings,
      });

      await this.audit.log({
        action: 'VENDOR_UPLOAD',
        entityType: source,
        entityId: jobId,
        details: `Job ${jobId.slice(0, 8)} ingested ${result.saved} vendors (${result.uniqueVendors} unique from ${result.rawRows} rows). Reconciliation: ${reconRunId || 'skipped'}`,
      });

    } catch (err: any) {
      this.logger.error(`Job ${jobId.slice(0, 8)} failed: ${err.message}`, err.stack);
      this.jobsSvc.fail(jobId, err.message || 'Unknown error');
    } finally {
      // Cleanup uploaded file
      try { fs.unlinkSync(filePath); } catch {}
    }
  }

  // ─── Phase 1: header discovery ────────────────────────────────────────────

  /**
   * Locate the header row and (if needed) merge continuation rows.
   *
   * The Master Vendor P2P report ("VendorMasterReport") uses a multi-row header
   * layout — e.g. column CM has "TDS" in row 10 and "Section" in row 11, which
   * means the parser would only see "TDS" and either (a) miss the column entirely
   * or (b) collide with a Yes/No flag column also literally named "TDS".
   *
   * Strategy:
   *   1. Find the first row that contains a signature ("Vendor Code", etc.) — call this rowN.
   *   2. Note which column holds the signature (signatureColIdx).
   *   3. Peek at rowN+1, rowN+2, ...: if the signature column there is empty or
   *      non-numeric (i.e., not a vendor code), treat it as a header continuation;
   *      concatenate values into the composite headers.
   *   4. Stop once we find a row whose signature-column value looks like data
   *      (numeric, ≥4 chars), OR we've merged a hard maximum of 5 continuation rows.
   *
   * `headerRowNum` returned is the LAST header row (so streamChunked skips it
   * correctly when reading data).
   */
  private async findHeaders(filePath: string): Promise<{
    headers: string[];
    headerRowNum: number;
    sheetName: string;
    dataSample: string[][];
  }> {
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache', worksheets: 'emit', hyperlinks: 'ignore',
    } as any);

    const MAX_CONTINUATION_ROWS = 5;
    // Sample size for content-sniff column resolution (e.g. binding tdsSection
    // by looking at actual data when header text is ambiguous).
    const MAX_SAMPLE_ROWS = 50;

    for await (const ws of wb as any) {
      const sheetName = ws.name || 'Sheet1';
      let rowCount = 0;
      let composite: string[] | null = null;
      let signatureRowNum = -1;
      let signatureColIdx = -1;
      let lastHeaderRowNum = -1;
      let headerLocked = false;
      const dataSample: string[][] = [];

      for await (const row of ws) {
        rowCount++;
        // Hard stop: searching for signature beyond 100 rows.
        if (composite === null && rowCount > 100) break;
        // Stop once we've collected enough data rows for content-sniff.
        if (dataSample.length >= MAX_SAMPLE_ROWS) break;

        const cells = this.extractRowValues(row);

        // Phase 1: locate signature row.
        if (composite === null) {
          if (!this.looksLikeHeader(cells)) continue;

          composite = [...cells];
          signatureRowNum = rowCount;
          lastHeaderRowNum = rowCount;

          const lower = cells.map(c => c.toLowerCase().trim());
          for (const sig of ANY_SIGNATURES) {
            const idx = lower.indexOf(sig);
            if (idx >= 0) { signatureColIdx = idx; break; }
          }
          continue;
        }

        // Phase 2: continuation-row detection (active until headerLocked).
        if (!headerLocked) {
          if (rowCount - signatureRowNum > MAX_CONTINUATION_ROWS) {
            headerLocked = true;
          } else {
            const sigVal = (cells[signatureColIdx] || '').trim();
            // Data row signal: signature column has a long numeric value
            // (typical vendor code). The current row is data, not a header.
            if (sigVal && /^\d{4,}$/.test(sigVal)) {
              headerLocked = true;
              // Fall through to Phase 3 so this row is captured in dataSample.
            } else {
              // Continuation: merge this row's cells into composite headers.
              const maxLen = Math.max(composite.length, cells.length);
              for (let i = 0; i < maxLen; i++) {
                const a = (composite[i] || '').trim();
                const b = (cells[i] || '').trim();
                composite[i] = a && b ? `${a} ${b}` : (a || b);
              }
              lastHeaderRowNum = rowCount;
              continue;
            }
          }
        }

        // Phase 3: data-row sample collection (used by content-sniff).
        dataSample.push(cells);
      }

      if (composite !== null) {
        const merged = lastHeaderRowNum - signatureRowNum;
        if (merged > 0) {
          this.logger.log(
            `🔗 Merged ${merged} continuation row(s) into header on "${sheetName}" ` +
            `(rows ${signatureRowNum}..${lastHeaderRowNum})`,
          );
        }
        return {
          headers: composite,
          headerRowNum: lastHeaderRowNum,
          sheetName,
          dataSample,
        };
      }
    }
    throw new BadRequestException(
      `Could not locate header row in the first 100 rows of any worksheet. ` +
      `Expected a column like "Vendor Code", "VENDOR_NUMBER", or "Vendor Number".`,
    );
  }

  private looksLikeHeader(cells: string[]): boolean {
    const lower = cells.map(c => c.toLowerCase().trim());
    return ANY_SIGNATURES.some(sig => lower.includes(sig));
  }

  private detectSource(headers: string[]): 'P2P' | 'ERP' | null {
    const lower = headers.map(h => h.toLowerCase().trim());
    if (P2P_SIGNATURES.some(sig => lower.includes(sig))) return 'P2P';
    if (ERP_SIGNATURES.some(sig => lower.includes(sig))) return 'ERP';
    return null;
  }

  // ─── Phase 3: chunked streaming; insights after full parse, then DB flush ─

  private async streamChunked(
    jobId: string,
    filePath: string,
    targetSheet: string,
    headerRowNum: number,
    col: Record<string, number>,
    source: 'P2P' | 'ERP',
  ) {
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache', worksheets: 'emit', hyperlinks: 'ignore',
    } as any);

    /**
     * Sprint 4.4: composite key (vendorCode, city). One Map entry per (code, city) pair.
     * Multi-site vendors no longer collapse to a single record.
     */
    const vendorMap = new Map<string, any>();
    const conflictingNames = new Set<string>();
    const keyRowCounts = new Map<string, number>();
    const codeCityCount = new Map<string, Set<string>>();
    /**
     * Sprint 4.4.1: entity-level fields (vendorName, panNumber, msmeNumber) belong to the legal
     * entity, not the location. P2P stores them on a single row per vendor (typically inside the
     * statutory matrix) — capture them per vendorCode here, then back-fill every (code, city)
     * record before insights / coverage logging / DB flush.
     */
    const entityFields = new Map<string, {
      vendorName?: string;
      panNumber?: string;
      msmeNumber?: string;
    }>();

    let rawRows = 0;
    let chunkRows = 0;
    let rowsWithCode = 0;
    let rowsInherited = 0;
    /** P2P statutory matrix: continuation rows often omit Vendor Code — reuse last explicit code. */
    let p2pVendorCodeCarry = '';
    /**
     * P2P statutory matrix: city only updates when the row also has an explicit vendor code.
     * This avoids fragmenting a vendor's statutory block into ghost sites if a continuation row
     * happens to have a stray non-empty city cell.
     */
    let p2pCityCarry = 'UNSPECIFIED';

    for await (const ws of wb as any) {
      if (ws.name && ws.name !== targetSheet) continue;
      let rowNum = 0;

      for await (const row of ws) {
        rowNum++;
        if (rowNum <= headerRowNum) continue;

        const cells = this.extractRowValues(row);
        if (source === 'P2P' && col.vendorCode >= 0) {
          const rawCode = n(cells[col.vendorCode] || '');
          if (rawCode) {
            p2pVendorCodeCarry = rawCode;
            // City carry refreshes only when this row introduces a new vendor identifier.
            if (col.city >= 0) p2pCityCarry = normCity(cells[col.city] || '');
            rowsWithCode++;
          } else if (p2pVendorCodeCarry) {
            rowsInherited++;
          }
        }

        const record = source === 'P2P'
          ? this.mapP2pRow(cells, col, p2pVendorCodeCarry, p2pCityCarry)
          : this.mapErpRow(cells, col);

        if (!record || !record.vendorCode) continue;
        rawRows++;
        chunkRows++;

        const cityKey = normCity(record.city);
        record.city = cityKey;
        const groupKey = `${record.vendorCode}||${cityKey}`;
        keyRowCounts.set(groupKey, (keyRowCounts.get(groupKey) || 0) + 1);
        if (!codeCityCount.has(record.vendorCode)) {
          codeCityCount.set(record.vendorCode, new Set());
        }
        codeCityCount.get(record.vendorCode)!.add(cityKey);

        const existing = vendorMap.get(groupKey);
        if (!existing) {
          vendorMap.set(groupKey, record);
        } else {
          if (record.vendorName && existing.vendorName && record.vendorName !== existing.vendorName) {
            conflictingNames.add(groupKey);
          }
          for (const [k, v] of Object.entries(record)) {
            if (v && !existing[k]) existing[k] = v;
          }
        }

        // Sprint 4.4.1: capture entity-level fields per vendorCode (first non-empty wins).
        // These flow back into every (code, city) record after streaming completes.
        if (source === 'P2P') {
          let ef = entityFields.get(record.vendorCode);
          if (!ef) {
            ef = {};
            entityFields.set(record.vendorCode, ef);
          }
          if (!ef.vendorName && record.vendorName) ef.vendorName = record.vendorName;
          if (!ef.panNumber  && record.panNumber)  ef.panNumber  = record.panNumber;
          if (!ef.msmeNumber && record.msmeNumber) ef.msmeNumber = record.msmeNumber;
        }

        if (chunkRows >= CHUNK_SIZE) {
          this.jobsSvc.updateProgress(jobId, {
            rowsProcessed: rawRows,
            uniqueVendors: vendorMap.size,
            chunksCompleted: Math.floor(rawRows / CHUNK_SIZE),
          });
          chunkRows = 0;
        }
      }
    }

    // Sprint 4.4.1: propagate entity-level fields (vendorName, panNumber, msmeNumber)
    // from vendorCode-scoped capture into every (code, city) record. Runs BEFORE merged /
    // insights / coverage log so downstream metrics reflect the post-fix state.
    if (source === 'P2P' && entityFields.size > 0) {
      let bfName = 0;
      let bfPan = 0;
      let bfMsme = 0;
      for (const rec of vendorMap.values()) {
        const ef = entityFields.get(rec.vendorCode);
        if (!ef) continue;
        if (!rec.vendorName && ef.vendorName) { rec.vendorName = ef.vendorName; bfName++; }
        if (!rec.panNumber  && ef.panNumber)  { rec.panNumber  = ef.panNumber;  bfPan++; }
        if (!rec.msmeNumber && ef.msmeNumber) { rec.msmeNumber = ef.msmeNumber; bfMsme++; }
      }
      this.logger.log(
        `[P2P] Entity-level back-fill: vendorName=${bfName}, panNumber=${bfPan}, msmeNumber=${bfMsme} ` +
          `propagated across ${entityFields.size.toLocaleString()} vendors (${vendorMap.size.toLocaleString()} locations)`,
      );
    }

    const merged = Array.from(vendorMap.values());
    /** Duplicate (code, city) tuples — would be a real ingestion bug now, not just multi-site. */
    const duplicateVendorCodes = [...keyRowCounts.values()].filter((n) => n > 1).length;
    const multiSiteCodes = [...codeCityCount.values()].filter((s) => s.size > 1).length;

    if (source === 'P2P') {
      this.logger.log(
        `[P2P] Grouped into ${vendorMap.size.toLocaleString()} (code, city) pairs from ${rawRows.toLocaleString()} rows ` +
          `(${rowsWithCode.toLocaleString()} with code, ${rowsInherited.toLocaleString()} inherited; ${multiSiteCodes} multi-site codes)`,
      );
    } else {
      this.logger.log(
        `[ERP] Built ${vendorMap.size.toLocaleString()} (code, city) records from ${rawRows.toLocaleString()} rows (${multiSiteCodes} multi-site codes)`,
      );
    }

    this.jobsSvc.updateProgress(jobId, {
      uniqueVendors: vendorMap.size,
      message: 'Analysing vendor data for quality insights…',
      percentComplete: 55,
    });

    const insights = this.computeInsights(merged, source);
    insights.duplicateVendorCodes = duplicateVendorCodes;
    insights.duplicateCodesWithConflictingName = conflictingNames.size;

    if (source === 'P2P' && merged.length > 0) {
      let withPan = 0;
      let withGst = 0;
      let withMsme = 0;
      let withTdsCode = 0;
      for (const r of merged) {
        const pan = nPan(r.panNumber);
        if (pan && PAN_REGEX.test(pan)) withPan++;
        const gst = r.gstNumber ? String(r.gstNumber).trim().toUpperCase() : '';
        if (gst && GST_REGEX.test(gst)) withGst++;
        if (r.msmeNumber?.trim()) withMsme++;
        // TDS: count rows whose tdsSection looks like a real code, excluding
        // Yes/No/blank lookalike captures that would inflate the metric.
        const tds = typeof r.tdsSection === 'string' ? r.tdsSection.trim() : '';
        if (tds && tds.toLowerCase() !== 'yes' && tds.toLowerCase() !== 'no') {
          withTdsCode++;
        }
      }
      const total = merged.length;
      const pct = (x: number) => ((x / total) * 100).toFixed(1);
      this.logger.log(
        `[P2P] Coverage: PAN ${withPan}/${total} (${pct(withPan)}%), ` +
          `GST ${withGst}/${total} (${pct(withGst)}%), ` +
          `MSME ${withMsme}/${total} (${pct(withMsme)}%), ` +
          `TDS codes ${withTdsCode}/${total} (${pct(withTdsCode)}%) [excl. Yes/No]`,
      );
    }

    this.jobsSvc.updateProgress(jobId, {
      insights,
      message: 'Insights ready. Saving to database…',
      percentComplete: 65,
      status: 'INGESTING',
    });

    const saved = await this.flushVendorBatch(source, vendorMap);

    this.jobsSvc.updateProgress(jobId, {
      rowsProcessed: rawRows,
      uniqueVendors: vendorMap.size,
      saved,
      chunksCompleted: rawRows ? Math.ceil(rawRows / CHUNK_SIZE) : 0,
    });

    return { rawRows, uniqueVendors: vendorMap.size, saved };
  }

  private computeInsights(merged: any[], source: 'P2P' | 'ERP'): IngestionInsights {
    const groupCounts = new Map<string, number>();
    const bankCounts = new Map<string, number>();
    const payTermCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const stateCounts = new Map<string, number>();
    const ins: IngestionInsights = {
      totalAnalysed: merged.length,
      missingCity: 0,
      missingState: 0,
      topCities: [],
      topStates: [],
      missingVendorName: 0,
      missingPan: 0,
      missingGst: 0,
      missingMsme: 0,
      missingIfsc: 0,
      missingBankAccount: 0,
      missingBankName: 0,
      missingTds: 0,
      invalidPan: 0,
      invalidGst: 0,
      invalidIfsc: 0,
      duplicateVendorCodes: 0,
      duplicateCodesWithConflictingName: 0,
      topVendorGroups: [],
      topBankNames: [],
      topPaymentTerms: [],
      invalidPanSamples: [],
      invalidGstSamples: [],
      invalidIfscSamples: [],
    };

    for (const r of merged) {
      if (!r.vendorName?.trim()) ins.missingVendorName++;
      if (!r.city?.trim()) ins.missingCity++;
      if (!r.state?.trim()) ins.missingState++;

      const pan = nPan(r.panNumber);
      if (!pan) ins.missingPan++;
      else if (!PAN_REGEX.test(pan)) {
        ins.invalidPan++;
        if (ins.invalidPanSamples.length < 10) {
          ins.invalidPanSamples.push({
            vendorCode: r.vendorCode,
            vendorName: r.vendorName || '',
            value: pan,
          });
        }
      }

      const gst = r.gstNumber ? String(r.gstNumber).trim().toUpperCase() : '';
      if (!gst) ins.missingGst++;
      else if (!GST_REGEX.test(gst)) {
        ins.invalidGst++;
        if (ins.invalidGstSamples.length < 10) {
          ins.invalidGstSamples.push({
            vendorCode: r.vendorCode,
            vendorName: r.vendorName || '',
            value: gst,
          });
        }
      }

      if (!r.msmeNumber?.trim()) ins.missingMsme++;

      const ifsc = r.ifscCode ? String(r.ifscCode).trim().toUpperCase() : '';
      if (!ifsc) ins.missingIfsc++;
      else if (!IFSC_REGEX.test(ifsc)) {
        ins.invalidIfsc++;
        if (ins.invalidIfscSamples.length < 10) {
          ins.invalidIfscSamples.push({
            vendorCode: r.vendorCode,
            vendorName: r.vendorName || '',
            value: ifsc,
          });
        }
      }

      if (!r.bankAccount?.trim()) ins.missingBankAccount++;
      if (!r.bankName?.trim()) ins.missingBankName++;

      const tdsField = source === 'P2P' ? r.tdsSection : r.withholdTaxGroup;
      if (!tdsField?.trim()) ins.missingTds++;

      if (r.vendorGroup) groupCounts.set(r.vendorGroup, (groupCounts.get(r.vendorGroup) || 0) + 1);
      if (r.bankName) bankCounts.set(r.bankName, (bankCounts.get(r.bankName) || 0) + 1);
      const pt = r.payTerm || r.paymentTerm;
      if (pt) payTermCounts.set(pt, (payTermCounts.get(pt) || 0) + 1);
      const city = r.city?.trim();
      const state = r.state?.trim();
      if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      if (state) stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
    }

    ins.topVendorGroups = this.topN(groupCounts, 10);
    ins.topBankNames = this.topN(bankCounts, 10);
    ins.topPaymentTerms = this.topN(payTermCounts, 10);
    ins.topCities = this.topN(cityCounts, 10);
    ins.topStates = this.topN(stateCounts, 10);
    return ins;
  }

  private async flushVendorBatch(source: 'P2P' | 'ERP', vendorMap: Map<string, any>): Promise<number> {
    const items = Array.from(vendorMap.values());
    if (items.length === 0) return 0;
    let saved = 0;
    for (let i = 0; i < items.length; i += DB_BATCH_SIZE) {
      const batch = items.slice(i, i + DB_BATCH_SIZE);
      const t0 = Date.now();
      const result = await this.vendors.bulkUpsertFast(source, batch);
      const ms = Date.now() - t0;
      this.logger.log(`💨 Flushed ${batch.length} ${source} rows in ${ms}ms`);
      saved += result.saved;
    }
    // Don't clear — we need full collapse map across all chunks for P2P
    return saved;
  }

  private topN(counts: Map<string, number>, n: number): Array<{ value: string; count: number }> {
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  // ─── Row mapping (P2P) ────────────────────────────────────────────────────

  /**
   * @param inheritedVendorCode Last non-empty Vendor Code from prior rows (P2P matrix continuation rows).
   * @param inheritedCity       Sprint 4.4 — city carried from the row that introduced this vendor code,
   *                            used as the (code, city) composite key on continuation rows.
   */
  private mapP2pRow(
    cells: string[],
    col: Record<string, number>,
    inheritedVendorCode = '',
    inheritedCity = '',
  ): any | null {
    const v = (key: string) => col[key] >= 0 ? n(cells[col[key]] || '') : '';
    const explicitCode = v('vendorCode');
    const code = explicitCode || inheritedVendorCode;
    if (!code) return null;

    // Continuation rows reuse the carrier-row city; new-vendor rows use this row's own city.
    const cityRaw = explicitCode ? v('city') : (v('city') || inheritedCity);

    const r: any = {
      vendorCode: code,
      vendorName: v('vendorName'),
      vendorType: v('vendorType'),
      vendorCategory: v('vendorCategory'),
      vendorGroup: v('vendorGroup'),
      payTerm: v('payTerm'),
      residentStatus: v('residentStatus'),
      applicantType: v('applicantType'),
      activeStatus: v('activeStatus') || 'Yes',
      hold: v('hold'),
      city: cityRaw,
      state: v('state'),
      country: 'India',
      pincode: v('pincode'),
      address: v('address'),
      bankAccount: v('bankAccount'),
      bankName: v('bankName'),
      ifscCode: v('ifscCode'),
      tdsSection: v('tds'),
      createdByErp: v('createdBy'),
      approvedByErp: v('approvedBy'),
      approvalStatus: v('status'),
    };

    // Direct-column path (new VendorMasterReport.xlsx — "PAN No." and "GST No."
    // are real columns). Populated first; statutory-matrix fallback below only
    // fills if the direct column is absent for this row/vendor.
    const directPan = v('panNumber');
    const directGst = v('gstNumber');
    if (directPan) r.panNumber = nPan(directPan);
    if (directGst) r.gstNumber = directGst;

    // Statutory-matrix path (old Master Vendor P2P export — vendor data is
    // spread across multiple rows tagged by a "Statutory Name" column). Each
    // matrix row carries one identifier; guards ensure a direct-column value
    // (when present) is never overwritten by a later matrix row.
    const statNameRaw = v('sname');
    const statVal = v('sval');
    if (statVal && !r.panNumber && matchesStatutoryP2p(statNameRaw, 'pan')) {
      r.panNumber = nPan(statVal);
    }
    if (statVal && !r.gstNumber && matchesStatutoryP2p(statNameRaw, 'gstin')) {
      r.gstNumber = statVal;
    }
    if (statVal && !r.msmeNumber && matchesStatutoryP2p(statNameRaw, 'msme')) {
      r.msmeNumber = statVal;
    }

    return r;
  }

  private mapErpRow(cells: string[], col: Record<string, number>): any | null {
    const v = (key: string) => col[key] >= 0 ? n(cells[col[key]] || '') : '';
    const code = v('vendorCode');
    if (!code) return null;
    return {
      vendorCode: code,
      vendorId: v('vendorId'),
      partyId: v('partyId'),
      vendorName: v('vendorName'),
      taxOrgType: v('taxOrgType'),
      vendorTypeLookupCode: v('vendorTypeLookupCode'),
      status: v('status') || 'Active',
      msmeCategory: v('msmeCategory'),
      msmeNumber: v('msmeNumber'),
      gstNumber: v('gstNumber'),
      panNumber: nPan(v('panNumber')),
      withholdTaxGroup: v('withholdTaxGroup'),
      paymentMethodCode: v('paymentMethodCode'),
      bankAccount: v('bankAccount'),
      bankName: v('bankName'),
      bankBranchName: v('bankBranchName'),
      ifscCode: v('ifscCode'),
      remitEmail: v('remitEmail'),
      supplierAddressName: v('supplierAddressName'),
      address: v('address'),
      city: v('city'),
      state: v('state'),
      postalCode: v('postalCode'),
      country: v('country') || 'IN',
      paymentTerm: v('paymentTerm'),
      email: v('email'),
    };
  }

  /**
   * Verified canonical columns (column-mappings.ts) + legacy alias resolution for remaining fields.
   *
   * @param dataSample First ~50 data rows (post-header) used for content-sniff
   *                   column resolution where the header text alone is too
   *                   ambiguous to bind a field (e.g. P2P TDS Section column
   *                   whose row-10 cell value is literally "TDS" while a
   *                   different "TDS" column elsewhere holds Yes/No flags).
   */
  private resolveColumns(
    headers: string[],
    source: 'P2P' | 'ERP',
    dataSample: string[][] = [],
  ): { map: Record<string, number>; warnings: string[]; verifiedCanonical: Record<string, number> } {
    const essential = ESSENTIAL_FIELDS[source];
    const warnings: string[] = [];
    const legacyLogRows: string[] = [];

    // P2P now resolves pan / gstin as DIRECT columns when present (new
    // VendorMasterReport format has "PAN No." / "GST No." as real columns).
    // When they're not present, mapP2pRow falls back to the statutory matrix.
    // MSME stays matrix-only on P2P — the new file has no MSME column and we
    // do not want a missing-field warning for it.
    const verified = resolveAllColumns(
      headers,
      source === 'P2P' ? P2P_COLUMN_ALIASES : ERP_COLUMN_ALIASES,
      source,
      this.logger,
      source === 'P2P' ? { skipFields: ['msme'] } : undefined,
    );

    const verifiedCanonical = Object.fromEntries(
      ALL_CANONICAL_FIELDS.map((f) => [f, verified[f]]),
    ) as Record<string, number>;

    const map: Record<string, number> = {};

    if (source === 'P2P') {
      map.vendorCode = verified.vendorCode;
      map.vendorName = verified.vendorName;
      map.city = verified.city;
      map.state = verified.state;
      // Direct-column resolution for PAN / GSTIN (new file format). -1 if absent,
      // in which case mapP2pRow falls back to the statutory matrix per row.
      map.panNumber = verified.pan;
      map.gstNumber = verified.gstin;
      map.bankAccount = verified.bankAccount;
      map.bankName = verified.bankName;
      map.ifscCode = verified.ifscCode;
      map.tds = verified.tdsSection;
      // Canonical paymentTerm → row-mapper key 'payTerm' (P2P entity column kept as payTerm).
      map.payTerm = verified.paymentTerm;
      for (const [field, aliases] of Object.entries(P2P_LEGACY_ALIASES)) {
        const r = resolveColumn(headers, aliases);
        map[field] = r.idx;
        const ok = r.idx >= 0 ? '✓' : '✗';
        const matchInfo = r.idx >= 0
          ? `${r.matchedAs} (idx ${r.idx}) [${r.strategy}]`
          : `NOT FOUND`;
        legacyLogRows.push(`  ${ok} ${field.padEnd(22)} → ${matchInfo}`);
      }
    } else {
      map.vendorCode = verified.vendorCode;
      map.vendorName = verified.vendorName;
      map.city = verified.city;
      map.state = verified.state;
      map.panNumber = verified.pan;
      map.gstNumber = verified.gstin;
      map.msmeNumber = verified.msme;
      map.msmeCategory = verified.msme;
      map.withholdTaxGroup = verified.tdsSection;
      map.bankAccount = verified.bankAccount;
      map.bankName = verified.bankName;
      map.ifscCode = verified.ifscCode;
      map.paymentTerm = verified.paymentTerm;
      for (const [field, aliases] of Object.entries(ERP_LEGACY_ALIASES)) {
        const r = resolveColumn(headers, aliases);
        map[field] = r.idx;
        const ok = r.idx >= 0 ? '✓' : '✗';
        const matchInfo = r.idx >= 0
          ? `${r.matchedAs} (idx ${r.idx}) [${r.strategy}]`
          : `NOT FOUND`;
        legacyLogRows.push(`  ${ok} ${field.padEnd(22)} → ${matchInfo}`);
      }
    }

    for (const field of essential) {
      if ((map[field] ?? -1) < 0) {
        warnings.push(
          `${source} file: essential column "${field}" could not be resolved (verified + legacy mapping).`,
        );
      }
    }

    this.logger.log(
      `Legacy / extra column resolution (${source}):\n${legacyLogRows.join('\n')}`,
    );

    // ─── P2P content-sniff for tdsSection ─────────────────────────────────
    // P2P file formats vary: "TDS Section" / "TDS\nSection" / "TDSSection" /
    // bare "TDS" / "Withholding Tax Section" / etc. The old Master Vendor
    // file even has a separate Yes/No "TDS" column that previously collided
    // with naive alias matching.
    //
    // Strategy: trust the alias resolver when it lands on a column whose data
    // actually looks like TDS section codes. If the alias matched a Yes/No-
    // dominated column (or matched nothing at all), scan every column and
    // bind to the one whose first ~50 data values look like TDS codes.
    // Yes/No-dominated columns are explicitly rejected.
    if (source === 'P2P' && dataSample.length > 0) {
      const TDS_CODE_REGEX = /^(393\(\d+\)_|19[0-9][A-Z]?(\([a-z]\))?|195[_ ])/i;
      const TDS_FLAG_REGEX = /^(yes|no|none|n\/a|null|true|false)$/i;
      const MIN_SNIFF_HITS = 3;

      const scanColumn = (
        colIdx: number,
      ): { codeHits: number; flagHits: number; nonEmpty: number } => {
        let codeHits = 0;
        let flagHits = 0;
        let nonEmpty = 0;
        for (const r of dataSample) {
          const cell = colIdx >= 0 && colIdx < r.length ? r[colIdx] : '';
          const v = (cell || '').trim();
          if (!v) continue;
          nonEmpty++;
          if (TDS_CODE_REGEX.test(v)) codeHits++;
          else if (TDS_FLAG_REGEX.test(v)) flagHits++;
        }
        return { codeHits, flagHits, nonEmpty };
      };

      // (a) Diagnostic block — fires when the alias list returned NOT FOUND.
      //     Dumps every header containing tds/section/with so we can see
      //     exactly what raw text the file actually uses (line breaks,
      //     trailing whitespace, non-breaking spaces, etc. visible via
      //     JSON.stringify).
      if (verified.tdsSection < 0) {
        const candidates = headers
          .map((h, i) => ({ idx: i, raw: h, normalized: normalizeHeaderLabel(h) }))
          .filter(
            (h) =>
              h.normalized.includes('tds') ||
              h.normalized.includes('section') ||
              h.normalized.includes('with'),
          );
        const diagLines = candidates.length === 0
          ? '  (no headers containing tds/section/with — file may use an unrelated label)'
          : candidates
              .map((h) => {
                const beforeRaw = h.idx > 0 ? JSON.stringify(headers[h.idx - 1]) : '—';
                const afterRaw = h.idx + 1 < headers.length ? JSON.stringify(headers[h.idx + 1]) : '—';
                return (
                  `  col ${String(h.idx + 1).padStart(3)}: ` +
                  `raw=${JSON.stringify(h.raw)} norm="${h.normalized}"\n` +
                  `      neighbours: col ${h.idx} raw=${beforeRaw} | ` +
                  `col ${h.idx + 2} raw=${afterRaw}`
                );
              })
              .join('\n');
        this.logger.warn(
          `[P2P][DIAG] tdsSection unmatched by alias list. ` +
            `Candidate headers containing "tds"/"section"/"with":\n${diagLines}`,
        );
      } else {
        // (b) Validate the alias-bound column. If its data is Yes/No-
        //     dominated rather than TDS codes, reject and re-bind via sniff.
        const { codeHits, flagHits } = scanColumn(verified.tdsSection);
        if (flagHits > codeHits && flagHits >= MIN_SNIFF_HITS) {
          this.logger.warn(
            `[P2P] tdsSection alias bound col ${verified.tdsSection + 1} ` +
              `("${headers[verified.tdsSection]}") but its data is ` +
              `Yes/No-dominated (${flagHits} flags vs ${codeHits} codes); ` +
              `re-binding via content-sniff`,
          );
          verified.tdsSection = -1;
          map.tds = -1;
          verifiedCanonical.tdsSection = -1;
        }
      }

      // (c) Content-sniff fallback. Runs when the alias resolver missed or
      //     was rejected in (b). Scans every column for TDS code patterns,
      //     picks the highest-scoring column.
      if (verified.tdsSection < 0) {
        let bestIdx = -1;
        let bestScore = 0;
        const colWidth = headers.length;
        for (let colIdx = 0; colIdx < colWidth; colIdx++) {
          const { codeHits, flagHits, nonEmpty } = scanColumn(colIdx);
          if (codeHits < MIN_SNIFF_HITS) continue;
          if (flagHits >= codeHits) continue; // Yes/No-dominated — skip
          // Heavier weight on TDS-code hits; light penalty for flag noise;
          // tiny bonus when the column is consistently filled.
          const score =
            codeHits * 2 -
            flagHits +
            (nonEmpty >= dataSample.length / 2 ? 1 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = colIdx;
          }
        }

        if (bestIdx >= 0) {
          const colName = String(headers[bestIdx] ?? '').replace(/\s+/g, ' ').trim();
          this.logger.log(
            `[P2P] tdsSection → col ${String(bestIdx + 1).padStart(3)} ` +
              `("${colName}") [content-sniff: values match TDS code pattern, ` +
              `score=${bestScore}]`,
          );
          verified.tdsSection = bestIdx;
          verifiedCanonical.tdsSection = bestIdx;
          map.tds = bestIdx;
        } else {
          this.logger.warn(
            `[P2P] tdsSection content-sniff found no column whose data looks ` +
              `like TDS section codes (393(1)_*, 194C, 195_*) in the first ` +
              `${dataSample.length} sampled rows. tdsSection will be empty.`,
          );
        }
      }
    }

    // P2P-only: explicit source annotation for fields that can come from either
    // a direct column (new file format) or the statutory matrix (old file
    // format). Helps debug whichever file format is being parsed today.
    if (source === 'P2P') {
      const snameIdx = map.sname ?? -1;
      const svalIdx = map.sval ?? -1;
      const matrixOk = snameIdx >= 0 && svalIdx >= 0;
      const annotate = (field: 'pan' | 'gstin' | 'msme', directIdx: number) => {
        if (directIdx >= 0) {
          const colName = String(headers[directIdx] ?? '').replace(/\s+/g, ' ').trim();
          this.logger.log(
            `[P2P] ${field.padEnd(12)} → DIRECT col ${String(directIdx + 1).padStart(3)} ("${colName}")`,
          );
        } else if (matrixOk) {
          this.logger.log(
            `[P2P] ${field.padEnd(12)} → MATRIX (Statutory Name + Value columns)`,
          );
        } else {
          this.logger.warn(
            `[P2P] ${field.padEnd(12)} → UNAVAILABLE (no direct column and no statutory matrix)`,
          );
        }
      };
      annotate('pan', map.panNumber ?? -1);
      annotate('gstin', map.gstNumber ?? -1);
      // MSME is intentionally matrix-only — we never wire a direct column. Skip
      // the UNAVAILABLE warning for it; absent MSME is fine.
      if (matrixOk) {
        this.logger.log(`[P2P] msme         → MATRIX (Statutory Name + Value columns)`);
      } else {
        this.logger.log(`[P2P] msme         → out of scope on this file (no matrix present)`);
      }
    }

    return { map, warnings, verifiedCanonical };
  }

  // ─── Cell extraction ──────────────────────────────────────────────────────

  private extractRowValues(row: any): string[] {
    const vals: string[] = [];
    if (!row || !row.values) return vals;
    const arr = Array.isArray(row.values) ? row.values : [];
    for (let i = 1; i < arr.length; i++) vals.push(this.cellToString(arr[i]));
    return vals;
  }

  private cellToString(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      if ('text' in v && typeof v.text === 'string') return v.text;
      if ('result' in v) return String(v.result ?? '');
      if ('richText' in v && Array.isArray(v.richText)) {
        return v.richText.map((p: any) => p?.text || '').join('');
      }
      if ('error' in v) return '';
      try { return String(v); } catch { return ''; }
    }
    return String(v);
  }
}
