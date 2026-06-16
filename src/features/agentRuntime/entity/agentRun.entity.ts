import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AgentRunStatus = "running" | "completed" | "failed";

@Entity({ name: "agent_runs", schema: "quote_agent" })
@Index(["sessionId", "createdAt"])
@Index(["agentType"])
@Index(["status"])
export class AgentRun extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "session_id", type: "bigint" })
  sessionId: string;

  @Column({ name: "agent_type", type: "varchar", length: 100 })
  agentType: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  intent: string | null;

  @Column({ type: "varchar", length: 50, default: "running" })
  status: AgentRunStatus;

  @Column("jsonb", { name: "planner_jsonb", default: () => "'{}'::jsonb" })
  plannerJsonb: unknown;

  @Column("jsonb", { name: "context_summary_jsonb", default: () => "'{}'::jsonb" })
  contextSummaryJsonb: unknown;

  @Column("jsonb", { name: "error_jsonb", nullable: true })
  errorJsonb: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
