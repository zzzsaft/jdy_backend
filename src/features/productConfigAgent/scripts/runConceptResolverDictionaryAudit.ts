import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import {
  ConceptPatternReview,
  ConceptResolution,
  ConceptResolverRun,
  DictionaryAlias,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryVersion,
} from "../dictionary/entity/index.js";
import { ConceptIssueDetectorService } from "../dictionary/conceptIssueDetector.service.js";
import { CONCEPT_RESOLVER_VERSION } from "../dictionary/conceptResolver.service.js";
import type {
  ConceptCandidateType,
  ConceptIssue,
  ConceptMatchTarget,
  ConceptRecommendedAction,
  ConceptRelationType,
  ConceptResolverRoute,
  ConceptRiskLevel,
} from "../dictionary/conceptResolver.types.js";
import { normalizeText } from "../dictionary/dictionary.utils.js";

const JUNE_2026_START = new Date("2026-06-01T00:00:00.000Z");
const GENERIC_SHARED_VALUES = new Set([
  "有",
  "无",
  "是",
  "否",
  "yes",
  "no",
  "none",
  "其他",
  "other",
  "不配",
  "不配打",
]);

type DictionaryAuditEntryType =
  | "dictionary_term_type"
  | "dictionary_term"
  | "dictionary_alias"
  | "dictionary_term_type_alias";

