import { DataSource, In } from "typeorm";
import {
  ConceptPatternReview,
  ConceptResolution,
  ConceptResolverRun,
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  DictionaryChangeLog,
  DictionaryHealthReport,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryTermTypeCandidate,
  DictionaryVersion,
} from "./entity/index.js";
import { approveValueCandidateAsAlias } from "./dictionary.review.js";
import { ConceptTargetScoringService } from "./conceptTargetScoring.service.js";
import { ResolverRoutingService } from "./resolverRouting.service.js";
import {
  type ConceptCandidateType,
  type ConceptIssue,
  type ConceptMatchTarget,
  type ConceptRecommendedAction,
  type ConceptRelationType,
  type ConceptResolverDecision,
  type ConceptResolverRoute,
  type ConceptRiskLevel,
  type DictionaryBaselineTrustTier,
} from "./conceptResolver.types.js";
import { ConceptIssueDetectorService } from "./conceptIssueDetector.service.js";
import { NormalizationRuleRegistry } from "./normalizationRuleRegistry.js";
import { detectQualifierConcept } from "./qualifierConcept.js";
import { normalizeText } from "./dictionary.utils.js";
import { logger } from "../../../config/logger.js";
import { readBooleanEnv } from "../utils/envParsing.js";

export const CONCEPT_RESOLVER_VERSION = "v1";
export const NORMALIZATION_RULE_VERSION = "v1";

type ResolveParams = {
  candidateType: Extract<ConceptCandidateType, "term_type" | "value">;
  candidateId: string;
  runId?: string | null;
  force?: boolean;
};

type ResolverConfig = {
  enabled: boolean;
  apply: boolean;
  llmEnabled: boolean;
  mode: "sync" | "async";
};

type LoadedCandidate =
  | { candidateType: "term_type"; candidate: DictionaryTermTypeCandidate }
  | { candidateType: "value"; candidate: DictionaryCandidate };

type DictionarySnapshot = {
  version: number;
  termTypeByKey: Map<string, DictionaryTermType>;
  termTypeAliasesByNormalized: Map<string, DictionaryTermTypeAlias[]>;
  valueAliasesByNormalized: Map<string, DictionaryAlias[]>;
  valueAliasesByTermTypeNormalized: Map<string, DictionaryAlias[]>;
  valueTermTypesByCanonicalNormalized: Map<string, string[]>;
  termsById: Map<string, DictionaryTerm>;
  termsByTermType: Map<string, DictionaryTerm[]>;
  healthReportByTermType: Map<string, DictionaryHealthReport>;
  healthReportByTermId: Map<string, DictionaryHealthReport>;
};

