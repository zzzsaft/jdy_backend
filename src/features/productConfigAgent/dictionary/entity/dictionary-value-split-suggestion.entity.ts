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

@Entity({ name: "dictionary_value_split_suggestions", schema: "quote_agent" })
@Unique(["candidateId", "model"])
@Index(["candidateId"])
export class DictionaryValueSplitSuggestion extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "candidate_id", type: "bigint" })
  candidateId: string;

  @Column({ name: "term_type", type: "varchar", length: 100 })
  termType: string;

  @Column({ name: "raw_value", type: "text" })
  rawValue: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  suggestions: Array<{
    termType: string;
    displayName?: string;
    canonicalValue: string;
    aliases?: string[];
  }>;

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
