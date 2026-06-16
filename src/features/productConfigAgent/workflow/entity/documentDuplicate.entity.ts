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
import type { Relation } from "typeorm";
import { Documents } from "./documents.entity.js";

@Entity({ name: "document_duplicates", schema: "quote_agent" })
@Index("idx_document_duplicates_canonical_document_id", ["canonicalDocumentId"])
@Index("idx_document_duplicates_content_hash", ["contentHash"])
export class DocumentDuplicate extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "duplicate_document_id", unique: true })
  duplicateDocumentId: number;

  @Column({ name: "canonical_document_id" })
  canonicalDocumentId: number;

  @Column({ default: "same_file_name_same_content" })
  reason: string;

  @Column({ name: "content_hash" })
  contentHash: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @ManyToOne(() => Documents, { onDelete: "CASCADE" })
  @JoinColumn({ name: "duplicate_document_id" })
  duplicateDocument: Relation<Documents>;

  @ManyToOne(() => Documents, { onDelete: "CASCADE" })
  @JoinColumn({ name: "canonical_document_id" })
  canonicalDocument: Relation<Documents>;
}
