import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import type { EntityMetadata } from 'typeorm';
import type { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { from as copyFrom } from 'pg-copy-streams';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';
import { nPan } from '../../common/normalize.util';

export type VendorSource = 'P2P' | 'ERP';

/** PostgreSQL identifier quoting for camelCase columns. */
function qi(ident: string): string {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectRepository(P2pVendor) public readonly p2pRepo: Repository<P2pVendor>,
    @InjectRepository(ErpVendor) public readonly erpRepo: Repository<ErpVendor>,
  ) {}

  private repoFor(source: VendorSource): Repository<any> {
    return source === 'P2P' ? this.p2pRepo : this.erpRepo;
  }

  /**
   * Columns copied / upserted (exclude auto-generated columns + create/update timestamps).
   * Composite-PK columns (vendorCode, city) are NOT auto-generated, so they remain in the COPY.
   */
  private copyColumns(meta: EntityMetadata): ColumnMetadata[] {
    return meta.columns.filter(
      (c) => !c.isGenerated && !c.isCreateDate && !c.isUpdateDate,
    );
  }

  private escapeCopyCsvField(s: string, quoteChar: string): string {
    const needsQuote =
      s.includes('\t') ||
      s.includes('\n') ||
      s.includes('\r') ||
      s.includes(quoteChar) ||
      s.includes('\\');
    if (!needsQuote) return s;
    const doubled = quoteChar + quoteChar;
    return quoteChar + s.split(quoteChar).join(doubled) + quoteChar;
  }

  /**
   * Truncate strings to the entity column length before COPY.
   * Oracle exports often exceed varchar(200) on remitEmail, withholdTaxGroup, email, etc.
   */
  private clampCopyField(col: ColumnMetadata, str: string, raw: unknown): string {
    if (raw instanceof Date) return str;
    const len = col.length as string | number | undefined;
    if (len === undefined || len === null) return str;
    const max = typeof len === 'number' ? len : parseInt(String(len), 10);
    if (!Number.isFinite(max) || max <= 0) return str;
    if (str.length <= max) return str;
    return str.slice(0, max);
  }

  /** Tab-separated CSV row for COPY (NULL as \\N per PostgreSQL). */
  private formatCopyLine(cols: ColumnMetadata[], item: any, quoteChar: string): string {
    const fields = cols.map((col) => {
      const raw = item[col.propertyName];
      if (raw === undefined || raw === null) return '\\N';
      const str = raw instanceof Date ? raw.toISOString() : String(raw);
      const clipped = this.clampCopyField(col, str, raw);
      return this.escapeCopyCsvField(clipped, quoteChar);
    });
    return fields.join('\t');
  }

  async list(source: VendorSource, q?: string, page = 1, pageSize = 50) {
    const repo = this.repoFor(source);
    const where = q
      ? [
          { vendorCode: Like(`%${q}%`) },
          { vendorName: Like(`%${q}%`) },
          { city: Like(`%${q.toUpperCase()}%`) },
        ]
      : {};
    const [items, total] = await repo.findAndCount({
      where: where as any,
      order: { vendorCode: 'ASC', city: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  /**
   * Look up a vendor by code. If `city` is provided, returns that exact (code, city) record.
   * If omitted, returns the first site (back-compat for callers that haven't been updated).
   */
  async getByCode(source: VendorSource, code: string, city?: string) {
    const where: any = { vendorCode: code };
    if (city) where.city = city.trim().toUpperCase() || 'UNSPECIFIED';
    return this.repoFor(source).findOne({ where });
  }

  /** All locations for a vendor code (multi-site). */
  async listByCode(source: VendorSource, code: string) {
    return this.repoFor(source).find({
      where: { vendorCode: code },
      order: { city: 'ASC' } as any,
    });
  }

  async upsertOne(source: VendorSource, dto: any) {
    const repo = this.repoFor(source);
    const cityKey = (dto.city ?? '').trim().toUpperCase() || 'UNSPECIFIED';
    const existing = await repo.findOne({
      where: { vendorCode: dto.vendorCode, city: cityKey } as any,
    });
    const patch = { ...dto, city: cityKey, lastSyncedAt: new Date() };
    if (patch.panNumber !== undefined && patch.panNumber !== null) {
      patch.panNumber = nPan(patch.panNumber) || null;
    }
    const merged = repo.merge(existing || repo.create(), patch);
    return repo.save(merged);
  }

  async bulkUpsert(source: VendorSource, items: any[]) {
    let saved = 0;
    for (const item of items) {
      if (!item.vendorCode) continue;
      await this.upsertOne(source, item);
      saved += 1;
    }
    this.logger.log(`Upserted ${saved} ${source} vendors`);
    return { saved };
  }

  /**
   * High-throughput path: COPY into TEMP + INSERT … ON CONFLICT.
   * Preserves existing non-null fields when incoming values are null (COALESCE merge).
   */
  async bulkUpsertFast(source: VendorSource, items: any[]): Promise<{ saved: number }> {
    const rows = items.filter((i) => i?.vendorCode);
    if (rows.length === 0) return { saved: 0 };

    const repo = this.repoFor(source);
    const meta = repo.metadata;
    const tableName = meta.tableName;
    const tmpTable = `tmp_${tableName}`;
    const copyCols = this.copyColumns(meta);
    const vendorCol = copyCols.find((c) => c.propertyName === 'vendorCode');
    const cityCol = copyCols.find((c) => c.propertyName === 'city');
    const lastSyncedCol = copyCols.find((c) => c.propertyName === 'lastSyncedAt');
    if (!vendorCol || !cityCol || !lastSyncedCol) {
      throw new Error(
        `bulkUpsertFast: missing vendorCode, city, or lastSyncedAt column metadata for ${tableName}`,
      );
    }

    // Conflict key columns are not updated on conflict (they ARE the match condition).
    const mergeCols = copyCols.filter(
      (c) =>
        c.propertyName !== 'vendorCode' &&
        c.propertyName !== 'city' &&
        c.propertyName !== 'lastSyncedAt',
    );

    const colListSql = copyCols.map((c) => qi(c.databaseName)).join(', ');
    const selectList = copyCols.map((c) => qi(c.databaseName)).join(', ');
    const conflictTarget = `${qi(vendorCol.databaseName)}, ${qi(cityCol.databaseName)}`;
    const setClause = [
      ...mergeCols.map(
        (c) =>
          `${qi(c.databaseName)} = COALESCE(EXCLUDED.${qi(c.databaseName)}, ${qi(tableName)}.${qi(c.databaseName)})`,
      ),
      `${qi(lastSyncedCol.databaseName)} = NOW()`,
    ].join(', ');

    const nowMs = Date.now();
    const stamped = rows.map((item) => ({
      ...item,
      // City is part of the composite PK — empty cells must coalesce to a stable sentinel.
      city: ((item.city ?? '') as string).trim().toUpperCase() || 'UNSPECIFIED',
      lastSyncedAt: item.lastSyncedAt ?? new Date(nowMs),
    }));

    const quoteChar = '\b';
    const copySql =
      `COPY ${qi(tmpTable)} (${colListSql}) FROM STDIN ` +
      `WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N', QUOTE E'\\b')`;

    const qr = repo.manager.connection.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const client = (qr as any).databaseConnection as import('pg').PoolClient;
      if (!client?.query) {
        throw new Error('bulkUpsertFast: could not obtain pg client from query runner');
      }

      await qr.query(
        `CREATE TEMP TABLE ${qi(tmpTable)} (LIKE ${qi(tableName)} INCLUDING DEFAULTS) ON COMMIT DROP`,
      );

      const lineEnding = '\n';
      const readable = Readable.from(
        stamped.map((item) => this.formatCopyLine(copyCols, item, quoteChar) + lineEnding),
      );

      const copyStream = client.query(copyFrom(copySql));
      await pipeline(readable, copyStream);

      const insertSql =
        `INSERT INTO ${qi(tableName)} (${colListSql}) ` +
        `SELECT ${selectList} FROM ${qi(tmpTable)} ` +
        `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${setClause}`;

      await qr.query(insertSql);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return { saved: rows.length };
  }

  async clearAll(source: VendorSource) {
    return this.repoFor(source).clear();
  }

  async stats() {
    const [p2pCount, erpCount] = await Promise.all([
      this.p2pRepo.count(),
      this.erpRepo.count(),
    ]);
    return { p2pCount, erpCount };
  }
}
