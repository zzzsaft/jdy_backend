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
} from "typeorm";
import type { Relation } from "typeorm";
import { ContractArchive } from "./contractArchive.entity.js";

@Entity({ name: "contract_archive_versions", schema: "quote_agent" })
@Unique(["archiveId", "version"])
@Index(["archiveId", "createdAt"])
export class ContractArchiveVersion extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "archive_id", type: "bigint" })
  archiveId: string;

  @Column({ type: "int" })
  version: number;

  @Column("jsonb", { name: "snapshot_jsonb" })
  snapshotJsonb: unknown;

  @Column("jsonb", { name: "change_summary_jsonb", default: () => "'[]'::jsonb" })
  changeSummaryJsonb: unknown;

  @Column({ name: "edited_by", type: "text", nullable: true })
  editedBy: string | null;

  @Column({ name: "edit_reason", type: "text", nullable: true })
  editReason: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @ManyToOne(() => ContractArchive, (archive) => archive.versions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "archive_id" })
  archive: Relation<ContractArchive>;
}
