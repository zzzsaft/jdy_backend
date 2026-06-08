import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { DictionaryTerm } from "./dictionary-term.entity";

@Entity({ name: "dictionary_aliases", schema: "quote_agent" })
@Unique(["termType", "normalizedAlias"])
@Index(["termId"])
@Index(["termType", "normalizedAlias", "isActive"])
@Index(["riskLevel"])
export class DictionaryAlias extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "term_id", type: "bigint" })
  termId: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "alias_value", type: "text" })
  aliasValue: string;

  @Column({ name: "normalized_alias", type: "text" })
  normalizedAlias: string;

  @Column({
    type: "numeric",
    precision: 4,
    scale: 3,
    default: "1.000",
  })
  confidence: string;

  @Column({ type: "varchar", length: 50, default: "manual" })
  source: string;

  @Column({ name: "usage_count", type: "int", default: 0 })
  usageCount: number;

  @Column({ name: "last_seen_at", type: "timestamp", nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: "risk_level", type: "varchar", length: 30, default: "normal" })
  riskLevel: string;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  @ManyToOne(() => DictionaryTerm, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "term_id" })
  term: DictionaryTerm;
}
