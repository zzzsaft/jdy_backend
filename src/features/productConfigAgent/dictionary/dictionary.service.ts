import { DataSource, In, Repository } from "typeorm";
import {
  DictionaryTermType,
  DictionaryCandidate,
  DictionaryTermTypeCandidate,
  DictionaryTerm,
  DictionaryAlias,
  DictionaryCandidateOccurrence,
  DictionaryUnitAlias,
  DictionaryUnitCandidate,
} from "./entity/index.js";
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
  CachedValueAlias,
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
import { setRuntimeQualifierMatcher } from "./qualifierMatcher.js";
import {
  isProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataService,
  sourceForModelTermType,
} from "../masterData.service.js";
import {
  normalizeNumberUnit,
  normalizeUnitAliasText,
} from "./numberUnit.js";
import { parseRangeBoundFieldName } from "../normalization/rules/rangeBoundRules.js";
import { parseNumberUnitPartFieldName } from "../normalization/rules/numberUnitPartRules.js";
import { parseIndexedInstanceFieldName } from "../normalization/rules/indexedInstanceRules.js";
import { SplitResolutionService } from "./splitResolution.service.js";
import {
  isExplicitNumberUnitSplitField,
  normalizeProductTypeHintForMatch,
} from "./dictionary.service.helpers.js";
import { ConceptResolverService } from "./conceptResolver.service.js";

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
  private readonly splitResolutionService: SplitResolutionService;
  private readonly conceptResolverService: ConceptResolverService;
  private readonly pendingTermTypeAliasUsage = new Map<string, number>();
  private readonly pendingValueAliasUsage = new Map<string, number>();
  private productTypeOptionsCache:
    | {
        loadedAt: number;
        values: Array<{
          canonicalValue: string;
          displayName: string;
          aliases: string[];
        }>;
      }
    | null = null;
  private productTypeOptionsPromise: Promise<
    Array<{ canonicalValue: string; displayName: string; aliases: string[] }>
  > | null = null;

  constructor(private readonly dataSource: DataSource) {
    this.cache = new DictionaryCache(dataSource);
    this.masterDataService = new ProductConfigAgentMasterDataService(dataSource);
    this.splitResolutionService = new SplitResolutionService(dataSource);
    this.conceptResolverService = new ConceptResolverService(dataSource);
  }

  normalizeText(input: unknown): string {
    return normalizeText(input);
  }

  async ensureCacheFresh(): Promise<void> {
    await this.cache.ensureFresh();
    this.syncRuntimeQualifierMatcher();
  }

  getUnitAliasMap() {
    return this.cache.unitAliasMap;
  }

  async reloadCache(): Promise<void> {
    await this.cache.reload();
    this.syncRuntimeQualifierMatcher();
    this.productTypeOptionsCache = null;
    this.productTypeOptionsPromise = null;
  }

  async bumpDictionaryVersion(): Promise<void> {
    const startedAt = Date.now();
    await this.cache.bumpVersion();
    this.syncRuntimeQualifierMatcher();
    logger.info(
      `[productConfigAgent:dictionary:bumpVersion] totalMs=${Date.now() - startedAt}`,
    );
  }

  private syncRuntimeQualifierMatcher(): void {
    setRuntimeQualifierMatcher(this.cache.qualifierMatcher);
  }

  async getLlmDictionaryContext(): Promise<LlmDictionaryContext> {
    return this.cache.getLlmDictionaryContext();
  }

  async getProductTypeOptions(): Promise<
    Array<{ canonicalValue: string; displayName: string; aliases: string[] }>
  > {
    const now = Date.now();
    if (
      this.productTypeOptionsCache &&
      now - this.productTypeOptionsCache.loadedAt < 60000
    ) {
      return this.productTypeOptionsCache.values;
    }
    if (this.productTypeOptionsPromise) {
      return this.productTypeOptionsPromise;
    }

    this.productTypeOptionsPromise = (async () => {
      const terms = await this.dataSource.getRepository(DictionaryTerm).find({
        where: { termType: "product_type", isActive: true },
        order: { displayName: "ASC" },
      });
      const aliases = await this.dataSource.getRepository(DictionaryAlias).find({
        where: { termType: "product_type", isActive: true },
      });
      const aliasesByTermId = new Map<string, string[]>();
      for (const alias of aliases) {
        const values = aliasesByTermId.get(alias.termId) ?? [];
        values.push(alias.aliasValue);
        aliasesByTermId.set(alias.termId, values);
      }
      const values = terms.map((term) => ({
        canonicalValue: term.canonicalValue,
        displayName: term.displayName ?? term.canonicalValue,
        aliases: aliasesByTermId.get(term.id) ?? [],
      }));
      this.productTypeOptionsCache = {
        loadedAt: Date.now(),
        values,
      };
      return values;
    })();

    try {
      return await this.productTypeOptionsPromise;
    } finally {
      this.productTypeOptionsPromise = null;
    }
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
    const candidate = await createValueCandidateRecord(
      this.dataSource,
      params,
      this.normalizeText(params.rawValue),
    );
    if (candidate) {
      this.conceptResolverService.enqueueCandidate({
        candidateType: "value",
        candidateId: candidate.id,
        force: true,
      });
    }
    return candidate;
  }

  async createTermTypeCandidate(
    params: CreateTermTypeCandidateParams,
  ): Promise<DictionaryTermTypeCandidate | null> {
    const candidate = await createTermTypeCandidateRecord(
      this.dataSource,
      params,
      this.normalizeText(params.rawFieldName),
    );
    if (candidate) {
      this.conceptResolverService.enqueueCandidate({
        candidateType: "term_type",
        candidateId: candidate.id,
        force: true,
      });
    }
    return candidate;
  }

  async waitForConceptResolverIdle(): Promise<void> {
    await this.conceptResolverService.waitForIdle();
  }

  async createUnitCandidate(params: {
    documentId?: string;
    extractionResultId?: string;
    termType?: string;
    rawValue: string;
    rawUnit: string;
    normalizedRawUnit: string;
    proposedCanonicalUnit?: string;
    reason?: string;
    evidence?: unknown;
  }): Promise<DictionaryUnitCandidate | undefined> {
    const normalizedRawUnit =
      params.normalizedRawUnit || normalizeUnitAliasText(params.rawUnit);
    if (!normalizedRawUnit) {
      return undefined;
    }
    const repo = this.dataSource.getRepository(DictionaryUnitCandidate);
    const existing = await repo.findOne({
      where: { normalizedRawUnit, status: "pending" },
    });
    if (existing) {
      return existing;
    }
    try {
      return await repo.save(
        repo.create({
          documentId: params.documentId ?? null,
          extractionResultId: params.extractionResultId ?? null,
          termType: params.termType ?? null,
          rawValue: params.rawValue,
          rawUnit: params.rawUnit,
          normalizedRawUnit,
          proposedCanonicalUnit: params.proposedCanonicalUnit ?? normalizedRawUnit,
          reason: params.reason ?? "unit_alias_no_match",
          evidence: params.evidence ?? null,
          status: "pending",
        }),
      );
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      return (
        (await repo.findOne({ where: { normalizedRawUnit, status: "pending" } })) ??
        undefined
      );
    }
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
    const occurrenceRepo = this.dataSource.getRepository(
      DictionaryCandidateOccurrence,
    );
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
    const valueCandidateOccurrences = valueCandidates.length
      ? await occurrenceRepo.find({
          where: {
            candidateType: "value",
            candidateId: In(valueCandidates.map((candidate) => candidate.id)),
          },
        })
      : [];
    const valueOccurrencesByCandidateId = new Map<
      string,
      DictionaryCandidateOccurrence[]
    >();
    for (const occurrence of valueCandidateOccurrences) {
      valueOccurrencesByCandidateId.set(occurrence.candidateId, [
        ...(valueOccurrencesByCandidateId.get(occurrence.candidateId) ?? []),
        occurrence,
      ]);
    }
    const splitResolutionLookup =
      await this.splitResolutionService.buildCandidateReviewSplitResolutionLookup(
      valueCandidates,
      valueCandidateOccurrences,
    );
    const currentValueCandidateReferences =
      await this.loadCurrentNormalizedValueCandidateReferences(
        valueCandidates,
        valueCandidateOccurrences,
      );

    let resolvedTermTypeCandidateCount = 0;
    const resolvedTermTypeCandidateIds: string[] = [];
    const affectedDocumentIds = new Set<number>();
    for (const candidate of termTypeCandidates) {
      const indexedInstanceField = parseIndexedInstanceFieldName(
        candidate.rawFieldName,
      );
      if (indexedInstanceField) {
        const match = await this.matchTermType(indexedInstanceField.baseFieldName, {
          itemProductTypeHint: candidate.sourceProductType,
        });
        candidate.status = "auto_resolved";
        candidate.proposedTermType =
          match.matched && !match.crossProductFallback
            ? match.termTypes[0] ?? candidate.proposedTermType
            : candidate.proposedTermType;
        candidate.reason = match.matched && !match.crossProductFallback
          ? `auto_resolved_by_indexed_instance_field_normalization:${indexedInstanceField.baseFieldName}:${match.termTypes.join(",")}`
          : `auto_resolved_by_indexed_instance_field_normalization:${indexedInstanceField.baseFieldName}`;
        candidate.reviewedBy = "system";
        candidate.reviewedAt = new Date();
        await this.saveTermTypeCandidateAutoResolved(
          termTypeCandidateRepo,
          candidate,
        );
        resolvedTermTypeCandidateCount += 1;
        resolvedTermTypeCandidateIds.push(candidate.id);
        if (candidate.documentId) {
          affectedDocumentIds.add(Number(candidate.documentId));
        }
        continue;
      }

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
      if (currentValueCandidateReferences.get(candidate.id) === false) {
        candidate.status = this.doneStatus(candidate.id);
        candidate.reason =
          "auto_resolved_by_normalization_refresh:no_current_reference";
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

      if (
        candidate.documentId &&
        candidate.extractionResultId &&
        candidate.itemIndex !== null
      ) {
        const splitResolution =
          this.splitResolutionService.findCandidateSplitResolution(
            candidate,
            valueOccurrencesByCandidateId.get(candidate.id) ?? [],
            splitResolutionLookup,
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

  private async loadCurrentNormalizedValueCandidateReferences(
    candidates: DictionaryCandidate[],
    occurrences: DictionaryCandidateOccurrence[],
  ): Promise<Map<string, boolean>> {
    const extractionIdsByCandidateId = new Map<string, Set<string>>();
    for (const candidate of candidates) {
      if (!candidate.extractionResultId) continue;
      extractionIdsByCandidateId.set(
        candidate.id,
        new Set([String(candidate.extractionResultId)]),
      );
    }
    for (const occurrence of occurrences) {
      if (!occurrence.extractionResultId) continue;
      extractionIdsByCandidateId.set(occurrence.candidateId, new Set([
        ...(extractionIdsByCandidateId.get(occurrence.candidateId) ?? []),
        String(occurrence.extractionResultId),
      ]));
    }

    const extractionIds = [
      ...new Set(
        [...extractionIdsByCandidateId.values()].flatMap((ids) => [...ids]),
      ),
    ];
    if (extractionIds.length === 0) {
      return new Map();
    }

    const candidateIds: string[] = [];
    const pairedExtractionIds: string[] = [];
    const seenCandidateExtractionPairs = new Set<string>();
    for (const [candidateId, ids] of extractionIdsByCandidateId) {
      for (const extractionId of ids) {
        const pairKey = `${candidateId}:${extractionId}`;
        if (seenCandidateExtractionPairs.has(pairKey)) continue;
        seenCandidateExtractionPairs.add(pairKey);
        candidateIds.push(String(candidateId));
        pairedExtractionIds.push(String(extractionId));
      }
    }

    const rows = await this.dataSource.query(
      `
        WITH candidate_refs AS (
          SELECT *
          FROM unnest($1::text[], $2::bigint[]) AS item(candidate_id, extraction_id)
        )
        SELECT
          candidate_refs.candidate_id AS "candidateId",
          COUNT(extraction.id)::int AS "extractionCount",
          BOOL_OR(
            field->'candidate'->>'candidate_type' = 'value'
            AND field->'candidate'->>'candidate_id' = candidate_refs.candidate_id
          ) AS "isReferenced"
        FROM candidate_refs
        LEFT JOIN quote_agent.extraction_results extraction
          ON extraction.id = candidate_refs.extraction_id
        LEFT JOIN LATERAL jsonb_array_elements(
          COALESCE(extraction.normalized_extraction_json->'items', '[]'::jsonb)
        ) item ON true
        LEFT JOIN LATERAL jsonb_array_elements(
          COALESCE(item->'fields', '[]'::jsonb)
        ) field ON true
        GROUP BY candidate_refs.candidate_id
      `,
      [candidateIds, pairedExtractionIds],
    );

    const result = new Map<string, boolean>();
    for (const row of rows) {
      if (Number(row.extractionCount) > 0) {
        result.set(String(row.candidateId), row.isReferenced === true);
      }
    }
    return result;
  }

  async normalizeField(
    params: NormalizeFieldParams,
  ): Promise<NormalizedFieldResult> {
    const itemProductTypeHint = normalizeProductTypeHintForMatch(
      params.itemProductTypeHint,
    );
    const rangeBoundField = parseRangeBoundFieldName(params.fieldName);
    const numberUnitPartField = parseNumberUnitPartFieldName(params.fieldName);
    const indexedInstanceField = parseIndexedInstanceFieldName(params.fieldName);
    const fieldNameForMatch =
      rangeBoundField?.baseFieldName ??
      numberUnitPartField?.baseFieldName ??
      indexedInstanceField?.baseFieldName ??
      params.fieldName;
    const termTypeMatch = await this.matchTermType(fieldNameForMatch, {
      itemProductTypeHint,
    });
    const normalizedValue = this.normalizeText(params.rawValue);

    if (!termTypeMatch.matched || termTypeMatch.crossProductFallback) {
      const valueLikeFieldName = this.detectValueLikeFieldName({
        fieldName: params.fieldName,
        rawValue: params.rawValue,
        itemProductTypeHint,
      });
      if (!termTypeMatch.crossProductFallback && valueLikeFieldName) {
        const valueLikeRawValue = this.pickValueLikeFieldNameRawValue({
          fieldName: params.fieldName,
          rawValue: params.rawValue,
        });
        const valueCandidate = valueLikeFieldName.termType
          ? await this.createValueCandidate({
              documentId: params.documentId,
              extractionResultId: params.extractionResultId,
              itemIndex: params.itemIndex,
              sourceProductType: itemProductTypeHint,
              termType: valueLikeFieldName.termType,
              rawValue: valueLikeRawValue,
              reason: "value_like_field_name",
              evidence: {
                ...(params.evidence && typeof params.evidence === "object"
                  ? (params.evidence as Record<string, unknown>)
                  : {}),
                rawFieldName: params.fieldName,
                sourceRawValue: params.rawValue,
                valueLikeFieldNameReason: valueLikeFieldName.reason,
              },
            })
          : null;

        return {
          matched: false,
          fieldMatched: false,
          rawFieldName: params.fieldName,
          normalizedFieldName: termTypeMatch.normalizedFieldName,
          rawValue: params.rawValue,
          normalizedValue,
          termType: valueLikeFieldName.termType,
          itemIndex: params.itemIndex,
          itemProductTypeHint,
          valueCandidate: valueCandidate ?? undefined,
          warnings: [
            {
              type: valueCandidate
                ? "value_like_field_name_moved_to_value_candidate"
                : "value_like_field_name_not_term_type",
              message: valueCandidate
                ? "字段名看起来是枚举值，已按字段值候选处理，未生成字段 Key 候选"
                : "字段名看起来是枚举值，不应作为字段 Key 候选",
              rawValue: params.rawValue,
              termType: valueLikeFieldName.termType,
            },
          ],
        };
      }

      const termTypeCandidate = await this.createTermTypeCandidate({
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: itemProductTypeHint,
        rawFieldName: fieldNameForMatch,
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
      applicableProductTypes?: string[];
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

  async markTermTypeCandidateAsDocumentInfo(params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  }): Promise<void> {
    await rejectTermTypeCandidateRecord(this.dataSource, {
      candidateId: params.candidateId,
      reviewedBy: params.reviewedBy,
      reason:
        params.reason ?? "document_info_field_not_product_term_type",
    });
  }

  async listUnitAliases() {
    return this.dataSource.getRepository(DictionaryUnitAlias).find({
      order: { canonicalUnit: "ASC", aliasValue: "ASC" },
    });
  }

  async saveUnitAlias(params: {
    canonicalUnit: string;
    displayUnit?: string | null;
    aliasValue: string;
    note?: string | null;
    isActive?: boolean;
    source?: string;
  }) {
    const repo = this.dataSource.getRepository(DictionaryUnitAlias);
    const normalizedAlias = normalizeUnitAliasText(params.aliasValue);
    if (!normalizedAlias) {
      throw new Error("aliasValue is required");
    }
    const existing = await repo.findOne({ where: { normalizedAlias } });
    const row =
      existing ??
      repo.create({
        normalizedAlias,
      });
    row.canonicalUnit = params.canonicalUnit.trim();
    row.displayUnit = params.displayUnit ?? params.canonicalUnit.trim();
    row.aliasValue = params.aliasValue.trim();
    row.note = params.note ?? row.note ?? null;
    row.source = params.source ?? row.source ?? "manual";
    row.isActive = params.isActive ?? row.isActive ?? true;
    const alias = await repo.save(row);
    await this.bumpDictionaryVersion();
    return alias;
  }

  async updateUnitAlias(params: {
    id: string;
    canonicalUnit?: string;
    displayUnit?: string | null;
    aliasValue?: string;
    note?: string | null;
    isActive?: boolean;
  }) {
    const repo = this.dataSource.getRepository(DictionaryUnitAlias);
    const row = await repo.findOne({ where: { id: params.id } });
    if (!row) {
      throw new Error(`DictionaryUnitAlias not found: ${params.id}`);
    }
    if (params.canonicalUnit !== undefined) {
      row.canonicalUnit = params.canonicalUnit.trim();
    }
    if (params.displayUnit !== undefined) {
      row.displayUnit = params.displayUnit;
    }
    if (params.aliasValue !== undefined) {
      row.aliasValue = params.aliasValue.trim();
      row.normalizedAlias = normalizeUnitAliasText(params.aliasValue);
    }
    if (params.note !== undefined) {
      row.note = params.note;
    }
    if (params.isActive !== undefined) {
      row.isActive = params.isActive;
    }
    const alias = await repo.save(row);
    await this.bumpDictionaryVersion();
    return alias;
  }

  async listUnitCandidates(params?: { status?: string }) {
    return this.dataSource.getRepository(DictionaryUnitCandidate).find({
      where: { status: params?.status ?? "pending" },
      order: { createdAt: "DESC" },
    });
  }

  async approveUnitCandidate(params: {
    candidateId: string;
    canonicalUnit: string;
    displayUnit?: string | null;
    aliasValue?: string;
    reviewedBy?: string;
  }) {
    const candidateRepo = this.dataSource.getRepository(DictionaryUnitCandidate);
    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(`DictionaryUnitCandidate not found: ${params.candidateId}`);
    }
    const alias = await this.saveUnitAlias({
      canonicalUnit: params.canonicalUnit,
      displayUnit: params.displayUnit ?? params.canonicalUnit,
      aliasValue: params.aliasValue ?? candidate.rawUnit,
      source: "candidate_review",
    });
    candidate.status = "approved";
    candidate.proposedCanonicalUnit = params.canonicalUnit;
    candidate.reviewedBy = params.reviewedBy ?? null;
    candidate.reviewedAt = new Date();
    await candidateRepo.save(candidate);
    return { candidate, alias };
  }

  async rejectUnitCandidate(params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  }) {
    const candidateRepo = this.dataSource.getRepository(DictionaryUnitCandidate);
    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(`DictionaryUnitCandidate not found: ${params.candidateId}`);
    }
    candidate.status = "rejected";
    candidate.reason = params.reason ?? candidate.reason;
    candidate.reviewedBy = params.reviewedBy ?? null;
    candidate.reviewedAt = new Date();
    await candidateRepo.save(candidate);
    return candidate;
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
    movedRawValue?: string;
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

    const rawValue = String(
      params.movedRawValue ?? params.rawValue ?? candidate.rawValue,
    ).trim();
    if (!rawValue) {
      throw new Error("rawValue is required");
    }

    const normalizedRawValue = this.normalizeText(rawValue);
    const targetMatch = await this.matchValue({ termType, rawValue });
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
    candidate.proposedCanonicalValue =
      targetMatch.matched && targetMatch.canonicalValue
        ? `${termType}:${targetMatch.canonicalValue}`
        : `${termType}:${rawValue}`;
    candidate.proposedTermId = targetMatch.termId ?? candidate.proposedTermId;

    if (targetMatch.matched) {
      candidate.reason =
        params.reason ??
        `moved_to_other_term_type_resolved:${candidate.termType}->${termType}`;
      await this.saveMovedValueCandidateResolved(candidateRepo, candidate);
      await this.splitResolutionService.saveMoveValueSplitResolution({
        candidate,
        targetTermType: termType,
        movedRawValue: rawValue,
      });
      return;
    }

    if (existing) {
      candidate.reason =
        params.reason ??
        `moved_to_existing_candidate:${existing.termType}:${existing.id}`;
      await this.saveMovedValueCandidateResolved(candidateRepo, candidate);
      await this.splitResolutionService.saveMoveValueSplitResolution({
        candidate,
        targetTermType: termType,
        movedRawValue: rawValue,
      });
      return;
    }

    await this.saveMovedValueCandidateResolved(candidateRepo, candidate);
    await this.splitResolutionService.saveMoveValueSplitResolution({
      candidate,
      targetTermType: termType,
      movedRawValue: rawValue,
    });
    await this.createValueCandidate({
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
    });
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
      if (valueKind === "number_unit") {
        return this.normalizeNumberUnitField(
          params,
          termTypeMatch,
          termType,
          valueKind,
        );
      }
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

    const enumValueRoute = classifyEnumResidual(termType, params.rawValue);
    if (enumValueRoute.action === "suppress") {
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
        warnings: [
          {
            type: enumValueRoute.warningType ?? "plastic_material_residual_suppressed",
            message: enumValueRoute.message,
            rawValue: params.rawValue,
            termType,
            source: enumValueRoute.source ?? "material_residual_classifier",
          },
        ],
      };
    }

    if (enumValueRoute.action === "route") {
      let firstValueCandidate: DictionaryCandidate | undefined;
      const warnings: NormalizedFieldResult["warnings"] = [];
      for (const routedCandidate of enumValueRoute.candidates) {
        const targetTermType = this.cache.termTypeMap.get(routedCandidate.termType);
        if (!targetTermType) {
          warnings.push({
            type: "plastic_material_residual_route_missing_term_type",
            message: `字段值残片 ${routedCandidate.rawValue} 需要转入 ${routedCandidate.termType}，但字典中未找到目标字段`,
            rawValue: params.rawValue,
            termType,
            source: routedCandidate.source ?? "material_residual_classifier",
          });
          continue;
        }
        const valueCandidate = params.suppressValueCandidate
          ? null
          : await this.createValueCandidate({
              documentId: params.documentId,
              extractionResultId: params.extractionResultId,
              itemIndex: params.itemIndex,
              sourceProductType: params.itemProductTypeHint,
              sourceRawValue: params.rawValue,
              splitFromRawValue: routedCandidate.rawValue,
              termType: routedCandidate.termType,
              termTypeDisplayName: targetTermType.displayName,
              valueKind: targetTermType.valueKind,
              rawValue: routedCandidate.rawValue,
              reason: routedCandidate.reason,
              evidence: {
                ...(params.evidence && typeof params.evidence === "object"
                  ? (params.evidence as Record<string, unknown>)
                  : {}),
                ...routedCandidate.evidence,
                sourceRawValue: params.rawValue,
                routedFromTermType: termType,
                routedBy:
                  routedCandidate.source ?? "material_residual_classifier",
              },
              confidence: routedCandidate.confidence,
            });
        if (valueCandidate) {
          firstValueCandidate ??= valueCandidate;
        }
        warnings.push({
          type: valueCandidate
            ? routedCandidate.warningType
            : params.suppressValueCandidate
              ? "value_candidate_suppressed"
              : "value_candidate_previously_rejected",
          message: valueCandidate
            ? routedCandidate.termType === termType
              ? `以下值未匹配字典：${routedCandidate.rawValue}，是否创建为新标准值？`
              : `字段值残片 ${routedCandidate.rawValue} 已转为 ${targetTermType.displayName} 候选`
            : params.suppressValueCandidate
              ? `备注再解析值 ${routedCandidate.rawValue} 未命中字典，已跳过自动生成 value candidate`
              : `字段值候选 ${routedCandidate.rawValue} 此前已被拒绝，已跳过重新生成候选`,
          rawValue: params.rawValue,
          termType: routedCandidate.warningTermType,
          source: routedCandidate.source,
        });
      }

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
        valueCandidate: firstValueCandidate,
        warnings,
      };
    }

    const valueCandidate = params.suppressValueCandidate
      ? null
      : await this.createValueCandidate({
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
            : params.suppressValueCandidate
              ? "value_candidate_suppressed"
              : "value_candidate_previously_rejected",
          message: valueCandidate
            ? "字段值未命中字典，请人工确认"
            : params.suppressValueCandidate
              ? "备注再解析字段未命中字典值，已跳过自动生成 value candidate"
              : "字段值候选此前已被拒绝，已跳过重新生成候选",
          rawValue: params.rawValue,
          termType,
        },
      ],
    };
  }

  private pickValueLikeFieldNameRawValue(params: {
    fieldName: string;
    rawValue: string;
  }): string {
    const normalizedFieldName = this.normalizeText(params.fieldName);
    const normalizedValue = this.normalizeText(params.rawValue);
    if (
      normalizedValue &&
      normalizedFieldName &&
      (normalizedValue === normalizedFieldName ||
        normalizedValue.startsWith(normalizedFieldName))
    ) {
      return params.rawValue || params.fieldName;
    }

    return params.fieldName || params.rawValue;
  }

  private detectValueLikeFieldName(params: {
    fieldName: string;
    rawValue: string;
    itemProductTypeHint: string;
  }): { termType?: string; reason: string } | null {
    const normalizedFieldName = this.normalizeText(params.fieldName);
    const normalizedValue = this.normalizeText(params.rawValue);
    if (!normalizedFieldName) {
      return null;
    }

    const valueAliasMatches = this.findValueAliasesByNormalizedValue(
      normalizedFieldName,
      params.itemProductTypeHint,
    );
    if (valueAliasMatches.length) {
      return {
        termType: valueAliasMatches[0].termType,
        reason: "raw_field_name_matches_dictionary_value_alias",
      };
    }

    const fieldEqualsValue =
      normalizedValue === normalizedFieldName ||
      (normalizedValue.length > normalizedFieldName.length &&
        normalizedValue.startsWith(normalizedFieldName));
    const surfacePlatingValueLike = this.detectSurfacePlatingValueLikeFieldName({
      fieldEqualsValue,
      normalizedFieldName,
    });
    if (surfacePlatingValueLike) {
      return surfacePlatingValueLike;
    }

    if (
      fieldEqualsValue &&
      normalizedFieldName.length <= 12 &&
      /(?:式|型|有|无|内置|外置|自动|手动|是|否)$/u.test(params.fieldName.trim())
    ) {
      return { reason: "raw_field_name_equals_value_like_token" };
    }

    return null;
  }

  private detectSurfacePlatingValueLikeFieldName(params: {
    fieldEqualsValue: boolean;
    normalizedFieldName: string;
  }): { termType: string; reason: string } | null {
    if (!params.fieldEqualsValue) {
      return null;
    }

    const text = params.normalizedFieldName;
    const hasPlatingAction =
      text.includes("\u7535\u9540") ||
      text.includes("\u9540\u94ec") ||
      text.includes("\u9540\u5c42") ||
      text.includes("\u9540\u5904\u7406");
    if (!hasPlatingAction) {
      return null;
    }

    const hasRequirementContext =
      text.includes("\u9700\u8981") ||
      text.includes("\u9700") ||
      text.includes("\u8981\u6c42") ||
      text.includes("\u5904\u7406") ||
      text.includes("\u8868\u9762") ||
      text.includes("\u6d41\u9053");
    if (!hasRequirementContext) {
      return null;
    }

    return {
      termType: "surface_plating_type",
      reason: "raw_field_name_is_surface_plating_value_phrase",
    };
  }

  private findValueAliasesByNormalizedValue(
    normalizedValue: string,
    itemProductTypeHint: string,
  ): CachedValueAlias[] {
    const matches: CachedValueAlias[] = [];
    for (const [key, alias] of this.cache.valueAliasMap.entries()) {
      if (!key.endsWith(`:${normalizedValue}`)) {
        continue;
      }
      const termType = this.cache.termTypeMap.get(alias.termType);
      const applicable = termType?.applicableProductTypes ?? [];
      if (
        applicable.length &&
        !applicable.includes("common") &&
        !applicable.includes(itemProductTypeHint)
      ) {
        continue;
      }
      matches.push(alias);
    }
    return matches.sort((left, right) => {
      const leftTerm = this.cache.termTypeMap.get(left.termType);
      const rightTerm = this.cache.termTypeMap.get(right.termType);
      return (leftTerm?.sortOrder ?? 1000) - (rightTerm?.sortOrder ?? 1000);
    });
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

      const enumValueRoute = classifyEnumResidual(termType, unmatched);
      if (enumValueRoute.action === "suppress") {
        warnings.push({
          type: enumValueRoute.warningType ?? "plastic_material_residual_suppressed",
          message: enumValueRoute.message,
          rawValue: params.rawValue,
          termType,
          source: enumValueRoute.source ?? "material_residual_classifier",
        });
        continue;
      }

      const routedCandidates =
        enumValueRoute.action === "route"
          ? enumValueRoute.candidates
          : [
              {
                termType,
                termTypeDisplayName: cachedTermType.displayName,
                rawValue: enumValueRoute.rawValue,
                reason: "enums_token_no_match",
                confidence: undefined,
                warningType: "enums_unmatched_token",
                warningTermType: termType,
                source: undefined,
                evidence: undefined,
              },
            ];

      for (const routedCandidate of routedCandidates) {
        const routedNormalized = this.normalizeText(routedCandidate.rawValue);
        if (!routedNormalized) continue;
        const routedTermType = this.cache.termTypeMap.get(routedCandidate.termType);
        if (!routedTermType) {
          warnings.push({
            type: "plastic_material_residual_route_missing_term_type",
            message: `塑料原料残片 ${routedCandidate.rawValue} 需要转入 ${routedCandidate.termType}，但字典中未找到目标字段`,
            rawValue: params.rawValue,
            termType,
            source: routedCandidate.source ?? "material_residual_classifier",
          });
          continue;
        }

        const valueCandidate = params.suppressValueCandidate
          ? null
          : await this.createValueCandidate({
              documentId: params.documentId,
              extractionResultId: params.extractionResultId,
              itemIndex: params.itemIndex,
              sourceProductType: params.itemProductTypeHint,
              sourceRawValue: params.rawValue,
              splitFromRawValue: routedCandidate.rawValue,
              splitTokenIndex: index,
              termType: routedCandidate.termType,
              termTypeDisplayName: routedTermType.displayName,
              valueKind: routedTermType.valueKind,
              rawValue: routedCandidate.rawValue,
              reason: routedCandidate.reason,
              evidence: {
                ...(params.evidence && typeof params.evidence === "object"
                  ? (params.evidence as Record<string, unknown>)
                  : {}),
                ...routedCandidate.evidence,
                ...(routedCandidate.termType !== termType || routedCandidate.source
                  ? {
                      sourceRawValue: params.rawValue,
                      routedFromTermType: termType,
                      routedBy:
                        routedCandidate.source ?? "plastic_material_residual_classifier",
                    }
                  : {}),
              },
              confidence: routedCandidate.confidence,
            });
        if (valueCandidate) {
          firstValueCandidate ??= valueCandidate;
          if (routedCandidate.termType === termType) {
            pendingUnmatchedTokens.push(routedCandidate.rawValue);
          }
        }

        warnings.push({
          type: valueCandidate
            ? routedCandidate.warningType
            : params.suppressValueCandidate
              ? "value_candidate_suppressed"
              : "value_candidate_previously_rejected",
          message: valueCandidate
            ? routedCandidate.termType === termType
              ? `以下值未匹配字典：${routedCandidate.rawValue}，是否创建为新标准值？`
              : `塑料原料残片 ${routedCandidate.rawValue} 已转为 ${routedTermType.displayName} 候选`
            : params.suppressValueCandidate
              ? `备注再解析值 ${routedCandidate.rawValue} 未命中字典，已跳过自动生成 value candidate`
              : `字段值候选 ${routedCandidate.rawValue} 此前已被拒绝，已跳过重新生成候选`,
          rawValue: params.rawValue,
          termType: routedCandidate.warningTermType,
          source:
            routedCandidate.termType !== termType || routedCandidate.source
              ? routedCandidate.source ?? "material_residual_classifier"
              : undefined,
        });
      }
    }

    const materialSuffix = result.materialPrefixSplit?.suffixRawValue?.trim();
    if (
      termType === "plastic_material" &&
      materialSuffix &&
      params.suppressValueCandidate !== true
    ) {
      const suffixRoute = classifyPlasticMaterialResidual(materialSuffix);
      let suffixHandledAsApplication = false;
      if (suffixRoute.action === "suppress") {
        warnings.push({
          type: "plastic_material_residual_suppressed",
          message: suffixRoute.message,
          rawValue: params.rawValue,
          termType,
          source: "material_residual_classifier",
        });
      } else {
        const suffixCandidates =
          suffixRoute.action === "route"
            ? suffixRoute.candidates.filter(
                (candidate) => candidate.termType !== "plastic_material",
              )
            : (() => {
                const applicationRawValue =
                  cleanApplicationCandidateValue(materialSuffix);
                if (
                  !applicationRawValue ||
                  isMaterialApplicationResidualNoise(applicationRawValue)
                ) {
                  return [];
                }
                return [
                  {
                    termType: "application",
                    rawValue: applicationRawValue,
                    reason: "plastic_material_prefix_suffix_application_candidate",
                    confidence: 0.72,
                    warningType: "plastic_material_prefix_split_applied",
                    warningTermType: "application",
                    evidence: undefined,
                  },
                ];
              })();

        for (const suffixCandidate of suffixCandidates) {
          const targetTermType = this.cache.termTypeMap.get(suffixCandidate.termType);
          if (!targetTermType) continue;
          const suffixMatch = await this.matchValue({
            termType: suffixCandidate.termType,
            rawValue: suffixCandidate.rawValue,
          });
          if (suffixMatch.matched) {
            if (suffixCandidate.termType === "application") {
              suffixHandledAsApplication = true;
            }
            continue;
          }
          const valueCandidate = await this.createValueCandidate({
            documentId: params.documentId,
            extractionResultId: params.extractionResultId,
            itemIndex: params.itemIndex,
            sourceProductType: params.itemProductTypeHint,
            sourceRawValue: params.rawValue,
            splitFromRawValue: suffixCandidate.rawValue,
            termType: suffixCandidate.termType,
            termTypeDisplayName: targetTermType.displayName,
            valueKind: targetTermType.valueKind,
            rawValue: suffixCandidate.rawValue,
            reason:
              suffixCandidate.reason === "plastic_material_residual_application_candidate"
                ? "plastic_material_prefix_suffix_application_candidate"
                : suffixCandidate.reason,
            evidence: {
              ...(params.evidence && typeof params.evidence === "object"
                ? (params.evidence as Record<string, unknown>)
                : {}),
              ...suffixCandidate.evidence,
              sourceRawValue: params.rawValue,
              matchedMaterialTokens: result.materialPrefixSplit?.matchedMaterialTokens,
              suffixCandidateTermType: suffixCandidate.termType,
              suffixRawValue: suffixCandidate.rawValue,
              routedBy: "plastic_material_residual_classifier",
            },
            confidence: suffixCandidate.confidence,
          });
          if (valueCandidate) {
            firstValueCandidate ??= valueCandidate;
            if (suffixCandidate.termType === "application") {
              suffixHandledAsApplication = true;
            }
          }
        }
      }
      warnings.push({
        type: "plastic_material_prefix_split_applied",
        message: suffixHandledAsApplication
          ? "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀"
          : "塑料原料字段含产品/应用描述，已提取明确材料前缀并跳过非应用后缀候选",
        rawValue: params.rawValue,
        termType,
        source: "material_prefix_split",
      });
    } else if (result.materialPrefixSplit) {
      warnings.push({
        type: "plastic_material_prefix_split_applied",
        message: "塑料原料字段含产品/应用描述，已提取明确材料前缀",
        rawValue: params.rawValue,
        termType,
        source: "material_prefix_split",
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
      materialPrefixSplit: result.materialPrefixSplit,
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
    const valueCandidate = params.suppressValueCandidate
      ? null
      : await this.createValueCandidate({
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
            : params.suppressValueCandidate
              ? "value_candidate_suppressed"
              : "value_candidate_previously_rejected",
          message: valueCandidate
            ? "字段名对应多个标准字段，但字段值未命中，请人工确认"
            : params.suppressValueCandidate
              ? "备注再解析字段未命中字典值，已跳过自动生成 value candidate"
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

  private async normalizeNumberUnitField(
    params: NormalizeFieldParams,
    termTypeMatch: TermTypeMatchResult,
    termType: string,
    valueKind: DictionaryValueKind,
  ): Promise<NormalizedFieldResult> {
    const numberUnit = normalizeNumberUnit(
      params.rawValue,
      this.cache.unitAliasMap,
    );
    if (numberUnit.numberKind === "none") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: termTypeMatch.normalizedFieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
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
    let unitCandidate: DictionaryUnitCandidate | undefined;
    if (numberUnit.unitRaw && !numberUnit.unitCanonical) {
      unitCandidate = await this.createUnitCandidate({
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        termType,
        rawValue: params.rawValue,
        rawUnit: numberUnit.unitRaw,
        normalizedRawUnit: numberUnit.normalizedUnitRaw ?? "",
        proposedCanonicalUnit: numberUnit.normalizedUnitRaw,
        reason: "unit_alias_no_match",
        evidence: params.evidence,
      });
    }
    const trailingSplit = this.resolveNumberUnitTrailingSplit({
      numberUnit,
      itemProductTypeHint: normalizeProductTypeHintForMatch(
        params.itemProductTypeHint,
      ),
    });
    const trailingTermTypeCandidate = trailingSplit
      ? await this.createTermTypeCandidate({
          documentId: params.documentId,
          extractionResultId: params.extractionResultId,
          itemIndex: params.itemIndex,
          sourceProductType: params.itemProductTypeHint,
          rawFieldName: trailingSplit.rawFieldName,
          rawValue: trailingSplit.rawValue,
          proposedTermType: trailingSplit.proposedTermType,
          ignoreRejected: true,
          reason: trailingSplit.proposedTermType
            ? "number_unit_trailing_split_candidate"
            : "number_unit_trailing_split_needs_review",
          evidence: {
            ...(params.evidence && typeof params.evidence === "object"
              ? params.evidence
              : {}),
            sourceRawValue: params.rawValue,
            sourceTermType: termType,
          },
        })
      : null;

    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: termTypeMatch.normalizedFieldName,
      rawValue: params.rawValue,
      normalizedValue: numberUnit.normalizedValue,
      termType,
      candidateTermTypes:
        termTypeMatch.termTypes.length > 1 ? termTypeMatch.termTypes : undefined,
      valueKind,
      matchMethod: "term_type_only",
      itemIndex: params.itemIndex,
      itemProductTypeHint: normalizeProductTypeHintForMatch(
        params.itemProductTypeHint,
      ),
      numberUnit,
      unitCandidate,
      termTypeCandidate: trailingTermTypeCandidate ?? undefined,
      warnings: numberUnit.warnings.map((warning) => ({
        type: warning,
        message:
          warning === "unit_alias_no_match"
            ? "单位未命中字典 alias，请审核单位写法"
            : "number_unit 解析存在异常，请人工确认",
        rawValue: params.rawValue,
        termType,
      })),
    };
  }

  private resolveNumberUnitTrailingSplit(params: {
    numberUnit: ReturnType<typeof normalizeNumberUnit>;
    itemProductTypeHint?: string;
  }): { rawFieldName: string; rawValue: string; proposedTermType?: string } | undefined {
    const rawFieldName = String(params.numberUnit.trailingFieldName ?? "").trim();
    const rawValue = String(params.numberUnit.trailingRawValue ?? "").trim();
    if (!rawFieldName || !rawValue) {
      return undefined;
    }

    const proposedTermType = this.proposeTrailingSplitTermType({
      rawFieldName,
      itemProductTypeHint: params.itemProductTypeHint,
    });
    if (!proposedTermType && !isExplicitNumberUnitSplitField(rawFieldName)) {
      return undefined;
    }

    return {
      rawFieldName,
      rawValue,
      proposedTermType,
    };
  }

  private proposeTrailingSplitTermType(params: {
    rawFieldName: string;
    itemProductTypeHint?: string;
  }): string | undefined {
    const normalized = this.normalizeText(params.rawFieldName);
    const candidates: Record<string, string> = {
      "\u5f00\u53e3": "lower_lip_gap",
      "\u5f00\u6863": "lower_lip_gap",
      "\u4e0b\u6a21\u5507\u5f00\u6863": "lower_lip_gap",
    };
    const termType = candidates[normalized];
    if (
      termType &&
      this.cache.termTypeMap.has(termType) &&
      this.isTermTypeApplicableToProduct(termType, params.itemProductTypeHint)
    ) {
      return termType;
    }
    return undefined;
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

type PlasticMaterialResidualRoute =
  | {
      action: "candidate";
      rawValue: string;
    }
  | {
      action: "route";
      candidates: Array<{
        termType: string;
        rawValue: string;
        reason: string;
        confidence?: number;
        warningType: string;
        warningTermType: string;
        source?: string;
        evidence?: Record<string, unknown>;
      }>;
    }
  | {
      action: "suppress";
      message: string;
      warningType?: string;
      source?: string;
    };

function classifyEnumResidual(
  termType: string,
  rawValue: string,
): PlasticMaterialResidualRoute {
  if (termType === "plastic_material") {
    return classifyPlasticMaterialResidual(rawValue);
  }
  if (termType === "application") {
    return classifyApplicationMaterialPrefixResidual(rawValue);
  }
  return { action: "candidate", rawValue };
}

function classifyApplicationMaterialPrefixResidual(
  rawValue: string,
): PlasticMaterialResidualRoute {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return { action: "suppress", message: "空应用残片已跳过" };

  const alphaPrefixSplit = splitAlphaMaterialPrefix(trimmed);
  if (!alphaPrefixSplit) {
    return { action: "candidate", rawValue: trimmed };
  }

  const applicationPart = extractApplicationPrefixFromMaterialResidual(
    alphaPrefixSplit.suffix,
  );
  const applicationRawValue = applicationPart?.application ?? alphaPrefixSplit.suffix;
  if (!isApplicationLikeMaterialSuffix(applicationRawValue)) {
    return { action: "candidate", rawValue: trimmed };
  }

  return {
    action: "route",
    candidates: [
      {
        termType: "plastic_material",
        rawValue: alphaPrefixSplit.material,
        reason: "application_material_prefix_material_candidate",
        confidence: 0.82,
        warningType: "application_material_prefix_split_applied",
        warningTermType: "plastic_material",
        source: "application_material_prefix_split",
        evidence: {
          sourceRawValue: trimmed,
          materialPart: alphaPrefixSplit.material,
          applicationLikePart: applicationRawValue,
          residualPart: applicationPart?.residual,
          splitRule: "application_material_prefix_split",
        },
      },
      {
        termType: "application",
        rawValue: applicationRawValue,
        reason: "application_material_prefix_application_candidate",
        confidence: 0.74,
        warningType: "application_material_prefix_split_applied",
        warningTermType: "application",
        source: "application_material_prefix_split",
        evidence: {
          sourceRawValue: trimmed,
          materialPart: alphaPrefixSplit.material,
          applicationLikePart: applicationRawValue,
          residualPart: applicationPart?.residual,
          splitRule: "application_material_prefix_split",
        },
      },
    ],
  };
}

function classifyPlasticMaterialResidual(
  rawValue: string,
): PlasticMaterialResidualRoute {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return { action: "suppress", message: "空塑料原料残片已跳过" };

  const parts = splitPlasticMaterialResidualParts(trimmed);
  if (parts.length > 1) {
    const routed: Extract<PlasticMaterialResidualRoute, { action: "route" }>["candidates"] =
      [];
    const keptCandidates: string[] = [];
    const suppressed: string[] = [];
    for (const part of parts) {
      const classified = classifyPlasticMaterialResidual(part);
      if (classified.action === "route") {
        routed.push(...classified.candidates);
      } else if (classified.action === "candidate") {
        keptCandidates.push(classified.rawValue);
      } else {
        suppressed.push(part);
      }
    }
    if (routed.length > 0) {
      return {
        action: "route",
        candidates: dedupePlasticMaterialResidualRoutes(routed),
      };
    }
    if (keptCandidates.length > 0) {
      return { action: "candidate", rawValue: keptCandidates.join("、") };
    }
    return {
      action: "suppress",
      message: `塑料原料残片 ${trimmed} 已拆分为非材料说明并跳过：${suppressed.join("、")}`,
    };
  }

  const normalized = normalizeText(trimmed);
  const applicationPart = extractApplicationPrefixFromMaterialResidual(trimmed);
  const applicationCandidate = applicationPart
    ? cleanApplicationCandidateValue(applicationPart.application)
    : null;
  if (
    applicationCandidate &&
    !isMaterialApplicationResidualNoise(applicationCandidate)
  ) {
    return {
      action: "route",
      candidates: [
        {
          termType: "application",
          rawValue: applicationCandidate,
          reason: "plastic_material_residual_application_candidate",
          confidence: 0.72,
          warningType: "plastic_material_residual_routed",
          warningTermType: "application",
          source: "plastic_material_residual_classifier",
          evidence: {
            sourceRawValue: trimmed,
            applicationLikePart: applicationCandidate,
            residualPart: applicationPart?.residual,
            splitRule: "plastic_material_residual_classifier",
          },
        },
      ],
    };
  }

  if (
    isPlasticMaterialResidualNoise(normalized) ||
    isPlasticMaterialModifierLike(normalized) ||
    isMaterialApplicationResidualNoise(trimmed)
  ) {
    return {
      action: "suppress",
      message: `塑料原料残片 ${trimmed} 更像工艺、参数或结构说明，已跳过 plastic_material 候选`,
    };
  }

  const alphaPrefixSplit = splitAlphaMaterialPrefix(trimmed);
  if (alphaPrefixSplit && isApplicationLikeMaterialSuffix(alphaPrefixSplit.suffix)) {
    const applicationRawValue = cleanApplicationCandidateValue(
      alphaPrefixSplit.suffix,
    );
    if (!applicationRawValue || isMaterialApplicationResidualNoise(applicationRawValue)) {
      return {
        action: "suppress",
        message: `塑料原料残片 ${trimmed} 更像工艺、参数或结构说明，已跳过 application 候选`,
      };
    }
    return {
      action: "route",
      candidates: [
        {
          termType: "plastic_material",
          rawValue: alphaPrefixSplit.material,
          reason: "plastic_material_residual_material_prefix_candidate",
          confidence: 0.82,
          warningType: "enums_unmatched_token",
          warningTermType: "plastic_material",
          source: "plastic_material_residual_classifier",
          evidence: {
            sourceRawValue: trimmed,
            materialPart: alphaPrefixSplit.material,
            applicationLikePart: alphaPrefixSplit.suffix,
            splitRule: "plastic_material_residual_classifier",
          },
        },
        {
          termType: "application",
          rawValue: applicationRawValue,
          reason: "plastic_material_residual_application_candidate",
          confidence: 0.72,
          warningType: "plastic_material_residual_routed",
          warningTermType: "application",
          source: "plastic_material_residual_classifier",
          evidence: {
            sourceRawValue: trimmed,
            materialPart: alphaPrefixSplit.material,
            applicationLikePart: applicationRawValue,
            splitRule: "plastic_material_residual_classifier",
          },
        },
      ],
    };
  }

  if (isApplicationLikeMaterialSuffix(normalized)) {
    const applicationRawValue = cleanApplicationCandidateValue(trimmed);
    if (!applicationRawValue || isMaterialApplicationResidualNoise(applicationRawValue)) {
      return {
        action: "suppress",
        message: `塑料原料残片 ${trimmed} 更像工艺、参数或结构说明，已跳过 application 候选`,
      };
    }
    return {
      action: "route",
      candidates: [
        {
          termType: "application",
          rawValue: applicationRawValue,
          reason: "plastic_material_residual_application_candidate",
          confidence: 0.72,
          warningType: "plastic_material_residual_routed",
          warningTermType: "application",
        },
      ],
    };
  }

  return { action: "candidate", rawValue: trimmed };
}

function splitPlasticMaterialResidualParts(rawValue: string): string[] {
  return rawValue
    .split(/[、，,;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupePlasticMaterialResidualRoutes(
  candidates: Extract<PlasticMaterialResidualRoute, { action: "route" }>["candidates"],
) {
  const seen = new Set<string>();
  const result: typeof candidates = [];
  for (const candidate of candidates) {
    const key = `${candidate.termType}:${normalizeText(candidate.rawValue)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function splitAlphaMaterialPrefix(
  rawValue: string,
): { material: string; suffix: string } | null {
  const compact = rawValue.trim();
  const match = compact.match(/^([A-Za-z][A-Za-z0-9-]{1,12})([\u4e00-\u9fff].+)$/u);
  if (!match?.[1] || !match[2]) return null;
  return {
    material: match[1],
    suffix: match[2].trim(),
  };
}

function isApplicationLikeMaterialSuffix(value: string): boolean {
  const compact = normalizeText(value);
  if (!compact) return false;
  return /(中空格子板|保鲜膜|膜上涂覆胶水|片材模头|板材模头|流延膜自动模头|自动流延模头|自动模头|防水卷材|车衣膜|透气膜|降解膜|流延膜|淋膜|流延|涂覆|薄膜|片材|板材|管材|型材|生产线|挤出线|模头|膜|板)$/.test(
    compact,
  );
}

function cleanApplicationCandidateValue(value: string): string | null {
  let cleaned = String(value ?? "").trim();
  if (!cleaned) return null;

  cleaned = cleaned
    .replace(/^[（(]\s*|\s*[）)]$/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  const stopMatch = cleaned.match(
    /^(.*?)(?:[（(]?(?:正常使用)?产量|工艺温度|温度|原料及回收料|及回收料|回收料|含[0-9]*(?:%|％)?填充料|含填充料|填充料|比例|重量比|配比|可参考|按|厚度|格子宽度|共[0-9一二三四五六七八九十]+套|[0-9一二三四五六七八九十]+套|说明|备注)/u,
  );
  if (stopMatch?.[1]) {
    cleaned = stopMatch[1].trim();
  }

  cleaned = cleaned
    .replace(/^含?[0-9]+(?:\.[0-9]+)?(?:%|％)?(?:钙粉|碳酸钙|滑石粉|填料|填充料|填充|色母|母粒|助剂)?/iu, "")
    .replace(/^(?:原料|塑料原料|适用原料|适用塑料原料)[:：]?/u, "")
    .replace(/^(?:及回收料|回收料|含填充料|填充料|填充|钙粉|碳酸钙|滑石粉|助剂|色母|母粒)+/u, "")
    .replace(/^模头[、，,:：-]?(?:适用|适用于|用于)?/u, "")
    .replace(/^(?:适用|适用于|用于)/u, "")
    .replace(/^(?:PP|PE|PET|PVC|PC|PS|ABS|POM|EVA|POE|CPE|CPP|PBT|PA|TPU|TPE|TPR|PLA|PVA|ASA|PMMA|LDPE|HDPE|LLDPE)+/iu, "")
    .replace(/(?:PP|PE|PET|PVC|PC|PS|ABS|POM|EVA|POE|CPE|CPP|PBT|PA|TPU|TPE|TPR|PLA|PVA|ASA|PMMA|LDPE|HDPE|LLDPE)+$/iu, "")
    .replace(/(?:自动模头|手动模头|流延模头|衣架式模头|模头)$/u, "")
    .replace(/^(?:自动|手动)(?=流延|透气|薄膜|片材|板材|膜|板)/u, "")
    .replace(/[，,、;；:：.。]+$/u, "")
    .trim();

  if (!cleaned || isMaterialApplicationResidualNoise(cleaned)) return null;
  return cleaned;
}

function extractApplicationPrefixFromMaterialResidual(
  rawValue: string,
): { application: string; residual?: string } | null {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return null;

  const match =
    trimmed.match(
      /^(保鲜膜|中空格子板|膜上涂覆胶水|防水卷材|热收缩膜|电池隔膜|车衣膜|透气膜|降解膜|流延膜|淋膜|流延|发泡|涂覆|薄膜|片材|板材|管材|型材)(.*)$/u,
    ) ??
    trimmed.match(
      /^(.+?(?:中空格子板|保鲜膜|防水卷材|热收缩膜|电池隔膜|车衣膜|透气膜|降解膜|流延膜|淋膜|薄膜|片材|板材|管材|型材|自动模头|手动模头|模头|生产线|挤出线))(.*)$/u,
    );
  const application = match?.[1]?.trim();
  const residual = match?.[2]?.trim();
  if (!application || !residual) return null;
  if (!/[（(]|既要|兼顾|说明|备注|工艺|温度|产量|挤出机|规格|重量比|熔指|共[0-9一二三四五六七八九十]+套|为主|等/u.test(residual)) {
    return null;
  }

  return {
    application,
    residual: residual.replace(/^[（(]\s*|\s*[）)]$/g, "").trim() || residual,
  };
}

function isMaterialApplicationResidualNoise(value: string): boolean {
  const compact = normalizeText(value);
  if (!compact) return true;
  if (/^(?:适用塑料原料|塑料原料|适用原料|原料)$/.test(compact)) {
    return true;
  }
  if (/^(?:自动|手动)$/.test(compact)) {
    return true;
  }
  if (/^[0-9]+(?:\.[0-9]+)?(?:%|％|mm|cm|m|kg|公斤|度|℃|c|mpa|pa)?$/i.test(compact)) {
    return true;
  }
  return /(?:客户|需方|供方|图纸|签名|确认|提供|存档|备注|注明|要求|工艺温度|正常使用产量|产量|每小时|密度|线速度|熔指|检测|分析|按.*加工|按.*设计)/u.test(
    value,
  );
}

function isPlasticMaterialResidualNoise(value: string): boolean {
  const compact = normalizeText(value);
  if (!compact) return true;
  if (/^(?:分|等|为主|第三套|共?[一二三四五六七八九十0-9]+套|第[一二三四五六七八九十0-9]+套)$/.test(compact)) {
    return true;
  }
  return /(线速度|密度|工作压力|压力|工艺温度|温度|产量|kg|每小时|左右每小时|发泡倍率|倍率|螺杆|挤出机|挤出机规格|锥双|单螺杆|原料重量比|重量比|熔指|mfr|g10min|图纸|签名|日期|安装孔|螺丝孔|螺纹套|冷却循环孔|冷却|液压|防护|紧固|区域|配打)/.test(
    compact,
  );
}

function isPlasticMaterialModifierLike(value: string): boolean {
  const compact = normalizeText(value);
  if (!compact) return true;
  if (/^(?:石墨|助剂|填料|多种填料|滑石粉|碳酸钙|钙粉|淀粉|玉米淀粉|色母|母粒|填充|添加剂)$/.test(compact)) {
    return true;
  }
  return /(滑石粉|碳酸钙|钙粉|淀粉|填料|助剂|添加剂|色母|母粒|填充|共挤)$/.test(
    compact,
  );
}
