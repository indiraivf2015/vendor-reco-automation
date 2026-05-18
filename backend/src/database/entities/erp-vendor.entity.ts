import {
  Column, Entity, PrimaryColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Composite primary key (vendorCode, city) — Sprint 4.4: each (code, city) pair
 * is its own vendor record so multi-site vendors are not collapsed.
 */
@Entity('erp_vendors')
export class ErpVendor {
  @PrimaryColumn({ length: 30 }) vendorCode: string;
  @PrimaryColumn({ length: 100, default: 'UNSPECIFIED' }) city: string;

  @Column({ length: 50, nullable: true }) vendorId: string;
  @Column({ length: 50, nullable: true }) partyId: string;
  @Column({ length: 300 }) vendorName: string;

  @Column({ length: 100, nullable: true }) taxOrgType: string;
  @Column({ length: 100, nullable: true }) vendorTypeLookupCode: string;
  @Column({ length: 30, default: 'Active' }) status: string;

  @Column({ length: 30, nullable: true }) msmeCategory: string;
  @Column({ length: 50, nullable: true }) msmeNumber: string;

  @Column({ length: 20, nullable: true }) gstNumber: string;
  @Column({ length: 20, nullable: true }) panNumber: string;
  @Column({ length: 200, nullable: true }) withholdTaxGroup: string;

  @Column({ length: 30, nullable: true }) paymentMethodCode: string;
  @Column({ length: 30, nullable: true }) bankAccount: string;
  @Column({ length: 100, nullable: true }) bankName: string;
  @Column({ length: 100, nullable: true }) bankBranchName: string;
  @Column({ length: 20, nullable: true }) ifscCode: string;

  @Column({ length: 200, nullable: true }) remitEmail: string;
  @Column({ length: 100, nullable: true }) supplierAddressName: string;

  @Column({ length: 500, nullable: true }) address: string;
  @Column({ length: 100, nullable: true }) state: string;
  @Column({ length: 20, nullable: true }) postalCode: string;
  @Column({ length: 10, nullable: true, default: 'IN' }) country: string;

  @Column({ length: 50, nullable: true }) paymentTerm: string;
  @Column({ length: 200, nullable: true }) email: string;

  @Column({ type: 'timestamp', nullable: true }) endDateActive: Date;
  @Column({ type: 'timestamp', nullable: true }) lastSyncedAt: Date;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
