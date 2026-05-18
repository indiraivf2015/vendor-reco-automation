import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['action'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 100 }) action: string;
  @Column({ length: 100, nullable: true }) entityType: string;
  @Column({ length: 100, nullable: true }) entityId: string;
  @Column({ length: 100, nullable: true }) userIdentifier: string;
  @Column({ type: 'text', nullable: true }) details: string;
  @Column({ length: 50, nullable: true }) ipAddress: string;

  @CreateDateColumn() createdAt: Date;
}
