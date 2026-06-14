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

@Entity({ name: "dictionary_candidate_review_suggestions", schema: "quote_agent" })
@Unique(["candidateType", "candidateId", "model"])
@Index(["candidateType", "candidateId"])
export class DictionaryCandidateReviewSuggestion extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "candidate_type", type: "varchar", length: 30 })
  candidateType: "term_type" | "value";

  @Column({ name: "candidate_id", type: "bigint" })
  candidateId: string;

  @Column({ name: "recommended_action", type: "varchar", length: 50 })
  recommendedAction: string;

  @Column({
    type: "numeric",
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidence: string | null;

  @Column({ type: "jsonb" })
  suggestion: unknown;

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
