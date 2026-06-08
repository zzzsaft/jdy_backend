import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ name: "dictionary_candidate_occurrences", schema: "quote_agent" })
@Unique(["candidateType", "candidateId", "extractionResultId", "itemIndex", "fieldName"])
@Index(["candidateType", "candidateId"])
@Index(["sourceProductType"])
@Index(["documentId"])
@Index(["extractionResultId"])
export class DictionaryCandidateOccurrence extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "candidate_type", type: "varchar", length: 30 })
  candidateType: "term_type" | "value";

  @Column({ name: "candidate_id", type: "bigint" })
  candidateId: string;

  @Column({ name: "document_id", type: "bigint" })
  documentId: string;

  @Column({ name: "extraction_result_id", type: "bigint" })
  extractionResultId: string;

  @Column({ name: "item_index", type: "int" })
  itemIndex: number;

  @Column({
    name: "source_product_type",
    type: "varchar",
    length: 100,
    default: "unknown",
  })
  sourceProductType: string;

  @Column({ name: "field_name", type: "text" })
  fieldName: string;

  @Column({ name: "raw_value", type: "text", nullable: true })
  rawValue: string | null;

  @Column({ type: "jsonb", nullable: true })
  evidence: unknown | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}
