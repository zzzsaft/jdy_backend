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

@Entity({ name: "dictionary_term_type_suggestions", schema: "quote_agent" })
@Unique(["normalizedFieldName", "model"])
@Index(["candidateId"])
@Index(["normalizedFieldName"])
export class DictionaryTermTypeSuggestion extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "candidate_id", type: "bigint", nullable: true })
  candidateId: string | null;

  @Column({ name: "raw_field_name", type: "text" })
  rawFieldName: string;

  @Column({ name: "normalized_field_name", type: "text" })
  normalizedFieldName: string;

  @Column({ name: "suggested_term_type", type: "varchar", length: 100 })
  suggestedTermType: string;

  @Column({ name: "suggested_display_name", type: "text" })
  suggestedDisplayName: string;

  @Column({ name: "suggested_aliases", type: "jsonb", default: () => "'[]'::jsonb" })
  suggestedAliases: string[];

  @Column({ type: "text" })
  prompt: string;

  @Column({ type: "varchar", length: 100 })
  model: string;

  @Column({ name: "raw_response", type: "jsonb", nullable: true })
  rawResponse: unknown | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
