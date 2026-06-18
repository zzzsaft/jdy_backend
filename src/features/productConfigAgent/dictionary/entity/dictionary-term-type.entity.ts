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
import type { DictionaryValueKind } from "../dictionary.types.js";

@Entity({ name: "dictionary_term_types", schema: "quote_agent" })
@Unique(["termType"])
@Index(["termType"])
@Index(["category"])
@Index(["isActive"])
@Index(["applicableProductTypes"])
export class DictionaryTermType extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "display_name", type: "text" })
  displayName: string;

  @Column({ name: "quote_display_name", type: "text", nullable: true })
  quoteDisplayName: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  category: string | null;

  @Column({ name: "value_kind", type: "varchar", length: 50, default: "enum" })
  valueKind: DictionaryValueKind;

  @Column({ type: "varchar", length: 50, default: "item" })
  scope: string;

  @Column({ name: "concept_role", type: "varchar", length: 50, default: "config_attribute" })
  conceptRole: string;

  @Column({ name: "risk_level", type: "varchar", length: 30, default: "normal" })
  riskLevel: string;

  @Column({ name: "baseline_trust_tier", type: "varchar", length: 30, default: "provisional" })
  baselineTrustTier: string;

  @Column({ name: "baseline_risk_labels", type: "jsonb", default: () => "'[]'::jsonb" })
  baselineRiskLabels: string[];

  @Column({ name: "sort_order", type: "int", default: 100 })
  sortOrder: number;

  @Column({
    name: "applicable_product_types",
    type: "jsonb",
    default: () => `'["common"]'::jsonb`,
  })
  applicableProductTypes: string[];

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
