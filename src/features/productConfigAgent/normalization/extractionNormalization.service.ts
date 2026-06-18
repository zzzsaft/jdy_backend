import { DataSource } from "typeorm";
import { DictionaryCandidateOccurrence } from "../dictionary/entity/index.js";
import { SplitResolution } from "../dictionary/entity/splitResolution.entity.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import {
  isProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataService,
  sourceForModelTermType,
  type ProductConfigAgentModelTermType,
} from "../masterData.service.js";
import type {
  LlmExtractionItem,
  LlmExtractionResult,
  LlmRawField,
} from "../extraction/types.js";
import { resolveItemProductTypeHint } from "./productTypeRouting.js";
import { normalizeDocInfo } from "../archive/utils/docInfo.js";
import {
  createBaseField,
  hasSplitFields,
  isBlankValue,
  isExplicitUnselectedOption,
  isOriginalRetainedField,
  isUnknownValue,
  manualSplitKey,
  manualSplitValueKey,
  stringifyOptionalId,
} from "./splitFields.js";
import type {
  DictionaryExtractionField,
  DictionaryExtractionItem,
  DictionaryExtractionResult,
  DictionaryExtractionWarning,
} from "./types.js";
import { createWarning, mapDictionaryWarnings } from "./warnings.js";
import {
  applyStructuredFieldLabels,
  getRawFieldProductTypeRedirect,
  mergeNumberUnitPartFields,
  mergeRangeBoundFields,
  moveRawFieldToDocumentInfo,
  parseIndexedInstanceFieldName,
  parseNumberUnitPartFieldName,
  parseRangeBoundFieldName,
  splitFieldToSelectionAwareRawField,
} from "./rules/index.js";
import { NormalizationRuleRegistry } from "../dictionary/normalizationRuleRegistry.js";

type IndexedInstanceGroup = {
  baseFieldName: string;
  fields: Array<{
    rawField: LlmRawField;
    sourceFieldName: string;
    instanceIndex: number;
  }>;
};

const MODEL_TERM_TYPE_FIELD_NAMES: Record<ProductConfigAgentModelTermType, string> = {
  filter_model: "\u8fc7\u6ee4\u5668\u578b\u53f7",
  metering_pump_model: "\u8ba1\u91cf\u6cf5\u578b\u53f7",
};

const ATTRIBUTE_MATCH_PRODUCT_TYPES: Record<
  string,
  ProductConfigAgentModelTermType
> = {
  filter: "filter_model",
  metering_pump: "metering_pump_model",
};

function productTypeValue(item: LlmExtractionItem): string {
  return String(item.product_type_hint?.value ?? item.item_type_hint?.value ?? "unknown");
}

function nextUnusedItemIndex(usedIndexes: Set<number>): number {
  let next = 1;
  while (usedIndexes.has(next)) {
    next += 1;
  }
  usedIndexes.add(next);
  return next;
}

function indexedFieldGroups(rawFields: LlmRawField[]): {
  groups: IndexedInstanceGroup[];
  ungrouped: LlmRawField[];
  instanceIndexes: number[];
} {
  const groupsByBase = new Map<string, IndexedInstanceGroup>();
  const ungrouped: LlmRawField[] = [];
  const instanceIndexes = new Set<number>();

  for (const rawField of rawFields) {
    const parsed = parseIndexedInstanceFieldName(rawField.field_name);
    if (!parsed) {
      ungrouped.push(rawField);
      continue;
    }

    instanceIndexes.add(parsed.instanceIndex);
    const group =
      groupsByBase.get(parsed.baseFieldName) ??
      {
        baseFieldName: parsed.baseFieldName,
        fields: [],
      };
    group.fields.push({
      rawField,
      sourceFieldName: rawField.field_name,
      instanceIndex: parsed.instanceIndex,
    });
    groupsByBase.set(parsed.baseFieldName, group);
  }

  return {
    groups: [...groupsByBase.values()],
    ungrouped,
    instanceIndexes: [...instanceIndexes].sort((a, b) => a - b),
  };
}

function isContiguousFromOne(indexes: number[]): boolean {
  if (indexes.length < 2 || indexes[0] !== 1) {
    return false;
  }
  return indexes.every((index, offset) => index === offset + 1);
}

function indexedInstanceEvidence(params: {
  productType: string;
  parentItemIndex: number;
  assignedItemIndexes?: number[];
  instanceIndexes: number[];
  groups: IndexedInstanceGroup[];
  confidenceReason: string;
}) {
  return {
    productType: params.productType,
    parentItemIndex: params.parentItemIndex,
    assignedItemIndexes: params.assignedItemIndexes,
    instanceIndexes: params.instanceIndexes,
    baseFieldNames: params.groups.map((group) => group.baseFieldName),
    sourceFieldNames: params.groups.flatMap((group) =>
      group.fields.map((field) => field.sourceFieldName),
    ),
    rawValues: Object.fromEntries(
      params.groups.map((group) => [
        group.baseFieldName,
        group.fields.map((field) => ({
          sourceFieldName: field.sourceFieldName,
          instanceIndex: field.instanceIndex,
          value: field.rawField.value,
        })),
      ]),
    ),
    confidenceReason: params.confidenceReason,
  };
}

