import {
  Column, Entity, PrimaryColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Composite primary key (vendorCode, city) — Sprint 4.4: each (code, city) pair
 * is its own vendor record so multi-site vendors are not collapsed.
 *
 * Empty city is normalized to 'UNSPECIFIED' before persistence so the PK is always populated.
 */
@Entity('p2p_vendors')
export class P2pVendor {
  @PrimaryColumn({ length: 30 }) vendorCode: string;
  @PrimaryColumn({ length: 100, default: 'UNSPECIFIED' }) city: string;

  @Column({ length: 300 }) vendorName: string;

  @Column({ length: 100, nullable: true }) vendorType: string;
  @Column({ length: 100, nullable: true }) vendorCategory: string;
  @Column({ length: 100, nullable: true }) vendorGroup: string;
  @Column({ length: 50, nullable: true }) payTerm: string;
  @Column({ length: 30, nullable: true }) residentStatus: string;
  @Column({ length: 30, nullable: true }) applicantType: string;
  @Column({ length: 20, default: 'Yes' }) activeStatus: string;
  @Column({ length: 20, nullable: true }) hold: string;

  @Column({ length: 20, nullable: true }) panNumber: string;
  @Column({ length: 20, nullable: true }) gstNumber: string;
  @Column({ length: 50, nullable: true }) msmeNumber: string;

  @Column({ length: 30, nullable: true }) bankAccount: string;
  @Column({ length: 100, nullable: true }) bankName: string;
  @Column({ length: 20, nullable: true }) ifscCode: string;

  @Column({ length: 100, nullable: true }) tdsSection: string;

  @Column({ length: 500, nullable: true }) address: string;
  @Column({ length: 100, nullable: true }) state: string;
  @Column({ length: 100, nullable: true, default: 'India' }) country: string;
  @Column({ length: 20, nullable: true }) pincode: string;

  @Column({ length: 200, nullable: true }) email: string;
  @Column({ length: 30, nullable: true }) phone: string;

  @Column({ length: 100, nullable: true }) createdByErp: string;
  @Column({ type: 'timestamp', nullable: true }) createdDateErp: Date;
  @Column({ length: 100, nullable: true }) approvedByErp: string;
  @Column({ type: 'timestamp', nullable: true }) approvedDateErp: Date;
  @Column({ length: 30, nullable: true }) approvalStatus: string;

  @Column({ type: 'timestamp', nullable: true }) lastSyncedAt: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
