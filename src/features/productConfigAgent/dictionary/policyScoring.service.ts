import type {
  ConceptIssue,
  ConceptMatchTarget,
  ConceptNegativeEvidence,
  ConceptPositiveEvidence,
  DictionaryBaselineTrustTier,
} from "./conceptResolver.types.js";

export type PolicyTrustTier =
  | "trusted"
  | "provisional"
  | "suspect"
  | "deprecated_candidate";

export type PolicyHardConstraint = {
  id: string;
  blocksAutoAccept?: boolean;
  blocksPromotion?: boolean;
  reason: string;
  evidence?: unknown;
};

export type PolicyScoreDelta = {
  ruleId: string;
  delta: number;
  reason: string;
  evidence?: unknown;
};

export type PolicyScoringVector = {
  trustScore: number;
  riskScore: number;
  contextScore: number;
  constraintScore: number;
};

export type PolicyEvaluationContext = {
  target: ConceptMatchTarget;
  baseScore: number;
  positive: ConceptPositiveEvidence;
  negative: ConceptNegativeEvidence;
  issues: ConceptIssue[];
  auditSignal?: {
    riskScore?: number;
    riskLabels?: string[];
    trustSignals?: Record<string, unknown>;
    evidenceJson?: unknown;
    auditRunId?: string | null;
    dictionaryVersion?: string | number | null;
  } | null;
  matchContext?: {
    candidateType?: string;
    matchRoute?: string;
    matchConfidence?: number;
    sourceProductType?: string | null;
    valueKind?: string | null;
    scope?: string | null;
    candidateStatus?: string | null;
    occurrenceCount?: number;
  };
};

export type PolicyRuleResult = {
  scoreDeltas?: PolicyScoreDelta[];
  hardConstraints?: PolicyHardConstraint[];
  intermediateLabels?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  explanations?: string[];
};

export type PolicyRule = {
  id: string;
  description: string;
  applies: (context: PolicyEvaluationContext) => boolean;
  evaluate: (context: PolicyEvaluationContext) => PolicyRuleResult;
};

export type PolicyEvaluation = {
  policyVersion: string;
  auditRunId: string | null;
  dictionaryVersion: string | null;
  baseScore: number;
  scoreDeltas: PolicyScoreDelta[];
  scoringVector: PolicyScoringVector;
  unifiedScore: number;
  finalScore: number;
  hardConstraints: PolicyHardConstraint[];
  intermediateLabels: Record<string, unknown>;
  evidence: Record<string, unknown>;
  explanations: string[];
};

export const DICTIONARY_POLICY_VERSION = "dictionary_policy_v1";

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function normalizeRiskLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeTrustTier(value: unknown): DictionaryBaselineTrustTier {
  return value === "trusted" ||
    value === "suspect" ||
    value === "deprecated" ||
    value === "provisional"
    ? value
    : "provisional";
}

function trustTierLabelForRiskScore(riskScore: number): PolicyTrustTier {
  if (riskScore >= 70) return "deprecated_candidate";
  if (riskScore >= 40) return "suspect";
  if (riskScore >= 20) return "provisional";
  return "trusted";
}

function trustTierLabelForFinalScore(finalScore: number): PolicyTrustTier {
  if (finalScore >= 0.92) return "trusted";
  if (finalScore >= 0.72) return "provisional";
  if (finalScore >= 0.45) return "suspect";
  return "deprecated_candidate";
}

function issuePenalty(issue: ConceptIssue): number {
  if (issue.riskLevel === "high") return -0.35;
  if (issue.riskLevel === "medium") return -0.22;
  return -0.08;
}

