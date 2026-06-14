import { DataSource, In, Repository } from "typeorm";
import {
  DictionaryTermType,
  DictionaryCandidate,
  DictionaryTermTypeCandidate,
  DictionaryTerm,
  DictionaryCandidateOccurrence,
} from "./entity/index.js";
import { SplitResolution } from "../normalization/entity/splitResolution.entity.js";
import { DictionaryCache } from "./dictionary.cache.js";
import { logger } from "../../../config/logger.js";
import {
  createTermTypeCandidate as createTermTypeCandidateRecord,
  createValueCandidate as createValueCandidateRecord,
} from "./dictionary.candidates.js";
import {
  approveTermTypeCandidateAsAlias as approveTermTypeCandidateAsAliasRecord,
  approveValueCandidateAsAlias as approveValueCandidateAsAliasRecord,
  createTermTypeFromCandidate as createTermTypeFromCandidateRecord,
  createValueFromCandidate as createValueFromCandidateRecord,
  rejectTermTypeCandidate as rejectTermTypeCandidateRecord,
  rejectValueCandidate as rejectValueCandidateRecord,
  reviewTermTypeCandidatesBatch as reviewTermTypeCandidatesBatchRecord,
  splitTermTypeCandidate as splitTermTypeCandidateRecord,
  splitValueCandidate as splitValueCandidateRecord,
} from "./dictionary.review.js";
import { normalizeMultiEnumValues, buildEnumsFieldResult, extractMultiValueTokens } from "./multiValue.js";
import type {
  CreateTermTypeCandidateParams,
  CreateValueCandidateParams,
  DictionaryValueKind,
  LlmDictionaryContext,
  NormalizedFieldResult,
  NormalizeFieldParams,
  TermTypeMatchResult,
  ValueMatchResult,
} from "./dictionary.types.js";
import {
  buildMatchedFieldResult,
  normalizeText,
  termTypeSpecificityScore,
  valueAliasKey,
} from "./dictionary.utils.js";
import {
  isProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataService,
  sourceForModelTermType,
} from "../masterData.service.js";

export type {
  CachedTermType,
  CachedValueAlias,
  CreateTermTypeCandidateParams,
  CreateValueCandidateParams,
  DictionaryValueKind,
  LlmDictionaryContext,
  NormalizedFieldResult,
  NormalizeFieldParams,
  TermTypeMatchResult,
  ValueMatchResult,
} from "./dictionary.types.js";

export class DictionaryService {
  private readonly cache: DictionaryCache;
  private readonly masterDataService: ProductConfigAgentMasterDataService;
  private readonly pendingTermTypeAliasUsage = new Map<string, number>();
  private readonly pendingValueAliasUsage = new Map<string, number>();

  constructor(private readonly dataSource: DataSource) {
    this.cache = new DictionaryCache(dataSource);
    this.masterDataService = new ProductConfigAgentMasterDataService(dataSource);
  }

  normalizeText(input: unknown): string {
    return normalizeText(input);
  }

  async ensureCacheFresh(): Promise<void> {
    await this.cache.ensureFresh();
  }

  async reloadCache(): Promise<void> {
    await this.cache.reload();
  }

  async bumpDictionaryVersion(): Promise<void> {
    const startedAt = Date.now();
    await this.cache.bumpVersion();
    logger.info(
      `[productConfigAgent:dictionary:bumpVersion] totalMs=${Date.now() - startedAt}`,
    );
  }

  async getLlmDictionaryContext(): Promise<LlmDictionaryContext> {
    return this.cache.getLlmDictionaryContext();
  }

  async getProductTypeOptions(): Promise<
    Array<{ canonicalValue: string; displayName: string }>
  > {
    const terms = await this.dataSource.getRepository(DictionaryTerm).find({
      where: { termType: "product_type", isActive: true },
      order: { displayName: "ASC" },
    });
    return terms.map((term) => ({
      canonicalValue: term.canonicalValue,
      displayName: term.displayName ?? term.canonicalValue,
    }));
  }

  async matchTermType(
    fieldName: string,
    context?: { itemProductTypeHint?: string },
  ): Promise<TermTypeMatchResult> {
    await this.ensureCacheFresh();

    const normalizedFieldName = this.normalizeText(fieldName);
    const termTypes = this.cache.termTypeAliasMap.get(normalizedFieldName) ?? [];
    if (termTypes.length > 0) {
      this.markTermTypeAliasSeen(
        this.cache.termTypeAliasIdMap.get(normalizedFieldName) ?? [],
      );
    }

    const itemProductTypeHint = normalizeProductTypeHintForMatch(
      context?.itemProductTypeHint,
    );
    const applicableTermTypes = termTypes.filter((termType) =>
      this.isTermTypeApplicableToProduct(termType, itemProductTypeHint),
    );
    const preferredTermTypes =
      termTypes.length > 0 && applicableTermTypes.length > 0
        ? applicableTermTypes
        : termTypes;
    const crossProductFallback =
      termTypes.length > 0 &&
      applicableTermTypes.length === 0 &&
      Boolean(itemProductTypeHint && itemProductTypeHint !== "unknown");

    return {
      matched: termTypes.length > 0,
      rawFieldName: fieldName,
      normalizedFieldName,
      termTypes: preferredTermTypes,
      crossProductTermTypes: crossProductFallback ? termTypes : undefined,
      matchMethod: termTypes.length > 0 ? "alias_exact" : "none",
      itemProductTypeHint,
      crossProductFallback,
    };
  }

