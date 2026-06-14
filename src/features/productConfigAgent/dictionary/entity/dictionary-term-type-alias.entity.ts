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

@Entity({ name: "dictionary_term_type_aliases", schema: "quote_agent" })
@Unique(["normalizedAliasName"])
@Index(["normalizedAliasName", "isActive"])
@Index(["termType"])
export class DictionaryTermTypeAlias extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "alias_name", type: "text" })
  aliasName: string;

  @Column({ name: "normalized_alias_name", type: "text" })
  normalizedAliasName: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "varchar", length: 50, default: "manual" })
  source: string;

  @Column({ name: "usage_count", type: "int", default: 0 })
  usageCount: number;

  @Column({ name: "last_seen_at", type: "timestamp", nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
