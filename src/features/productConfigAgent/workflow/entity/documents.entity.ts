import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { DocumentBlocks } from "./documentBlocks.entity.js";
import { ExtractionResults } from "../../extraction/entity/extractionResults.entity.js";

@Entity({ name: "documents", schema: "quote_agent" })
export class Documents extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "file_name" })
  fileName: string;

  @Column({ name: "file_hash", unique: true })
  fileHash: string;

  @Column({ name: "file_path" })
  filePath: string;

  @Column()
  source: string;

  @Column({ default: "uploaded" })
  status: string;

  @Column({ name: "dirty_reason", type: "varchar", length: 80, nullable: true })
  dirtyReason: string | null;

  @Column({ name: "dirty_source_run_id", type: "bigint", nullable: true })
  dirtySourceRunId: string | null;

  @Column({ name: "dirty_dictionary_version", type: "bigint", nullable: true })
  dirtyDictionaryVersion: string | null;

  @Column({ name: "dirty_normalization_rule_version", type: "varchar", length: 50, nullable: true })
  dirtyNormalizationRuleVersion: string | null;

  @Column({ name: "dirty_resolver_version", type: "varchar", length: 50, nullable: true })
  dirtyResolverVersion: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => DocumentBlocks, (blocks) => blocks.document)
  blocks: Relation<DocumentBlocks>;

  @OneToMany(() => ExtractionResults, (result) => result.document)
  extractionResults: Relation<ExtractionResults[]>;
}