  async matchValue(params: {
    termType: string;
    rawValue: string;
  }): Promise<ValueMatchResult> {
    await this.ensureCacheFresh();

    const normalizedValue = this.normalizeText(params.rawValue);
    const valueKind = this.getTermTypeValueKind(params.termType);

    if (valueKind !== "enum" && valueKind !== "enums") {
      return {
        matched: true,
        termType: params.termType,
        rawValue: params.rawValue,
        normalizedValue,
        valueKind,
        matchMethod: "term_type_only",
      };
    }

    const matchedAlias = this.cache.valueAliasMap.get(
      valueAliasKey(params.termType, normalizedValue),
    );

    if (!matchedAlias) {
      return {
        matched: false,
        termType: params.termType,
        rawValue: params.rawValue,
        normalizedValue,
        valueKind,
        matchMethod: "none",
      };
    }

    if (matchedAlias.aliasId) {
      this.markValueAliasSeen(matchedAlias.aliasId);
    }

    return {
      matched: true,
      termType: params.termType,
      rawValue: params.rawValue,
      normalizedValue,
      canonicalValue: matchedAlias.canonicalValue,
      displayName: matchedAlias.displayName,
      termId: matchedAlias.termId,
      aliasId: matchedAlias.aliasId,
      confidence: matchedAlias.confidence,
      riskLevel: matchedAlias.riskLevel,
      note: matchedAlias.note,
      valueKind,
      matchMethod: "alias_exact",
    };
  }

  async matchValueMulti(params: {
    termTypes: string[];
    rawValue: string;
  }): Promise<ValueMatchResult> {
    const matchedResults: ValueMatchResult[] = [];

    for (const termType of params.termTypes) {
      const result = await this.matchValue({
        termType,
        rawValue: params.rawValue,
      });
      if (result.matched) {
        matchedResults.push(result);
      }
    }

    if (matchedResults.length === 1) {
      return matchedResults[0];
    }

    if (matchedResults.length > 1) {
      return [...matchedResults].sort((left, right) => {
        const confidenceDiff = (right.confidence ?? 0) - (left.confidence ?? 0);
        if (confidenceDiff !== 0) {
          return confidenceDiff;
        }

        return (
          termTypeSpecificityScore(right.termType, params.rawValue) -
          termTypeSpecificityScore(left.termType, params.rawValue)
        );
      })[0];
    }

    return {
      matched: false,
      termType: params.termTypes[0] ?? "",
      rawValue: params.rawValue,
      normalizedValue: this.normalizeText(params.rawValue),
      matchMethod: "none",
    };
  }

  async createValueCandidate(
    params: CreateValueCandidateParams,
  ): Promise<DictionaryCandidate | null> {
    return createValueCandidateRecord(
      this.dataSource,
      params,
      this.normalizeText(params.rawValue),
    );
  }

  async createTermTypeCandidate(
    params: CreateTermTypeCandidateParams,
  ): Promise<DictionaryTermTypeCandidate | null> {
    return createTermTypeCandidateRecord(
      this.dataSource,
      params,
      this.normalizeText(params.rawFieldName),
    );
  }

