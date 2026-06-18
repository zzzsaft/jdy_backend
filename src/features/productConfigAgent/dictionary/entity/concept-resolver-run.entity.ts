import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "concept_resolver_runs", schema: "quote_agent" })
@Index(["status"])
@Index(["scope"])
export class ConceptResolverRun extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ type: "varchar", length: 50, default: "realtime_candidate" })
  scope: string;

  @Column({ type: "varchar", length: 50, default: "dry_run" })
  mode: string;

  @Column({ type: "varchar", length: 30, default: "running" })
  status: string;

  @Column({ name: "dictionary_version_at_start", type: "bigint", nullable: true })
  dictionaryVersionAtStart: string | null;

  @Column({ name: "resolver_version", type: "varchar", length: 50, default: "v1" })
  resolverVersion: string;

  @Column({ type: "jsonb", nullable: true })
  stats: unknown | null;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({ name: "finished_at", type: "timestamp", nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}

