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

@Entity({ name: "dictionary_terms", schema: "quote_agent" })
@Unique(["termType", "canonicalValue"])
@Index(["termType"])
@Index(["isActive"])
export class DictionaryTerm extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "canonical_value", type: "text" })
  canonicalValue: string;

  @Column({ name: "display_name", type: "text", nullable: true })
  displayName: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
