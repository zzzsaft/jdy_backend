import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Documents } from "./documents.entity";

@Entity({ name: "document_blocks", schema: "quote_agent" })
export class DocumentBlocks extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("idx_document_blocks_document_id")
  @Column({ name: "document_id", unique: true })
  documentId: number;

  @Column("jsonb", { name: "blocks_json" })
  blocksJson: unknown;

  @Column({ name: "parser_version", default: "v1" })
  parserVersion: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => Documents, (document) => document.blocks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "document_id" })
  document: Documents;
}