type DictionaryAuditFinding = {
  candidateType: DictionaryAuditEntryType;
  candidateId: string;
  relationType: ConceptRelationType;
  recommendedAction: ConceptRecommendedAction;
  route: ConceptResolverRoute;
  score: number;
  riskLevel: ConceptRiskLevel;
  reason: string;
  patternKey: string;
  issues: ConceptIssue[];
  matchedTargets: ConceptMatchTarget[];
  evidence: Record<string, unknown>;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function riskRank(risk: ConceptRiskLevel): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function highestRisk(base: ConceptRiskLevel, issues: ConceptIssue[]): ConceptRiskLevel {
  return issues.reduce(
    (current, issue) =>
      riskRank(issue.riskLevel) > riskRank(current) ? issue.riskLevel : current,
    base,
  );
}

function patternKeyFor(params: {
  candidateType: DictionaryAuditEntryType;
  relationType: ConceptRelationType;
  normalized: string;
  termType?: string | null;
  detector?: string | null;
}): string {
  return [
    params.candidateType,
    params.termType ?? "",
    params.normalized,
    "dictionary",
    params.relationType,
    params.detector ?? "",
  ]
    .map((part) => String(part).replace(/\|\|/g, "|"))
    .join("||");
}

function isJuneTouched(row: { createdAt?: Date | null; updatedAt?: Date | null }) {
  return {
    juneCreated: Boolean(row.createdAt && row.createdAt >= JUNE_2026_START),
    juneUpdated: Boolean(row.updatedAt && row.updatedAt >= JUNE_2026_START),
  };
}

function compactEntryForReport(entry: any): Record<string, unknown> {
  return {
    id: entry?.id,
    termType: entry?.termType,
    displayName: entry?.displayName,
    canonicalValue: entry?.canonicalValue,
    aliasValue: entry?.aliasValue,
    aliasName: entry?.aliasName,
    source: entry?.source,
    valueKind: entry?.valueKind,
    scope: entry?.scope,
    conceptRole: entry?.conceptRole,
    riskLevel: entry?.riskLevel,
    applicableProductTypes: entry?.applicableProductTypes,
    createdAt: entry?.createdAt,
    updatedAt: entry?.updatedAt,
  };
}

function routeFor(relationType: ConceptRelationType): ConceptResolverRoute {
  return relationType === "extraction_error" || relationType === "non_config_noise"
    ? "auto_reject_pending"
    : "human_review";
}

function valueKey(termType: string, normalized: string): string {
  return `${termType}::${normalized}`;
}

async function getDictionaryVersion(): Promise<number> {
  const row = await PgDataSource.getRepository(DictionaryVersion).findOne({
    where: { versionKey: "dictionary" },
  });
  return Number(row?.versionValue ?? 0);
}

function buildValueIndex(params: {
  terms: DictionaryTerm[];
  aliases: DictionaryAlias[];
}) {
  const byNormalized = new Map<string, Array<ConceptMatchTarget & { sourceKind: string }>>();
  const add = (
    normalized: string,
    target: ConceptMatchTarget & { sourceKind: string },
  ) => {
    if (!normalized || GENERIC_SHARED_VALUES.has(normalized)) return;
    byNormalized.set(normalized, [...(byNormalized.get(normalized) ?? []), target]);
  };

  for (const term of params.terms.filter((item) => item.isActive)) {
    const normalizedCanonical = normalizeText(term.canonicalValue);
    add(normalizedCanonical, {
      targetType: "term",
      id: term.id,
      termType: term.termType,
      canonicalValue: term.canonicalValue,
      displayName: term.displayName,
      relationType: "exact_alias",
      score: 0.95,
      sourceKind: "canonical_value",
    });
    const normalizedDisplay = normalizeText(term.displayName);
    if (normalizedDisplay && normalizedDisplay !== normalizedCanonical) {
      add(normalizedDisplay, {
        targetType: "term",
        id: term.id,
        termType: term.termType,
        canonicalValue: term.canonicalValue,
        displayName: term.displayName,
        relationType: "exact_alias",
        score: 0.9,
        sourceKind: "display_name",
      });
    }
  }

  for (const alias of params.aliases.filter((item) => item.isActive)) {
    add(alias.normalizedAlias, {
      targetType: "alias",
      id: alias.id,
      termType: alias.termType,
      displayName: alias.aliasValue,
      relationType: "exact_alias",
      score: Number(alias.confidence ?? 0.9),
      evidence: { source: alias.source, termId: alias.termId },
      sourceKind: "value_alias",
    });
  }

  return byNormalized;
}

function crossTermTargets(params: {
  normalized: string;
  currentTermType: string;
  valueIndex: Map<string, Array<ConceptMatchTarget & { sourceKind: string }>>;
  currentId?: string;
}) {
  return (params.valueIndex.get(params.normalized) ?? []).filter(
    (target) =>
      target.termType &&
      target.termType !== params.currentTermType &&
      target.id !== params.currentId,
  );
}

function issueFinding(params: {
  candidateType: DictionaryAuditEntryType;
  candidateId: string;
  normalized: string;
  termType?: string | null;
  issues: ConceptIssue[];
  evidence: Record<string, unknown>;
  matchedTargets?: ConceptMatchTarget[];
}): DictionaryAuditFinding | null {
  if (params.issues.length === 0) return null;
  const topIssue = params.issues[0];
  const riskLevel = highestRisk(topIssue.riskLevel, params.issues);
  const score = clampScore(Math.max(...params.issues.map((issue) => issue.confidence)));
  return {
    candidateType: params.candidateType,
    candidateId: params.candidateId,
    relationType: topIssue.relationType,
    recommendedAction: topIssue.recommendedAction,
    route: routeFor(topIssue.relationType),
    score,
    riskLevel,
    reason: topIssue.reason,
    patternKey: patternKeyFor({
      candidateType: params.candidateType,
      relationType: topIssue.relationType,
      normalized: params.normalized,
      termType: params.termType,
      detector: topIssue.detector,
    }),
    issues: params.issues,
    matchedTargets: params.matchedTargets ?? [],
    evidence: params.evidence,
  };
}

function crossTermFinding(params: {
  candidateType: DictionaryAuditEntryType;
  candidateId: string;
  normalized: string;
  termType: string;
  rawValue: string;
  targets: ConceptMatchTarget[];
  evidence: Record<string, unknown>;
}): DictionaryAuditFinding | null {
  if (params.targets.length === 0) return null;
  const issue: ConceptIssue = {
    detector: "DictionaryCrossTermValueAudit",
    relationType: "different_concept",
    recommendedAction: "send_to_review",
    confidence: 0.83,
    riskLevel: "high",
    reason: "正式字典值/alias 同时命中其它 termType，可能已经把跨字段概念写入字典",
    evidence: {
      currentTermType: params.termType,
      rawValue: params.rawValue,
      matchedTermTypes: [...new Set(params.targets.map((target) => target.termType))],
    },
    blocksAutoApply: true,
  };
  return issueFinding({
    candidateType: params.candidateType,
    candidateId: params.candidateId,
    normalized: params.normalized,
    termType: params.termType,
    issues: [issue],
    matchedTargets: params.targets,
    evidence: params.evidence,
  });
}

function missingMetadataFinding(params: {
  candidateType: DictionaryAuditEntryType;
  candidateId: string;
  normalized: string;
  termType?: string | null;
  entry: Record<string, unknown>;
  evidence: Record<string, unknown>;
}): DictionaryAuditFinding | null {
  const missing = ["scope", "conceptRole", "riskLevel"].filter(
    (field) => !String(params.entry[field] ?? "").trim(),
  );
  if (params.candidateType === "dictionary_term_type") {
    if (!String(params.entry.valueKind ?? "").trim()) {
      missing.push("valueKind");
    }
  }
  if (missing.length === 0) return null;
  const issue: ConceptIssue = {
    detector: "DictionaryMetadataAudit",
    relationType: "different_concept",
    recommendedAction: "send_to_review",
    confidence: 0.72,
    riskLevel: "medium",
    reason: "正式字典缺少 resolver 判断所需 metadata",
    evidence: { missing },
    blocksAutoApply: true,
  };
  return issueFinding({
    candidateType: params.candidateType,
    candidateId: params.candidateId,
    normalized: params.normalized,
    termType: params.termType,
    issues: [issue],
    evidence: params.evidence,
  });
}

async function saveFindings(params: {
  runId: string;
  dictionaryVersion: number;
  findings: DictionaryAuditFinding[];
}) {
  const resolutionRepo = PgDataSource.getRepository(ConceptResolution);
  const patternRepo = PgDataSource.getRepository(ConceptPatternReview);

  for (const finding of params.findings) {
    const entity = resolutionRepo.create({
      runId: params.runId,
      candidateType: finding.candidateType as ConceptCandidateType,
      candidateId: finding.candidateId,
      dictionaryVersion: String(params.dictionaryVersion),
      resolverVersion: `${CONCEPT_RESOLVER_VERSION}:dictionary_audit`,
      relationType: finding.relationType,
      recommendedAction: finding.recommendedAction,
      route: finding.route,
      score: String(finding.score),
      riskLevel: finding.riskLevel,
      patternKey: finding.patternKey,
      reason: finding.reason,
      evidenceJsonb: finding.evidence,
      matchedTargetsJsonb: finding.matchedTargets,
      issuesJsonb: finding.issues,
      llmSuggestionId: null,
      appliedOperationJsonb: null,
      appliedAt: null,
    });
    await resolutionRepo.upsert(entity as any, [
      "candidateType",
      "candidateId",
      "dictionaryVersion",
      "resolverVersion",
    ]);
    await PgDataSource.query(
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
        finding.patternKey,
        finding.candidateType,
        finding.relationType,
        finding.recommendedAction,
      ],
    );
  }
}