export const baselineTrustPriorRule: PolicyRule = {
  id: "baseline_trust_prior",
  description: "Converts existing baseline trust metadata into a score prior.",
  applies: () => true,
  evaluate: (context) => {
    const baselineTrustTier = normalizeTrustTier(context.target.baselineTrustTier);
    const priors: Record<DictionaryBaselineTrustTier, number> = {
      trusted: 0.08,
      provisional: -0.02,
      suspect: -0.16,
      deprecated: -0.32,
    };
    return {
      scoreDeltas: [
        {
          ruleId: "baseline_trust_prior",
          delta: priors[baselineTrustTier],
          reason: `baselineTrustTier=${baselineTrustTier}`,
        },
      ],
      intermediateLabels: { baselineTrustTier },
    };
  },
};

export const auditRiskSignalRule: PolicyRule = {
  id: "audit_risk_signal",
  description: "Applies health-audit risk score and labels as policy inputs.",
  applies: (context) => Boolean(context.auditSignal),
  evaluate: (context) => {
    const riskScore = Number(context.auditSignal?.riskScore ?? 0);
    const riskLabels = normalizeRiskLabels(context.auditSignal?.riskLabels);
    const delta = -Math.min(0.45, Math.max(0, riskScore) / 180);
    const hardConstraints: PolicyHardConstraint[] = [];
    if (
      riskLabels.includes("alias_purity") ||
      riskLabels.includes("value_kind_consistency")
    ) {
      hardConstraints.push({
        id: "audit_blocks_auto_accept",
        blocksAutoAccept: true,
        reason: "Audit signal contains labels that require review before auto-accept.",
        evidence: { riskLabels },
      });
    }
    return {
      scoreDeltas: [
        {
          ruleId: "audit_risk_signal",
          delta,
          reason: `audit riskScore=${riskScore}`,
          evidence: { riskScore, riskLabels },
        },
      ],
      hardConstraints,
      intermediateLabels: {
        auditTrustTier: trustTierLabelForRiskScore(riskScore),
      },
      evidence: { auditSignal: context.auditSignal },
      explanations: [
        `Health audit riskScore=${riskScore}; labels=${riskLabels.join(",") || "none"}.`,
      ],
    };
  },
};

export const positiveEvidenceRule: PolicyRule = {
  id: "positive_evidence",
  description: "Rewards exact alias, same product usage, and historical review evidence.",
  applies: () => true,
  evaluate: (context) => {
    const deltas: PolicyScoreDelta[] = [];
    if (context.positive.aliasExact) {
      deltas.push({
        ruleId: "positive_evidence.alias_exact",
        delta: 0.05,
        reason: "Exact alias match.",
      });
    }
    if ((context.positive.synonymSimilarity ?? 0) >= 0.8) {
      deltas.push({
        ruleId: "positive_evidence.synonym_similarity",
        delta: 0.03,
        reason: "High synonym similarity.",
      });
    }
    if ((context.positive.sameProductTypeUsage ?? 0) > 0) {
      deltas.push({
        ruleId: "positive_evidence.same_product_type_usage",
        delta: Math.min(0.04, Number(context.positive.sameProductTypeUsage) * 0.01),
        reason: "Observed same-product-type usage.",
      });
    }
    if ((context.positive.historicalHumanReviewCount ?? 0) > 0) {
      deltas.push({
        ruleId: "positive_evidence.historical_human_review",
        delta: Math.min(
          0.06,
          Number(context.positive.historicalHumanReviewCount) * 0.02,
        ),
        reason: "Historical human review evidence.",
      });
    }
    if ((context.positive.ruleSignalCount ?? 0) > 0) {
      deltas.push({
        ruleId: "positive_evidence.normalization_rule_signal",
        delta: Math.min(0.03, Number(context.positive.ruleSignalCount) * 0.01),
        reason: "Normalization rule signals support the match.",
      });
    }
    return {
      scoreDeltas: deltas,
      explanations: deltas.map((item) => item.reason),
    };
  },
};

