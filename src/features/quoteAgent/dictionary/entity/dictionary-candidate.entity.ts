import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { DictionaryTerm } from "./dictionary-term.entity";

@Entity({ name: "dictionary_candidates", schema: "quote_agent" })
@Unique(["termType", "normalizedRawValue", "status"])
@Index(["status"])
@Index(["termType", "normalizedRawValue"])
@Index(["sourceProductType"])
@Index(["documentId"])
@Index(["extractionResultId"])
export class DictionaryCandidate extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "document_id", type: "bigint", nullable: true })
  documentId: string | null;

  @Column({ name: "extraction_result_id", type: "bigint", nullable: true })
  extractionResultId: string | null;

  @Column({
    name: "source_product_type",
    type: "varchar",
    length: 100,
    default: "unknown",
  })
  sourceProductType: string;

  @Column({ name: "item_index", type: "int", nullable: true })
  itemIndex: number | null;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "raw_value", type: "text" })
  rawValue: string;

  @Column({ name: "normalized_raw_value", type: "text" })
  normalizedRawValue: string;

  @Column({ name: "proposed_canonical_value", type: "text", nullable: true })
  proposedCanonicalValue: string | null;

  @Column({ name: "proposed_term_id", type: "bigint", nullable: true })
  proposedTermId: string | null;

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

  @ManyToOne(() => DictionaryTerm, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "proposed_term_id" })
  proposedTerm: DictionaryTerm | null;
}
