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
import type {
  ConceptCandidateType,
  ConceptRecommendedAction,
  ConceptRelationType,
  ConceptResolverRoute,
  ConceptRiskLevel,
} from "../conceptResolver.types.js";

@Entity({ name: "concept_resolutions", schema: "quote_agent" })
@Unique("uq_concept_resolution_candidate_version", [
  "candidateType",
  "candidateId",
  "dictionaryVersion",
  "resolverVersion",
])
@Index(["candidateType", "candidateId"])
@Index(["route"])
@Index(["relationType"])
@Index(["recommendedAction"])
@Index(["patternKey"])
export class ConceptResolution extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "run_id", type: "bigint", nullable: true })
  runId: string | null;

  @Column({ name: "candidate_type", type: "varchar", length: 30 })
  candidateType: ConceptCandidateType;

  @Column({ name: "candidate_id", type: "bigint" })
  candidateId: string;

  @Column({ name: "dictionary_version", type: "bigint", default: 0 })
  dictionaryVersion: string;

  @Column({ name: "resolver_version", type: "varchar", length: 50, default: "v1" })
  resolverVersion: string;

  @Column({ name: "relation_type", type: "varchar", length: 50 })
  relationType: ConceptRelationType;

  @Column({ name: "recommended_action", type: "varchar", length: 80 })
  recommendedAction: ConceptRecommendedAction;

  @Column({ type: "varchar", length: 50 })
  route: ConceptResolverRoute;

  @Column({ type: "numeric", precision: 5, scale: 3 })
  score: string;

  @Column({ name: "risk_level", type: "varchar", length: 30 })
  riskLevel: ConceptRiskLevel;

  @Column({ name: "pattern_key", type: "text" })
  patternKey: string;

  @Column({ type: "text" })
  reason: string;

  @Column({ name: "evidence_jsonb", type: "jsonb", default: () => "'{}'::jsonb" })
  evidenceJsonb: unknown;

  @Column({ name: "matched_targets_jsonb", type: "jsonb", default: () => "'[]'::jsonb" })
  matchedTargetsJsonb: unknown;

  @Column({ name: "issues_jsonb", type: "jsonb", default: () => "'[]'::jsonb" })
  issuesJsonb: unknown;

  @Column({ name: "llm_suggestion_id", type: "bigint", nullable: true })
  llmSuggestionId: string | null;

  @Column({ name: "applied_operation_jsonb", type: "jsonb", nullable: true })
  appliedOperationJsonb: unknown | null;

  @Column({ name: "applied_at", type: "timestamp", nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}