function rawFieldFromSplitField(
  rawField: LlmRawField,
  splitField: NonNullable<LlmRawField["split_fields"]>[number],
): LlmRawField {
  return {
    field_name: splitField.field_name,
    value: splitField.value,
    selected: splitField.selected,
    raw_text: splitField.raw_text ?? rawField.raw_text,
    evidence: splitField.evidence ?? rawField.evidence,
    confidence: splitField.confidence ?? rawField.confidence,
  };
}

function normalizeContextualLipGapRawField(params: {
  rawField: LlmRawField;
  itemRawFields: LlmRawField[];
  itemProductTypeHint: string;
}): LlmRawField {
  if (params.itemProductTypeHint !== "flat_die") {
    return params.rawField;
  }

  const fieldName = String(params.rawField.field_name ?? "").trim();
  const rawValue = String(params.rawField.value ?? "").trim();
  if (!fieldName || !rawValue) {
    return params.rawField;
  }

  const setName = parseLipSetName(fieldName) ?? parseLipSetName(rawValue);
  if (!setName) {
    return params.rawField;
  }

  const compactFieldName = fieldName.replace(/\s+/g, "");
  const hasExplicitLipMeaning =
    /模唇.*(?:厚度|开口|间隙)|开口尺寸|自然开口/.test(compactFieldName);
  const hasContext = hasExplicitLipMeaning ||
    itemHasLipGapContext(params.itemRawFields);
  if (!hasContext) {
    return params.rawField;
  }

  return {
    ...params.rawField,
    field_name: `${setName}模唇厚度`,
    value: extractLipGapValue(rawValue) ?? rawValue,
    evidence: NormalizationRuleRegistry.mergeSignalsIntoEvidence(
      params.rawField.evidence,
      [
        NormalizationRuleRegistry.signal("contextual_lip_gap_rewrite", {
          confidence: 0.82,
          before: {
            fieldName,
            value: rawValue,
          },
          after: {
            fieldName: `${setName}模唇厚度`,
            value: extractLipGapValue(rawValue) ?? rawValue,
          },
        }),
      ],
    ),
  };
}

function parseLipSetName(value: string): string | null {
  const compact = String(value ?? "").replace(/\s+/g, "");
  const match = compact.match(/(第?[一二三四五六七八九十0-9]+)(?:套|Sheet)/i);
  if (!match) {
    return null;
  }
  return `${match[1].startsWith("第") ? match[1] : `第${match[1]}`}套`;
}

function extractLipGapValue(value: string): string | null {
  const raw = String(value ?? "").trim();
  const parenMatch = raw.match(/[（(]\s*([^）)]+?)\s*[）)]/);
  if (parenMatch?.[1]) {
    return parenMatch[1].trim();
  }

  const numberUnitMatch = raw.match(/[0-9]+(?:\.[0-9]+)?\s*(?:mm|毫米)/i);
  return numberUnitMatch?.[0]?.trim() ?? null;
}

function itemHasLipGapContext(rawFields: LlmRawField[]): boolean {
  const context = rawFields
    .flatMap((field) => [
      field.field_name,
      field.value,
      field.raw_text,
      typeof field.evidence === "object" && field.evidence !== null
        ? (field.evidence as Record<string, unknown>).text
        : undefined,
    ])
    .map((value) => String(value ?? ""))
    .join("\n")
    .replace(/\s+/g, "");

  if (
    /模唇数量|模唇厚度调节范围|模唇.*开口|开口尺寸|自然开口|配[0-9一二三四五六七八九十]+根模唇/.test(
      context,
    )
  ) {
    return true;
  }

  return /模唇/.test(context) && /第?[一二三四五六七八九十0-9]+套|配[0-9一二三四五六七八九十]+根|开口/.test(context);
}

function distributeUngroupedFields(params: {
  ungrouped: LlmRawField[];
  instanceCount: number;
}): LlmRawField[][] {
  const perInstance = Array.from(
    { length: params.instanceCount },
    () => [] as LlmRawField[],
  );
  const copiedFields: LlmRawField[] = [];
  const repeatedFieldGroups = new Map<string, LlmRawField[]>();

  for (const rawField of params.ungrouped) {
    if (Array.isArray(rawField.split_fields) && rawField.split_fields.length) {
      const splitGroups = new Map<
        string,
        NonNullable<LlmRawField["split_fields"]>
      >();
      for (const splitField of rawField.split_fields) {
        splitGroups.set(splitField.field_name, [
          ...(splitGroups.get(splitField.field_name) ?? []),
          splitField,
        ]);
      }

      const distributedSplitFieldNames = new Set<string>();
      for (const [fieldName, splitFields] of splitGroups.entries()) {
        const rawValues = new Set(splitFields.map((field) => field.value));
        if (splitFields.length !== params.instanceCount || rawValues.size <= 1) {
          continue;
        }
        splitFields.forEach((splitField, index) => {
          perInstance[index].push(rawFieldFromSplitField(rawField, splitField));
        });
        distributedSplitFieldNames.add(fieldName);
      }

      const remainingSplitFields = rawField.split_fields.filter(
        (splitField) => !distributedSplitFieldNames.has(splitField.field_name),
      );
      if (remainingSplitFields.length === rawField.split_fields.length) {
        copiedFields.push(rawField);
      } else if (remainingSplitFields.length > 0) {
        copiedFields.push({
          ...rawField,
          split_fields: remainingSplitFields,
        });
      }
      continue;
    }

    repeatedFieldGroups.set(rawField.field_name, [
      ...(repeatedFieldGroups.get(rawField.field_name) ?? []),
      rawField,
    ]);
  }

  for (const groupFields of repeatedFieldGroups.values()) {
    const rawValues = new Set(groupFields.map((field) => field.value));
    if (groupFields.length === params.instanceCount && rawValues.size > 1) {
      groupFields.forEach((field, index) => {
        perInstance[index].push(field);
      });
    } else {
      copiedFields.push(...groupFields);
    }
  }

  return perInstance.map((fields) => [...fields, ...copiedFields]);
}

