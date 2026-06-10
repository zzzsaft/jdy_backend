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
import { ExtractionResults } from "./extractionResults.entity.js";

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

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @OneToOne(() => DocumentBlocks, (blocks) => blocks.document)
  blocks: Relation<DocumentBlocks>;

  @OneToMany(() => ExtractionResults, (result) => result.document)
  extractionResults: Relation<ExtractionResults[]>;
}
