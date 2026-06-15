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

@Entity({ name: "dictionary_unit_candidates", schema: "quote_agent" })
@Unique(["normalizedRawUnit", "status"])
@Index(["status"])
@Index(["normalizedRawUnit"])
@Index(["documentId"])
@Index(["extractionResultId"])
@Index(["termType"])
export class DictionaryUnitCandidate extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "document_id", type: "bigint", nullable: true })
  documentId: string | null;

  @Column({ name: "extraction_result_id", type: "bigint", nullable: true })
  extractionResultId: string | null;

  @Column({ name: "term_type", type: "varchar", length: 100, nullable: true })
  termType: string | null;

  @Column({ name: "raw_value", type: "text" })
  rawValue: string;

  @Column({ name: "raw_unit", type: "text" })
  rawUnit: string;

  @Column({ name: "normalized_raw_unit", type: "text" })
  normalizedRawUnit: string;

  @Column({ name: "proposed_canonical_unit", type: "text", nullable: true })
  proposedCanonicalUnit: string | null;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "jsonb", nullable: true })
  evidence: unknown | null;

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
