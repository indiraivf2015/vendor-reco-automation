import {
  Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, OneToMany,
} from 'typeorm';
import { ReconException } from './recon-exception.entity';
import { ReconLedger } from './recon-ledger.entity';
import { ReconCategorySummary } from './recon-category-summary.entity';

export type ReconStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ReconTrigger = 'SCHEDULED' | 'MANUAL' | 'UPLOAD';

@Entity('recon_runs')
export class ReconRun {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 30 }) status: ReconStatus;
  @Column({ length: 20, default: 'SCHEDULED' }) trigger: ReconTrigger;

  @Column({ default: 0 }) totalP2pVendors: number;
  @Column({ default: 0 }) totalErpVendors: number;
  @Column({ default: 0 }) commonVendors: number;
  @Column({ default: 0 }) missingInErpCount: number;
  @Column({ default: 0 }) missingInP2pCount: number;
  @Column({ default: 0 }) totalExceptions: number;
  @Column({ default: 0 }) matchRatePct: number;

  @Column({ type: 'timestamp', nullable: true }) startedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) completedAt: Date;
  @Column({ type: 'int', nullable: true }) durationMs: number;
  @Column({ type: 'text', nullable: true }) errorMessage: string;
  @Column({ length: 100, nullable: true }) triggeredBy: string;

  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => ReconException, (e) => e.run) exceptions: ReconException[];
  @OneToMany(() => ReconLedger, (l) => l.run) ledger: ReconLedger[];
  @OneToMany(() => ReconCategorySummary, (s) => s.run) summary: ReconCategorySummary[];
}
