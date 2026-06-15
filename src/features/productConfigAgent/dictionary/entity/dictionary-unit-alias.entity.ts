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

@Entity({ name: "dictionary_unit_aliases", schema: "quote_agent" })
@Unique(["normalizedAlias"])
@Index(["canonicalUnit"])
@Index(["normalizedAlias", "isActive"])
export class DictionaryUnitAlias extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "canonical_unit", type: "text" })
  canonicalUnit: string;

  @Column({ name: "display_unit", type: "text", nullable: true })
  displayUnit: string | null;

  @Column({ name: "alias_value", type: "text" })
  aliasValue: string;

  @Column({ name: "normalized_alias", type: "text" })
  normalizedAlias: string;

  @Column({ type: "varchar", length: 50, default: "manual" })
  source: string;

  @Column({ name: "usage_count", type: "int", default: 0 })
  usageCount: number;

  @Column({ name: "last_seen_at", type: "timestamp", nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