  async recheckPendingCandidatesAfterDictionaryUpdate(params?: {
    limit?: number;
  }): Promise<{
    checkedTermTypeCandidateCount: number;
    resolvedTermTypeCandidateCount: number;
    checkedValueCandidateCount: number;
    resolvedValueCandidateCount: number;
    affectedDocumentIds: number[];
  }> {
    const startedAt = Date.now();
    await this.reloadCache();
    const reloadCacheMs = Date.now() - startedAt;
    const limit = Math.min(5000, Math.max(1, Number(params?.limit ?? 1000) || 1000));
    const termTypeCandidateRepo = this.dataSource.getRepository(
      DictionaryTermTypeCandidate,
    );
    const valueCandidateRepo = this.dataSource.getRepository(DictionaryCandidate);
    const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
    const [termTypeCandidates, valueCandidates] = await Promise.all([
      termTypeCandidateRepo.find({
        where: { status: "pending" },
        order: { createdAt: "ASC" },
        take: limit,
      }),
      valueCandidateRepo.find({
        where: { status: "pending" },
        order: { createdAt: "ASC" },
        take: limit,
      }),
    ]);
    const splitResolutionLookup = await this.buildCandidateReviewSplitResolutionLookup(
      valueCandidates,
      splitResolutionRepo,
    );

    let resolvedTermTypeCandidateCount = 0;
    const resolvedTermTypeCandidateIds: string[] = [];
    const affectedDocumentIds = new Set<number>();
    for (const candidate of termTypeCandidates) {
      const match = await this.matchTermType(candidate.rawFieldName, {
        itemProductTypeHint: candidate.sourceProductType,
      });
      if (!match.matched || match.crossProductFallback) {
        continue;
      }
      candidate.status = "auto_resolved";
      candidate.proposedTermType = match.termTypes[0] ?? candidate.proposedTermType;
      candidate.reason = `auto_resolved_by_dictionary_update:${match.termTypes.join(",")}`;
      candidate.reviewedBy = "system";
      candidate.reviewedAt = new Date();
      await this.saveTermTypeCandidateAutoResolved(termTypeCandidateRepo, candidate);
      resolvedTermTypeCandidateCount += 1;
      resolvedTermTypeCandidateIds.push(candidate.id);
      if (candidate.documentId) {
        affectedDocumentIds.add(Number(candidate.documentId));
      }
    }

    let resolvedValueCandidateCount = 0;
    const resolvedValueCandidateIds: string[] = [];
    for (const candidate of valueCandidates) {
      if (
        candidate.documentId &&
        candidate.extractionResultId &&
        candidate.itemIndex !== null
      ) {
        const splitResolution = splitResolutionLookup.get(
          this.splitResolutionLookupKey({
            documentId: candidate.documentId,
            extractionResultId: candidate.extractionResultId,
            itemIndex: candidate.itemIndex,
            rawValue: candidate.rawValue,
          }),
        );
        if (splitResolution) {
          candidate.status = "auto_resolved";
          candidate.proposedCanonicalValue = Array.isArray(splitResolution.splitFields)
            ? splitResolution.splitFields
                .map((item: any) => `${item.field_name}:${item.value}`)
                .join("|")
            : null;
          candidate.reason = `auto_resolved_by_split_resolution:${splitResolution.id}`;
          candidate.reviewedBy = "system";
          candidate.reviewedAt = new Date();
          await this.saveValueCandidateAutoResolved(valueCandidateRepo, candidate);
          resolvedValueCandidateCount += 1;
          resolvedValueCandidateIds.push(candidate.id);
          affectedDocumentIds.add(Number(candidate.documentId));
          continue;
        }
      }

      const valueKind = this.getTermTypeValueKind(candidate.termType);
      if (valueKind === "enums") {
        const cachedTermType = this.cache.termTypeMap.get(candidate.termType);
        if (cachedTermType) {
          const multiMatch = normalizeMultiEnumValues(candidate.rawValue, cachedTermType, {
            aliasMap: this.cache.valueAliasMap,
          });
          if (multiMatch.values.length > 0 && multiMatch.unmatchedTokens.length === 0) {
            candidate.status = "auto_resolved";
            candidate.proposedTermId =
              multiMatch.values[0]?.termId === undefined
                ? candidate.proposedTermId
                : String(multiMatch.values[0].termId);
            candidate.proposedCanonicalValue = multiMatch.values
              .map((value) => value.canonicalValue)
              .join("|");
            candidate.reason = `auto_resolved_by_dictionary_update:${candidate.proposedCanonicalValue}`;
            candidate.reviewedBy = "system";
            candidate.reviewedAt = new Date();
            await this.saveValueCandidateAutoResolved(valueCandidateRepo, candidate);
            resolvedValueCandidateCount += 1;
            resolvedValueCandidateIds.push(candidate.id);
            if (candidate.documentId) {
              affectedDocumentIds.add(Number(candidate.documentId));
            }
            continue;
          }
        }
      }

      const match = await this.matchValue({
        termType: candidate.termType,
        rawValue: candidate.rawValue,
      });
      if (!match.matched) {
        continue;
      }
      candidate.status = "auto_resolved";
      candidate.proposedTermId = match.termId ?? candidate.proposedTermId;
      candidate.proposedCanonicalValue =
        match.canonicalValue ?? candidate.proposedCanonicalValue;
      candidate.reason = match.termId
        ? `auto_resolved_by_dictionary_update:${match.termId}`
        : `auto_resolved_by_dictionary_update:${match.matchMethod}`;
      candidate.reviewedBy = "system";
      candidate.reviewedAt = new Date();
      await this.saveValueCandidateAutoResolved(valueCandidateRepo, candidate);
      resolvedValueCandidateCount += 1;
      resolvedValueCandidateIds.push(candidate.id);
      if (candidate.documentId) {
        affectedDocumentIds.add(Number(candidate.documentId));
      }
    }

    const occurrenceRepo = this.dataSource.getRepository(
      DictionaryCandidateOccurrence,
    );
    const occurrenceQueries = await Promise.all([
      resolvedTermTypeCandidateIds.length
        ? occurrenceRepo.find({
            where: {
              candidateType: "term_type",
              candidateId: In(resolvedTermTypeCandidateIds),
            },
          })
        : Promise.resolve([]),
      resolvedValueCandidateIds.length
        ? occurrenceRepo.find({
            where: {
              candidateType: "value",
              candidateId: In(resolvedValueCandidateIds),
            },
          })
        : Promise.resolve([]),
    ]);
    for (const occurrence of occurrenceQueries.flat()) {
      affectedDocumentIds.add(Number(occurrence.documentId));
    }

    await this.flushAliasUsageStats();
    const totalMs = Date.now() - startedAt;
    logger.info(
      `[productConfigAgent:dictionary:recheckPendingCandidatesAfterDictionaryUpdate] totalMs=${totalMs} reloadCacheMs=${reloadCacheMs} ` +
        `limit=${limit} checkedTermTypeCandidateCount=${termTypeCandidates.length} resolvedTermTypeCandidateCount=${resolvedTermTypeCandidateCount} ` +
        `checkedValueCandidateCount=${valueCandidates.length} resolvedValueCandidateCount=${resolvedValueCandidateCount} ` +
        `affectedDocumentCount=${affectedDocumentIds.size}`,
    );

    return {
      checkedTermTypeCandidateCount: termTypeCandidates.length,
      resolvedTermTypeCandidateCount,
      checkedValueCandidateCount: valueCandidates.length,
      resolvedValueCandidateCount,
      affectedDocumentIds: [...affectedDocumentIds],
    };
  }

