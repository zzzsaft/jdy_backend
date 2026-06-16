import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AgentToolCallStatus = "running" | "completed" | "failed";

@Entity({ name: "agent_tool_calls", schema: "quote_agent" })
@Index(["runId", "stepId"])
@Index(["toolName"])
@Index(["status"])
export class AgentToolCall extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "run_id", type: "bigint" })
  runId: string;

  @Column({ name: "step_id", type: "varchar", length: 100 })
  stepId: string;

  @Column({ name: "tool_name", type: "varchar", length: 100 })
  toolName: string;

  @Column("jsonb", { name: "args_jsonb", default: () => "'{}'::jsonb" })
  argsJsonb: unknown;

  @Column("jsonb", { name: "result_jsonb", nullable: true })
  resultJsonb: unknown;

  @Column({ type: "varchar", length: 50, default: "running" })
  status: AgentToolCallStatus;

  @Column("jsonb", { name: "error_jsonb", nullable: true })
  errorJsonb: unknown;

  @Column({ name: "duration_ms", type: "int", nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
