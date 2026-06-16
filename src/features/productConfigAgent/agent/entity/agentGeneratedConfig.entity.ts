import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

export type AgentGeneratedConfigStatus = "draft" | "confirmed" | "archived";

@Entity({ name: "agent_generated_configs", schema: "quote_agent" })
@Unique(["shareToken"])
@Index(["runId"])
@Index(["sessionId"])
@Index(["ownerUserId"])
@Index(["status"])
export class AgentGeneratedConfig extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "run_id", type: "bigint" })
  runId: string;

  @Column({ name: "session_id", type: "bigint" })
  sessionId: string;

  @Column({ type: "text", nullable: true })
  title: string | null;

  @Column({ type: "varchar", length: 50, default: "draft" })
  status: AgentGeneratedConfigStatus;

  @Column("jsonb", { name: "config_jsonb", default: () => "'{}'::jsonb" })
  configJsonb: unknown;

  @Column("jsonb", { name: "validation_jsonb", default: () => "'{}'::jsonb" })
  validationJsonb: unknown;

  @Column({ name: "share_token", type: "text", nullable: true })
  shareToken: string | null;

  @Column({ name: "owner_user_id", type: "text", nullable: true })
  ownerUserId: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
