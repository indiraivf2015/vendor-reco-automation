import {
  Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn,
} from 'typeorm';
import { ReconRun } from './recon-run.entity';

export type ExceptionType =
  | 'MISSING_IN_ERP'
  | 'MISSING_IN_P2P'
  | 'VENDOR_NAME_MISMATCH'
  | 'PAN_MISMATCH'
  | 'GST_MISMATCH'
  | 'MSME_MISMATCH'
  | 'IFSC_MISMATCH'
  | 'BANK_ACCOUNT_MISMATCH'
  | 'BANK_NAME_MISMATCH'
  | 'TDS_MISMATCH'
  | 'PAYMENT_TERM_MISMATCH';

export type ExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ExceptionStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'IGNORED';

@Entity('recon_exceptions')
@Index(['runId'])
@Index(['vendorCode'])
@Index(['status'])
@Index(['type'])
export class ReconException {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 30 }) vendorCode: string;
  @Column({ length: 100, default: 'UNSPECIFIED' }) city: string;
  @Column({ length: 300, nullable: true }) vendorName: string;

  @Column({ length: 40 }) type: ExceptionType;
  @Column({ length: 20, default: 'MEDIUM' }) severity: ExceptionSeverity;
  @Column({ length: 20, default: 'OPEN' }) status: ExceptionStatus;

  @Column({ length: 50, nullable: true }) fieldName: string;
  @Column({ type: 'text', nullable: true }) p2pValue: string;
  @Column({ type: 'text', nullable: true }) erpValue: string;
  @Column({ type: 'text', nullable: true }) description: string;

  @Column({ type: 'text', nullable: true }) resolutionNotes: string;
  @Column({ length: 100, nullable: true }) resolvedBy: string;
  @Column({ type: 'timestamp', nullable: true }) resolvedAt: Date;

  @Column({ type: 'uuid' }) runId: string;
  @ManyToOne(() => ReconRun, (r) => r.exceptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: ReconRun;

  @CreateDateColumn() createdAt: Date;
}
