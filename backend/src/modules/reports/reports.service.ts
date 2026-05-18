import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ReconRun } from '../../database/entities/recon-run.entity';
import { ReconLedger } from '../../database/entities/recon-ledger.entity';
import { ReconCategorySummary } from '../../database/entities/recon-category-summary.entity';
import { ReconException } from '../../database/entities/recon-exception.entity';
import { groupExceptions, formatGroupHeader } from '../exceptions/exception-grouping.util';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ReconRun) private readonly runRepo: Repository<ReconRun>,
    @InjectRepository(ReconLedger) private readonly ledgerRepo: Repository<ReconLedger>,
    @InjectRepository(ReconCategorySummary) private readonly summaryRepo: Repository<ReconCategorySummary>,
    @InjectRepository(ReconException) private readonly exRepo: Repository<ReconException>,
  ) {}

  async generateRunReport(runId: string): Promise<{ buffer: Buffer; filename: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    const [ledger, summary, exceptions] = await Promise.all([
      this.ledgerRepo.find({ where: { runId }, order: { mismatchCount: 'DESC' } }),
      this.summaryRepo.find({ where: { runId } }),
      this.exRepo.find({ where: { runId }, order: { createdAt: 'DESC' } }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Indira IVF • Vendor Recon Automation';
    wb.created = new Date();

    // ----- Dashboard sheet -----
    const dash = wb.addWorksheet('Dashboard');
    dash.mergeCells('B2:G2');
    dash.getCell('B2').value = 'Vendor Master Reconciliation • Dashboard';
    dash.getCell('B2').font = { bold: true, size: 16, color: { argb: 'FF0F1320' } };
    dash.getCell('B2').alignment = { horizontal: 'left', vertical: 'middle' };

    const meta: [string, any][] = [
      ['Run Started', run.startedAt],
      ['Triggered By', run.triggeredBy],
      ['P2P Vendors', run.totalP2pVendors],
      ['ERP Vendors', run.totalErpVendors],
      ['Common', run.commonVendors],
      ['Missing in ERP', run.missingInErpCount],
      ['Missing in P2P', run.missingInP2pCount],
      ['Match Rate', `${(run.matchRatePct / 100).toFixed(2)}%`],
      ['Total Exceptions', run.totalExceptions],
    ];
    meta.forEach(([k, v], i) => {
      dash.getCell(`B${4 + i}`).value = k;
      dash.getCell(`B${4 + i}`).font = { bold: true, color: { argb: 'FF566071' } };
      dash.getCell(`C${4 + i}`).value = v;
    });

    const headerRow = 4 + meta.length + 2;
    const cats = ['Missing Count', 'Category', 'P2P Unique', 'ERP Unique', 'P2P Missing', 'ERP Missing'];
    cats.forEach((h, i) => {
      const c = dash.getCell(headerRow, 2 + i);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1320' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    summary.forEach((s, idx) => {
      const r = headerRow + 1 + idx;
      dash.getCell(r, 2).value = s.missingCount;
      dash.getCell(r, 3).value = s.category;
      dash.getCell(r, 4).value = s.p2pUnique;
      dash.getCell(r, 5).value = s.erpUnique;
      dash.getCell(r, 6).value = s.p2pMissing;
      dash.getCell(r, 7).value = s.erpMissing;
    });
    dash.columns.forEach((c) => (c.width = 18));

    // ----- Vendor Master sheet -----
    const vm = wb.addWorksheet('Vendor Master');
    vm.columns = [
      { header: 'Sr No.', key: 'sr', width: 7 },
      { header: 'Vendor Unique ID', key: 'uid', width: 32 },
      { header: 'Vendor Name P2P', key: 'vnp', width: 30 },
      { header: 'Vendor Name ERP', key: 'vne', width: 30 },
      { header: 'Status', key: 'vns', width: 9 },
      { header: 'Vendor P2P Code', key: 'vcp', width: 14 },
      { header: 'Vendor ERP Code', key: 'vce', width: 14 },
      { header: 'Status', key: 'vcs', width: 9 },
      { header: 'PAN No P2P', key: 'pp', width: 14 },
      { header: 'PAN No ERP', key: 'pe', width: 14 },
      { header: 'Status', key: 'ps', width: 9 },
      { header: 'GST P2P', key: 'gp', width: 18 },
      { header: 'GST ERP', key: 'ge', width: 18 },
      { header: 'Status', key: 'gs', width: 9 },
      { header: 'MSME P2P', key: 'mp', width: 22 },
      { header: 'MSME ERP', key: 'me', width: 22 },
      { header: 'Status', key: 'ms', width: 9 },
      { header: 'IFSC P2P', key: 'ip', width: 14 },
      { header: 'IFSC ERP', key: 'ie', width: 14 },
      { header: 'Status', key: 'is', width: 9 },
      { header: 'Bank Acc P2P', key: 'bap', width: 18 },
      { header: 'Bank Acc ERP', key: 'bae', width: 18 },
      { header: 'Status', key: 'bas', width: 9 },
      { header: 'Bank Name P2P', key: 'bnp', width: 22 },
      { header: 'Bank Name ERP', key: 'bne', width: 22 },
      { header: 'Status', key: 'bns', width: 9 },
      { header: 'TDS P2P', key: 'tp', width: 24 },
      { header: 'TDS ERP', key: 'te', width: 24 },
      { header: 'Status', key: 'ts', width: 9 },
    ];
    ledger.forEach((l, idx) => {
      vm.addRow({
        sr: idx + 1, uid: l.vendorUniqueId,
        vnp: l.vendorNameP2p, vne: l.vendorNameErp, vns: l.vendorNameMatch,
        vcp: l.vendorCodeP2p, vce: l.vendorCodeErp, vcs: l.vendorCodeMatch,
        pp: l.panP2p, pe: l.panErp, ps: l.panMatch,
        gp: l.gstP2p, ge: l.gstErp, gs: l.gstMatch,
        mp: l.msmeP2p, me: l.msmeErp, ms: l.msmeMatch,
        ip: l.ifscP2p, ie: l.ifscErp, is: l.ifscMatch,
        bap: l.bankAccountP2p, bae: l.bankAccountErp, bas: l.bankAccountMatch,
        bnp: l.bankNameP2p, bne: l.bankNameErp, bns: l.bankNameMatch,
        tp: l.tdsP2p, te: l.tdsErp, ts: l.tdsMatch,
      });
    });
    this.styleHeader(vm);
    this.colourBoolColumns(vm, ['vns', 'vcs', 'ps', 'gs', 'ms', 'is', 'bas', 'bns', 'ts'], ledger.length);

    // ----- Exceptions sheet -----
    const ex = wb.addWorksheet('Exceptions');
    ex.columns = [
      { header: 'Vendor Code', key: 'vc', width: 16 },
      { header: 'Vendor Name', key: 'vn', width: 30 },
      { header: 'Type', key: 't', width: 24 },
      { header: 'Severity', key: 's', width: 12 },
      { header: 'Field', key: 'f', width: 16 },
      { header: 'P2P Value', key: 'p', width: 28 },
      { header: 'ERP Value', key: 'e', width: 28 },
      { header: 'Status', key: 'st', width: 12 },
      { header: 'Description', key: 'd', width: 60 },
    ];
    exceptions.forEach((e) => ex.addRow({
      vc: e.vendorCode, vn: e.vendorName, t: e.type, s: e.severity,
      f: e.fieldName, p: e.p2pValue, e: e.erpValue, st: e.status, d: e.description,
    }));
    this.styleHeader(ex);
    this.applySeverityColours(ex, exceptions);

    this.addGroupedExceptionsSheet(wb, exceptions);

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const dt = new Date(run.startedAt).toISOString().slice(0, 10);
    return { buffer, filename: `vendor_recon_${dt}_${run.id.slice(0, 8)}.xlsx` };
  }

  async generateLatestReport() {
    const latest = await this.runRepo.findOne({ where: { status: 'COMPLETED' }, order: { startedAt: 'DESC' } });
    if (!latest) throw new NotFoundException('No completed run available yet.');
    return this.generateRunReport(latest.id);
  }

  private styleHeader(ws: ExcelJS.Worksheet) {
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1320' } };
    h.height = 22;
    h.alignment = { vertical: 'middle' };
  }

  private applySeverityColours(ws: ExcelJS.Worksheet, exceptions: ReconException[]) {
    const colours: Record<string, string> = {
      CRITICAL: 'FFDC2626', HIGH: 'FFEA580C', MEDIUM: 'FFCA8A04', LOW: 'FF16A34A',
    };
    exceptions.forEach((e, idx) => {
      const cell = ws.getRow(idx + 2).getCell('s');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colours[e.severity] || 'FF6B7280' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });
  }

  private addGroupedExceptionsSheet(wb: ExcelJS.Workbook, exceptions: ReconException[]) {
    const ws = wb.addWorksheet('Exceptions (Grouped)');
    const { groups } = groupExceptions(exceptions);
    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8EAED' } };
    const subHeaderFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };

    ws.getRow(1).values = ['Field', 'Severity', 'P2P Value', 'ERP Value'];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1320' } };
    ws.getRow(1).height = 22;
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    let rowNum = 2;

    for (const g of groups) {
      const headerRow = ws.getRow(rowNum);
      headerRow.getCell(1).value = formatGroupHeader(g.vendorName, g.city, g.vendorCode, g.issueCount);
      ws.mergeCells(rowNum, 1, rowNum, 4);
      headerRow.font = { bold: true, color: { argb: 'FF0F1320' } };
      headerRow.fill = headerFill;
      headerRow.height = 20;
      rowNum += 1;

      const subRow = ws.getRow(rowNum);
      ['Field', 'Severity', 'P2P Value', 'ERP Value'].forEach((h, i) => {
        const cell = subRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10, color: { argb: 'FF566071' } };
        cell.fill = subHeaderFill;
      });
      rowNum += 1;

      for (const m of g.mismatches) {
        const row = ws.getRow(rowNum);
        row.getCell(1).value = m.field;
        const sevCell = row.getCell(2);
        sevCell.value = m.severity;
        this.applyGroupedSeverityFont(sevCell, m.severity);
        row.getCell(3).value = m.p2pValue;
        row.getCell(4).value = m.erpValue;
        rowNum += 1;
      }

      rowNum += 1;
    }

    ws.columns = [
      { width: 22 },
      { width: 12 },
      { width: 32 },
      { width: 32 },
    ];
  }

  private applyGroupedSeverityFont(cell: ExcelJS.Cell, severity: string) {
    const colours: Record<string, string> = {
      CRITICAL: 'FFDC2626',
      HIGH: 'FFEA580C',
      MEDIUM: 'FF6B7280',
      LOW: 'FF9CA3AF',
    };
    cell.font = { bold: severity === 'CRITICAL' || severity === 'HIGH', color: { argb: colours[severity] || 'FF6B7280' } };
    cell.alignment = { horizontal: 'left' };
  }

  private colourBoolColumns(ws: ExcelJS.Worksheet, keys: string[], rowCount: number) {
    for (let r = 2; r < 2 + rowCount; r++) {
      keys.forEach((k) => {
        const cell = ws.getRow(r).getCell(k);
        const isTrue = cell.value === true;
        cell.value = isTrue ? 'TRUE' : 'FALSE';
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTrue ? 'FF16A34A' : 'FFDC2626' } };
        cell.alignment = { horizontal: 'center' };
      });
    }
  }
}
