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
  payTerm: ['PayTerm', 'Pay Term', 'Payment Term'],
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
  paymentTerm: ['PAYMENT_TERM', 'PAYMENT_TERM_S', 'PAYMENT_TERMS', 'Payment Term'],
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

      // Phase 1: locate header row + detect source
      const { headers, headerRowNum, sheetName } = await this.findHeaders(filePath);
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
      const { map: colMap, warnings: columnWarnings, verifiedCanonical } = this.resolveColumns(headers, source);
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

  private async findHeaders(filePath: string): Promise<{ headers: string[]; headerRowNum: number; sheetName: string }> {
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache', worksheets: 'emit', hyperlinks: 'ignore',
    } as any);

    for await (const ws of wb as any) {
      const sheetName = ws.name || 'Sheet1';
      let rowCount = 0;
      for await (const row of ws) {
        rowCount++;
        if (rowCount > 100) break;
        const cells = this.extractRowValues(row);
        if (this.looksLikeHeader(cells)) {
          return { headers: cells, headerRowNum: rowCount, sheetName };
        }
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
      for (const r of merged) {
        const pan = nPan(r.panNumber);
        if (pan && PAN_REGEX.test(pan)) withPan++;
        const gst = r.gstNumber ? String(r.gstNumber).trim().toUpperCase() : '';
        if (gst && GST_REGEX.test(gst)) withGst++;
        if (r.msmeNumber?.trim()) withMsme++;
      }
      const total = merged.length;
      const pct = (x: number) => ((x / total) * 100).toFixed(1);
      this.logger.log(
        `[P2P] Coverage: PAN ${withPan}/${total} (${pct(withPan)}%), ` +
          `GST ${withGst}/${total} (${pct(withGst)}%), MSME ${withMsme}/${total} (${pct(withMsme)}%)`,
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

    const statNameRaw = v('sname');
    const statVal = v('sval');
    // One statutory type per row — scan every row via merge; independent checks (not else-if).
    if (statVal && matchesStatutoryP2p(statNameRaw, 'pan')) {
      r.panNumber = nPan(statVal);
    }
    if (statVal && matchesStatutoryP2p(statNameRaw, 'gstin')) {
      r.gstNumber = statVal;
    }
    if (statVal && matchesStatutoryP2p(statNameRaw, 'msme')) {
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
   */
  private resolveColumns(
    headers: string[],
    source: 'P2P' | 'ERP',
  ): { map: Record<string, number>; warnings: string[]; verifiedCanonical: Record<string, number> } {
    const essential = ESSENTIAL_FIELDS[source];
    const warnings: string[] = [];
    const legacyLogRows: string[] = [];

    const verified = resolveAllColumns(
      headers,
      source === 'P2P' ? P2P_COLUMN_ALIASES : ERP_COLUMN_ALIASES,
      source,
      this.logger,
      source === 'P2P' ? { skipFields: ['pan', 'gstin', 'msme'] } : undefined,
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
      map.bankAccount = verified.bankAccount;
      map.bankName = verified.bankName;
      map.ifscCode = verified.ifscCode;
      map.tds = verified.tdsSection;
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
