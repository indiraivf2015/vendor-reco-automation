import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';
import { ReconRun } from '../../database/entities/recon-run.entity';
import { ReconLedger } from '../../database/entities/recon-ledger.entity';
import { ReconCategorySummary } from '../../database/entities/recon-category-summary.entity';
import {
  ReconException, ExceptionType, ExceptionSeverity,
} from '../../database/entities/recon-exception.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { fieldEquals, isEmpty, n, nName, nUpper, nPan, nAccount } from '../../common/normalize.util';

type FieldRule = {
  category: string;
  p2pField: keyof P2pVendor;
  erpField: keyof ErpVendor;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  normalize: (v: any) => string;
};

const RULES: FieldRule[] = [
  { category: 'Vendor Name',  p2pField: 'vendorName',  erpField: 'vendorName',       exceptionType: 'VENDOR_NAME_MISMATCH',  severity: 'MEDIUM',   normalize: nName },
  { category: 'PAN',          p2pField: 'panNumber',   erpField: 'panNumber',        exceptionType: 'PAN_MISMATCH',          severity: 'HIGH',     normalize: nPan },
  { category: 'GST',          p2pField: 'gstNumber',   erpField: 'gstNumber',        exceptionType: 'GST_MISMATCH',          severity: 'HIGH',     normalize: nUpper },
  { category: 'MSME',         p2pField: 'msmeNumber',  erpField: 'msmeNumber',       exceptionType: 'MSME_MISMATCH',         severity: 'MEDIUM',   normalize: nUpper },
  { category: 'IFSC',         p2pField: 'ifscCode',    erpField: 'ifscCode',         exceptionType: 'IFSC_MISMATCH',         severity: 'HIGH',     normalize: nUpper },
  { category: 'Bank Account', p2pField: 'bankAccount', erpField: 'bankAccount',      exceptionType: 'BANK_ACCOUNT_MISMATCH', severity: 'CRITICAL', normalize: nAccount },
  { category: 'Bank Name',    p2pField: 'bankName',    erpField: 'bankName',         exceptionType: 'BANK_NAME_MISMATCH',    severity: 'MEDIUM',   normalize: nName },
  { category: 'TDS',          p2pField: 'tdsSection',  erpField: 'withholdTaxGroup', exceptionType: 'TDS_MISMATCH',          severity: 'LOW',      normalize: nUpper },
];

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  /** Recon join-key aliases only — stored city in DB/UI stays original. */
  private static readonly CITY_ALIASES: Record<string, string> = {
    BOMBAY: 'MUMBAI',
    BANGALORE: 'BENGALURU',
    CALCUTTA: 'KOLKATA',
    MADRAS: 'CHENNAI',
    GURGAON: 'GURUGRAM',
    PONDICHERRY: 'PUDUCHERRY',
    TRIVANDRUM: 'THIRUVANANTHAPURAM',
    BARODA: 'VADODARA',
  };

  constructor(
    @InjectRepository(P2pVendor) private readonly p2pRepo: Repository<P2pVendor>,
    @InjectRepository(ErpVendor) private readonly erpRepo: Repository<ErpVendor>,
    @InjectRepository(ReconRun) private readonly runRepo: Repository<ReconRun>,
    @InjectRepository(ReconLedger) private readonly ledgerRepo: Repository<ReconLedger>,
    @InjectRepository(ReconCategorySummary) private readonly summaryRepo: Repository<ReconCategorySummary>,
    @InjectRepository(ReconException) private readonly exRepo: Repository<ReconException>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async runReconciliation(opts: { trigger: 'SCHEDULED' | 'MANUAL' | 'UPLOAD'; triggeredBy?: string }) {
    const startedAt = new Date();
    const run = await this.runRepo.save(
      this.runRepo.create({
        status: 'RUNNING', trigger: opts.trigger,
        triggeredBy: opts.triggeredBy || 'system', startedAt,
      }),
    );
    this.logger.log(`▶️  Recon run ${run.id} (${run.trigger} by ${run.triggeredBy})`);
    await this.audit.log({
      action: 'RECON_STARTED', entityType: 'ReconRun', entityId: run.id,
      userIdentifier: run.triggeredBy, details: `Trigger: ${run.trigger}`,
    });

    try {
      const [p2pVendors, erpVendors] = await Promise.all([this.p2pRepo.find(), this.erpRepo.find()]);
      const { ledger, exceptions, summary } = this.compare(p2pVendors, erpVendors, run.id);

      await this.saveChunked(this.ledgerRepo, ledger, 200);
      await this.saveChunked(this.summaryRepo, summary, 50);
      await this.saveChunked(this.exRepo, exceptions, 200);

      const missingInErp = ledger.filter((l) => l.presentInP2p && !l.presentInErp).length;
      const missingInP2p = ledger.filter((l) => !l.presentInP2p && l.presentInErp).length;
      const common = ledger.filter((l) => l.presentInP2p && l.presentInErp).length;
      const matched = ledger.filter((l) => l.presentInP2p && l.presentInErp && l.mismatchCount === 0).length;
      const matchRatePct = common > 0 ? Math.round((matched / common) * 10000) : 0;

      const completedAt = new Date();
      run.status = 'COMPLETED';
      run.completedAt = completedAt;
      run.durationMs = completedAt.getTime() - startedAt.getTime();
      run.totalP2pVendors = p2pVendors.length;
      run.totalErpVendors = erpVendors.length;
      run.commonVendors = common;
      run.missingInErpCount = missingInErp;
      run.missingInP2pCount = missingInP2p;
      run.totalExceptions = exceptions.length;
      run.matchRatePct = matchRatePct;
      await this.runRepo.save(run);

      this.logger.log(
        `✅ Recon ${run.id} done | P2P=${p2pVendors.length} ERP=${erpVendors.length} ` +
          `Common=${common} MissingERP=${missingInErp} MissingP2P=${missingInP2p} ` +
          `Exceptions=${exceptions.length} Match=${(matchRatePct / 100).toFixed(2)}%`,
      );

      if (exceptions.length > 0) {
        this.notifications.sendExceptionAlert(run, exceptions).catch((e) =>
          this.logger.error(`Notification failed: ${e.message}`),
        );
      }

      await this.audit.log({
        action: 'RECON_COMPLETED', entityType: 'ReconRun', entityId: run.id,
        userIdentifier: run.triggeredBy,
        details: `Exceptions: ${exceptions.length} | Match: ${(matchRatePct / 100).toFixed(2)}%`,
      });
      return run;
    } catch (err: any) {
      run.status = 'FAILED';
      run.completedAt = new Date();
      run.errorMessage = err.message;
      await this.runRepo.save(run);
      this.logger.error(`❌ Recon ${run.id} failed: ${err.message}`);
      await this.audit.log({
        action: 'RECON_FAILED', entityType: 'ReconRun', entityId: run.id,
        userIdentifier: run.triggeredBy, details: err.message,
      });
      throw err;
    }
  }

  /**
   * Aggressive city normalization for recon JOIN keys only (not storage/display).
   * Collapses spelling variants: "Mumbai (West)" / BOMBAY / MUMBAI → same canonical key.
   */
  private canonicalCity(raw: any): string {
    let c = String(raw ?? '').trim().toUpperCase();
    if (!c) return 'UNSPECIFIED';
    c = c.replace(/\([^)]*\)/g, ' ');
    c = c.replace(/[^A-Z0-9 ]/g, ' ');
    c = c.replace(/\s+/g, ' ').trim();
    const alias = ReconciliationService.CITY_ALIASES[c];
    if (alias) return alias;
    return c || 'UNSPECIFIED';
  }

  /** Sprint 4.4: composite key (vendorCode, canonicalCity) for matching across P2P and ERP. */
  private joinKey(code: any, city: any): string {
    return `${n(code)}||${this.canonicalCity(city)}`;
  }

  /** Tie-break when multiple rows collapse to the same join key after city normalization. */
  private fieldFillCount(v: any): number {
    const fields = ['vendorName', 'panNumber', 'gstNumber', 'msmeNumber', 'bankAccount', 'ifscCode', 'bankName'];
    let count = fields.filter((f) => v?.[f] && String(v[f]).trim()).length;
    if (v?.tdsSection?.trim() || v?.withholdTaxGroup?.trim()) count += 1;
    return count;
  }

  private buildP2pJoinMap(vendors: P2pVendor[]): Map<string, P2pVendor> {
    const map = new Map<string, P2pVendor>();
    for (const v of vendors) {
      const k = this.joinKey(v.vendorCode, v.city);
      const existing = map.get(k);
      if (!existing || this.fieldFillCount(v) > this.fieldFillCount(existing)) {
        map.set(k, v);
      }
    }
    return map;
  }

  private buildErpJoinMap(vendors: ErpVendor[]): Map<string, ErpVendor> {
    const map = new Map<string, ErpVendor>();
    for (const v of vendors) {
      const k = this.joinKey(v.vendorCode, v.city);
      const existing = map.get(k);
      if (!existing || this.fieldFillCount(v) > this.fieldFillCount(existing)) {
        map.set(k, v);
      }
    }
    return map;
  }

  private compare(p2pVendors: P2pVendor[], erpVendors: ErpVendor[], runId: string) {
    const p2pMap = this.buildP2pJoinMap(p2pVendors);
    const erpMap = this.buildErpJoinMap(erpVendors);

    this.logger.log(
      `[Recon] Join keys after city normalization: ` +
        `P2P ${p2pVendors.length}→${p2pMap.size}, ` +
        `ERP ${erpVendors.length}→${erpMap.size}`,
    );

    const allKeys = new Set<string>([...p2pMap.keys(), ...erpMap.keys()]);

    const ledger: ReconLedger[] = [];
    const exceptions: ReconException[] = [];

    for (const key of allKeys) {
      const p2p = p2pMap.get(key);
      const erp = erpMap.get(key);
      const presentInP2p = !!p2p;
      const presentInErp = !!erp;

      // Pull canonical (code, city) from whichever side is present so empty halves still display.
      const code = (p2p?.vendorCode || erp?.vendorCode || '').toString();
      const city = (p2p?.city || erp?.city || 'UNSPECIFIED').toString();

      const row = this.ledgerRepo.create({
        runId, vendorCode: code, city,
        vendorUniqueId: this.uniqueId(p2p, erp),
        presentInP2p, presentInErp,
        vendorNameP2p: p2p?.vendorName, vendorNameErp: erp?.vendorName,
        vendorCodeP2p: p2p?.vendorCode, vendorCodeErp: erp?.vendorCode,
        panP2p: p2p ? (nPan(p2p.panNumber) || null) : undefined,
        panErp: erp ? (nPan(erp.panNumber) || null) : undefined,
        gstP2p: p2p?.gstNumber,         gstErp: erp?.gstNumber,
        msmeP2p: p2p?.msmeNumber,       msmeErp: erp?.msmeNumber,
        ifscP2p: p2p?.ifscCode,         ifscErp: erp?.ifscCode,
        bankAccountP2p: p2p?.bankAccount, bankAccountErp: erp?.bankAccount,
        bankNameP2p: p2p?.bankName,     bankNameErp: erp?.bankName,
        tdsP2p: p2p?.tdsSection,        tdsErp: erp?.withholdTaxGroup,
      } as Partial<ReconLedger>);

      row.vendorCodeMatch = fieldEquals(p2p?.vendorCode, erp?.vendorCode, n);

      let mismatchCount = 0;
      for (const rule of RULES) {
        const a = p2p ? (p2p as any)[rule.p2pField] : undefined;
        const b = erp ? (erp as any)[rule.erpField] : undefined;
        const eq = presentInP2p && presentInErp && fieldEquals(a, b, rule.normalize);
        const matchKey = `${this.fieldKey(rule.category)}Match` as keyof ReconLedger;
        (row as any)[matchKey] = eq;

        if (presentInP2p && presentInErp && !eq) {
          mismatchCount += 1;
          exceptions.push(
            this.exRepo.create({
              runId, vendorCode: code, city,
              vendorName: p2p?.vendorName || erp?.vendorName,
              type: rule.exceptionType, severity: rule.severity,
              fieldName: rule.category,
              p2pValue: a == null ? null : String(a),
              erpValue: b == null ? null : String(b),
              description: `${rule.category} mismatch • P2P="${a ?? ''}" • ERP="${b ?? ''}"`,
            }),
          );
        }
      }
      row.mismatchCount = mismatchCount;

      if (presentInP2p && !presentInErp) {
        exceptions.push(this.exRepo.create({
          runId, vendorCode: code, city, vendorName: p2p!.vendorName,
          type: 'MISSING_IN_ERP', severity: 'CRITICAL',
          description: `Vendor ${code} (${city}) exists in P2P but is not yet integrated in ERP. Invoices/payments will be blocked.`,
          p2pValue: p2p!.vendorName, erpValue: null,
        }));
      }
      if (presentInErp && !presentInP2p) {
        exceptions.push(this.exRepo.create({
          runId, vendorCode: code, city, vendorName: erp!.vendorName,
          type: 'MISSING_IN_P2P', severity: 'HIGH',
          description: `Vendor ${code} (${city}) exists in ERP but not in P2P (likely legacy/decommissioned).`,
          p2pValue: null, erpValue: erp!.vendorName,
        }));
      }
      ledger.push(row);
    }

    const summary: ReconCategorySummary[] = [
      this.summaryFor('Vendor Name',  ledger, runId, (l) => l.vendorNameP2p,  (l) => l.vendorNameErp,  (l) => l.vendorNameMatch),
      this.summaryFor('PAN',          ledger, runId, (l) => l.panP2p,         (l) => l.panErp,         (l) => l.panMatch),
      this.summaryFor('GST',          ledger, runId, (l) => l.gstP2p,         (l) => l.gstErp,         (l) => l.gstMatch),
      this.summaryFor('MSME',         ledger, runId, (l) => l.msmeP2p,        (l) => l.msmeErp,        (l) => l.msmeMatch),
      this.summaryFor('IFSC',         ledger, runId, (l) => l.ifscP2p,        (l) => l.ifscErp,        (l) => l.ifscMatch),
      this.summaryFor('Bank Account', ledger, runId, (l) => l.bankAccountP2p, (l) => l.bankAccountErp, (l) => l.bankAccountMatch),
      this.summaryFor('Bank Name',    ledger, runId, (l) => l.bankNameP2p,    (l) => l.bankNameErp,    (l) => l.bankNameMatch),
      this.summaryFor('TDS',          ledger, runId, (l) => l.tdsP2p,         (l) => l.tdsErp,         (l) => l.tdsMatch),
    ];
    return { ledger, summary, exceptions };
  }

  private summaryFor(
    category: string, ledger: ReconLedger[], runId: string,
    pickP2p: (l: ReconLedger) => any, pickErp: (l: ReconLedger) => any,
    pickMatch: (l: ReconLedger) => boolean,
  ) {
    let p2pMissing = 0, erpMissing = 0, matched = 0, missingCount = 0;
    const p2pVals = new Set<string>(), erpVals = new Set<string>();
    for (const l of ledger) {
      const a = pickP2p(l), b = pickErp(l);
      if (l.presentInP2p && isEmpty(a)) p2pMissing++;
      if (l.presentInErp && isEmpty(b)) erpMissing++;
      if (!isEmpty(a)) p2pVals.add(String(a).trim().toUpperCase());
      if (!isEmpty(b)) erpVals.add(String(b).trim().toUpperCase());
      if (l.presentInP2p && l.presentInErp) {
        if (pickMatch(l)) matched++; else missingCount++;
      }
    }
    const p2pUnique = [...p2pVals].filter((v) => !erpVals.has(v)).length;
    const erpUnique = [...erpVals].filter((v) => !p2pVals.has(v)).length;
    return this.summaryRepo.create({
      runId, category, missingCount, p2pUnique, erpUnique, p2pMissing, erpMissing, matched,
    });
  }

  private uniqueId(p2p?: P2pVendor, erp?: ErpVendor): string {
    const name = p2p?.vendorName || erp?.vendorName || '';
    const city = p2p?.city || erp?.city || '';
    return `${name}${city}`;
  }

  private fieldKey(category: string): string {
    const map: Record<string, string> = {
      'Vendor Name': 'vendorName', PAN: 'pan', GST: 'gst', MSME: 'msme',
      IFSC: 'ifsc', 'Bank Account': 'bankAccount', 'Bank Name': 'bankName', TDS: 'tds',
    };
    return map[category];
  }

  private async saveChunked<T>(repo: Repository<T>, items: T[], chunk = 200) {
    for (let i = 0; i < items.length; i += chunk) {
      await repo.save(items.slice(i, i + chunk) as any);
    }
  }

  // --- Read APIs ---

  async listRuns(limit = 50) {
    return this.runRepo.find({ order: { startedAt: 'DESC' }, take: limit });
  }
  async getRun(id: string) { return this.runRepo.findOne({ where: { id } }); }
  async getLatestRun() { return this.runRepo.findOne({ where: {}, order: { startedAt: 'DESC' } }); }

  async getRunSummary(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) return null;
    const summary = await this.summaryRepo.find({ where: { runId } });
    return { run, summary };
  }

  async getRunLedger(runId: string, q?: string, page = 1, pageSize = 100, onlyMismatches = false) {
    const qb = this.ledgerRepo.createQueryBuilder('l').where('l.runId = :runId', { runId });
    if (onlyMismatches) {
      qb.andWhere('(l.mismatchCount > 0 OR l.presentInP2p = false OR l.presentInErp = false)');
    }
    if (q) {
      qb.andWhere(
        '(l.vendorCode LIKE :q OR l.vendorNameP2p LIKE :q OR l.vendorNameErp LIKE :q OR l.city LIKE :qu)',
        { q: `%${q}%`, qu: `%${q.toUpperCase()}%` },
      );
    }
    qb.orderBy('l.mismatchCount', 'DESC')
      .addOrderBy('l.vendorCode', 'ASC')
      .addOrderBy('l.city', 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async dashboardSummary() {
    const latest = await this.getLatestRun();
    const totalRuns = await this.runRepo.count();
    const openExceptions = await this.exRepo.count({ where: { status: 'OPEN' } });
    const trend = await this.runRepo.find({ order: { startedAt: 'DESC' }, take: 14 });
    let categorySummary: ReconCategorySummary[] = [];
    if (latest) categorySummary = await this.summaryRepo.find({ where: { runId: latest.id } });
    return {
      latestRun: latest, totalRuns, openExceptions, categorySummary,
      trend: trend.reverse().map((r) => ({
        id: r.id, date: r.startedAt, exceptions: r.totalExceptions,
        matchRatePct: r.matchRatePct, common: r.commonVendors,
      })),
    };
  }
}
