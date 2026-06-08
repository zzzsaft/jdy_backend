import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "llm_call_logs", schema: "public" })
@Index(["provider"])
@Index(["model"])
@Index(["purpose"])
@Index(["status"])
export class LlmCallLog extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ type: "varchar", length: 50 })
  provider: string;

  @Column({ type: "varchar", length: 100 })
  model: string;

  @Column({ type: "varchar", length: 100 })
  purpose: string;

  @Column({ type: "jsonb" })
  input: unknown;

  @Column({ type: "jsonb", nullable: true })
  output: unknown | null;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({ type: "varchar", length: 30, default: "pending" })
  status: "pending" | "success" | "failed";

  @Column({ name: "latency_ms", type: "int", nullable: true })
  latencyMs: number | null;

  @Column({ name: "started_at", type: "timestamp" })
  startedAt: Date;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}
