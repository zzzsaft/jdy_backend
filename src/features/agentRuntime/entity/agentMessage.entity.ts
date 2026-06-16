import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

@Entity({ name: "agent_messages", schema: "quote_agent" })
@Index(["sessionId", "createdAt"])
@Index(["role"])
export class AgentMessage extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "session_id", type: "bigint" })
  sessionId: string;

  @Column({ type: "varchar", length: 50 })
  role: AgentMessageRole;

  @Column({ type: "text", nullable: true })
  content: string | null;

  @Column("jsonb", { name: "content_jsonb", nullable: true })
  contentJsonb: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;
}
