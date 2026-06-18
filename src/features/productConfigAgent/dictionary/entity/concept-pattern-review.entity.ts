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
import type { ConceptCandidateType } from "../conceptResolver.types.js";

@Entity({ name: "concept_pattern_reviews", schema: "quote_agent" })
@Unique(["patternKey"])
@Index(["status"])
@Index(["relationType"])
@Index(["recommendedAction"])
export class ConceptPatternReview extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "pattern_key", type: "text" })
  patternKey: string;

  @Column({ name: "candidate_type", type: "varchar", length: 30 })
  candidateType: ConceptCandidateType;

  @Column({ name: "relation_type", type: "varchar", length: 50 })
  relationType: string;

  @Column({ name: "recommended_action", type: "varchar", length: 80 })
  recommendedAction: string;

  @Column({ type: "varchar", length: 30, default: "pending" })
  status: string;

  @Column({ name: "review_payload_jsonb", type: "jsonb", nullable: true })
  reviewPayloadJsonb: unknown | null;

  @Column({ name: "reviewed_by", type: "text", nullable: true })
  reviewedBy: string | null;

  @Column({ name: "reviewed_at", type: "timestamp", nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
