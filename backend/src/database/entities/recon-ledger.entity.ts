import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { ReconRun } from './recon-run.entity';

@Entity('recon_ledger')
@Index(['runId'])
@Index(['vendorCode'])
@Index(['runId', 'vendorCode', 'city'])
export class ReconLedger {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 30 }) vendorCode: string;
  @Column({ length: 100, default: 'UNSPECIFIED' }) city: string;
  @Column({ length: 300, nullable: true }) vendorUniqueId: string;

  @Column({ length: 300, nullable: true }) vendorNameP2p: string;
  @Column({ length: 300, nullable: true }) vendorNameErp: string;
  @Column({ default: false }) vendorNameMatch: boolean;

  @Column({ length: 30, nullable: true }) vendorCodeP2p: string;
  @Column({ length: 30, nullable: true }) vendorCodeErp: string;
  @Column({ default: false }) vendorCodeMatch: boolean;

  @Column({ length: 30, nullable: true }) panP2p: string;
  @Column({ length: 30, nullable: true }) panErp: string;
  @Column({ default: false }) panMatch: boolean;

  @Column({ length: 30, nullable: true }) gstP2p: string;
  @Column({ length: 30, nullable: true }) gstErp: string;
  @Column({ default: false }) gstMatch: boolean;

  @Column({ length: 50, nullable: true }) msmeP2p: string;
  @Column({ length: 50, nullable: true }) msmeErp: string;
  @Column({ default: false }) msmeMatch: boolean;

  @Column({ length: 30, nullable: true }) ifscP2p: string;
  @Column({ length: 30, nullable: true }) ifscErp: string;
  @Column({ default: false }) ifscMatch: boolean;

  @Column({ length: 50, nullable: true }) bankAccountP2p: string;
  @Column({ length: 50, nullable: true }) bankAccountErp: string;
  @Column({ default: false }) bankAccountMatch: boolean;

  @Column({ length: 200, nullable: true }) bankNameP2p: string;
  @Column({ length: 200, nullable: true }) bankNameErp: string;
  @Column({ default: false }) bankNameMatch: boolean;

  @Column({ length: 200, nullable: true }) tdsP2p: string;
  @Column({ length: 200, nullable: true }) tdsErp: string;
  @Column({ default: false }) tdsMatch: boolean;

  @Column({ length: 100, nullable: true }) paymentTermP2p: string;
  @Column({ length: 100, nullable: true }) paymentTermErp: string;
  @Column({ default: false }) paymentTermMatch: boolean;

  @Column({ default: true }) presentInP2p: boolean;
  @Column({ default: true }) presentInErp: boolean;
  @Column({ default: 0 }) mismatchCount: number;

  @Column({ type: 'uuid' }) runId: string;
  @ManyToOne(() => ReconRun, (r) => r.ledger, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: ReconRun;
}
