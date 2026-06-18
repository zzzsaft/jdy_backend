import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "dictionary_change_logs", schema: "quote_agent" })
@Index(["dictionaryVersion"])
@Index(["candidateType", "candidateId"])
@Index(["source"])
export class DictionaryChangeLog extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "dictionary_version", type: "bigint" })
  dictionaryVersion: string;

  @Column({ type: "varchar", length: 80 })
  source: string;

  @Column({ type: "varchar", length: 80 })
  action: string;

  @Column({ name: "candidate_type", type: "varchar", length: 30, nullable: true })
  candidateType: "term_type" | "value" | null;

  @Column({ name: "candidate_id", type: "bigint", nullable: true })
  candidateId: string | null;

  @Column({ name: "resolver_run_id", type: "bigint", nullable: true })
  resolverRunId: string | null;

  @Column({ name: "before_jsonb", type: "jsonb", nullable: true })
  beforeJsonb: unknown | null;

  @Column({ name: "after_jsonb", type: "jsonb", nullable: true })
  afterJsonb: unknown | null;

  @Column({ name: "changed_by", type: "text", nullable: true })
  changedBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}

