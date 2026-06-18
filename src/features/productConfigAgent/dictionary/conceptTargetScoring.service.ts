import type {
  ConceptIssue,
  ConceptMatchTarget,
  ConceptNegativeEvidence,
  ConceptPositiveEvidence,
} from "./conceptResolver.types.js";
import {
  PolicyScoringService,
  type PolicyEvaluation,
} from "./policyScoring.service.js";
import { AUTO_ACCEPT_PENDING_THRESHOLD } from "./resolverRouting.service.js";

export { AUTO_ACCEPT_PENDING_THRESHOLD };

type ScoreParams = {
  target: ConceptMatchTarget;
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

function labelsFromEvaluation(
  target: ConceptMatchTarget,
  params: ScoreParams,
  evaluation: PolicyEvaluation,
): string[] {
  return [
    ...new Set([
      ...normalizeRiskLabels(target.targetRiskLabels),
      ...normalizeRiskLabels(params.auditSignal?.riskLabels),
      ...params.issues.map((issue) => issue.relationType),
      ...evaluation.hardConstraints.map((constraint) => constraint.id),
    ]),
  ];
}

export class ConceptTargetScoringService {
  constructor(private readonly policyScoring = new PolicyScoringService()) {}

  scoreTarget(params: ScoreParams): ConceptMatchTarget {
    const baseScore = clampScore(params.target.score);
    const targetEvidence =
      params.target.evidence &&
      typeof params.target.evidence === "object" &&
      !Array.isArray(params.target.evidence)
        ? (params.target.evidence as Record<string, unknown>)
        : {};
    const auditSignal = params.auditSignal ?? (targetEvidence.auditSignal as any) ?? null;
    const evaluation = this.policyScoring.evaluate({
      target: params.target,
      baseScore,
      positive: params.positive,
      negative: params.negative,
      issues: params.issues,
      auditSignal,
      matchContext: params.matchContext,
    });

    return {
      ...params.target,
      contextAwareScore: evaluation.unifiedScore,
      targetRiskLabels: labelsFromEvaluation(
        params.target,
        params,
        evaluation,
      ),
      scoreBreakdown: {
        policyEvaluation: evaluation,
        baseSimilarity: baseScore,
        scoringVector: evaluation.scoringVector,
        unifiedScore: evaluation.unifiedScore,
        finalScore: evaluation.finalScore,
      },
    };
  }

  scoreTargets(params: Omit<ScoreParams, "target"> & {
    targets: ConceptMatchTarget[];
  }): ConceptMatchTarget[] {
    return params.targets
      .map((target) => this.scoreTarget({ ...params, target }))
      .sort(
        (left, right) =>
          (right.contextAwareScore ?? right.score) -
            (left.contextAwareScore ?? left.score) ||
          right.score - left.score,
      );
  }
}
