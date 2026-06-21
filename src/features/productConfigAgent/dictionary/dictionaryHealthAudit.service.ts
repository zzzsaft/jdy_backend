import type { DataSource } from "typeorm";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryHealthReport,
  type DictionaryHealthTargetKind,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeCandidate,
} from "./entity/index.js";
import { normalizeNumberUnit } from "./numberUnit.js";
import { extractMultiValueTokens } from "./multiValue.js";
import {
  productConfigAgentSourceSchema,
  qualifiedTable,
} from "./dictionaryHealth.schemas.js";
import { QUALIFIER_CONCEPT_PATTERN } from "./qualifierConcept.js";
import { readDictionaryVersionValue } from "./dictionaryVersion.service.js";

export type DictionaryHealthAuditTargetKind = DictionaryHealthTargetKind | "all";

export type DictionaryHealthAuditParams = {
  targetKind?: DictionaryHealthAuditTargetKind;
  targetIds?: string[];
  limit?: number;
  dryRun?: boolean;
  auditRunId?: string;
};

export type DictionaryHealthDimensionKey =
  | "valueKindConsistency"
  | "unitConsistency"
  | "enumPurity"
  | "aliasPurity"
  | "scopeConsistency"
  | "coOccurrenceConflict"
  | "qualifierRisk"
  | "compositeValueRate"
  | "candidateMappingPressure"
  | "productTypeSpread";

type DimensionEvidence = {
  score: number;
  labels: string[];
  reasons: string[];
  samples?: unknown[];
};

export type DictionaryHealthReportInput = {
  targetKind: DictionaryHealthTargetKind;
  targetId: string;
  auditRunId: string | null;
  dictionaryVersion: string | null;
  riskScore: number;
  riskLabels: string[];
  trustSignals: Record<string, unknown>;
  evidenceJson: Record<string, unknown>;
  recommendedAction: string;
  affectedRecordsCount: number;
  lastAuditedAt: Date;
};

type ArchivedFieldObservation = {
  termType: string;
  canonicalValue: string | null;
  rawValue: string | null;
  sourceProductType: string | null;
  valueKind: string | null;
  numberUnit: unknown | null;
};

type CandidatePressure = {
  pendingCount: number;
  reviewedCount: number;
  rejectedCount: number;
  resolverHighRiskCount: number;
  sampleRawValues: string[];
  productTypes: string[];
};

type TermTypePressure = CandidatePressure & {
  sampleRawFields: string[];
};

type HealthSnapshot = {
  termTypes: DictionaryTermType[];
  terms: DictionaryTerm[];
  aliases: DictionaryAlias[];
  archivedFields: ArchivedFieldObservation[];
  valueCandidatePressure: Map<string, CandidatePressure>;
  termTypeCandidatePressure: Map<string, TermTypePressure>;
};

const DOCUMENT_SCOPE_PATTERN = /(合同|订单|客户|国家|日期|交期|交货|地址|联系人|电话)/u;
const GENERIC_ALIAS_VALUES = new Set([
  "有",
  "无",
  "是",
  "否",
  "yes",
  "no",
  "none",
  "其他",
  "other",
]);
const COMPOSITE_SLASH_UNIT_PATTERN =
  /\b(?:kg\/h|ml\/min|m\/min|l\/min|n\/m|g\/10min)\b/gi;

function clampDimensionScore(value: number): number {
  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
}

