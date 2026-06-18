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

@Entity({ name: "dictionary_terms", schema: "quote_agent" })
@Unique(["termType", "canonicalValue"])
@Index(["termType"])
@Index(["isActive"])
export class DictionaryTerm extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "canonical_value", type: "text" })
  canonicalValue: string;

  @Column({ name: "display_name", type: "text", nullable: true })
  displayName: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 50, default: "value" })
  scope: string;

  @Column({ name: "concept_role", type: "varchar", length: 50, default: "enum_value" })
  conceptRole: string;

  @Column({ name: "risk_level", type: "varchar", length: 30, default: "normal" })
  riskLevel: string;

  @Column({ name: "baseline_trust_tier", type: "varchar", length: 30, default: "provisional" })
  baselineTrustTier: string;

  @Column({ name: "baseline_risk_labels", type: "jsonb", default: () => "'[]'::jsonb" })
  baselineRiskLabels: string[];

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
