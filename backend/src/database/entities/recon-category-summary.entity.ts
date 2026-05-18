import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { ReconRun } from './recon-run.entity';

@Entity('recon_category_summary')
@Index(['runId'])
export class ReconCategorySummary {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 50 }) category: string;

  @Column({ default: 0 }) missingCount: number;
  @Column({ default: 0 }) p2pUnique: number;
  @Column({ default: 0 }) erpUnique: number;
  @Column({ default: 0 }) p2pMissing: number;
  @Column({ default: 0 }) erpMissing: number;
  @Column({ default: 0 }) matched: number;

  @Column({ type: 'uuid' }) runId: string;
  @ManyToOne(() => ReconRun, (r) => r.summary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: ReconRun;
}