function riskScoreTotal(dimensions: Record<DictionaryHealthDimensionKey, DimensionEvidence>) {
  const total = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

function uniqueStrings(values: Array<unknown>, limit = 20): string[] {
  return [
    ...new Set(
      values
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function textLooksNumeric(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s|$)/.test(value.trim());
}

function textLooksBoolean(value: string): boolean {
  return /^(是|否|有|无|true|false|yes|no)$/i.test(value.trim());
}

function textLooksDate(value: string): boolean {
  return /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(value.trim());
}

function compositeRate(values: Array<string | null | undefined>): number {
  const nonEmpty = values.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 0;
  const compositeCount = nonEmpty.filter(
    (value) => hasCompositeValue(value),
  ).length;
  return compositeCount / nonEmpty.length;
}

function hasCompositeValue(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:kg\/h|ml\/min|m\/min|l\/min|n\/m|g\/10min)$/i.test(
      compact,
    )
  ) {
    return false;
  }
  const auditValue = value.replace(COMPOSITE_SLASH_UNIT_PATTERN, (unit) =>
    unit.replace("/", "_"),
  );
  return extractMultiValueTokens(auditValue).length > 1;
}

function recommendedActionFor(labels: string[], riskScore: number): string {
  if (labels.includes("alias_purity")) return "clean_alias_collision";
  if (labels.includes("value_kind_consistency")) return "fix_value_kind";
  if (labels.includes("composite_value_rate")) return "split_composite_value";
  if (labels.includes("scope_consistency")) return "move_scope";
  if (labels.includes("product_type_spread")) return "limit_product_types";
  if (riskScore >= 40) return "review_dictionary_target";
  return "keep_observing";
}

function emptyDimension(): DimensionEvidence {
  return { score: 0, labels: [], reasons: [] };
}

function dimension(
  score: number,
  label: string,
  reason: string,
  samples?: unknown[],
): DimensionEvidence {
  const normalized = clampDimensionScore(score);
  return normalized <= 0
    ? emptyDimension()
    : {
        score: normalized,
        labels: [label],
        reasons: [reason],
        ...(samples && samples.length ? { samples: samples.slice(0, 10) } : {}),
      };
}

function aliasCollisionMap(aliases: DictionaryAlias[]) {
  const byAlias = new Map<string, DictionaryAlias[]>();
  for (const alias of aliases.filter((item) => item.isActive)) {
    const normalized = String(alias.normalizedAlias ?? "").trim();
    if (!normalized || GENERIC_ALIAS_VALUES.has(normalized)) continue;
    byAlias.set(normalized, [...(byAlias.get(normalized) ?? []), alias]);
  }
  return byAlias;
}

function groupBy<T>(
  values: T[],
  keyFor: (value: T) => string | null | undefined,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

export class DictionaryHealthAuditService {
  constructor(private readonly dataSource: DataSource) {}

  async runAudit(params?: DictionaryHealthAuditParams) {
    const snapshot = await this.loadSnapshot();
    const dictionaryVersion = await this.getDictionaryVersion();
    const auditRunId =
      params?.auditRunId ??
      `dictionary-health-audit:${new Date().toISOString()}`;
    const reports = this.buildReports(snapshot, {
      ...params,
      auditRunId,
      dictionaryVersion,
    });
    if (params?.dryRun !== true) {
      await this.saveReports(reports);
    }
    return {
      dryRun: params?.dryRun === true,
      auditRunId,
      dictionaryVersion,
      generatedCount: reports.length,
      savedCount: params?.dryRun === true ? 0 : reports.length,
      riskSummary: {
        highRiskCount: reports.filter((item) => item.riskScore >= 70).length,
        suspectCount: reports.filter((item) => item.riskScore >= 40).length,
      },
      sampleReports: reports
        .sort((left, right) => right.riskScore - left.riskScore)
        .slice(0, 20),
    };
  }

  async listReports(params?: {
    targetKind?: string;
    minRiskScore?: number;
    label?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(500, Math.max(1, Number(params?.limit ?? 100) || 100));
    const offset = Math.max(0, Number(params?.offset ?? 0) || 0);
    const query = this.dataSource
      .getRepository(DictionaryHealthReport)
      .createQueryBuilder("report")
      .orderBy("report.riskScore", "DESC")
      .addOrderBy("report.lastAuditedAt", "DESC")
      .limit(limit)
      .offset(offset);

    if (params?.targetKind) {
      query.andWhere("report.targetKind = :targetKind", {
        targetKind: params.targetKind,
      });
    }
    if (params?.minRiskScore !== undefined) {
      query.andWhere("report.riskScore >= :minRiskScore", {
        minRiskScore: params.minRiskScore,
      });
    }
    if (params?.label) {
      query.andWhere("report.riskLabels @> :label::jsonb", {
        label: JSON.stringify([params.label]),
      });
    }
    return {
      reports: await query.getMany(),
      limit,
      offset,
    };
  }

  buildReports(
    snapshot: HealthSnapshot,
    params?: DictionaryHealthAuditParams & {
      dictionaryVersion?: string | null;
    },
  ): DictionaryHealthReportInput[] {
    const now = new Date();
    const targetIds = new Set((params?.targetIds ?? []).map(String));
    const includeTarget = (kind: DictionaryHealthTargetKind, id: string) => {
      if (params?.targetKind && params.targetKind !== "all" && params.targetKind !== kind) {
        return false;
      }
      return targetIds.size === 0 || targetIds.has(id);
    };
    const maxTargets = Math.max(1, Math.floor(params?.limit ?? 10000));
    const termsByTermType = groupBy(snapshot.terms, (term) => term.termType);
    const aliasesByTermType = groupBy(snapshot.aliases, (alias) => alias.termType);
    const aliasesByTermId = groupBy(snapshot.aliases, (alias) => alias.termId);
    const aliasCollisions = aliasCollisionMap(snapshot.aliases);
    const termTypeByKey = new Map(snapshot.termTypes.map((item) => [item.termType, item]));
    const archivedByTermType = new Map<string, ArchivedFieldObservation[]>();
    const archivedByTermId = new Map<string, ArchivedFieldObservation[]>();
    const activeTermByTypeValue = new Map(
      snapshot.terms.map((term) => [`${term.termType}:${term.canonicalValue}`, term]),
    );
    for (const field of snapshot.archivedFields) {
      archivedByTermType.set(field.termType, [
        ...(archivedByTermType.get(field.termType) ?? []),
        field,
      ]);
      const term = field.canonicalValue
        ? activeTermByTypeValue.get(`${field.termType}:${field.canonicalValue}`)
        : null;
      if (term) {
        archivedByTermId.set(term.id, [
          ...(archivedByTermId.get(term.id) ?? []),
          field,
        ]);
      }
    }

    const reports: DictionaryHealthReportInput[] = [];
    for (const termType of snapshot.termTypes) {
      if (!includeTarget("termType", termType.termType)) continue;
      reports.push(
        this.buildTermTypeReport({
          termType,
          terms: termsByTermType.get(termType.termType) ?? [],
          aliases: aliasesByTermType.get(termType.termType) ?? [],
          archivedFields: archivedByTermType.get(termType.termType) ?? [],
          candidatePressure:
            snapshot.termTypeCandidatePressure.get(termType.termType) ??
            snapshot.termTypeCandidatePressure.get(termType.displayName) ??
            null,
          aliasCollisions,
          now,
          auditRunId: params?.auditRunId ?? null,
          dictionaryVersion: params?.dictionaryVersion ?? null,
        }),
      );
      if (reports.length >= maxTargets) return reports;
    }

    for (const term of snapshot.terms) {
      if (!includeTarget("enumValue", term.id)) continue;
      reports.push(
        this.buildEnumValueReport({
          term,
          termType: termTypeByKey.get(term.termType) ?? null,
          aliases: aliasesByTermId.get(term.id) ?? [],
          archivedFields: archivedByTermId.get(term.id) ?? [],
          candidatePressure: snapshot.valueCandidatePressure.get(term.id) ?? null,
          aliasCollisions,
          now,
          auditRunId: params?.auditRunId ?? null,
          dictionaryVersion: params?.dictionaryVersion ?? null,
        }),
      );
      if (reports.length >= maxTargets) return reports;
    }
    return reports;
  }

  private buildTermTypeReport(params: {
    termType: DictionaryTermType;
    terms: DictionaryTerm[];
    aliases: DictionaryAlias[];
    archivedFields: ArchivedFieldObservation[];
    candidatePressure: TermTypePressure | null;
    aliasCollisions: Map<string, DictionaryAlias[]>;
    now: Date;
    auditRunId: string | null;
    dictionaryVersion: string | null;
  }): DictionaryHealthReportInput {
    const dimensions = this.termTypeDimensions(params);
    return this.reportFromDimensions({
      targetKind: "termType",
      targetId: params.termType.termType,
      active: params.termType.isActive,
      dimensions,
      affectedRecordsCount: params.archivedFields.length,
      trustSignals: {
        active: params.termType.isActive,
        valueKind: params.termType.valueKind,
        scope: params.termType.scope,
        applicableProductTypes: params.termType.applicableProductTypes ?? [],
        evidenceVolume: params.archivedFields.length,
        candidatePressure: params.candidatePressure ?? {},
      },
      now: params.now,
      auditRunId: params.auditRunId,
      dictionaryVersion: params.dictionaryVersion,
    });
  }

  private buildEnumValueReport(params: {
    term: DictionaryTerm;
    termType: DictionaryTermType | null;
    aliases: DictionaryAlias[];
    archivedFields: ArchivedFieldObservation[];
    candidatePressure: CandidatePressure | null;
    aliasCollisions: Map<string, DictionaryAlias[]>;
    now: Date;
    auditRunId: string | null;
    dictionaryVersion: string | null;
  }): DictionaryHealthReportInput {
    const dimensions = this.enumValueDimensions(params);
    return this.reportFromDimensions({
      targetKind: "enumValue",
      targetId: params.term.id,
      active: params.term.isActive,
      dimensions,
      affectedRecordsCount: params.archivedFields.length,
      trustSignals: {
        active: params.term.isActive,
        termType: params.term.termType,
        valueKind: params.termType?.valueKind ?? null,
        scope: params.term.scope,
        evidenceVolume: params.archivedFields.length,
        candidatePressure: params.candidatePressure ?? {},
        aliasCount: params.aliases.length,
      },
      now: params.now,
      auditRunId: params.auditRunId,
      dictionaryVersion: params.dictionaryVersion,
    });
  }

  private reportFromDimensions(params: {
    targetKind: DictionaryHealthTargetKind;
    targetId: string;
    active: boolean;
    dimensions: Record<DictionaryHealthDimensionKey, DimensionEvidence>;
    affectedRecordsCount: number;
    trustSignals: Record<string, unknown>;
    now: Date;
    auditRunId: string | null;
    dictionaryVersion: string | null;
  }): DictionaryHealthReportInput {
    const riskScore = riskScoreTotal(params.dimensions);
    const riskLabels = uniqueStrings(
      Object.values(params.dimensions).flatMap((item) => item.labels),
      50,
    );
    const recommendedAction = recommendedActionFor(riskLabels, riskScore);
    return {
      targetKind: params.targetKind,
      targetId: params.targetId,
      auditRunId: params.auditRunId,
      dictionaryVersion: params.dictionaryVersion,
      riskScore,
      riskLabels,
      trustSignals: {
        ...params.trustSignals,
        inactiveTarget: params.active !== true,
        riskScore,
        riskLabels,
      },
      evidenceJson: {
        dimensions: params.dimensions,
      },
      recommendedAction:
        params.active === false && params.affectedRecordsCount > 0
          ? "review_inactive_target_usage"
          : recommendedAction,
      affectedRecordsCount: params.affectedRecordsCount,
      lastAuditedAt: params.now,
    };
  }

  private termTypeDimensions(params: {
    termType: DictionaryTermType;
    terms: DictionaryTerm[];
    aliases: DictionaryAlias[];
    archivedFields: ArchivedFieldObservation[];
    candidatePressure: TermTypePressure | null;
    aliasCollisions: Map<string, DictionaryAlias[]>;
  }): Record<DictionaryHealthDimensionKey, DimensionEvidence> {
    const observedKinds = uniqueStrings(params.archivedFields.map((item) => item.valueKind));
    const rawValues = params.archivedFields.map((item) => item.rawValue);
    const productTypes = uniqueStrings(
      params.archivedFields.map((item) => item.sourceProductType),
      100,
    );
    const unexpectedProductTypes = productTypes.filter(
      (item) =>
        !["unknown", "common"].includes(item) &&
        Array.isArray(params.termType.applicableProductTypes) &&
        !params.termType.applicableProductTypes.includes("common") &&
        !params.termType.applicableProductTypes.includes(item),
    );
    const candidatePressure = params.candidatePressure;
    const aliasConflicts = params.aliases.filter((alias) => {
      const conflicts = params.aliasCollisions.get(alias.normalizedAlias) ?? [];
      return conflicts.some((item) => item.termType !== alias.termType);
    });

    return {
      valueKindConsistency: dimension(
        observedKinds.length > 1 || (observedKinds[0] && observedKinds[0] !== params.termType.valueKind)
          ? 7
          : 0,
        "value_kind_consistency",
        "Observed value kinds do not consistently match the term type declaration.",
        observedKinds,
      ),
      unitConsistency: this.unitDimension(rawValues, params.termType.valueKind),
      enumPurity: this.enumPurityDimension(rawValues, params.termType.valueKind),
      aliasPurity: dimension(
        aliasConflicts.length > 0 ? Math.min(10, aliasConflicts.length * 3) : 0,
        "alias_purity",
        "One or more aliases collide with aliases under other term types.",
        aliasConflicts.map((item) => ({
          aliasValue: item.aliasValue,
          normalizedAlias: item.normalizedAlias,
        })),
      ),
      scopeConsistency: dimension(
        params.termType.scope !== "document" &&
          DOCUMENT_SCOPE_PATTERN.test(`${params.termType.displayName} ${params.termType.termType}`)
          ? 8
          : 0,
        "scope_consistency",
        "Term type name looks document-scoped but is not marked as document scope.",
      ),
      coOccurrenceConflict: dimension(
        (candidatePressure?.resolverHighRiskCount ?? 0) > 0 ? 6 : 0,
        "co_occurrence_conflict",
        "Resolver high-risk evidence exists for this term type.",
      ),
      qualifierRisk: dimension(
        QUALIFIER_CONCEPT_PATTERN.test(`${params.termType.displayName} ${params.termType.termType}`)
          ? 5
          : 0,
        "qualifier_risk",
        "Term type appears to include qualifier text.",
      ),
      compositeValueRate: dimension(
        compositeRate(rawValues) * 10,
        "composite_value_rate",
        "Observed raw values frequently contain multiple values.",
        rawValues.filter((item) => item && hasCompositeValue(item)).slice(0, 10),
      ),
      candidateMappingPressure: dimension(
        Math.min(10, (candidatePressure?.pendingCount ?? 0) * 2),
        "candidate_mapping_pressure",
        "Pending term type candidates point at this target.",
        candidatePressure?.sampleRawFields,
      ),
      productTypeSpread: dimension(
        unexpectedProductTypes.length > 0 ? Math.min(10, unexpectedProductTypes.length * 2) : 0,
        "product_type_spread",
        "Usage appears under product types outside applicableProductTypes.",
        unexpectedProductTypes,
      ),
    };
  }

  private enumValueDimensions(params: {
    term: DictionaryTerm;
    termType: DictionaryTermType | null;
    aliases: DictionaryAlias[];
    archivedFields: ArchivedFieldObservation[];
    candidatePressure: CandidatePressure | null;
    aliasCollisions: Map<string, DictionaryAlias[]>;
  }): Record<DictionaryHealthDimensionKey, DimensionEvidence> {
    const valueKind = params.termType?.valueKind ?? "enum";
    const rawValues = [
      params.term.canonicalValue,
      params.term.displayName,
      ...params.aliases.map((item) => item.aliasValue),
      ...params.archivedFields.map((item) => item.rawValue),
    ];
    const aliasConflicts = params.aliases.filter((alias) => {
      const conflicts = params.aliasCollisions.get(alias.normalizedAlias) ?? [];
      return conflicts.some((item) => item.termType !== alias.termType);
    });
    const candidatePressure = params.candidatePressure;
    const productTypes = uniqueStrings(
      params.archivedFields.map((item) => item.sourceProductType),
      100,
    );
    const applicable = params.termType?.applicableProductTypes ?? [];
    const unexpectedProductTypes = productTypes.filter(
      (item) =>
        !["unknown", "common"].includes(item) &&
        Array.isArray(applicable) &&
        !applicable.includes("common") &&
        !applicable.includes(item),
    );

    return {
      valueKindConsistency: dimension(
        (valueKind === "enum" || valueKind === "enums") &&
          rawValues.some((item) => {
            const value = String(item ?? "").trim();
            return textLooksNumeric(value) || textLooksDate(value);
          })
          ? 6
          : 0,
        "value_kind_consistency",
        "Enum value or alias looks numeric/date-like.",
        rawValues,
      ),
      unitConsistency: this.unitDimension(rawValues, valueKind),
      enumPurity: this.enumPurityDimension(rawValues, valueKind),
      aliasPurity: dimension(
        aliasConflicts.length > 0 ? Math.min(10, aliasConflicts.length * 3) : 0,
        "alias_purity",
        "One or more aliases collide with aliases under other term types.",
        aliasConflicts.map((item) => ({
          aliasValue: item.aliasValue,
          normalizedAlias: item.normalizedAlias,
        })),
      ),
      scopeConsistency: dimension(
        params.term.scope !== "document" &&
          DOCUMENT_SCOPE_PATTERN.test(`${params.term.displayName ?? ""} ${params.term.canonicalValue}`)
          ? 8
          : 0,
        "scope_consistency",
        "Enum value looks document-scoped but is not marked as document scope.",
      ),
      coOccurrenceConflict: dimension(
        (candidatePressure?.resolverHighRiskCount ?? 0) > 0 ? 6 : 0,
        "co_occurrence_conflict",
        "Resolver high-risk evidence exists for this enum value.",
      ),
      qualifierRisk: dimension(
        QUALIFIER_CONCEPT_PATTERN.test(`${params.term.displayName ?? ""} ${params.term.canonicalValue}`)
          ? 5
          : 0,
        "qualifier_risk",
        "Enum value appears to include qualifier text.",
      ),
      compositeValueRate: dimension(
        compositeRate(rawValues) * 10,
        "composite_value_rate",
        "Value or observed raw values frequently contain multiple values.",
        rawValues.filter((item) => item && hasCompositeValue(item)).slice(0, 10),
      ),
      candidateMappingPressure: dimension(
        Math.min(10, (candidatePressure?.pendingCount ?? 0) * 2),
        "candidate_mapping_pressure",
        "Pending value candidates point at this enum value.",
        candidatePressure?.sampleRawValues,
      ),
      productTypeSpread: dimension(
        unexpectedProductTypes.length > 0 ? Math.min(10, unexpectedProductTypes.length * 2) : 0,
        "product_type_spread",
        "Usage appears under product types outside applicableProductTypes.",
        unexpectedProductTypes,
      ),
    };
  }

  private unitDimension(
    rawValues: Array<string | null | undefined>,
    valueKind: string | null | undefined,
  ): DimensionEvidence {
    const parsed = rawValues
      .map((item) => normalizeNumberUnit(item))
      .filter((item) => item.numberKind !== "none");
    if (parsed.length === 0) return emptyDimension();
    const units = uniqueStrings(parsed.map((item) => item.unitCanonical ?? item.normalizedUnitRaw));
    const missingUnitCount = parsed.filter((item) => item.warnings.includes("unit_missing")).length;
    const score =
      valueKind === "number_unit"
        ? Math.min(10, Math.max(0, (units.length - 1) * 3 + missingUnitCount * 2))
        : Math.min(10, 5 + units.length);
    return dimension(
      score,
      "unit_consistency",
      valueKind === "number_unit"
        ? "Number-unit observations have inconsistent or missing units."
        : "Non number-unit target contains unit-like values.",
      parsed.slice(0, 10),
    );
  }

  private enumPurityDimension(
    rawValues: Array<string | null | undefined>,
    valueKind: string | null | undefined,
  ): DimensionEvidence {
    if (valueKind !== "enum" && valueKind !== "enums") return emptyDimension();
    const suspicious = rawValues
      .map((item) => String(item ?? "").trim())
      .filter(
        (value) =>
          value.length > 40 ||
          textLooksBoolean(value) ||
          DOCUMENT_SCOPE_PATTERN.test(value) ||
          (textLooksNumeric(value) && /\s/.test(value)),
      );
    return dimension(
      Math.min(10, suspicious.length * 2),
      "enum_purity",
      "Enum target contains values that look like booleans, long text, document info, or numeric prose.",
      suspicious,
    );
  }

  private async loadSnapshot(): Promise<HealthSnapshot> {
    const [termTypes, terms, aliases] = await Promise.all([
      this.dataSource.getRepository(DictionaryTermType).find(),
      this.dataSource.getRepository(DictionaryTerm).find(),
      this.dataSource.getRepository(DictionaryAlias).find(),
    ]);
    const [archivedFields, valueCandidatePressure, termTypeCandidatePressure] =
      await Promise.all([
        this.loadArchivedFields(),
        this.loadValueCandidatePressure(),
        this.loadTermTypeCandidatePressure(),
      ]);
    return {
      termTypes,
      terms,
      aliases,
      archivedFields,
      valueCandidatePressure,
      termTypeCandidatePressure,
    };
  }

  private async saveReports(reports: DictionaryHealthReportInput[]) {
    if (reports.length === 0) return;
    const repo = this.dataSource.getRepository(DictionaryHealthReport);
    await repo.upsert(
      reports.map((report) =>
        repo.create({
          targetKind: report.targetKind,
          targetId: report.targetId,
          auditRunId: report.auditRunId,
          dictionaryVersion: report.dictionaryVersion,
          riskScore: report.riskScore.toFixed(2),
          riskLabels: report.riskLabels,
          trustSignals: report.trustSignals,
          evidenceJson: report.evidenceJson,
          recommendedAction: report.recommendedAction,
          affectedRecordsCount: report.affectedRecordsCount,
          lastAuditedAt: report.lastAuditedAt,
        }),
      ) as any[],
      ["targetKind", "targetId"],
    );
  }

  private async getDictionaryVersion(): Promise<string | null> {
    return readDictionaryVersionValue(this.dataSource);
  }

  private async loadArchivedFields(): Promise<ArchivedFieldObservation[]> {
    const schema = productConfigAgentSourceSchema();
    const itemsTable = qualifiedTable(schema, "contract_archive_items");
    return this.dataSource.query(
      `
      SELECT
        field->'dictionary'->>'term_type' AS "termType",
        field->'dictionary'->>'canonical_value' AS "canonicalValue",
        field->>'raw_value' AS "rawValue",
        item.product_type_hint AS "sourceProductType",
        field->'dictionary'->>'value_kind' AS "valueKind",
        field->'dictionary'->'number_unit' AS "numberUnit"
      FROM ${itemsTable} item
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(item.fields_jsonb) = 'array' THEN item.fields_jsonb
          ELSE '[]'::jsonb
        END
      ) field
      WHERE field->'dictionary'->>'term_type' IS NOT NULL
      LIMIT 50000
      `,
    ) as Promise<ArchivedFieldObservation[]>;
  }

  private async loadValueCandidatePressure(): Promise<Map<string, CandidatePressure>> {
    const candidates = await this.dataSource.getRepository(DictionaryCandidate).find({
      take: 50000,
    });
    const result = new Map<string, CandidatePressure>();
    for (const candidate of candidates) {
      const key = String(candidate.proposedTermId ?? "");
      if (!key) continue;
      const pressure = result.get(key) ?? {
        pendingCount: 0,
        reviewedCount: 0,
        rejectedCount: 0,
        resolverHighRiskCount: 0,
        sampleRawValues: [],
        productTypes: [],
      };
      if (candidate.status === "pending") pressure.pendingCount += 1;
      else if (candidate.status === "rejected") pressure.rejectedCount += 1;
      else pressure.reviewedCount += 1;
      if (candidate.resolverRiskLevel === "high") pressure.resolverHighRiskCount += 1;
      pressure.sampleRawValues = uniqueStrings([...pressure.sampleRawValues, candidate.rawValue], 20);
      pressure.productTypes = uniqueStrings([...pressure.productTypes, candidate.sourceProductType], 20);
      result.set(key, pressure);
    }
    return result;
  }

  private async loadTermTypeCandidatePressure(): Promise<Map<string, TermTypePressure>> {
    const candidates = await this.dataSource
      .getRepository(DictionaryTermTypeCandidate)
      .find({ take: 50000 });
    const result = new Map<string, TermTypePressure>();
    for (const candidate of candidates) {
      const key = String(candidate.proposedTermType || candidate.normalizedFieldName || "");
      if (!key) continue;
      const pressure = result.get(key) ?? {
        pendingCount: 0,
        reviewedCount: 0,
        rejectedCount: 0,
        resolverHighRiskCount: 0,
        sampleRawValues: [],
        sampleRawFields: [],
        productTypes: [],
      };
      if (candidate.status === "pending") pressure.pendingCount += 1;
      else if (candidate.status === "rejected") pressure.rejectedCount += 1;
      else pressure.reviewedCount += 1;
      if (candidate.resolverRiskLevel === "high") pressure.resolverHighRiskCount += 1;
      pressure.sampleRawValues = uniqueStrings([...pressure.sampleRawValues, candidate.rawValue], 20);
      pressure.sampleRawFields = uniqueStrings([...pressure.sampleRawFields, candidate.rawFieldName], 20);
      pressure.productTypes = uniqueStrings([...pressure.productTypes, candidate.sourceProductType], 20);
      result.set(key, pressure);
    }
    return result;
  }
}
