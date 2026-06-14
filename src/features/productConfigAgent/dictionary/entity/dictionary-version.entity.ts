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

@Entity({ name: "dictionary_versions", schema: "quote_agent" })
@Unique(["versionKey"])
@Index(["versionKey"])
export class DictionaryVersion extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "version_key", type: "varchar", length: 100, unique: true })
  versionKey: string;

  @Column({ name: "version_value", type: "bigint", default: 1 })
  versionValue: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
