import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Documents } from "./documents.entity";

@Entity({ name: "extraction_results", schema: "quote_agent" })
export class ExtractionResults extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("idx_extraction_results_document_id")
  @Column({ name: "document_id" })
  documentId: number;

  @Column("jsonb", { name: "extraction_json" })
  extractionJson: unknown;

  @Column("jsonb", { name: "normalized_extraction_json", nullable: true })
  normalizedExtractionJson: unknown | null;

  @Column("jsonb", { name: "dictionary_proposals", nullable: true })
  dictionaryProposals: unknown | null;

  @Column("jsonb", { nullable: true })
  warnings: unknown | null;

  @Column({ name: "llm_model" })
  llmModel: string;

  @Column({ name: "prompt_version" })
  promptVersion: string;

  @Column({ name: "dictionary_version", type: "int" })
  dictionaryVersion: number;

  @Column({ default: "parsed" })
  status: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @ManyToOne(() => Documents, (document) => document.extractionResults, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "document_id" })
  document: Documents;
}
