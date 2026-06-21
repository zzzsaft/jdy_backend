export type ConceptCandidateType =
  | "term_type"
  | "value"
  | "dictionary_term_type"
  | "dictionary_term"
  | "dictionary_alias"
  | "dictionary_term_type_alias";

export type ConceptRelationType =
  | "exact_alias"
  | "synonym_alias"
  | "qualifier_variant"
  | "split_component"
  | "composite_value"
  | "wrong_scope"
  | "value_as_type"
  | "different_concept"
  | "extraction_error"
  | "non_config_noise";

export type ConceptRecommendedAction =
  | "map_to_existing_termtype"
  | "add_alias"
  | "create_new_termtype_candidate"
  | "create_new_enum_value_candidate"
  | "send_to_review"
  | "map_as_qualifier_variant"
  | "split_value"
  | "move_scope"
  | "mark_extraction_error"
  | "mark_non_config"
  | "defer_until_more_occurrences";

export type ConceptResolverRoute =
  | "auto_accept_pending"
  | "auto_pass"
  | "auto_reject_pending"
  | "llm_review"
  | "human_review"
  | "defer_until_more_occurrences";

export type ConceptRiskLevel = "low" | "medium" | "high";

export type DictionaryBaselineTrustTier =
  | "trusted"
  | "provisional"
  | "suspect"
  | "deprecated";

export type DictionaryConceptScope =
  | "document"
  | "product"
  | "item"
  | "component"
  | "field"
  | "value"
  | "unknown";

export type DictionaryConceptRole =
  | "config_attribute"
  | "qualifier"
  | "enum_value"
  | "unit"
  | "product_type"
  | "document_info"
  | "noise"
  | "unknown";

export interface ConceptRuleSignal {
  ruleId: string;
  relationType?: ConceptRelationType;
  recommendedAction?: ConceptRecommendedAction;
  confidence?: number;
  message?: string;
  before?: unknown;
  after?: unknown;
  evidence?: unknown;
}

export interface ConceptNegativeEvidence {
  coOccurrenceConflict?: boolean;
  unitConflict?: boolean;
  valueKindConflict?: boolean;
  productTypeMismatch?: boolean;
  sameItemTogetherCount?: number;
  existingSeparateUsage?: number;
}

export interface ConceptPositiveEvidence {
  aliasExact?: boolean;
  synonymSimilarity?: number;
  sameProductTypeUsage?: number;
  sameItemTogetherCount?: number;
  existingSeparateUsage?: number;
  ruleSignalCount?: number;
  historicalHumanReviewCount?: number;
}

export interface ConceptIssue {
  detector: string;
  relationType: ConceptRelationType;
  recommendedAction: ConceptRecommendedAction;
  confidence: number;
  riskLevel: ConceptRiskLevel;
  reason: string;
  evidence?: unknown;
  blocksAutoApply?: boolean;
}

export interface ConceptMatchTarget {
  targetType: "term_type" | "term" | "alias" | "unit" | "scope";
  id?: string | null;
  termType?: string | null;
  canonicalValue?: string | null;
  displayName?: string | null;
  relationType: ConceptRelationType;
  score: number;
  baselineTrustTier?: DictionaryBaselineTrustTier;
  targetTrustTier?: DictionaryBaselineTrustTier;
  targetRiskLabels?: string[];
  contextAwareScore?: number;
  scoreBreakdown?: unknown;
  evidence?: unknown;
}

export interface ConceptResolverDecision {
  candidateType: ConceptCandidateType;
  candidateId: string;
  relationType: ConceptRelationType;
  recommendedAction: ConceptRecommendedAction;
  route: ConceptResolverRoute;
  score: number;
  riskLevel: ConceptRiskLevel;
  reason: string;
  patternKey: string;
  matchedTargets: ConceptMatchTarget[];
  issues: ConceptIssue[];
  evidence: {
    positive: ConceptPositiveEvidence;
    negative: ConceptNegativeEvidence;
    ruleSignals: ConceptRuleSignal[];
    occurrenceCount: number;
    documentCount: number;
    sampleOccurrences: unknown[];
    dictionaryVersion: number;
    valueKind?: string | null;
    scope?: string | null;
    conceptRole?: string | null;
    qualifier?: unknown;
    baseFieldName?: string | null;
    originalFieldName?: string | null;
    matchedQualifierAlias?: string | null;
    qualifierKey?: string | null;
    qualifierKind?: string | null;
    qualifierRule?: string | null;
  };
  appliedOperation?: unknown;
}