async function main() {
  const startedAt = Date.now();
  PgDataSource.setOptions({ logging: false, maxQueryExecutionTime: 0 });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  const runRepo = PgDataSource.getRepository(ConceptResolverRun);
  const dictionaryVersion = await getDictionaryVersion();
  const run = await runRepo.save(
    runRepo.create({
      scope: "dictionary_entry_audit",
      mode: "dry_run",
      status: "running",
      dictionaryVersionAtStart: String(dictionaryVersion),
      resolverVersion: `${CONCEPT_RESOLVER_VERSION}:dictionary_audit`,
      stats: null,
      error: null,
      finishedAt: null,
    }),
  );

  try {
    const [termTypes, terms, aliases, termTypeAliases] = await Promise.all([
      PgDataSource.getRepository(DictionaryTermType).find(),
      PgDataSource.getRepository(DictionaryTerm).find(),
      PgDataSource.getRepository(DictionaryAlias).find(),
      PgDataSource.getRepository(DictionaryTermTypeAlias).find(),
    ]);
    const termTypeByKey = new Map(termTypes.map((item) => [item.termType, item]));
    const valueIndex = buildValueIndex({ terms, aliases });
    const issueDetector = new ConceptIssueDetectorService();
    const findings: DictionaryAuditFinding[] = [];

    for (const termType of termTypes.filter((item) => item.isActive)) {
      const normalized = normalizeText(termType.displayName || termType.termType);
      const knownValueAliasTermTypes = [
        ...new Set((valueIndex.get(normalized) ?? []).map((target) => target.termType).filter(Boolean)),
      ] as string[];
      const issues = issueDetector.detect({
        candidateType: "term_type",
        rawFieldName: termType.displayName || termType.termType,
        normalizedFieldName: normalized,
        rawValue: termType.description,
        sourceProductType: termType.applicableProductTypes?.[0] ?? "common",
        valueKind: termType.valueKind,
        scope: termType.scope,
        conceptRole: termType.conceptRole,
        knownValueAliasTermTypes,
      } as any);
      const evidence = {
        auditEntryType: "dictionary_term_type",
        entry: termType,
        ...isJuneTouched(termType),
      };
      const metadataFinding = missingMetadataFinding({
        candidateType: "dictionary_term_type",
        candidateId: termType.id,
        normalized,
        termType: termType.termType,
        entry: termType as any,
        evidence,
      });
      if (metadataFinding) findings.push(metadataFinding);
      const finding = issueFinding({
        candidateType: "dictionary_term_type",
        candidateId: termType.id,
        normalized,
        termType: termType.termType,
        issues,
        evidence,
      });
      if (finding) findings.push(finding);
    }

    for (const term of terms.filter((item) => item.isActive)) {
      const parent = termTypeByKey.get(term.termType);
      const rawValue = term.displayName || term.canonicalValue;
      const normalized = normalizeText(rawValue);
      const knownValueAliasTermTypes = [
        ...new Set((valueIndex.get(normalized) ?? []).map((target) => target.termType).filter(Boolean)),
      ] as string[];
      const issues = issueDetector.detect({
        candidateType: "value",
        termType: term.termType,
        rawFieldName: term.termType,
        rawValue,
        normalizedRawValue: normalized,
        sourceProductType: parent?.applicableProductTypes?.[0] ?? "common",
        valueKind: parent?.valueKind,
        scope: term.scope,
        conceptRole: term.conceptRole,
        knownValueAliasTermTypes,
      } as any);
      const evidence = {
        auditEntryType: "dictionary_term",
        parentTermType: parent ?? null,
        entry: term,
        ...isJuneTouched(term),
      };
      const metadataFinding = missingMetadataFinding({
        candidateType: "dictionary_term",
        candidateId: term.id,
        normalized,
        termType: term.termType,
        entry: term as any,
        evidence,
      });
      if (metadataFinding) findings.push(metadataFinding);
      const finding = issueFinding({
        candidateType: "dictionary_term",
        candidateId: term.id,
        normalized,
        termType: term.termType,
        issues,
        evidence,
      });
      if (finding) findings.push(finding);
      const targets = crossTermTargets({
        normalized,
        currentTermType: term.termType,
        valueIndex,
        currentId: term.id,
      });
      const crossFinding = crossTermFinding({
        candidateType: "dictionary_term",
        candidateId: term.id,
        normalized,
        termType: term.termType,
        rawValue,
        targets,
        evidence,
      });
      if (crossFinding) findings.push(crossFinding);
    }

    for (const alias of aliases.filter((item) => item.isActive)) {
      const parent = termTypeByKey.get(alias.termType);
      const issues = issueDetector.detect({
        candidateType: "value",
        termType: alias.termType,
        rawFieldName: alias.termType,
        rawValue: alias.aliasValue,
        normalizedRawValue: alias.normalizedAlias,
        sourceProductType: parent?.applicableProductTypes?.[0] ?? "common",
        valueKind: parent?.valueKind,
        scope: "value",
        knownValueAliasTermTypes: [
          ...new Set((valueIndex.get(alias.normalizedAlias) ?? []).map((target) => target.termType).filter(Boolean)),
        ] as string[],
      } as any);
      const evidence = {
        auditEntryType: "dictionary_alias",
        parentTermType: parent ?? null,
        entry: alias,
        ...isJuneTouched(alias),
      };
      const finding = issueFinding({
        candidateType: "dictionary_alias",
        candidateId: alias.id,
        normalized: alias.normalizedAlias,
        termType: alias.termType,
        issues,
        evidence,
      });
      if (finding) findings.push(finding);
      const targets = crossTermTargets({
        normalized: alias.normalizedAlias,
        currentTermType: alias.termType,
        valueIndex,
        currentId: alias.id,
      });
      const crossFinding = crossTermFinding({
        candidateType: "dictionary_alias",
        candidateId: alias.id,
        normalized: alias.normalizedAlias,
        termType: alias.termType,
        rawValue: alias.aliasValue,
        targets,
        evidence,
      });
      if (crossFinding) findings.push(crossFinding);
    }

    for (const alias of termTypeAliases.filter((item) => item.isActive)) {
      const parent = termTypeByKey.get(alias.termType);
      const knownValueAliasTermTypes = [
        ...new Set((valueIndex.get(alias.normalizedAliasName) ?? []).map((target) => target.termType).filter(Boolean)),
      ] as string[];
      const issues = issueDetector.detect({
        candidateType: "term_type",
        rawFieldName: alias.aliasName,
        normalizedFieldName: alias.normalizedAliasName,
        rawValue: alias.description,
        sourceProductType: parent?.applicableProductTypes?.[0] ?? "common",
        valueKind: parent?.valueKind,
        scope: parent?.scope,
        knownValueAliasTermTypes,
      } as any);
      const evidence = {
        auditEntryType: "dictionary_term_type_alias",
        parentTermType: parent ?? null,
        entry: alias,
        ...isJuneTouched(alias),
      };
      const finding = issueFinding({
        candidateType: "dictionary_term_type_alias",
        candidateId: alias.id,
        normalized: alias.normalizedAliasName,
        termType: alias.termType,
        issues,
        evidence,
      });
      if (finding) findings.push(finding);
    }

    await saveFindings({
      runId: run.id,
      dictionaryVersion,
      findings,
    });

    const relationSummary = Object.values(
      findings.reduce<Record<string, any>>((acc, finding) => {
        const key = `${finding.candidateType}:${finding.relationType}:${finding.recommendedAction}:${finding.route}`;
        acc[key] ??= {
          candidateType: finding.candidateType,
          relationType: finding.relationType,
          recommendedAction: finding.recommendedAction,
          route: finding.route,
          count: 0,
          juneCreatedCount: 0,
          juneUpdatedCount: 0,
        };
        acc[key].count += 1;
        if ((finding.evidence as any).juneCreated) acc[key].juneCreatedCount += 1;
        if ((finding.evidence as any).juneUpdated) acc[key].juneUpdatedCount += 1;
        return acc;
      }, {}),
    ).sort((left, right) => right.count - left.count);

    const samples = findings
      .filter((finding) => finding.riskLevel === "high" || (finding.evidence as any).juneCreated)
      .slice(0, 100)
      .map((finding) => ({
        candidateType: finding.candidateType,
        candidateId: finding.candidateId,
        relationType: finding.relationType,
        recommendedAction: finding.recommendedAction,
        route: finding.route,
        riskLevel: finding.riskLevel,
        score: finding.score,
        reason: finding.reason,
        juneCreated: (finding.evidence as any).juneCreated,
        juneUpdated: (finding.evidence as any).juneUpdated,
        entry: compactEntryForReport((finding.evidence as any).entry),
        matchedTargets: finding.matchedTargets.slice(0, 5),
      }));

    run.status = "completed";
    run.finishedAt = new Date();
    run.stats = {
      elapsedMs: Date.now() - startedAt,
      dictionaryVersion,
      totals: {
        termTypes: termTypes.length,
        terms: terms.length,
        aliases: aliases.length,
        termTypeAliases: termTypeAliases.length,
      },
      findingCount: findings.length,
      relationSummary,
      samples,
    };
    await runRepo.save(run);

    console.log(
      JSON.stringify(
        {
          mode: "dictionary_entry_audit",
          runId: run.id,
          elapsedMs: Date.now() - startedAt,
          dictionaryVersion,
          findingCount: findings.length,
          relationSummary,
          samples,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    run.finishedAt = new Date();
    await runRepo.save(run);
    throw error;
  } finally {
    await PgDataSource.destroy();
  }
}

void main();
