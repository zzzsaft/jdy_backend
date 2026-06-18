import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

export type DictionaryHealthTargetKind = "termType" | "enumValue";

@Entity({ name: "dictionary_health_report", schema: "productConfigAgent" })
@Unique(["targetKind", "targetId"])
@Index(["targetKind"])
@Index(["riskScore"])
@Index(["lastAuditedAt"])
export class DictionaryHealthReport extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "target_kind", type: "varchar", length: 30 })
  targetKind: DictionaryHealthTargetKind;

  @Column({ name: "target_id", type: "text" })
  targetId: string;

  @Column({ name: "audit_run_id", type: "text", nullable: true })
  auditRunId: string | null;

  @Column({ name: "dictionary_version", type: "bigint", nullable: true })
  dictionaryVersion: string | null;

  @Column({ name: "risk_score", type: "numeric", precision: 5, scale: 2 })
  riskScore: string;

  @Column({ name: "risk_labels", type: "jsonb", default: () => "'[]'::jsonb" })
  riskLabels: string[];

  @Column({ name: "trust_signals", type: "jsonb", default: () => "'{}'::jsonb" })
  trustSignals: Record<string, unknown>;

  @Column({ name: "evidence_json", type: "jsonb", default: () => "'{}'::jsonb" })
  evidenceJson: Record<string, unknown>;

  @Column({ name: "recommended_action", type: "text" })
  recommendedAction: string;

  @Column({ name: "affected_records_count", type: "int", default: 0 })
  affectedRecordsCount: number;

  @Column({ name: "last_audited_at", type: "timestamp" })
  lastAuditedAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