function splitIndexedInstanceItems(params: {
  items: LlmExtractionItem[];
  warnings: NonNullable<LlmExtractionResult["warnings"]>;
}): LlmExtractionItem[] {
  const usedIndexes = new Set(
    params.items
      .map((item) => Number(item.item_index))
      .filter((itemIndex) => Number.isFinite(itemIndex)),
  );
  const result: LlmExtractionItem[] = [];

  for (const item of params.items) {
    const { groups, ungrouped, instanceIndexes } = indexedFieldGroups(
      item.raw_fields ?? [],
    );
    const hasIndexedFields = groups.some((group) => group.fields.length > 0);
    const canSplit =
      hasIndexedFields &&
      isContiguousFromOne(instanceIndexes) &&
      groups.some((group) => group.fields.length >= 2);

    if (!hasIndexedFields) {
      result.push(item);
      continue;
    }

    const productType = productTypeValue(item);
    if (!canSplit) {
      params.warnings.push({
        type: "possible_indexed_instance_fields_needs_review",
        message:
          "字段名包含实例尾号，但序号不连续或证据不足，未自动拆分 item",
        evidence: indexedInstanceEvidence({
          productType,
          parentItemIndex: item.item_index,
          instanceIndexes,
          groups,
          confidenceReason:
            instanceIndexes.length < 2
              ? "only one indexed instance was detected"
              : "instance indexes are not a contiguous 1..N sequence",
        }),
      });
      result.push(item);
      continue;
    }

    const assignedItemIndexes = instanceIndexes.map((instanceIndex, offset) => {
      if (offset === 0) {
        return item.item_index;
      }
      return nextUnusedItemIndex(usedIndexes);
    });
    params.warnings.push({
      type: "item_instance_split_from_indexed_fields",
      message: "字段名尾号形成连续多实例配置，已拆分为多个同产品 item",
      evidence: indexedInstanceEvidence({
        productType,
        parentItemIndex: item.item_index,
        assignedItemIndexes,
        instanceIndexes,
        groups,
        confidenceReason:
          "indexed field suffixes form a contiguous 1..N sequence with repeated base fields",
      }),
    });
    const ungroupedFieldsByInstance = distributeUngroupedFields({
      ungrouped,
      instanceCount: instanceIndexes.length,
    });

    for (const [offset, instanceIndex] of instanceIndexes.entries()) {
      const rawFields = groups.flatMap((group) =>
        group.fields
          .filter((field) => field.instanceIndex === instanceIndex)
          .map((field) => ({
            ...field.rawField,
            field_name: group.baseFieldName,
          })),
      );
      result.push({
        ...item,
        item_index: assignedItemIndexes[offset],
        raw_fields: [...rawFields, ...ungroupedFieldsByInstance[offset]],
      });
    }
  }

  return result;
}