function configFromEnv(): ResolverConfig {
  const mode = process.env.QUOTE_AGENT_CONCEPT_RESOLVER_MODE === "sync"
    ? "sync"
    : "async";
  return {
    enabled: readBooleanEnv("QUOTE_AGENT_CONCEPT_RESOLVER_ENABLED", true),
    apply: readBooleanEnv("QUOTE_AGENT_CONCEPT_RESOLVER_APPLY"),
    llmEnabled: readBooleanEnv("QUOTE_AGENT_CONCEPT_RESOLVER_LLM_ENABLED"),
    mode,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function riskRank(risk: ConceptRiskLevel): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function pickHighestRisk(
  base: ConceptRiskLevel,
  issues: ConceptIssue[],
): ConceptRiskLevel {
  return issues.reduce(
    (current, issue) =>
      riskRank(issue.riskLevel) > riskRank(current) ? issue.riskLevel : current,
    base,
  );
}

function isEnumKind(valueKind: string | null | undefined): boolean {
  return valueKind === "enum" || valueKind === "enums";
}

function patternKeyFor(params: {
  candidateType: ConceptCandidateType;
  normalized: string;
  termType?: string | null;
  sourceProductType?: string | null;
  relationType: ConceptRelationType;
  detector?: string | null;
}): string {
  return [
    params.candidateType,
    params.termType ?? "",
    params.normalized,
    params.sourceProductType ?? "unknown",
    params.relationType,
    params.detector ?? "",
  ]
    .map((part) => String(part).replace(/\|\|/g, "|"))
    .join("||");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function splitSourceEvidenceFrom(evidence: unknown): {
  sourceRawValue: string | null;
  splitFromRawValue: string | null;
} {
  const record = objectRecord(evidence);
  const sourceRawValue = String(record.sourceRawValue ?? "").trim();
  const splitFromRawValue = String(record.splitFromRawValue ?? "").trim();
  return {
    sourceRawValue: sourceRawValue || null,
    splitFromRawValue: splitFromRawValue || null,
  };
}

function qualifierEvidenceFrom(...sources: Array<{
  fieldName?: string | null;
  rawValue?: string | null;
  evidence?: unknown;
}>): {
  qualifier?: unknown;
  baseFieldName?: string | null;
  originalFieldName?: string | null;
  sourceText?: string | null;
  matchedQualifierAlias?: string | null;
  qualifierKey?: string | null;
  qualifierKind?: string | null;
  rule?: string | null;
} {
  for (const source of sources) {
    const concept = detectQualifierConcept(source);
    if (!concept) continue;
    return {
      qualifier: concept.qualifier,
      baseFieldName: concept.baseFieldName,
      originalFieldName: concept.originalFieldName,
      sourceText: concept.qualifier?.sourceText ?? concept.sourceText ?? null,
      matchedQualifierAlias: concept.matchedQualifierAlias ?? null,
      qualifierKey: concept.qualifierKey ?? null,
      qualifierKind: concept.qualifierKind ?? null,
      rule: concept.rule ?? null,
    };
  }
  return {};
}

function normalizeBaselineTrustTier(value: unknown): DictionaryBaselineTrustTier {
  return value === "trusted" ||
    value === "suspect" ||
    value === "deprecated" ||
    value === "provisional"
    ? value
    : "provisional";
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

function targetRiskLabelsFrom(...sources: unknown[]): string[] {
  return [
    ...new Set(
      sources.flatMap((source) => {
        if (typeof source === "string" && source && source !== "normal") {
          return [`risk:${source}`];
        }
        return normalizeRiskLabels(source);
      }),
    ),
  ];
}

export class ConceptResolverService {
  private readonly issueDetector = new ConceptIssueDetectorService();
  private readonly targetScoring = new ConceptTargetScoringService();
  private readonly routingService = new ResolverRoutingService();
  private dictionarySnapshot: DictionarySnapshot | null = null;
  private dictionarySnapshotPromise: Promise<DictionarySnapshot> | null = null;
  private readonly sameItemTogetherCountCache = new Map<string, Promise<number>>();
  private readonly existingSeparateUsageCountCache = new Map<string, Promise<number>>();
  private readonly historicalHumanReviewCountCache = new Map<string, Promise<number>>();
  private readonly pendingCandidateRuns = new Set<Promise<void>>();
  private knownPatternKeys: Set<string> | null = null;
  private knownPatternKeysPromise: Promise<Set<string>> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  getConfig(): ResolverConfig {
    return configFromEnv();
  }

  isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  enqueueCandidate(params: ResolveParams): void {
    const config = this.getConfig();
    if (!config.enabled) return;
    const run = async () => {
      try {
        await this.resolveCandidate(params);
      } catch (error) {
        logger.warn(
          `[productConfigAgent:conceptResolver:candidateFailed] candidateType=${params.candidateType} ` +
            `candidateId=${params.candidateId} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const pending =
      config.mode === "sync"
        ? run()
        : new Promise<void>((resolve) => {
            setTimeout(() => {
              void run().finally(resolve);
            }, 0);
          });
    this.pendingCandidateRuns.add(pending);
    void pending.finally(() => {
      this.pendingCandidateRuns.delete(pending);
    });
  }

  async waitForIdle(): Promise<void> {
    while (this.pendingCandidateRuns.size > 0) {
      await Promise.allSettled([...this.pendingCandidateRuns]);
    }
  }

  async runResolver(params?: {
    candidateType?: "all" | ConceptCandidateType;
    status?: string;
    includeReviewed?: boolean;
    limit?: number;
    apply?: boolean;
  }) {
    const dictionaryVersion = await this.getDictionaryVersion();
    const runRepo = this.dataSource.getRepository(ConceptResolverRun);
    const run = await runRepo.save(
      runRepo.create({
        scope: "manual_run",
        mode: params?.apply ? "apply" : "dry_run",
        status: "running",
        dictionaryVersionAtStart: String(dictionaryVersion),
        resolverVersion: CONCEPT_RESOLVER_VERSION,
        stats: null,
        error: null,
        finishedAt: null,
      }),
    );
    const limit = Math.min(5000, Math.max(1, Number(params?.limit ?? 500) || 500));
    const status = params?.status ?? "pending";
    const includeReviewed = params?.includeReviewed === true;
    const candidateType = params?.candidateType ?? "all";
    const [termTypeCandidates, valueCandidates] = await Promise.all([
      candidateType === "value"
        ? Promise.resolve([])
        : this.dataSource.getRepository(DictionaryTermTypeCandidate).find({
            where: includeReviewed ? undefined : { status },
            order: { createdAt: "ASC" },
            take: limit,
          }),
      candidateType === "term_type"
        ? Promise.resolve([])
        : this.dataSource.getRepository(DictionaryCandidate).find({
            where: includeReviewed ? undefined : { status },
            order: { createdAt: "ASC" },
            take: limit,
          }),
    ]);
    const targets = [
      ...termTypeCandidates.map((candidate) => ({
        candidateType: "term_type" as const,
        candidateId: candidate.id,
      })),
      ...valueCandidates.map((candidate) => ({
        candidateType: "value" as const,
        candidateId: candidate.id,
      })),
    ].slice(0, limit);
    let successCount = 0;
    let failedCount = 0;
    const routes: Record<string, number> = {};
    try {
      for (const target of targets) {
        try {
          const result = await this.resolveCandidate({
            ...target,
            runId: run.id,
            force: true,
          });
          routes[result.route] = (routes[result.route] ?? 0) + 1;
          successCount += 1;
        } catch {
          failedCount += 1;
        }
      }
      run.status = "completed";
      run.stats = {
        requestedCount: targets.length,
        successCount,
        failedCount,
        routes,
      };
      run.finishedAt = new Date();
      return runRepo.save(run);
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      run.finishedAt = new Date();
      await runRepo.save(run);
      throw error;
    }
  }

  async resolveCandidate(params: ResolveParams): Promise<ConceptResolverDecision> {
    const loaded = await this.loadCandidate(params);
    const dictionaryVersion = await this.getDictionaryVersion();
    if (!params.force) {
      const existing = await this.dataSource.getRepository(ConceptResolution).findOne({
        where: {
          candidateType: params.candidateType,
          candidateId: params.candidateId,
          dictionaryVersion: String(dictionaryVersion),
          resolverVersion: CONCEPT_RESOLVER_VERSION,
        },
      });
      if (existing) {
        return this.decisionFromResolution(existing);
      }
    }

    const decision = await this.buildDecision(loaded, dictionaryVersion);
    const shouldApply = false;
    const saved = await this.saveDecision(decision, params.runId ?? null, shouldApply);
    await this.updateCandidateSnapshot(decision);
    await this.upsertPatternReview(decision);

    if (shouldApply && saved?.id) {
      await this.tryApplyDecision(decision, saved.id);
    }

    return decision;
  }

  async listResolutions(params?: {
    route?: string;
    relationType?: string;
    candidateType?: string;
    limit?: number;
  }) {
    const repo = this.dataSource.getRepository(ConceptResolution);
    const query = repo.createQueryBuilder("resolution").orderBy(
      "resolution.created_at",
      "DESC",
    );
    if (params?.route) {
      query.andWhere("resolution.route = :route", { route: params.route });
    }
    if (params?.relationType) {
      query.andWhere("resolution.relation_type = :relationType", {
        relationType: params.relationType,
      });
    }
    if (params?.candidateType) {
      query.andWhere("resolution.candidate_type = :candidateType", {
        candidateType: params.candidateType,
      });
    }
    query.limit(Math.min(500, Math.max(1, Number(params?.limit ?? 100) || 100)));
    return repo.find({
      where: {
        ...(params?.route ? { route: params.route as any } : {}),
        ...(params?.relationType
          ? { relationType: params.relationType as any }
          : {}),
        ...(params?.candidateType
          ? { candidateType: params.candidateType as any }
          : {}),
      },
      order: { createdAt: "DESC" },
      take: Math.min(500, Math.max(1, Number(params?.limit ?? 100) || 100)),
    });
  }

  async listPatterns(params?: { status?: string; limit?: number }) {
    const limit = Math.min(500, Math.max(1, Number(params?.limit ?? 100) || 100));
    const statusFilter = params?.status;
    const rows = await this.dataSource.query(
      `
      WITH latest AS (
        SELECT DISTINCT ON (pattern_key, candidate_type, candidate_id)
          *
        FROM quote_agent.concept_resolutions
        ORDER BY pattern_key, candidate_type, candidate_id, created_at DESC
      )
      SELECT
        latest.pattern_key AS "patternKey",
        latest.candidate_type AS "candidateType",
        latest.relation_type AS "relationType",
        latest.recommended_action AS "recommendedAction",
        COUNT(*)::int AS "candidateCount",
        COUNT(DISTINCT latest.candidate_id)::int AS "uniqueCandidateCount",
        AVG(latest.score)::float AS "avgScore",
        MAX(latest.created_at) AS "lastResolvedAt",
        review.id AS "reviewId",
        review.status AS "reviewStatus",
        review.review_payload_jsonb AS "reviewPayload"
      FROM latest
      LEFT JOIN quote_agent.concept_pattern_reviews review
        ON review.pattern_key = latest.pattern_key
      WHERE ($1::text IS NULL OR COALESCE(review.status, 'pending') = $1)
      GROUP BY
        latest.pattern_key,
        latest.candidate_type,
        latest.relation_type,
        latest.recommended_action,
        review.id,
        review.status,
        review.review_payload_jsonb
      ORDER BY "candidateCount" DESC, "lastResolvedAt" DESC
      LIMIT $2
      `,
      [statusFilter ?? null, limit],
    );
    return rows;
  }

  async reviewPattern(params: {
    patternKey: string;
    status?: string;
    reviewedBy?: string;
    reviewPayload?: unknown;
  }) {
    const resolution = await this.dataSource
      .getRepository(ConceptResolution)
      .findOne({ where: { patternKey: params.patternKey } });
    if (!resolution) {
      throw new Error(`concept pattern not found: ${params.patternKey}`);
    }
    const repo = this.dataSource.getRepository(ConceptPatternReview);
    let review = await repo.findOne({ where: { patternKey: params.patternKey } });
    if (!review) {
      review = repo.create({
        patternKey: params.patternKey,
        candidateType: resolution.candidateType,
        relationType: resolution.relationType,
        recommendedAction: resolution.recommendedAction,
      });
    }
    review.status = params.status ?? "reviewed";
    review.reviewPayloadJsonb = params.reviewPayload ?? review.reviewPayloadJsonb;
    review.reviewedBy = params.reviewedBy ?? review.reviewedBy;
    review.reviewedAt = new Date();
    return repo.save(review);
  }

  async applyPatternCandidates(params: {
    patternKey: string;
    reviewedBy?: string;
    limit?: number;
  }) {
    const limit = Math.min(200, Math.max(1, Number(params.limit ?? 100) || 100));
    const resolutions = await this.dataSource.getRepository(ConceptResolution).find({
      where: { patternKey: params.patternKey },
      order: { createdAt: "DESC" },
      take: limit,
    });
    const operations = resolutions.map((resolution) => ({
      candidateType: resolution.candidateType,
      candidateId: resolution.candidateId,
      recommendedAction: resolution.recommendedAction,
      route: resolution.route,
      status: "pending_manual_apply",
    }));
    await this.reviewPattern({
      patternKey: params.patternKey,
      status: "applied_to_candidates_pending_manual_review",
      reviewedBy: params.reviewedBy,
      reviewPayload: { operations },
    });
    return {
      patternKey: params.patternKey,
      operationCount: operations.length,
      operations,
    };
  }

  private async loadCandidate(params: ResolveParams): Promise<LoadedCandidate> {
    if (params.candidateType === "term_type") {
      const candidate = await this.dataSource
        .getRepository(DictionaryTermTypeCandidate)
        .findOne({ where: { id: params.candidateId } });
      if (!candidate) {
        throw new Error(`DictionaryTermTypeCandidate not found: ${params.candidateId}`);
      }
      return { candidateType: "term_type", candidate };
    }
    const candidate = await this.dataSource
      .getRepository(DictionaryCandidate)
      .findOne({ where: { id: params.candidateId } });
    if (!candidate) {
      throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
    }
    return { candidateType: "value", candidate };
  }

  private async getDictionaryVersion(): Promise<number> {
    const version = await this.dataSource
      .getRepository(DictionaryVersion)
      .findOne({ where: { versionKey: "dictionary" } });
    return Number(version?.versionValue ?? 0);
  }

  private async buildDecision(
    loaded: LoadedCandidate,
    dictionaryVersion: number,
  ): Promise<ConceptResolverDecision> {
    const rawFieldName =
      loaded.candidateType === "term_type" ? loaded.candidate.rawFieldName : loaded.candidate.termType;
    const rawValue =
      loaded.candidateType === "term_type" ? loaded.candidate.rawValue : loaded.candidate.rawValue;
    const normalized =
      loaded.candidateType === "term_type"
        ? loaded.candidate.normalizedFieldName
        : loaded.candidate.normalizedRawValue;
    const occurrences = await this.loadOccurrences(loaded);
    const snapshot = await this.loadDictionarySnapshot(dictionaryVersion);
    const termTypeRecord =
      loaded.candidateType === "value"
        ? snapshot.termTypeByKey.get(loaded.candidate.termType) ?? null
        : null;
    const ruleSignals = [
      ...NormalizationRuleRegistry.extractSignals(loaded.candidate.evidence),
      ...occurrences.flatMap((occurrence) =>
        NormalizationRuleRegistry.extractSignals(occurrence.evidence),
      ),
    ];
    const knownValueAliasTermTypes = await this.findValueAliasTermTypes(
      normalized,
      snapshot,
    );
    const rawTargets = await this.findMatchTargets(loaded, normalized, snapshot);
    const splitSourceEvidence = splitSourceEvidenceFrom(loaded.candidate.evidence);
    const qualifierEvidence = qualifierEvidenceFrom(
      {
        fieldName: rawFieldName,
        rawValue,
        evidence: loaded.candidate.evidence,
      },
      ...occurrences.map((occurrence) => ({
        fieldName: occurrence.fieldName,
        rawValue: occurrence.rawValue,
        evidence: occurrence.evidence,
      })),
    );
    const issues = this.issueDetector.detect({
      candidateType: loaded.candidateType,
      rawFieldName,
      normalizedFieldName:
        loaded.candidateType === "term_type" ? loaded.candidate.normalizedFieldName : undefined,
      termType: loaded.candidateType === "value" ? loaded.candidate.termType : undefined,
      rawValue,
      sourceRawValue:
        splitSourceEvidence.sourceRawValue ??
        splitSourceEvidence.splitFromRawValue,
      splitFromRawValue: splitSourceEvidence.splitFromRawValue,
      normalizedRawValue:
        loaded.candidateType === "value" ? loaded.candidate.normalizedRawValue : undefined,
      sourceProductType: loaded.candidate.sourceProductType,
      valueKind: termTypeRecord?.valueKind ?? null,
      scope: termTypeRecord?.scope ?? null,
      ruleSignals,
      qualifier: qualifierEvidence.qualifier,
      baseFieldName: qualifierEvidence.baseFieldName,
      originalFieldName: qualifierEvidence.originalFieldName,
      knownValueAliasTermTypes,
      occurrenceCount: occurrences.length,
      documentCount: new Set(occurrences.map((item) => item.documentId)).size,
    });
    const negative = {
      productTypeMismatch: this.hasProductTypeMismatch(
        termTypeRecord,
        loaded.candidate.sourceProductType,
      ),
      valueKindConflict:
        loaded.candidateType === "value" &&
        Boolean(termTypeRecord) &&
        !isEnumKind(termTypeRecord?.valueKind),
      unitConflict:
        loaded.candidateType === "value" &&
        isEnumKind(termTypeRecord?.valueKind) &&
        /\d/.test(rawValue ?? "") &&
        /(?:mm|毫米|mpa|kw|v|ccm|bar)/i.test(rawValue ?? ""),
      sameItemTogetherCount: await this.countSameItemTogether(loaded),
      existingSeparateUsage: await this.countExistingSeparateUsage(loaded),
    };
    const positive = {
      aliasExact: rawTargets.some((target) => target.relationType === "exact_alias"),
      synonymSimilarity: rawTargets.find((target) => target.relationType === "synonym_alias")?.score,
      sameProductTypeUsage: occurrences.filter(
        (occurrence) => occurrence.sourceProductType === loaded.candidate.sourceProductType,
      ).length,
      sameItemTogetherCount: negative.sameItemTogetherCount,
      existingSeparateUsage: negative.existingSeparateUsage,
      ruleSignalCount: ruleSignals.length,
      historicalHumanReviewCount: await this.countHistoricalHumanReviews(loaded, normalized),
    };
    const targets = this.targetScoring.scoreTargets({
      targets: rawTargets.map((target) =>
        this.attachAuditSignalToTarget(target, snapshot),
      ),
      issues,
      positive,
      negative,
      matchContext: {
        candidateType: loaded.candidateType,
        matchRoute: rawTargets[0]?.relationType,
        matchConfidence: rawTargets[0]?.score,
        sourceProductType: loaded.candidate.sourceProductType,
        valueKind: termTypeRecord?.valueKind ?? null,
        scope: termTypeRecord?.scope ?? null,
        candidateStatus: loaded.candidate.status,
        occurrenceCount: occurrences.length,
      },
    });
    const scored = this.scoreAndRoute({
      loaded,
      targets,
      issues,
      occurrenceCount: occurrences.length,
      positive,
      negative,
      valueKind: termTypeRecord?.valueKind ?? null,
    });
    const patternKey = patternKeyFor({
      candidateType: loaded.candidateType,
      normalized:
        scored.relationType === "qualifier_variant" &&
        qualifierEvidence.baseFieldName
          ? normalizeText(qualifierEvidence.baseFieldName)
          : normalized,
      termType: loaded.candidateType === "value" ? loaded.candidate.termType : null,
      sourceProductType: loaded.candidate.sourceProductType,
      relationType: scored.relationType,
      detector: issues[0]?.detector,
    });
    return {
      candidateType: loaded.candidateType,
      candidateId: loaded.candidate.id,
      relationType: scored.relationType,
      recommendedAction: scored.recommendedAction,
      route: scored.route,
      score: scored.score,
      riskLevel: scored.riskLevel,
      reason: scored.reason,
      patternKey,
      matchedTargets: targets,
      issues,
      evidence: {
        positive,
        negative,
        ruleSignals,
        occurrenceCount: occurrences.length,
        documentCount: new Set(occurrences.map((item) => item.documentId)).size,
        sampleOccurrences: occurrences.slice(0, 5),
        dictionaryVersion,
        valueKind: termTypeRecord?.valueKind ?? null,
        scope: termTypeRecord?.scope ?? null,
        conceptRole: termTypeRecord?.conceptRole ?? null,
        qualifier: qualifierEvidence.qualifier,
        baseFieldName: qualifierEvidence.baseFieldName ?? null,
        originalFieldName: qualifierEvidence.originalFieldName ?? null,
        matchedQualifierAlias: qualifierEvidence.matchedQualifierAlias ?? null,
        qualifierKey: qualifierEvidence.qualifierKey ?? null,
        qualifierKind: qualifierEvidence.qualifierKind ?? null,
        qualifierRule: qualifierEvidence.rule ?? null,
      },
    };
  }

  private scoreAndRoute(params: {
    loaded: LoadedCandidate;
    targets: ConceptMatchTarget[];
    issues: ConceptIssue[];
    occurrenceCount: number;
    positive: Record<string, any>;
    negative: Record<string, any>;
    valueKind: string | null;
  }): {
    relationType: ConceptRelationType;
    recommendedAction: ConceptRecommendedAction;
    route: ConceptResolverRoute;
    score: number;
    riskLevel: ConceptRiskLevel;
    reason: string;
  } {
    const topIssue = params.issues[0];
    const topTarget = params.targets[0];
    const policyEvaluation =
      topTarget?.scoreBreakdown &&
      typeof topTarget.scoreBreakdown === "object" &&
      !Array.isArray(topTarget.scoreBreakdown)
        ? (topTarget.scoreBreakdown as any).policyEvaluation
        : null;
    const hardConstraints = Array.isArray(policyEvaluation?.hardConstraints)
      ? policyEvaluation.hardConstraints
      : [];
    return this.routingService.route({
      candidateType: params.loaded.candidateType,
      termType:
        params.loaded.candidateType === "value"
          ? params.loaded.candidate.termType
          : null,
      topTarget,
      topIssue,
      occurrenceCount: params.occurrenceCount,
      aliasExact: params.positive.aliasExact === true,
      issues: params.issues,
      negative: params.negative,
      valueKind: params.valueKind,
      unifiedScore:
        typeof policyEvaluation?.unifiedScore === "number"
          ? policyEvaluation.unifiedScore
          : topTarget?.contextAwareScore ?? topTarget?.score ?? 0.45,
      hardConstraints,
      config: { llmEnabled: this.getConfig().llmEnabled },
    });
  }

  private async loadDictionarySnapshot(
    dictionaryVersion?: number,
  ): Promise<DictionarySnapshot> {
    const version = dictionaryVersion ?? (await this.getDictionaryVersion());
    if (this.dictionarySnapshot?.version === version) {
      return this.dictionarySnapshot;
    }
    if (this.dictionarySnapshotPromise) {
      const snapshot = await this.dictionarySnapshotPromise;
      if (snapshot.version === version) {
        return snapshot;
      }
    }
    this.dictionarySnapshotPromise = (async () => {
      const [termTypes, termTypeAliases, valueAliases, terms, healthReports] = await Promise.all([
        this.dataSource.getRepository(DictionaryTermType).find({
          where: { isActive: true },
        }),
        this.dataSource.getRepository(DictionaryTermTypeAlias).find({
          where: { isActive: true },
        }),
        this.dataSource.getRepository(DictionaryAlias).find({
          where: { isActive: true },
        }),
        this.dataSource.getRepository(DictionaryTerm).find({
          where: { isActive: true },
        }),
        this.dataSource
          .getRepository(DictionaryHealthReport)
          .find()
          .catch((): DictionaryHealthReport[] => []),
      ]);
      const snapshot: DictionarySnapshot = {
        version,
        termTypeByKey: new Map(termTypes.map((termType) => [termType.termType, termType])),
        termTypeAliasesByNormalized: new Map(),
        valueAliasesByNormalized: new Map(),
        valueAliasesByTermTypeNormalized: new Map(),
        valueTermTypesByCanonicalNormalized: new Map(),
        termsById: new Map(terms.map((term) => [term.id, term])),
        termsByTermType: new Map(),
        healthReportByTermType: new Map(
          healthReports
            .filter((report) => report.targetKind === "termType")
            .map((report) => [report.targetId, report]),
        ),
        healthReportByTermId: new Map(
          healthReports
            .filter((report) => report.targetKind === "enumValue")
            .map((report) => [report.targetId, report]),
        ),
      };
      for (const alias of termTypeAliases) {
        snapshot.termTypeAliasesByNormalized.set(alias.normalizedAliasName, [
          ...(snapshot.termTypeAliasesByNormalized.get(alias.normalizedAliasName) ?? []),
          alias,
        ]);
      }
      for (const alias of valueAliases) {
        snapshot.valueAliasesByNormalized.set(alias.normalizedAlias, [
          ...(snapshot.valueAliasesByNormalized.get(alias.normalizedAlias) ?? []),
          alias,
        ]);
        const key = `${alias.termType}:${alias.normalizedAlias}`;
        snapshot.valueAliasesByTermTypeNormalized.set(key, [
          ...(snapshot.valueAliasesByTermTypeNormalized.get(key) ?? []),
          alias,
        ]);
      }
      for (const term of terms) {
        snapshot.termsByTermType.set(term.termType, [
          ...(snapshot.termsByTermType.get(term.termType) ?? []),
          term,
        ]);
        const normalized = normalizeText(term.canonicalValue);
        if (normalized) {
          snapshot.valueTermTypesByCanonicalNormalized.set(normalized, [
            ...(snapshot.valueTermTypesByCanonicalNormalized.get(normalized) ?? []),
            term.termType,
          ]);
        }
      }
      this.dictionarySnapshot = snapshot;
      return snapshot;
    })();
    try {
      return await this.dictionarySnapshotPromise;
    } finally {
      this.dictionarySnapshotPromise = null;
    }
  }

  private attachAuditSignalToTarget(
    target: ConceptMatchTarget,
    snapshot: DictionarySnapshot,
  ): ConceptMatchTarget {
    const report =
      target.targetType === "term_type" && target.termType
        ? snapshot.healthReportByTermType.get(target.termType)
        : target.id
          ? snapshot.healthReportByTermId.get(String(target.id))
          : null;
    if (!report) {
      return target;
    }
    const evidence =
      target.evidence && typeof target.evidence === "object" && !Array.isArray(target.evidence)
        ? (target.evidence as Record<string, unknown>)
        : {};
    return {
      ...target,
      targetRiskLabels: targetRiskLabelsFrom(
        target.targetRiskLabels,
        report.riskLabels,
      ),
      evidence: {
        ...evidence,
        auditSignal: {
          riskScore: Number(report.riskScore),
          riskLabels: report.riskLabels,
          trustSignals: report.trustSignals,
          evidenceJson: report.evidenceJson,
          auditRunId: report.auditRunId,
          dictionaryVersion: report.dictionaryVersion,
        },
      },
    };
  }

  private async findMatchTargets(
    loaded: LoadedCandidate,
    normalized: string,
    snapshot: DictionarySnapshot,
  ): Promise<ConceptMatchTarget[]> {
    if (!normalized) return [];
    if (loaded.candidateType === "term_type") {
      const aliases = snapshot.termTypeAliasesByNormalized.get(normalized) ?? [];
      const termTypes = aliases.length
        ? aliases
            .map((alias) => snapshot.termTypeByKey.get(alias.termType))
            .filter((termType): termType is DictionaryTermType => Boolean(termType))
        : [snapshot.termTypeByKey.get(normalized)].filter(
            (termType): termType is DictionaryTermType => Boolean(termType),
          );
      return [
        ...aliases.map((alias) => ({
          targetType: "term_type" as const,
          id: alias.id,
          termType: alias.termType,
          displayName:
            termTypes.find((termType) => termType.termType === alias.termType)
              ?.displayName ?? alias.termType,
          relationType: "exact_alias" as const,
          score: 0.95,
          baselineTrustTier: normalizeBaselineTrustTier(alias.baselineTrustTier),
          targetRiskLabels: targetRiskLabelsFrom(
            alias.baselineRiskLabels,
            termTypes.find((termType) => termType.termType === alias.termType)
              ?.riskLevel,
          ),
          evidence: { aliasName: alias.aliasName, source: alias.source },
        })),
        ...termTypes
          .filter((termType) => termType.termType === normalized)
          .map((termType) => ({
            targetType: "term_type" as const,
            id: termType.id,
            termType: termType.termType,
            displayName: termType.displayName,
            relationType: "exact_alias" as const,
            score: 0.98,
            baselineTrustTier: normalizeBaselineTrustTier(
              termType.baselineTrustTier,
            ),
            targetRiskLabels: targetRiskLabelsFrom(
              termType.baselineRiskLabels,
              termType.riskLevel,
            ),
            evidence: { intrinsic: true },
          })),
      ];
    }
    const aliases =
      snapshot.valueAliasesByTermTypeNormalized.get(
        `${loaded.candidate.termType}:${normalized}`,
      ) ?? [];
    const terms = aliases.length
      ? aliases
          .map((alias) => snapshot.termsById.get(alias.termId))
          .filter((term): term is DictionaryTerm => Boolean(term))
      : (snapshot.termsByTermType.get(loaded.candidate.termType) ?? []).filter(
          (term) => normalizeText(term.canonicalValue) === normalized,
        );
    const splitComponentAliases =
      aliases.length > 0
        ? []
        : (snapshot.termsByTermType.get(loaded.candidate.termType) ?? [])
            .flatMap((term) =>
              (snapshot.valueAliasesByTermTypeNormalized.get(
                `${term.termType}:${normalizeText(term.canonicalValue)}`,
              ) ?? []).map((alias) => ({ alias, term })),
            )
            .filter(
              ({ alias }) =>
                alias.normalizedAlias !== normalized &&
                alias.normalizedAlias.length >= 2 &&
                normalized.includes(alias.normalizedAlias),
            )
            .sort(
              (left, right) =>
                right.alias.normalizedAlias.length -
                  left.alias.normalizedAlias.length ||
                right.alias.usageCount - left.alias.usageCount,
            )
            .slice(0, 5);
    return [
      ...aliases.map((alias) => {
        const term = terms.find((item) => item.id === alias.termId);
        return {
          targetType: "term" as const,
          id: term?.id ?? alias.termId,
          termType: alias.termType,
          canonicalValue: term?.canonicalValue ?? null,
          displayName: term?.displayName ?? null,
          relationType: "exact_alias" as const,
          score: Number(alias.confidence ?? 0.95),
          baselineTrustTier: normalizeBaselineTrustTier(alias.baselineTrustTier),
          targetRiskLabels: targetRiskLabelsFrom(
            alias.baselineRiskLabels,
            alias.riskLevel,
            term?.baselineRiskLabels,
            term?.riskLevel,
          ),
          evidence: { aliasValue: alias.aliasValue, source: alias.source },
        };
      }),
      ...terms
        .filter((term) => normalizeText(term.canonicalValue) === normalized)
        .map((term) => ({
          targetType: "term" as const,
          id: term.id,
          termType: term.termType,
          canonicalValue: term.canonicalValue,
          displayName: term.displayName,
          relationType: "exact_alias" as const,
          score: 0.98,
          baselineTrustTier: normalizeBaselineTrustTier(term.baselineTrustTier),
          targetRiskLabels: targetRiskLabelsFrom(
            term.baselineRiskLabels,
            term.riskLevel,
          ),
          evidence: { intrinsic: true },
        })),
      ...splitComponentAliases.map(({ alias, term }) => ({
        targetType: "term" as const,
        id: String(alias.termId),
        termType: alias.termType,
        canonicalValue: term.canonicalValue,
        displayName: term.displayName,
        relationType: "split_component" as const,
        score: 0.78,
        baselineTrustTier: normalizeBaselineTrustTier(alias.baselineTrustTier),
        targetRiskLabels: targetRiskLabelsFrom(
          alias.baselineRiskLabels,
          alias.riskLevel,
          term.baselineRiskLabels,
          term.riskLevel,
        ),
        evidence: {
          aliasId: alias.id,
          aliasValue: alias.aliasValue,
          normalizedAlias: alias.normalizedAlias,
        },
      })),
    ].sort((left, right) => right.score - left.score);
  }

  private async findValueAliasTermTypes(
    normalized: string,
    snapshot: DictionarySnapshot,
  ): Promise<string[]> {
    if (!normalized) return [];
    const aliases = snapshot.valueAliasesByNormalized.get(normalized) ?? [];
    return [
      ...new Set([
        ...aliases.map((item) => item.termType),
        ...(snapshot.valueTermTypesByCanonicalNormalized.get(normalized) ?? []),
      ]),
    ];
  }

  private async loadOccurrences(
    loaded: LoadedCandidate,
  ): Promise<DictionaryCandidateOccurrence[]> {
    return this.dataSource.getRepository(DictionaryCandidateOccurrence).find({
      where: {
        candidateType: loaded.candidateType,
        candidateId: loaded.candidate.id,
      },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  private hasProductTypeMismatch(
    termType: DictionaryTermType | null,
    sourceProductType: string | null | undefined,
  ): boolean {
    if (!termType || !sourceProductType || sourceProductType === "unknown") {
      return false;
    }
    const applicable = termType.applicableProductTypes ?? [];
    if (applicable.length === 0 || applicable.includes("common")) return false;
    return !applicable.includes(sourceProductType);
  }

  private async countSameItemTogether(loaded: LoadedCandidate): Promise<number> {
    if (!loaded.candidate.extractionResultId || loaded.candidate.itemIndex === null) {
      return 0;
    }
    const key = `${loaded.candidate.extractionResultId}:${loaded.candidate.itemIndex}`;
    if (!this.sameItemTogetherCountCache.has(key)) {
      this.sameItemTogetherCountCache.set(
        key,
        this.dataSource.getRepository(DictionaryCandidateOccurrence).count({
          where: {
            extractionResultId: loaded.candidate.extractionResultId,
            itemIndex: loaded.candidate.itemIndex,
          },
        }),
      );
    }
    return this.sameItemTogetherCountCache.get(key)!;
  }

  private async countExistingSeparateUsage(loaded: LoadedCandidate): Promise<number> {
    const rawValue =
      loaded.candidateType === "value"
        ? loaded.candidate.rawValue
        : loaded.candidate.rawValue ?? loaded.candidate.rawFieldName;
    const normalized = normalizeText(rawValue);
    if (!normalized) return 0;
    if (!this.existingSeparateUsageCountCache.has(normalized)) {
      this.existingSeparateUsageCountCache.set(
        normalized,
        this.dataSource.getRepository(DictionaryCandidateOccurrence).count({
          where: { rawValue },
        }),
      );
    }
    return this.existingSeparateUsageCountCache.get(normalized)!;
  }

  private async countHistoricalHumanReviews(
    loaded: LoadedCandidate,
    normalized: string,
  ): Promise<number> {
    if (loaded.candidateType === "term_type") {
      const key = `term_type:${normalized}`;
      if (!this.historicalHumanReviewCountCache.has(key)) {
        this.historicalHumanReviewCountCache.set(
          key,
          this.dataSource.getRepository(DictionaryTermTypeCandidate).count({
            where: {
              normalizedFieldName: normalized,
              status: In(["approved", "rejected"]) as any,
            },
          }),
        );
      }
      return this.historicalHumanReviewCountCache.get(key)!;
    }
    const key = `value:${loaded.candidate.termType}:${normalized}`;
    if (!this.historicalHumanReviewCountCache.has(key)) {
      this.historicalHumanReviewCountCache.set(
        key,
        this.dataSource.getRepository(DictionaryCandidate).count({
          where: {
            termType: loaded.candidate.termType,
            normalizedRawValue: normalized,
            status: In(["approved", "rejected"]) as any,
          },
        }),
      );
    }
    return this.historicalHumanReviewCountCache.get(key)!;
  }

  private async saveDecision(
    decision: ConceptResolverDecision,
    runId: string | null,
    returnSaved = false,
  ): Promise<ConceptResolution | null> {
    const repo = this.dataSource.getRepository(ConceptResolution);
    const entity = repo.create({
      runId,
      candidateType: decision.candidateType,
      candidateId: decision.candidateId,
      dictionaryVersion: String(decision.evidence.dictionaryVersion),
      resolverVersion: CONCEPT_RESOLVER_VERSION,
      relationType: decision.relationType,
      recommendedAction: decision.recommendedAction,
      route: decision.route,
      score: String(decision.score),
      riskLevel: decision.riskLevel,
      patternKey: decision.patternKey,
      reason: decision.reason,
      evidenceJsonb: decision.evidence,
      matchedTargetsJsonb: decision.matchedTargets,
      issuesJsonb: decision.issues,
      llmSuggestionId: null,
      appliedOperationJsonb: decision.appliedOperation ?? null,
      appliedAt: null,
    });
    await repo.upsert(entity as any, [
      "candidateType",
      "candidateId",
      "dictionaryVersion",
      "resolverVersion",
    ]);
    if (!returnSaved) return null;
    const saved = await repo.findOne({
      where: {
        candidateType: decision.candidateType,
        candidateId: decision.candidateId,
        dictionaryVersion: String(decision.evidence.dictionaryVersion),
        resolverVersion: CONCEPT_RESOLVER_VERSION,
      },
    });
    if (!saved) throw new Error("concept resolution upsert failed");
    return saved;
  }

  private async updateCandidateSnapshot(decision: ConceptResolverDecision) {
    const patch = {
      resolverStatus: "resolved",
      resolverRoute: decision.route,
      resolverScore: String(decision.score),
      resolverRiskLevel: decision.riskLevel,
      resolverDecisionJsonb: decision,
      lastResolvedAt: new Date(),
    };
    if (decision.candidateType === "term_type") {
      await this.dataSource
        .getRepository(DictionaryTermTypeCandidate)
        .update({ id: decision.candidateId }, patch as any);
    } else {
      await this.dataSource
        .getRepository(DictionaryCandidate)
        .update({ id: decision.candidateId }, patch as any);
    }
  }

  private async upsertPatternReview(decision: ConceptResolverDecision) {
    const knownPatternKeys = await this.loadKnownPatternKeys();
    if (knownPatternKeys.has(decision.patternKey)) return;
    await this.dataSource.query(
      `
      INSERT INTO quote_agent.concept_pattern_reviews(
        pattern_key,
        candidate_type,
        relation_type,
        recommended_action,
        status,
        review_payload_jsonb,
        reviewed_by,
        reviewed_at
      )
      VALUES ($1, $2, $3, $4, 'pending', NULL, NULL, NULL)
      ON CONFLICT(pattern_key) DO NOTHING
      `,
      [
        decision.patternKey,
        decision.candidateType,
        decision.relationType,
        decision.recommendedAction,
      ],
    );
    knownPatternKeys.add(decision.patternKey);
  }

  private async loadKnownPatternKeys(): Promise<Set<string>> {
    if (this.knownPatternKeys) return this.knownPatternKeys;
    if (!this.knownPatternKeysPromise) {
      this.knownPatternKeysPromise = (async () => {
        const rows = await this.dataSource.query(
          `SELECT pattern_key AS "patternKey" FROM quote_agent.concept_pattern_reviews`,
        );
        const keys: Set<string> = new Set(
          rows.map((row: any) => String(row.patternKey)),
        );
        this.knownPatternKeys = keys;
        return keys;
      })();
    }
    const keys = await this.knownPatternKeysPromise;
    return keys;
  }

  private async tryApplyDecision(decision: ConceptResolverDecision, resolutionId: string) {
    if (
      decision.candidateType !== "value" ||
      decision.relationType !== "exact_alias" ||
      decision.riskLevel !== "low"
    ) {
      return;
    }
    const targetTermId = decision.matchedTargets.find((target) => target.id)?.id;
    if (!targetTermId) return;
    await approveValueCandidateAsAlias(this.dataSource, {
      candidateId: decision.candidateId,
      termId: targetTermId,
      reviewedBy: "concept_resolver",
    });
    await this.bumpDictionaryVersion();
    const nextDictionaryVersion = await this.getDictionaryVersion();
    await this.dataSource.getRepository(DictionaryChangeLog).save(
      this.dataSource.getRepository(DictionaryChangeLog).create({
        dictionaryVersion: String(nextDictionaryVersion),
        source: "concept_resolver",
        action: "approve_value_as_alias",
        candidateType: decision.candidateType,
        candidateId: decision.candidateId,
        resolverRunId: null,
        beforeJsonb: { dictionaryVersion: decision.evidence.dictionaryVersion },
        afterJsonb: { termId: targetTermId, dictionaryVersion: nextDictionaryVersion },
        changedBy: "concept_resolver",
      }),
    );
    await this.markCandidateDocumentsDirty(decision, nextDictionaryVersion);
    await this.dataSource.getRepository(ConceptResolution).update(
      { id: resolutionId },
      {
        appliedAt: new Date(),
        appliedOperationJsonb: {
          action: "approve_value_as_alias",
          candidateId: decision.candidateId,
          termId: targetTermId,
        },
      },
    );
  }

  private async bumpDictionaryVersion() {
    await this.dataSource.query(
      `
      INSERT INTO quote_agent.dictionary_versions(version_key, version_value)
      VALUES ($1, 1)
      ON CONFLICT(version_key)
      DO UPDATE SET
        version_value = quote_agent.dictionary_versions.version_value + 1,
        updated_at = now()
      `,
      ["dictionary"],
    );
  }

  private async markCandidateDocumentsDirty(
    decision: ConceptResolverDecision,
    dictionaryVersion: number,
  ) {
    if (
      decision.candidateType !== "term_type" &&
      decision.candidateType !== "value"
    ) {
      return;
    }
    const rows = await this.dataSource.getRepository(DictionaryCandidateOccurrence).find({
      where: {
        candidateType: decision.candidateType,
        candidateId: decision.candidateId,
      },
    });
    const documentIds = [
      ...new Set(rows.map((row) => Number(row.documentId)).filter((id) => id > 0)),
    ];
    if (documentIds.length === 0) return;
    await this.dataSource.query(
      `
      UPDATE quote_agent.documents
      SET status = 'dictionary_dirty',
          dirty_reason = 'dictionary_refresh',
          dirty_dictionary_version = $2,
          dirty_resolver_version = $3
      WHERE id = ANY($1::int[])
      `,
      [documentIds, String(dictionaryVersion), CONCEPT_RESOLVER_VERSION],
    );
    await this.dataSource.query(
      `
      UPDATE quote_agent.contract_archives
      SET status = 'dictionary_dirty',
          dirty_reason = 'dictionary_refresh',
          dirty_dictionary_version = $2,
          dirty_resolver_version = $3
      WHERE document_id = ANY($1::text[])
      `,
      [
        documentIds.map((id) => String(id)),
        String(dictionaryVersion),
        CONCEPT_RESOLVER_VERSION,
      ],
    );
  }

  private decisionFromResolution(resolution: ConceptResolution): ConceptResolverDecision {
    return {
      candidateType: resolution.candidateType,
      candidateId: resolution.candidateId,
      relationType: resolution.relationType,
      recommendedAction: resolution.recommendedAction,
      route: resolution.route,
      score: Number(resolution.score),
      riskLevel: resolution.riskLevel,
      reason: resolution.reason,
      patternKey: resolution.patternKey,
      matchedTargets: Array.isArray(resolution.matchedTargetsJsonb)
        ? (resolution.matchedTargetsJsonb as any)
        : [],
      issues: Array.isArray(resolution.issuesJsonb)
        ? (resolution.issuesJsonb as any)
        : [],
      evidence:
        resolution.evidenceJsonb &&
        typeof resolution.evidenceJsonb === "object" &&
        !Array.isArray(resolution.evidenceJsonb)
          ? (resolution.evidenceJsonb as any)
          : {
              positive: {},
              negative: {},
              ruleSignals: [],
              occurrenceCount: 0,
              documentCount: 0,
              sampleOccurrences: [],
              dictionaryVersion: Number(resolution.dictionaryVersion),
            },
      appliedOperation: resolution.appliedOperationJsonb ?? undefined,
    };
  }
}

export const conceptResolverService = (dataSource: DataSource) =>
  new ConceptResolverService(dataSource);
