import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

export type BackgroundJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

@Entity({ name: "background_jobs", schema: "public" })
export class BackgroundJob {
  @PrimaryColumn({ name: "id", type: "varchar", length: 80 })
  id!: string;

  @Column({ name: "type", type: "varchar", length: 120 })
  type!: string;

  @Column({ name: "status", type: "varchar", length: 24 })
  status!: BackgroundJobStatus;

  @Column({ name: "payload", type: "jsonb", nullable: true })
  payload!: Record<string, any> | null;

  @Column({ name: "progress", type: "jsonb", nullable: true })
  progress!: Record<string, any> | null;

  @Column({ name: "result", type: "jsonb", nullable: true })
  result!: Record<string, any> | null;

  @Column({ name: "error", type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "attempts", type: "int", default: 0 })
  attempts!: number;

  @Column({ name: "max_attempts", type: "int", default: 1 })
  maxAttempts!: number;

  @Column({ name: "locked_by", type: "varchar", length: 120, nullable: true })
  lockedBy!: string | null;

  @Column({ name: "locked_until", type: "timestamptz", nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt!: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
