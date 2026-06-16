import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "user_preferences", schema: "quote_agent" })
@Index(["ownerUserId", "preferenceKey"], { unique: true })
export class UserPreference extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "owner_user_id", type: "text" })
  ownerUserId: string;

  @Column({ name: "preference_key", type: "text" })
  preferenceKey: string;

  @Column("jsonb", { name: "value_jsonb", nullable: true })
  valueJsonb: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
