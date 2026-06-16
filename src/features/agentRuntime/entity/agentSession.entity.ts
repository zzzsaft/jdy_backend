import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "agent_sessions", schema: "quote_agent" })
@Index(["agentType"])
@Index(["ownerUserId"])
@Index(["status"])
export class AgentSession extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "agent_type", type: "varchar", length: 100 })
  agentType: string;

  @Column({ type: "text", nullable: true })
  title: string | null;

  @Column({ name: "owner_user_id", type: "text", nullable: true })
  ownerUserId: string | null;

  @Column({ type: "varchar", length: 50, default: "active" })
  status: string;

  @Column("jsonb", { name: "metadata_jsonb", default: () => "'{}'::jsonb" })
  metadataJsonb: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
