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

export type DictionaryQualifierKind = "position" | "area" | "layer";

@Entity({ name: "dictionary_qualifiers", schema: "quote_agent" })
@Unique(["qualifierKey"])
@Index(["kind"])
@Index(["isActive"])
export class DictionaryQualifier extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "qualifier_key", type: "varchar", length: 100 })
  qualifierKey: string;

  @Column({ type: "varchar", length: 30 })
  kind: DictionaryQualifierKind;

  @Column({ name: "display_name", type: "text" })
  displayName: string;

  @Column({ name: "aliases", type: "jsonb", default: () => "'[]'::jsonb" })
  aliases: string[];

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "sort_order", type: "int", default: 100 })
  sortOrder: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