export const negativeEvidenceRule: PolicyRule = {
  id: "negative_evidence",
  description: "Applies penalties and hard constraints for conflict evidence.",
  applies: () => true,
  evaluate: (context) => {
    const deltas: PolicyScoreDelta[] = [];
    const hardConstraints: PolicyHardConstraint[] = [];
    const addPenalty = (
      key: string,
      delta: number,
      reason: string,
      blocksAutoAccept = false,
    ) => {
      deltas.push({ ruleId: `negative_evidence.${key}`, delta, reason });
      if (blocksAutoAccept) {
        hardConstraints.push({
          id: `negative_evidence.${key}.blocks_auto_accept`,
          blocksAutoAccept: true,
          reason,
        });
      }
    };

    if (context.negative.unitConflict) {
      addPenalty("unit_conflict", -0.28, "Unit conflict blocks auto-accept.", true);
    }
    if (context.negative.valueKindConflict) {
      addPenalty(
        "value_kind_conflict",
        -0.32,
        "Value kind conflict blocks auto-accept.",
        true,
      );
    }
    if (context.negative.productTypeMismatch) {
      addPenalty(
        "product_type_mismatch",
        -0.2,
        "Product type mismatch requires review.",
        true,
      );
    }
    if (context.negative.coOccurrenceConflict) {
      addPenalty("co_occurrence_conflict", -0.16, "Co-occurrence conflict.");
    }
    if ((context.negative.sameItemTogetherCount ?? 0) > 4) {
      addPenalty("same_item_together", -0.05, "Repeated same-item signal.");
    }
    return {
      scoreDeltas: deltas,
      hardConstraints,
      explanations: [
        ...deltas.map((item) => item.reason),
        ...hardConstraints.map((item) => item.reason),
      ],
    };
  },
};

export const issuePenaltyRule: PolicyRule = {
  id: "issue_penalty",
  description: "Converts detector issues into penalties and review constraints.",
  applies: (context) => context.issues.length > 0,
  evaluate: (context) => {
    const scoreDeltas = context.issues.map((issue) => ({
      ruleId: `issue_penalty.${issue.detector}`,
      delta: issuePenalty(issue),
      reason: issue.reason,
      evidence: issue.evidence,
    }));
    const hardConstraints = context.issues
      .filter((issue) => issue.blocksAutoApply)
      .map((issue) => ({
        id: `issue_penalty.${issue.detector}.blocks_auto_accept`,
        blocksAutoAccept: true,
        reason: issue.reason,
        evidence: issue.evidence,
      }));
    return {
      scoreDeltas,
      hardConstraints,
      evidence: { issues: context.issues },
      explanations: context.issues.map((issue) => issue.reason),
    };
  },
};

export const relationHardConstraintRule: PolicyRule = {
  id: "relation_hard_constraints",
  description: "Prevents unsafe relation types from direct auto-accept.",
  applies: (context) =>
    ["split_component", "qualifier_variant", "composite_value", "wrong_scope", "different_concept"].includes(
      context.target.relationType,
    ),
  evaluate: (context) => ({
    scoreDeltas:
      context.target.relationType === "split_component"
        ? [
            {
              ruleId: "relation_hard_constraints.split_component_penalty",
              delta: -0.18,
              reason: "Split component requires review.",
            },
          ]
        : [],
    hardConstraints: [
      {
        id: "relation_hard_constraints.blocks_auto_accept",
        blocksAutoAccept: true,
        reason: `${context.target.relationType} cannot be auto-accepted.`,
      },
    ],
    explanations: [`${context.target.relationType} cannot be auto-accepted.`],
  }),
};

export const defaultPolicyRules: PolicyRule[] = [
  baselineTrustPriorRule,
  auditRiskSignalRule,
  positiveEvidenceRule,
  negativeEvidenceRule,
  issuePenaltyRule,
  relationHardConstraintRule,
];

export class PolicyScoringService {
  constructor(private readonly rules: PolicyRule[] = defaultPolicyRules) {}