  private async buildCandidateReviewSplitResolutionLookup(
    candidates: DictionaryCandidate[],
    splitResolutionRepo: Repository<SplitResolution>,
  ): Promise<Map<string, SplitResolution>> {
    const extractionResultIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.extractionResultId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (extractionResultIds.length === 0) {
      return new Map();
    }

    const rows = await splitResolutionRepo.find({
      where: {
        extractionResultId: In(extractionResultIds),
        source: "candidate_review",
      },
    });
    return new Map(
      rows.map((row) => [
        this.splitResolutionLookupKey({
          documentId: row.documentId,
          extractionResultId: row.extractionResultId,
          itemIndex: row.itemIndex,
          rawValue: row.rawValue,
        }),
        row,
      ]),
    );
  }

  private splitResolutionLookupKey(params: {
    documentId: string;
    extractionResultId: string;
    itemIndex: number;
    rawValue: string;
  }): string {
    return [
      params.documentId,
      params.extractionResultId,
      params.itemIndex,
      this.normalizeText(params.rawValue),
    ].join("|");
  }

  async normalizeField(
    params: NormalizeFieldParams,
  ): Promise<NormalizedFieldResult> {
    const itemProductTypeHint = normalizeProductTypeHintForMatch(
      params.itemProductTypeHint,
    );
    const termTypeMatch = await this.matchTermType(params.fieldName, {
      itemProductTypeHint,
    });
    const normalizedValue = this.normalizeText(params.rawValue);

    if (!termTypeMatch.matched || termTypeMatch.crossProductFallback) {
      const termTypeCandidate = await this.createTermTypeCandidate({
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: itemProductTypeHint,
        rawFieldName: params.fieldName,
        rawValue: params.rawValue,
        proposedTermType: termTypeMatch.crossProductTermTypes?.[0],
        reason: termTypeMatch.crossProductFallback
          ? "term_type_cross_product_fallback"
          : "term_type_no_match",
        evidence: params.evidence,
      });

      return {
        matched: false,
        fieldMatched: false,
        rawFieldName: params.fieldName,
        normalizedFieldName: termTypeMatch.normalizedFieldName,
        rawValue: params.rawValue,
        normalizedValue,
        candidateTermTypes: termTypeMatch.crossProductTermTypes,
        itemIndex: params.itemIndex,
        itemProductTypeHint,
        crossProductFallback: termTypeMatch.crossProductFallback,
        termTypeCandidate: termTypeCandidate ?? undefined,
        warnings: [
          {
            type: termTypeCandidate
              ? termTypeMatch.crossProductFallback
                ? "term_type_not_applicable_to_product"
                : "term_type_no_match"
              : "term_type_candidate_previously_rejected",
            message: termTypeCandidate
              ? termTypeMatch.crossProductFallback
                ? "字段名命中字典，但不适用于当前产品类型，请人工确认"
                : "字段名未命中字典，请人工确认"
              : "字段名候选此前已被拒绝，已跳过重新生成候选",
            rawValue: params.rawValue,
            termType: termTypeMatch.crossProductTermTypes?.[0],
          },
        ],
      };
    }

    if (termTypeMatch.termTypes.length === 1) {
      return this.normalizeSingleTermTypeField(params, termTypeMatch);
    }

    return this.normalizeMultiTermTypeField(params, termTypeMatch);
  }

