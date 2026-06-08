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

@Entity({ name: "dictionary_term_type_candidates", schema: "quote_agent" })
@Unique(["sourceProductType", "normalizedFieldName", "status"])
@Index(["status"])
@Index(["sourceProductType"])
@Index(["normalizedFieldName"])
@Index(["proposedTermType"])
@Index(["documentId"])
@Index(["extractionResultId"])
export class DictionaryTermTypeCandidate extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({
    name: "source_product_type",
    type: "varchar",
    length: 100,
    default: "unknown",
  })
  sourceProductType: string;

  @Column({ name: "document_id", type: "bigint", nullable: true })
  documentId: string | null;

  @Column({ name: "extraction_result_id", type: "bigint", nullable: true })
  extractionResultId: string | null;

  @Column({ name: "item_index", type: "int", nullable: true })
  itemIndex: number | null;

  @Column({ name: "raw_field_name", type: "text" })
  rawFieldName: string;

  @Column({ name: "normalized_field_name", type: "text" })
  normalizedFieldName: string;

  @Column({ name: "raw_value", type: "text", nullable: true })
  rawValue: string | null;

  @Column({ name: "proposed_term_type", type: "varchar", length: 100, nullable: true })
  proposedTermType: string | null;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "jsonb", nullable: true })
  evidence: unknown | null;

  @Column({
    type: "numeric",
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidence: string | null;

  @Column({ type: "varchar", length: 30, default: "pending" })
  status: string;

  @Column({ name: "reviewed_by", type: "text", nullable: true })
  reviewedBy: string | null;

  @Column({ name: "reviewed_at", type: "timestamp", nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