export class ExtractionNormalizationService {
  private readonly masterDataService: ProductConfigAgentMasterDataService;
  private readonly hasExplicitMasterDataService: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly dictionaryService: DictionaryService,
    masterDataService?: ProductConfigAgentMasterDataService,
  ) {
    this.hasExplicitMasterDataService = Boolean(masterDataService);
    this.masterDataService =
      masterDataService ?? new ProductConfigAgentMasterDataService(dataSource);
  }

  async normalizeExtraction(params: {
    llmResult: LlmExtractionResult;
    documentId?: string | number;
    extractionResultId?: string | number;
  }): Promise<DictionaryExtractionResult> {
    const items: DictionaryExtractionItem[] = [];
    const warnings: DictionaryExtractionWarning[] = [];
    let rawFieldCount = 0;
    let dictionaryMatchedCount = 0;
    let valueCandidateCount = 0;
    let termTypeCandidateCount = 0;
    let splitResolutionCount = 0;
    let rewrittenFieldCount = 0;
    const documentInfo = normalizeDocInfo(
      params.llmResult.extraction.document_info,
    );
    const manualSplitMap = new Map<string, LlmRawField["split_fields"]>();
    const manualSplitValueKeys = new Set<string>();
    const productTypeOptions =
      await this.dictionaryService.getProductTypeOptions();
    const productTypeMap = new Map(
      productTypeOptions.map((item) => [item.canonicalValue, item]),
    );
    const llmWarningsForPreprocess =
      (params.llmResult.warnings ??= []);
    const preprocessedItems = splitIndexedInstanceItems({
      items: params.llmResult.extraction.items,
      warnings: llmWarningsForPreprocess,
    });
    const itemRoutes = preprocessedItems.map((item) => ({
      item,
      route: resolveItemProductTypeHint({ item, productTypeMap }),
    }));
    const flatDieRoute = itemRoutes.find(
      (item) => item.route.itemProductTypeHint === "flat_die",
    );
    const hydraulicStationRoute = itemRoutes.find(
      (item) => item.route.itemProductTypeHint === "hydraulic_station",
    );
    const itemsByIndex = new Map<number, DictionaryExtractionItem>();
    const pendingRedirectedFields = new Map<
      number,
      DictionaryExtractionField[]
    >();

    if (params.documentId && params.extractionResultId) {
      const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
      const extractionResultId = stringifyOptionalId(params.extractionResultId);
      const manualSplits = await splitResolutionRepo.find({
        where: { extractionResultId, source: "candidate_review" },
      });
      for (const split of manualSplits) {
        manualSplitMap.set(
          manualSplitKey({
            itemIndex: split.itemIndex,
            fieldName: split.rawFieldName,
            rawValue: split.rawValue,
          }),
          Array.isArray(split.splitFields)
            ? (split.splitFields as LlmRawField["split_fields"])
            : [],
        );
        manualSplitValueKeys.add(
          manualSplitValueKey({
            itemIndex: split.itemIndex,
            rawValue: split.rawValue,
          }),
        );
      }
      await splitResolutionRepo.delete({
        extractionResultId,
        source: "llm_extract",
      });
    }

    for (const { item, route } of itemRoutes) {
      warnings.push(...route.warnings);
      rawFieldCount += item.raw_fields.length;
      const fields: DictionaryExtractionField[] =
        pendingRedirectedFields.get(item.item_index) ?? [];
      pendingRedirectedFields.delete(item.item_index);
      const rewrittenRawFields: LlmRawField[] = [];

      for (const originalRawField of item.raw_fields) {
        const rawField = normalizeContextualLipGapRawField({
          rawField: originalRawField,
          itemRawFields: item.raw_fields,
          itemProductTypeHint: route.itemProductTypeHint,
        });

        if (moveRawFieldToDocumentInfo(documentInfo, rawField)) {
          continue;
        }

        const manualSplitFields = manualSplitMap.get(
          manualSplitKey({
            itemIndex: item.item_index,
            fieldName: rawField.field_name,
            rawValue: rawField.value,
          }),
        );
        if (
          !manualSplitFields &&
          manualSplitValueKeys.has(
            manualSplitValueKey({
              itemIndex: item.item_index,
              rawValue: rawField.value,
            }),
          )
        ) {
          const originalField = createBaseField(rawField);
          originalField.dictionary.note =
            "同一原始值已有人工拆分，原字段仅保留作追溯";
          originalField.warnings.push(
            createWarning({
              type: "split_original_retained",
              message: "同一原始值已有人工拆分，已跳过重复候选生成",
              itemIndex: item.item_index,
              fieldName: rawField.field_name,
              rawValue: rawField.value,
              evidence: rawField.evidence,
            }),
          );
          warnings.push(...originalField.warnings);
          fields.push(originalField);
          rewrittenRawFields.push({
            ...rawField,
            _original: true,
          } as LlmRawField);
          continue;
        }
        const rawFieldWithManualSplit =
          manualSplitFields && manualSplitFields.length > 0
            ? { ...rawField, split_fields: manualSplitFields }
            : rawField;
        const rawFieldsToNormalize = await this.expandRawField({
          rawField: rawFieldWithManualSplit,
          itemRawFields: item.raw_fields,
          itemProductTypeHint: route.itemProductTypeHint,
          itemIndex: item.item_index,
          documentId: stringifyOptionalId(params.documentId),
          extractionResultId: stringifyOptionalId(params.extractionResultId),
          fields,
          warnings,
        });
        splitResolutionCount += rawFieldsToNormalize.splitResolutionCount;
        rewrittenRawFields.push(...rawFieldsToNormalize.rewrittenRawFields);

        for (const normalizedRawField of rawFieldsToNormalize.fieldsToNormalize) {
          const nestedManualSplitFields = manualSplitMap.get(
            manualSplitKey({
              itemIndex: item.item_index,
              fieldName: normalizedRawField.field_name,
              rawValue: normalizedRawField.value,
            }),
          );
          const nestedRawFieldsToNormalize =
            nestedManualSplitFields && nestedManualSplitFields.length > 0
              ? await this.expandRawField({
                  rawField: {
                    ...normalizedRawField,
                    split_fields: nestedManualSplitFields,
                  },
                  itemRawFields: item.raw_fields,
                  itemProductTypeHint: route.itemProductTypeHint,
                  itemIndex: item.item_index,
                  documentId: stringifyOptionalId(params.documentId),
                  extractionResultId: stringifyOptionalId(
                    params.extractionResultId,
                  ),
                  fields,
                  warnings,
                })
              : null;
          if (nestedRawFieldsToNormalize) {
            splitResolutionCount += nestedRawFieldsToNormalize.splitResolutionCount;
            rewrittenRawFields.push(...nestedRawFieldsToNormalize.rewrittenRawFields);
          }

          const fieldsToBuild =
            nestedRawFieldsToNormalize?.fieldsToNormalize ?? [normalizedRawField];
          for (const fieldToBuild of fieldsToBuild) {
            if (moveRawFieldToDocumentInfo(documentInfo, fieldToBuild)) {
              continue;
            }

            const redirectRoute = getRawFieldProductTypeRedirect({
              rawField: fieldToBuild,
              itemIndex: item.item_index,
              itemProductTypeHint: route.itemProductTypeHint,
              flatDieRoute,
              hydraulicStationRoute,
            });
            const field = await this.buildField({
              rawField: fieldToBuild,
              itemIndex: redirectRoute?.item.item_index ?? item.item_index,
              itemProductTypeHint:
                redirectRoute?.route.itemProductTypeHint ??
                route.itemProductTypeHint,
              documentId: stringifyOptionalId(params.documentId),
              extractionResultId: stringifyOptionalId(params.extractionResultId),
            });

            if (field.dictionary.matched) {
              dictionaryMatchedCount += 1;
            }

            if (field.candidate?.candidate_type === "value") {
              valueCandidateCount += 1;
            }

            if (field.candidate?.candidate_type === "term_type") {
              termTypeCandidateCount += 1;
            }

            warnings.push(...field.warnings);
            if (redirectRoute) {
              field.evidence = NormalizationRuleRegistry.mergeSignalsIntoEvidence(
                field.evidence,
                [
                  NormalizationRuleRegistry.signal("product_type_redirect", {
                    confidence: 0.85,
                    before: {
                      itemIndex: item.item_index,
                      productType: route.itemProductTypeHint,
                    },
                    after: {
                      itemIndex: redirectRoute.item.item_index,
                      productType: redirectRoute.route.itemProductTypeHint,
                    },
                  }),
                ],
              );
              const redirectWarning = createWarning({
                type: "field_product_type_redirected",
                message:
                  "字段名指向其它产品配置，已从当前 item 归入同一 extraction 中更匹配的 item",
                itemIndex: item.item_index,
                fieldName: fieldToBuild.field_name,
                rawValue: fieldToBuild.value,
                evidence: fieldToBuild.evidence,
              });
              field.warnings.push(redirectWarning);
              warnings.push(redirectWarning);
              if (itemsByIndex.has(redirectRoute.item.item_index)) {
                itemsByIndex.get(redirectRoute.item.item_index)?.fields.push(field);
              } else {
                const redirectedFields =
                  pendingRedirectedFields.get(redirectRoute.item.item_index) ??
                  [];
                redirectedFields.push(field);
                pendingRedirectedFields.set(
                  redirectRoute.item.item_index,
                  redirectedFields,
                );
              }
            } else {
              fields.push(field);
            }
          }
        }
      }

      rewrittenFieldCount += rewrittenRawFields.length;
      const structuredFields = applyStructuredFieldLabels(fields);
      const numberUnitPartFields = mergeNumberUnitPartFields(
        structuredFields,
        item.item_index,
      );
      const mergedFields = mergeRangeBoundFields(numberUnitPartFields, item.item_index);
      const normalizedItem: DictionaryExtractionItem = {
        item_index: item.item_index,
        item_name: item.item_name?.value,
        item_quantity: item.item_quantity?.value,
        itemProductTypeHint: route.itemProductTypeHint,
        itemProductTypeHintRawValue: route.rawValue,
        itemProductTypeHintDisplayName: route.displayName,
        itemProductTypeHintConfidence: route.confidence,
        warnings: route.warnings,
        fields: mergedFields,
      };
      const masterDataAttributeMatchResult =
        await this.applyMasterDataAttributeMatch(normalizedItem);
      dictionaryMatchedCount +=
        masterDataAttributeMatchResult.dictionaryMatchedCountDelta;
      warnings.push(...masterDataAttributeMatchResult.warnings);
      items.push(normalizedItem);
      itemsByIndex.set(item.item_index, normalizedItem);
    }

    const llmWarnings = (params.llmResult.warnings ?? []).map((warning) =>
      createWarning({
        type: warning.type,
        message: warning.message,
        evidence: warning.evidence,
      }),
    );
    warnings.push(...llmWarnings);
    await this.dictionaryService.flushAliasUsageStats();

    return {
      summary: {
        item_count: items.length,
        raw_field_count: rawFieldCount,
        rewritten_field_count: rewrittenFieldCount,
        split_resolution_count: splitResolutionCount,
        dictionary_matched_count: dictionaryMatchedCount,
        value_candidate_count: valueCandidateCount,
        term_type_candidate_count: termTypeCandidateCount,
        warning_count: warnings.length,
      },
      document_info: documentInfo,
      items,
      warnings,
      raw_llm_result: params.llmResult,
      extraction_json: {
        document_info: documentInfo,
        items: items.map((item) => ({
          item_index: item.item_index,
          item_name: item.item_name,
          item_quantity: item.item_quantity,
          itemProductTypeHint: item.itemProductTypeHint,
          itemProductTypeHintRawValue: item.itemProductTypeHintRawValue,
          itemProductTypeHintDisplayName: item.itemProductTypeHintDisplayName,
          itemProductTypeHintConfidence: item.itemProductTypeHintConfidence,
          masterDataMatch: item.masterDataMatch,
          warnings: item.warnings,
          fields: item.fields.map((field) => ({
            field_name: field.field_name,
            raw_value: field.raw_value,
            selected: field.selected,
            raw_text: field.raw_text,
            evidence: field.evidence,
            confidence: field.llm_confidence,
            dictionary: field.dictionary,
            candidate: field.candidate,
            warnings: field.warnings,
            original:
              field.dictionary.note === "复合字段已拆分，原字段仅保留作追溯",
          })),
        })),
        warnings,
        summary: {
          item_count: items.length,
          raw_field_count: rawFieldCount,
          rewritten_field_count: rewrittenFieldCount,
          split_resolution_count: splitResolutionCount,
          dictionary_matched_count: dictionaryMatchedCount,
          value_candidate_count: valueCandidateCount,
          term_type_candidate_count: termTypeCandidateCount,
          warning_count: warnings.length,
        },
      },
    };
  }

  private async expandRawField(params: {
    rawField: LlmRawField;
    itemRawFields: LlmRawField[];
    itemProductTypeHint: string;
    itemIndex: number;
    documentId?: string;
    extractionResultId?: string;
    fields: DictionaryExtractionField[];
    warnings: DictionaryExtractionWarning[];
  }): Promise<{
    fieldsToNormalize: LlmRawField[];
    rewrittenRawFields: LlmRawField[];
    splitResolutionCount: number;
  }> {
    if (
      isOriginalRetainedField(params.rawField) ||
      !hasSplitFields(params.rawField)
    ) {
      return {
        fieldsToNormalize: isOriginalRetainedField(params.rawField)
          ? []
          : [params.rawField],
        rewrittenRawFields: [params.rawField],
        splitResolutionCount: 0,
      };
    }

    const originalField = createBaseField(params.rawField);
    originalField.dictionary.note = "复合字段已拆分，原字段仅保留作追溯";
    originalField.evidence = NormalizationRuleRegistry.mergeSignalsIntoEvidence(
      originalField.evidence,
      [
        NormalizationRuleRegistry.signal("selection_split", {
          confidence: 0.8,
          before: {
            fieldName: params.rawField.field_name,
            value: params.rawField.value,
          },
          after: params.rawField.split_fields,
        }),
      ],
    );
    originalField.warnings.push(
      createWarning({
        type: "split_original_retained",
        message: "字段值包含多个业务属性，已拆分为独立字段",
        itemIndex: params.itemIndex,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: params.rawField.evidence,
      }),
    );
    params.fields.push(originalField);
    params.warnings.push(...originalField.warnings);

    const splitRawFields: LlmRawField[] = [];
    for (const splitField of params.rawField.split_fields!) {
      const normalizedSplit = splitFieldToSelectionAwareRawField(
        params.rawField,
        splitField,
      );
      if (normalizedSplit.selectionState === "unselected") {
        const warning = createWarning({
          type: "split_unselected_option_dropped",
          message: "拆分字段是未选中选项，已跳过字典匹配",
          itemIndex: params.itemIndex,
          fieldName: splitField.field_name,
          rawValue: splitField.value,
          evidence: splitField.evidence ?? params.rawField.evidence,
        });
        originalField.warnings.push(warning);
        params.warnings.push(warning);
        continue;
      }
      if (normalizedSplit.rawField) {
        splitRawFields.push(
          normalizeContextualLipGapRawField({
            rawField: normalizedSplit.rawField,
            itemRawFields: [params.rawField, ...params.itemRawFields],
            itemProductTypeHint: params.itemProductTypeHint,
          }),
        );
      }
    }
    const originalRawField = {
      ...params.rawField,
      _original: true,
    } as LlmRawField;
    const rewrittenRawFields = [originalRawField, ...splitRawFields];

    if (params.documentId && params.extractionResultId) {
      await this.dataSource.getRepository(SplitResolution).save(
        this.dataSource.getRepository(SplitResolution).create({
          documentId: params.documentId,
          extractionResultId: params.extractionResultId,
          itemIndex: params.itemIndex,
          rawFieldName: params.rawField.field_name,
          rawValue: params.rawField.value,
          rawText: params.rawField.raw_text ?? null,
          splitFields: splitRawFields,
          evidence: params.rawField.evidence ?? null,
          source: "llm_extract",
        }),
      );
    }

    return {
      fieldsToNormalize: splitRawFields,
      rewrittenRawFields,
      splitResolutionCount: 1,
    };
  }

  private async applyMasterDataAttributeMatch(
    item: DictionaryExtractionItem,
  ): Promise<{
    dictionaryMatchedCountDelta: number;
    warnings: DictionaryExtractionWarning[];
  }> {
    if (
      !this.hasExplicitMasterDataService &&
      typeof (this.dataSource as any)?.getRepository !== "function"
    ) {
      return { dictionaryMatchedCountDelta: 0, warnings: [] };
    }

    const termType = ATTRIBUTE_MATCH_PRODUCT_TYPES[item.itemProductTypeHint];
    if (!termType || !isProductConfigAgentModelTermType(termType)) {
      return { dictionaryMatchedCountDelta: 0, warnings: [] };
    }

    const modelFields = item.fields.filter(
      (field) => field.dictionary.term_type === termType,
    );
    if (
      modelFields.some(
        (field) =>
          field.dictionary.masterDataMatch?.matched &&
          field.dictionary.masterDataMatch.matchMethod !==
            "attributes_unique_exact",
      )
    ) {
      return { dictionaryMatchedCountDelta: 0, warnings: [] };
    }

    const attributes = this.collectMasterDataAttributes(item);
    const result = await this.masterDataService.matchModelByAttributes({
      termType,
      attributes,
    });
    if (result.reason === "no_match") {
      return { dictionaryMatchedCountDelta: 0, warnings: [] };
    }

    if (result.masterDataMatch.matched) {
      const targetModelField = modelFields.find(
        (field) => !field.dictionary.masterDataMatch?.matched,
      );
      if (targetModelField) {
        const wasMatched = targetModelField.dictionary.matched;
        targetModelField.dictionary.matched = true;
        targetModelField.dictionary.masterDataMatch = result.masterDataMatch;
        targetModelField.dictionary.normalized_value =
          result.masterDataMatch.model ??
          targetModelField.dictionary.normalized_value;
        targetModelField.warnings = targetModelField.warnings.filter(
          (warning) => warning.type !== "master_data_no_match",
        );
        return {
          dictionaryMatchedCountDelta: wasMatched ? 0 : 1,
          warnings: [],
        };
      }

      item.masterDataMatch = result.masterDataMatch;
      const warning = createWarning({
        type: "master_data_attribute_match_applied",
        message: "型号字段缺失，已用 item 属性唯一匹配 CRM 产品主数据",
        itemIndex: item.item_index,
        termType,
        source: sourceForModelTermType(termType),
        evidence: {
          productType: item.itemProductTypeHint,
          matchedAttributes: result.matchedAttributes,
          masterDataMatch: result.masterDataMatch,
        },
      });
      item.warnings.push(warning);
      return { dictionaryMatchedCountDelta: 0, warnings: [warning] };
    }

    if (
      result.reason !== "multiple_matches" &&
      result.reason !== "insufficient_attributes"
    ) {
      return { dictionaryMatchedCountDelta: 0, warnings: [] };
    }

    const warning = createWarning({
      type: "master_data_attribute_match_needs_review",
      message:
        result.reason === "multiple_matches"
          ? "item 属性匹配到多条 CRM 产品主数据，请人工确认"
          : "item 可用于主数据反推的属性不足，未自动绑定型号",
      itemIndex: item.item_index,
      termType,
      source: sourceForModelTermType(termType),
      evidence: {
        productType: item.itemProductTypeHint,
        reason: result.reason,
        candidateCount: result.candidateCount,
        candidates: result.candidates,
        attributes,
      },
    });
    item.warnings.push(warning);
    return { dictionaryMatchedCountDelta: 0, warnings: [warning] };
  }

  private collectMasterDataAttributes(
    item: DictionaryExtractionItem,
  ): Record<string, string[]> {
    const attributes: Record<string, string[]> = {};
    for (const field of item.fields) {
      const termType = field.dictionary.term_type;
      if (!termType) {
        continue;
      }
      if (field.dictionary.value_kind !== "number_unit" && !field.raw_value) {
        continue;
      }
      attributes[termType] = [
        ...(attributes[termType] ?? []),
        field.raw_value,
      ];
    }
    return attributes;
  }

  private async buildField(params: {
    rawField: LlmRawField;
    itemIndex: number;
    itemProductTypeHint: string;
    documentId?: string;
    extractionResultId?: string;
  }): Promise<DictionaryExtractionField> {
    const field = createBaseField(params.rawField);

    if (isExplicitUnselectedOption(params.rawField)) {
      return field;
    }

    if (isBlankValue(params.rawField.value)) {
      field.warnings.push(
        createWarning({
          type: "empty_value",
          message: "字段值为空，已跳过字典匹配",
          itemIndex: params.itemIndex,
          fieldName: params.rawField.field_name,
          rawValue: params.rawField.value,
          evidence: params.rawField.evidence,
        }),
      );
      return field;
    }

    if (isUnknownValue(params.rawField.value)) {
      field.warnings.push(
        createWarning({
          type: "unknown_value",
          message: "字段值为 UNKNOWN，已跳过字典匹配",
          itemIndex: params.itemIndex,
          fieldName: params.rawField.field_name,
          rawValue: params.rawField.value,
          evidence: params.rawField.evidence,
        }),
      );
      return field;
    }

    const splitValues = hasSplitFields(params.rawField)
      ? params.rawField.split_fields!.map((sf) => sf.value)
      : undefined;

    const rangeBoundField = parseRangeBoundFieldName(params.rawField.field_name);
      const numberUnitPartField = parseNumberUnitPartFieldName(
      params.rawField.field_name,
    );
    const indexedInstanceField = parseIndexedInstanceFieldName(
      params.rawField.field_name,
    );
    const ruleSignals = [
      ...(rangeBoundField
        ? [
            NormalizationRuleRegistry.signal("range_bound_merge", {
              confidence: 0.82,
              evidence: rangeBoundField,
            }),
          ]
        : []),
      ...(numberUnitPartField
        ? [
            NormalizationRuleRegistry.signal("number_unit_part_merge", {
              confidence: 0.82,
              evidence: numberUnitPartField,
            }),
          ]
        : []),
      ...(indexedInstanceField
        ? [
            NormalizationRuleRegistry.signal("indexed_instance_normalized", {
              confidence: 0.9,
              evidence: indexedInstanceField,
            }),
          ]
        : []),
    ];
    const normalized = await this.dictionaryService.normalizeField({
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex: params.itemIndex,
      itemProductTypeHint: params.itemProductTypeHint,
      fieldName:
        rangeBoundField?.baseFieldName ??
        numberUnitPartField?.baseFieldName ??
        indexedInstanceField?.baseFieldName ??
        params.rawField.field_name,
      rawValue: params.rawField.value,
      splitRawValues: splitValues,
      evidence: NormalizationRuleRegistry.mergeSignalsIntoEvidence(
        params.rawField.evidence,
        ruleSignals,
      ),
    });

    field.dictionary = {
      matched: normalized.matched,
      field_matched: normalized.fieldMatched,
      normalized_field_name: normalized.normalizedFieldName,
      normalized_value: normalized.normalizedValue,
      term_type: normalized.termType,
      candidate_term_types: normalized.candidateTermTypes,
      canonical_value: normalized.canonicalValue,
      display_name: normalized.displayName,
      confidence: normalized.confidence,
      risk_level: normalized.riskLevel,
      note: normalized.note,
      value_kind: normalized.valueKind,
      values: normalized.values?.map((v) => ({
        canonicalValue: v.canonicalValue,
        displayName: v.displayName,
        rawValue: v.rawValue,
        confidence: v.confidence,
      })),
      masterDataMatch: normalized.masterDataMatch,
      number_unit: normalized.numberUnit,
      match_method:
        normalized.matchMethod ?? (normalized.matched ? "alias_exact" : "none"),
    };

    if (indexedInstanceField) {
      const warning = createWarning({
        type: "indexed_instance_field_normalized",
        message: "字段名末尾数字按同类 item 实例序号处理，字典匹配使用基础字段名",
        itemIndex: params.itemIndex,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: {
          baseFieldName: indexedInstanceField.baseFieldName,
          instanceIndex: indexedInstanceField.instanceIndex,
        },
      });
      field.warnings.push(warning);
    }

    const suppressIndexedInstanceTermTypeCandidate = Boolean(
      indexedInstanceField && normalized.termTypeCandidate,
    );

    if (normalized.termTypeCandidate && !suppressIndexedInstanceTermTypeCandidate) {
      field.candidate = {
        candidate_type: "term_type",
        candidate_id: normalized.termTypeCandidate.id,
        raw_field_name: normalized.termTypeCandidate.rawFieldName,
        source_product_type: normalized.termTypeCandidate.sourceProductType,
        item_index: normalized.termTypeCandidate.itemIndex ?? undefined,
        status: normalized.termTypeCandidate.status,
      };
      await this.recordOccurrence({
        candidateType: "term_type",
        candidateId: normalized.termTypeCandidate.id,
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: params.itemProductTypeHint,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: params.rawField.evidence,
      });
    }

    if (normalized.valueCandidate) {
      field.candidate = {
        candidate_type: "value",
        candidate_id: normalized.valueCandidate.id,
        term_type: normalized.valueCandidate.termType,
        raw_value: normalized.valueCandidate.rawValue,
        source_product_type: normalized.valueCandidate.sourceProductType,
        item_index: normalized.valueCandidate.itemIndex ?? undefined,
        status: normalized.valueCandidate.status,
      };
      await this.recordOccurrence({
        candidateType: "value",
        candidateId: normalized.valueCandidate.id,
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: params.itemProductTypeHint,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: params.rawField.evidence,
      });
    }

    if (normalized.unitCandidate) {
      field.candidate = {
        candidate_type: "unit",
        candidate_id: normalized.unitCandidate.id,
        term_type: normalized.unitCandidate.termType ?? undefined,
        raw_value: normalized.unitCandidate.rawValue,
        raw_unit: normalized.unitCandidate.rawUnit,
        status: normalized.unitCandidate.status,
      };
    }

    field.warnings.push(...mapDictionaryWarnings(normalized, params.itemIndex));

    if (
      normalized.termTypeCandidate &&
      !suppressIndexedInstanceTermTypeCandidate &&
      !field.warnings.some(
        (warning) =>
          warning.type === "term_type_no_match" ||
          warning.type === "term_type_not_applicable_to_product",
      )
    ) {
      field.warnings.push(
        createWarning({
          type: "term_type_no_match",
          message: "字段名未命中字典，已创建字段名候选",
          itemIndex: params.itemIndex,
          fieldName: normalized.rawFieldName,
          rawValue: normalized.rawValue,
          evidence: params.rawField.evidence,
        }),
      );
    }

    if (
      normalized.valueCandidate &&
      !field.warnings.some((warning) => warning.type === "value_no_match")
    ) {
      field.warnings.push(
        createWarning({
          type: "value_no_match",
          message: "字段值未命中字典，已创建字段值候选",
          itemIndex: params.itemIndex,
          fieldName: normalized.rawFieldName,
          rawValue: normalized.rawValue,
          termType: normalized.valueCandidate.termType,
          evidence: params.rawField.evidence,
        }),
      );
    }

    return field;
  }

  private async recordOccurrence(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    documentId?: string;
    extractionResultId?: string;
    itemIndex: number;
    sourceProductType?: string;
    fieldName: string;
    rawValue?: string;
    evidence?: unknown;
  }): Promise<void> {
    if (!params.documentId || !params.extractionResultId) {
      return;
    }

    const occurrenceRepo =
      this.dataSource.getRepository(DictionaryCandidateOccurrence);

    await occurrenceRepo.upsert(
      occurrenceRepo.create({
        candidateType: params.candidateType,
        candidateId: params.candidateId,
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        sourceProductType: params.sourceProductType ?? "unknown",
        fieldName: params.fieldName,
        rawValue: params.rawValue ?? null,
        evidence: params.evidence ?? null,
      }) as unknown as Parameters<typeof occurrenceRepo.upsert>[0],
      [
        "candidateType",
        "candidateId",
        "extractionResultId",
        "itemIndex",
        "fieldName",
      ],
    );
  }
}

export { ExtractionNormalizationService as DictionaryExtractionService };