  evaluate(context: PolicyEvaluationContext): PolicyEvaluation {
    const scoreDeltas: PolicyScoreDelta[] = [];
    const hardConstraints: PolicyHardConstraint[] = [];
    const intermediateLabels: Record<string, unknown> = {};
    const evidence: Record<string, unknown> = {};
    const explanations: string[] = [];

    for (const rule of this.rules) {
      if (!rule.applies(context)) continue;
      const result = rule.evaluate(context);
      scoreDeltas.push(...(result.scoreDeltas ?? []));
      hardConstraints.push(...(result.hardConstraints ?? []));
      Object.assign(intermediateLabels, result.intermediateLabels ?? {});
      explanations.push(...(result.explanations ?? []));
      if (result.evidence) {
        evidence[rule.id] = result.evidence;
      }
    }

    const scoringVector = this.buildScoringVector(context, scoreDeltas, hardConstraints);
    const unifiedScore = this.unifiedScore(scoringVector);
    const finalScore = unifiedScore;
    intermediateLabels.trustTier = trustTierLabelForFinalScore(unifiedScore);

    return {
      policyVersion: DICTIONARY_POLICY_VERSION,
      auditRunId:
        context.auditSignal?.auditRunId === undefined ||
        context.auditSignal.auditRunId === null
          ? null
          : String(context.auditSignal.auditRunId),
      dictionaryVersion:
        context.auditSignal?.dictionaryVersion === undefined ||
        context.auditSignal.dictionaryVersion === null
          ? null
          : String(context.auditSignal.dictionaryVersion),
      baseScore: context.baseScore,
      scoreDeltas,
      scoringVector,
      unifiedScore,
      finalScore,
      hardConstraints,
      intermediateLabels,
      evidence,
      explanations,
    };
  }

  private buildScoringVector(
    context: PolicyEvaluationContext,
    scoreDeltas: PolicyScoreDelta[],
    hardConstraints: PolicyHardConstraint[],
  ): PolicyScoringVector {
    const trustDelta = scoreDeltas
      .filter((item) =>
        item.ruleId.startsWith("baseline_trust_prior") ||
        item.ruleId.startsWith("positive_evidence.alias_exact") ||
        item.ruleId.startsWith("positive_evidence.synonym_similarity") ||
        item.ruleId.startsWith("positive_evidence.historical_human_review"),
      )
      .reduce((sum, item) => sum + item.delta, 0);
    const contextDelta = scoreDeltas
      .filter((item) =>
        item.ruleId.startsWith("positive_evidence.same_product_type_usage") ||
        item.ruleId.startsWith("positive_evidence.normalization_rule_signal"),
      )
      .reduce((sum, item) => sum + item.delta, 0);
    const riskPenalty = Math.abs(
      scoreDeltas
        .filter((item) =>
          item.ruleId.startsWith("audit_risk_signal") ||
          item.ruleId.startsWith("negative_evidence") ||
          item.ruleId.startsWith("issue_penalty") ||
          item.ruleId.startsWith("relation_hard_constraints"),
        )
        .filter((item) => item.delta < 0)
        .reduce((sum, item) => sum + item.delta, 0),
    );
    const blockingConstraintCount = hardConstraints.filter(
      (item) => item.blocksAutoAccept || item.blocksPromotion,
    ).length;
    const nonBlockingConstraintCount = hardConstraints.length - blockingConstraintCount;

    return {
      trustScore: clampScore(context.baseScore + trustDelta),
      riskScore: clampScore(riskPenalty),
      contextScore: clampScore(
        0.8 +
          contextDelta +
          Math.min(0.08, Number(context.matchContext?.occurrenceCount ?? 0) * 0.01),
      ),
      constraintScore: clampScore(
        1 - blockingConstraintCount * 0.35 - nonBlockingConstraintCount * 0.15,
      ),
    };
  }

  private unifiedScore(vector: PolicyScoringVector): number {
    return clampScore(
      vector.trustScore * 0.55 +
        vector.contextScore * 0.25 +
        vector.constraintScore * 0.2 -
        vector.riskScore * 0.45,
    );
  }
}