  async approveValueCandidateAsAlias(params: {
    candidateId: string;
    termId: string;
    reviewedBy?: string;
    aliasNames?: string[];
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await approveValueCandidateAsAliasRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:approveValueCandidateAsAlias] candidateId=${params.candidateId} ` +
        `aliasCount=${params.aliasNames?.length ?? 0} writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async createValueFromCandidate(params: {
    candidateId: string;
    canonicalValue: string;
    displayName?: string;
    reviewedBy?: string;
    aliasNames?: string[];
    values?: Array<{
      canonicalValue: string;
      displayName?: string;
      aliasNames?: string[];
    }>;
    suppressCandidateRawAlias?: boolean;
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await createValueFromCandidateRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:createValueFromCandidate] candidateId=${params.candidateId} ` +
        `valueCount=${1 + (params.values?.length ?? 0)} aliasCount=${params.aliasNames?.length ?? 0} ` +
        `writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async splitValueCandidate(params: {
    candidateId: string;
    splits: Array<{
      termType: string;
      canonicalValue: string;
      rawValue?: string;
      displayName?: string;
      aliasNames?: string[];
    }>;
    reviewedBy?: string;
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await splitValueCandidateRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:splitValueCandidate] candidateId=${params.candidateId} splitCount=${params.splits.length} ` +
        `writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async splitTermTypeCandidate(params: {
    candidateId: string;
    splits: Array<{
      termType: string;
      displayName?: string;
      valueKind?: DictionaryValueKind;
      rawValue?: string;
      canonicalValue?: string;
      aliasNames?: string[];
      valueAliasNames?: string[];
      applicableProductTypes?: string[];
    }>;
    reviewedBy?: string;
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await splitTermTypeCandidateRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:splitTermTypeCandidate] candidateId=${params.candidateId} splitCount=${params.splits.length} ` +
        `writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async approveTermTypeCandidateAsAlias(params: {
    candidateId: string;
    termType: string;
    reviewedBy?: string;
    valueKind?: DictionaryValueKind;
    aliasNames?: string[];
    valueCanonicalValue?: string;
    valueDisplayName?: string;
    valueAliasNames?: string[];
    appendApplicableProductType?: boolean;
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await approveTermTypeCandidateAsAliasRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:approveTermTypeCandidateAsAlias] candidateId=${params.candidateId} termType=${params.termType} ` +
        `aliasCount=${params.aliasNames?.length ?? 0} valueAliasCount=${params.valueAliasNames?.length ?? 0} ` +
        `hasEnumValue=${Boolean(params.valueCanonicalValue)} writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async createTermTypeFromCandidate(params: {
    candidateId: string;
    termType: string;
    displayName: string;
    quoteDisplayName?: string;
    description?: string;
    category?: string;
    sortOrder?: number;
    valueKind: DictionaryValueKind;
    reviewedBy?: string;
    aliasNames?: string[];
    valueCanonicalValue?: string;
    valueDisplayName?: string;
    valueAliasNames?: string[];
    applicableProductTypes?: string[];
    bumpVersion?: boolean;
  }): Promise<void> {
    const startedAt = Date.now();
    await createTermTypeFromCandidateRecord(this.dataSource, params);
    const writeMs = Date.now() - startedAt;
    let bumpVersionMs = 0;
    if (params.bumpVersion !== false) {
      const bumpVersionStartedAt = Date.now();
      await this.bumpDictionaryVersion();
      bumpVersionMs = Date.now() - bumpVersionStartedAt;
    }
    logger.info(
      `[productConfigAgent:dictionary:createTermTypeFromCandidate] candidateId=${params.candidateId} termType=${params.termType} ` +
        `valueKind=${params.valueKind} aliasCount=${params.aliasNames?.length ?? 0} valueAliasCount=${params.valueAliasNames?.length ?? 0} ` +
        `hasEnumValue=${Boolean(params.valueCanonicalValue)} writeMs=${writeMs} bumpVersionMs=${bumpVersionMs} totalMs=${Date.now() - startedAt}`,
    );
  }

  async reviewTermTypeCandidatesBatch(
    operations: Array<{
      candidateId: string;
      action: "create_term_type" | "approve_term_type_as_alias";
      payload: any;
    }>,
  ): Promise<
    Array<{
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }>
  > {
    const startedAt = Date.now();
    const result = await reviewTermTypeCandidatesBatchRecord(
      this.dataSource,
      operations,
    );
    logger.info(
      `[productConfigAgent:dictionary:reviewTermTypeCandidatesBatch] operationCount=${operations.length} ` +
        `successCount=${result.filter((item) => item.status === "ok").length} ` +
        `failedCount=${result.filter((item) => item.status === "failed").length} totalMs=${Date.now() - startedAt}`,
    );
    return result;
  }

  async rejectValueCandidate(params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  }): Promise<void> {
    await rejectValueCandidateRecord(this.dataSource, params);
  }

  async rejectTermTypeCandidate(params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  }): Promise<void> {
    await rejectTermTypeCandidateRecord(this.dataSource, params);
  }

  async updateTermTypeValueKind(params: {
    termType: string;
    valueKind: DictionaryValueKind;
    resolvedValueCandidateId?: string;
    reviewedBy?: string;
    bumpVersion?: boolean;
  }): Promise<void> {
    const repo = this.dataSource.getRepository(DictionaryTermType);
    const termType = await repo.findOne({
      where: { termType: params.termType },
    });
    if (!termType) {
      throw new Error(`DictionaryTermType not found: ${params.termType}`);
    }

    termType.valueKind = params.valueKind;
    await repo.save(termType);

    if (params.resolvedValueCandidateId !== undefined) {
      const candidateRepo = this.dataSource.getRepository(DictionaryCandidate);
      const candidate = await candidateRepo.findOne({
        where: { id: params.resolvedValueCandidateId },
      });
      if (candidate) {
        candidate.status = "approved";
        candidate.reviewedBy = params.reviewedBy ?? null;
        candidate.reviewedAt = new Date();
        candidate.reason = `resolved_by_term_type_value_kind:${params.valueKind}`;
        await candidateRepo.save(candidate);
      }
    }

    if (params.bumpVersion !== false) {
      await this.bumpDictionaryVersion();
    }
  }

  async moveValueCandidateToTermType(params: {
    candidateId: string;
    termType: string;
    rawValue?: string;
    reviewedBy?: string;
    reason?: string;
    bumpVersion?: boolean;
  }): Promise<void> {
    const candidateRepo = this.dataSource.getRepository(DictionaryCandidate);
    const termTypeRepo = this.dataSource.getRepository(DictionaryTermType);
    const termType = String(params.termType ?? "").trim();
    if (!termType) {
      throw new Error("termType is required");
    }

    const termTypeRecord = await termTypeRepo.findOne({ where: { termType } });
    if (!termTypeRecord) {
      throw new Error(`DictionaryTermType not found: ${termType}`);
    }

    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
    }

    const rawValue = String(params.rawValue ?? candidate.rawValue).trim();
    if (!rawValue) {
      throw new Error("rawValue is required");
    }

    const normalizedRawValue = this.normalizeText(rawValue);
    const existing = await candidateRepo
      .createQueryBuilder("candidate")
      .where("candidate.termType = :termType", { termType })
      .andWhere("candidate.normalizedRawValue = :normalizedRawValue", {
        normalizedRawValue,
      })
      .andWhere("candidate.status = :status", { status: "pending" })
      .andWhere("candidate.id <> :candidateId", {
        candidateId: params.candidateId,
      })
      .getOne();

    candidate.status = "approved";
    candidate.reviewedBy = params.reviewedBy ?? null;
    candidate.reviewedAt = new Date();
    candidate.reason =
      params.reason ??
      `moved_to_other_term_type:${candidate.termType}->${termType}`;

    if (existing) {
      candidate.reason =
        params.reason ??
        `moved_to_existing_candidate:${existing.termType}:${existing.id}`;
      await this.saveMovedValueCandidateResolved(candidateRepo, candidate);
      return;
    }

    await this.saveMovedValueCandidateResolved(candidateRepo, candidate);
    await createValueCandidateRecord(
      this.dataSource,
      {
        documentId: candidate.documentId ?? undefined,
        extractionResultId: candidate.extractionResultId ?? undefined,
        itemIndex: candidate.itemIndex ?? undefined,
        sourceProductType: candidate.sourceProductType,
        termType,
        rawValue,
        reason: `moved_from_candidate:${candidate.id}`,
        evidence: candidate.evidence ?? undefined,
        confidence:
          candidate.confidence === null ? undefined : Number(candidate.confidence),
      },
      normalizedRawValue,
    );
  }

  private async saveMovedValueCandidateResolved(
    candidateRepo: Repository<DictionaryCandidate>,
    candidate: DictionaryCandidate,
  ): Promise<void> {
    const existingApproved = await candidateRepo.findOne({
      where: {
        termType: candidate.termType,
        normalizedRawValue: candidate.normalizedRawValue,
        status: "approved",
      },
    });

    if (existingApproved && existingApproved.id !== candidate.id) {
      candidate.status = this.doneStatus(candidate.id);
      candidate.reason = `${candidate.reason ?? "moved_to_other_term_type"};merged_to_approved_candidate:${existingApproved.id}`;
    } else {
      candidate.status = "approved";
    }

    try {
      await candidateRepo.save(candidate);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      candidate.status = this.doneStatus(candidate.id);
      candidate.reason = `${candidate.reason ?? "moved_to_other_term_type"};merged_to_existing_reviewed_candidate`;
      await candidateRepo.save(candidate);
    }
  }

  private async saveValueCandidateAutoResolved(
    candidateRepo: Repository<DictionaryCandidate>,
    candidate: DictionaryCandidate,
  ): Promise<void> {
    try {
      await candidateRepo.save(candidate);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      candidate.status = this.doneStatus(candidate.id);
      candidate.reason = `${candidate.reason ?? "auto_resolved"};merged_to_existing_auto_resolved_candidate`;
      await candidateRepo.save(candidate);
    }
  }

  private async saveTermTypeCandidateAutoResolved(
    candidateRepo: Repository<DictionaryTermTypeCandidate>,
    candidate: DictionaryTermTypeCandidate,
  ): Promise<void> {
    try {
      await candidateRepo.save(candidate);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      candidate.status = this.doneStatus(candidate.id);
      candidate.reason = `${candidate.reason ?? "auto_resolved"};merged_to_existing_auto_resolved_candidate`;
      await candidateRepo.save(candidate);
    }
  }

  private doneStatus(id: string): string {
    return `done_${String(id).slice(-24)}`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    const candidate = error as { code?: string; message?: string };
    return (
      candidate?.code === "23505" ||
      String(candidate?.message ?? "").includes("duplicate key value")
    );
  }

  private async normalizeSingleTermTypeField(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
  ): Promise<NormalizedFieldResult> {
    const termType = termTypeMatch.termTypes[0];
    const valueKind = this.getTermTypeValueKind(termType);
    if (isProductConfigAgentModelTermType(termType)) {
      return this.normalizeMasterDataModelField(
        params,
        termTypeMatch,
        termType,
        valueKind,
      );
    }

    if (valueKind !== "enum" && valueKind !== "enums") {
      return this.buildTermTypeOnlyResult(params, termTypeMatch, termType, valueKind);
    }

    if (valueKind === "enums") {
      return this.normalizeEnumsField(params, termTypeMatch);
    }

    const valueMatch = await this.matchValue({
      termType,
      rawValue: params.rawValue,
    });

    if (valueMatch.matched) {
      return buildMatchedFieldResult(params, termTypeMatch, valueMatch);
    }

    const valueCandidate = await this.createValueCandidate({
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex: params.itemIndex,
      sourceProductType: params.itemProductTypeHint,
      termType,
      rawValue: params.rawValue,
      reason: "value_no_match",
      evidence: params.evidence,
    });

    return {
      matched: false,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      rawValue: params.rawValue,
      normalizedValue: this.normalizeText(params.rawValue),
      termType,
      itemIndex: params.itemIndex,
      itemProductTypeHint: normalizeProductTypeHintForMatch(
        params.itemProductTypeHint,
      ),
      valueCandidate: valueCandidate ?? undefined,
      warnings: [
        {
          type: valueCandidate
            ? "value_no_match"
            : "value_candidate_previously_rejected",
          message: valueCandidate
            ? "字段值未命中字典，请人工确认"
            : "字段值候选此前已被拒绝，已跳过重新生成候选",
          rawValue: params.rawValue,
          termType,
        },
      ],
    };
  }

  private async normalizeEnumsField(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
  ): Promise<NormalizedFieldResult> {
    const termType = termTypeMatch.termTypes[0];
    const cachedTermType = this.cache.termTypeMap.get(termType);
    if (!cachedTermType) {
      return this.buildTermTypeOnlyResult(params, termTypeMatch, termType, 'enums');
    }

    const result = normalizeMultiEnumValues(
      params.rawValue,
      cachedTermType,
      {
        aliasMap: this.cache.valueAliasMap,
        splitRawValues: params.splitRawValues,
      },
    );

    const warnings: NormalizedFieldResult['warnings'] = [];

    // Mark matched value aliases as seen
    for (const value of result.values) {
      if (value.aliasId) {
        this.markValueAliasSeen(String(value.aliasId));
      }
    }

    // Create value candidates for unmatched tokens
    let firstValueCandidate: DictionaryCandidate | undefined;
    const pendingUnmatchedTokens: string[] = [];
    for (let index = 0; index < result.unmatchedTokens.length; index += 1) {
      const unmatched = result.unmatchedTokens[index];
      const normalized = this.normalizeText(unmatched);
      if (!normalized) continue;

      const valueCandidate = await this.createValueCandidate({
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: params.itemProductTypeHint,
        sourceRawValue: params.rawValue,
        splitFromRawValue: unmatched,
        splitTokenIndex: index,
        termType,
        termTypeDisplayName: cachedTermType.displayName,
        valueKind: 'enums',
        rawValue: unmatched,
        reason: 'enums_token_no_match',
        evidence: params.evidence,
      });
      if (valueCandidate) {
        firstValueCandidate ??= valueCandidate;
        pendingUnmatchedTokens.push(unmatched);
      }

      warnings.push({
        type: valueCandidate
          ? 'enums_unmatched_token'
          : 'value_candidate_previously_rejected',
        message: valueCandidate
          ? `以下值未匹配字典：${unmatched}，是否创建为新标准值？`
          : `字段值候选 ${unmatched} 此前已被拒绝，已跳过重新生成候选`,
        rawValue: params.rawValue,
        termType,
      });
    }

    return buildEnumsFieldResult({
      rawFieldName: params.fieldName,
      rawValue: params.rawValue,
      termType: cachedTermType,
      values: result.values,
      unmatchedTokens: pendingUnmatchedTokens,
      itemIndex: params.itemIndex,
      itemProductTypeHint: normalizeProductTypeHintForMatch(params.itemProductTypeHint),
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      valueCandidate: firstValueCandidate,
      warnings,
    });
  }

  async flushAliasUsageStats(): Promise<void> {
    const termTypeUsage = [...this.pendingTermTypeAliasUsage.entries()].map(
      ([id, count]) => ({ id, count }),
    );
    const valueUsage = [...this.pendingValueAliasUsage.entries()].map(
      ([id, count]) => ({ id, count }),
    );
    this.pendingTermTypeAliasUsage.clear();
    this.pendingValueAliasUsage.clear();

    try {
      if (termTypeUsage.length > 0) {
        await this.dataSource.query(
          `
          UPDATE quote_agent.dictionary_term_type_aliases AS alias
          SET usage_count = alias.usage_count + usage.count,
              last_seen_at = now()
          FROM jsonb_to_recordset($1::jsonb) AS usage(id bigint, count int)
          WHERE alias.id = usage.id
          `,
          [JSON.stringify(termTypeUsage)],
        );
      }

      if (valueUsage.length > 0) {
        await this.dataSource.query(
          `
          UPDATE quote_agent.dictionary_aliases AS alias
          SET usage_count = alias.usage_count + usage.count,
              last_seen_at = now()
          FROM jsonb_to_recordset($1::jsonb) AS usage(id bigint, count int)
          WHERE alias.id = usage.id
          `,
          [JSON.stringify(valueUsage)],
        );
      }
    } catch {
      return;
    }
  }

  private markTermTypeAliasSeen(aliasIds: string[]): void {
    for (const aliasId of aliasIds) {
      this.pendingTermTypeAliasUsage.set(
        aliasId,
        (this.pendingTermTypeAliasUsage.get(aliasId) ?? 0) + 1,
      );
    }
  }

  private markValueAliasSeen(aliasId: string): void {
    this.pendingValueAliasUsage.set(
      aliasId,
      (this.pendingValueAliasUsage.get(aliasId) ?? 0) + 1,
    );
  }

  private async normalizeMultiTermTypeField(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
  ): Promise<NormalizedFieldResult> {
    const modelTermType = termTypeMatch.termTypes.find(isProductConfigAgentModelTermType);
    if (modelTermType) {
      return this.normalizeMasterDataModelField(
        params,
        termTypeMatch,
        modelTermType,
        this.getTermTypeValueKind(modelTermType),
      );
    }

    const enumTermTypes = termTypeMatch.termTypes.filter(
      (termType) => this.getTermTypeValueKind(termType) === "enum" || this.getTermTypeValueKind(termType) === "enums",
    );

    if (enumTermTypes.length === 0) {
      const firstTermType = termTypeMatch.termTypes[0];
      return this.buildTermTypeOnlyResult(
        params,
        termTypeMatch,
        firstTermType,
        this.getTermTypeValueKind(firstTermType),
      );
    }

    const valueMatch = await this.matchValueMulti({
      termTypes: enumTermTypes,
      rawValue: params.rawValue,
    });

    if (valueMatch.matched) {
      return buildMatchedFieldResult(params, termTypeMatch, valueMatch);
    }

    const firstTermType = enumTermTypes[0];
    const valueCandidate = await this.createValueCandidate({
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex: params.itemIndex,
      sourceProductType: params.itemProductTypeHint,
      termType: firstTermType,
      rawValue: params.rawValue,
      reason: "value_no_match_in_multiple_term_types",
      evidence: params.evidence,
    });

    return {
      matched: false,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      rawValue: params.rawValue,
      normalizedValue: this.normalizeText(params.rawValue),
      termType: firstTermType,
      candidateTermTypes: termTypeMatch.termTypes,
      itemIndex: params.itemIndex,
      itemProductTypeHint: normalizeProductTypeHintForMatch(
        params.itemProductTypeHint,
      ),
      valueCandidate: valueCandidate ?? undefined,
      warnings: [
        {
          type: valueCandidate
            ? "value_no_match_in_multiple_term_types"
            : "value_candidate_previously_rejected",
          message: valueCandidate
            ? "字段名对应多个标准字段，但字段值未命中，请人工确认"
            : "字段值候选此前已被拒绝，已跳过重新生成候选",
          rawValue: params.rawValue,
          termType: firstTermType,
        },
      ],
    };
  }

  private buildTermTypeOnlyResult(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
    termType: string,
    valueKind: DictionaryValueKind,
  ): NormalizedFieldResult {
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      rawValue: params.rawValue,
      normalizedValue: this.normalizeText(params.rawValue),
      termType,
      candidateTermTypes:
        termTypeMatch.termTypes.length > 1 ? termTypeMatch.termTypes : undefined,
      valueKind,
      matchMethod: "term_type_only",
      itemIndex: params.itemIndex,
      itemProductTypeHint: normalizeProductTypeHintForMatch(
        params.itemProductTypeHint,
      ),
      warnings: [],
    };
  }

  private async normalizeMasterDataModelField(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
    termType: "metering_pump_model" | "filter_model",
    valueKind: DictionaryValueKind,
  ): Promise<NormalizedFieldResult> {
    const masterDataMatch = await this.masterDataService.matchModel({
      termType,
      rawValue: params.rawValue,
    });
    const itemProductTypeHint = normalizeProductTypeHintForMatch(
      params.itemProductTypeHint,
    );
    const source = sourceForModelTermType(termType);

    return {
      matched: masterDataMatch.matched,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      rawValue: params.rawValue,
      normalizedValue: this.normalizeText(params.rawValue),
      termType,
      candidateTermTypes:
        termTypeMatch.termTypes.length > 1 ? termTypeMatch.termTypes : undefined,
      valueKind,
      matchMethod: "term_type_only",
      itemIndex: params.itemIndex,
      itemProductTypeHint,
      masterDataMatch,
      warnings: masterDataMatch.matched
        ? []
        : [
            {
              type: "master_data_no_match",
              message: "Model did not match CRM product master data; manual binding is required",
              rawValue: params.rawValue,
              termType,
              source,
            },
          ],
    };
  }

  private getTermTypeValueKind(termType: string): DictionaryValueKind {
    return this.cache.termTypeMap.get(termType)?.valueKind ?? "enum";
  }

  private isTermTypeApplicableToProduct(
    termType: string,
    itemProductTypeHint?: string,
  ): boolean {
    const applicable =
      this.cache.termTypeMap.get(termType)?.applicableProductTypes ?? [];

    if (!applicable.length) return true;
    if (applicable.includes("common")) return true;
    if (!itemProductTypeHint || itemProductTypeHint === "unknown") return true;

    return applicable.includes(itemProductTypeHint);
  }
}

function normalizeProductTypeHintForMatch(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
}
