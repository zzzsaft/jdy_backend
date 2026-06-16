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

@Entity({ name: "split_resolutions", schema: "quote_agent" })
@Index("idx_split_resolutions_document_id", ["documentId"])
@Index("idx_split_resolutions_extraction_result_id", ["extractionResultId"])
@Index("idx_split_resolutions_source", [
  "extractionResultId",
  "itemIndex",
  "rawFieldName",
])
@Unique("uq_split_resolutions_candidate_review_key", [
  "extractionResultId",
  "itemIndex",
  "rawFieldName",
  "rawValue",
  "source",
])
export class SplitResolution extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "document_id", type: "bigint" })
  documentId: string;

  @Column({ name: "extraction_result_id", type: "bigint" })
  extractionResultId: string;

  @Column({ name: "item_index", type: "int" })
  itemIndex: number;

  @Column({ name: "raw_field_name", type: "text" })
  rawFieldName: string;

  @Column({ name: "raw_value", type: "text" })
  rawValue: string;

  @Column({ name: "raw_text", type: "text", nullable: true })
  rawText: string | null;

  @Column({ name: "split_fields", type: "jsonb" })
  splitFields: unknown;

  @Column({ type: "jsonb", nullable: true })
  evidence: unknown | null;

  @Column({ type: "varchar", length: 50, default: "llm_extract" })
  source: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
