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
import { detectQualifierConcept } from "../dictionary/qualifierConcept.js";
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
  DictionaryExtractionProfile,
  DictionaryExtractionResult,
  DictionaryExtractionWarning,
} from "./types.js";
import { createWarning, mapDictionaryWarnings } from "./warnings.js";
import {
  applyStructuredFieldLabels,
  applyQualifier,
  consolidateQualifiedTermType,
  deriveHeatingConfigField,
  applyRoughness,
  applyVoltageComposite,
  createExtractionNote,
  expandBothMoldQualifier,
  getRawFieldProductTypeRedirect,
  isCustomerNoteFieldName,
  mergeNumberUnitPartFields,
  mergeRangeBoundFields,
  normalizeStandaloneVoltagePart,
  moveRawFieldToDocumentInfo,
  parseIndexedInstanceFieldName,
  parseNumberUnitPartFieldName,
  parseRangeBoundFieldName,
  reparseCustomerNote,
  splitThermocoupleAndPressureHoleField,
  splitLayerConfigCompositeField,
  groupLayerExtruderConfigFields,
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

type OccurrenceBufferRow = {
  candidateType: "term_type" | "value";
  candidateId: string;
  documentId: string;
  extractionResultId: string;
  itemIndex: number;
  sourceProductType: string;
  fieldName: string;
  rawValue: string | null;
  evidence: unknown | null;
};

type SplitResolutionBufferRow = {
  documentId: string;
  extractionResultId: string;
  itemIndex: number;
  rawFieldName: string;
  rawValue: string;
  rawText: string | null;
  splitFields: LlmRawField[];
  evidence: unknown | null;
  source: "llm_extract";
};

type NormalizationProfileAccumulator = Omit<
  DictionaryExtractionProfile,
  "enabled" | "totalMs"
> & {
  enabled: boolean;
  startedAt: number;
};

function createNormalizationProfile(): NormalizationProfileAccumulator {
  return {
    enabled: isNormalizationProfileEnabled(),
    startedAt: Date.now(),
    dictionaryCacheWarmMs: 0,
    productTypeOptionsMs: 0,
    manualSplitLoadMs: 0,
    manualSplitDeleteMs: 0,
    expandRawFieldMs: 0,
    splitResolutionSaveMs: 0,
    buildFieldMs: 0,
    dictionaryNormalizeMs: 0,
    recordOccurrenceMs: 0,
    masterDataAttributeMatchMs: 0,
    flushAliasUsageStatsMs: 0,
    fieldsBuilt: 0,
    occurrencesRecorded: 0,
    splitResolutionsSaved: 0,
  };
}

function disabledNormalizationProfile(): NormalizationProfileAccumulator {
  return {
    ...createNormalizationProfile(),
    enabled: false,
  };
}

function isNormalizationProfileEnabled(): boolean {
  const raw = process.env.QUOTE_AGENT_NORMALIZE_PROFILE;
  return raw === "1" || raw?.toLowerCase() === "true";
}

async function measureProfile<T>(
  profile: NormalizationProfileAccumulator,
  key: keyof Omit<
    DictionaryExtractionProfile,
    "enabled" | "totalMs" | "fieldsBuilt" | "occurrencesRecorded" | "splitResolutionsSaved"
  >,
  fn: () => Promise<T>,
): Promise<T> {
  if (!profile.enabled) return fn();
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    profile[key] += Date.now() - startedAt;
  }
}

function finalizeProfile(
  profile: NormalizationProfileAccumulator,
): DictionaryExtractionProfile | undefined {
  if (!profile.enabled) return undefined;
  return {
    enabled: true,
    totalMs: Date.now() - profile.startedAt,
    dictionaryCacheWarmMs: profile.dictionaryCacheWarmMs,
    productTypeOptionsMs: profile.productTypeOptionsMs,
    manualSplitLoadMs: profile.manualSplitLoadMs,
    manualSplitDeleteMs: profile.manualSplitDeleteMs,
    expandRawFieldMs: profile.expandRawFieldMs,
    splitResolutionSaveMs: profile.splitResolutionSaveMs,
    buildFieldMs: profile.buildFieldMs,
    dictionaryNormalizeMs: profile.dictionaryNormalizeMs,
    recordOccurrenceMs: profile.recordOccurrenceMs,
    masterDataAttributeMatchMs: profile.masterDataAttributeMatchMs,
    flushAliasUsageStatsMs: profile.flushAliasUsageStatsMs,
    fieldsBuilt: profile.fieldsBuilt,
    occurrencesRecorded: profile.occurrencesRecorded,
    splitResolutionsSaved: profile.splitResolutionsSaved,
  };
}

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
    qualifier: splitField.qualifier ?? rawField.qualifier,
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

  const lipSet = parseLipSetInstance(fieldName) ?? parseLipSetInstance(rawValue);
  if (!lipSet) {
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
    field_name: "模唇厚度",
    value: extractLipGapValue(rawValue) ?? rawValue,
    qualifier: {
      area: "lip",
      instanceIndex: lipSet.instanceIndex,
      sourceText: params.rawField.qualifier?.sourceText ?? lipSet.sourceText,
      ...params.rawField.qualifier,
    },
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
            fieldName: "模唇厚度",
            value: extractLipGapValue(rawValue) ?? rawValue,
            qualifier: {
              area: "lip",
              instanceIndex: lipSet.instanceIndex,
              sourceText: lipSet.sourceText,
            },
          },
        }),
      ],
    ),
  };
}

function parseLipSetInstance(value: string): {
  instanceIndex: number;
  sourceText: string;
} | null {
  const compact = String(value ?? "").replace(/\s+/g, "");
  const match = compact.match(/(第?[一二三四五六七八九十0-9]+)(?:套|Sheet)/i);
  if (!match) {
    return null;
  }
  const instanceIndex = parseChineseInteger(match[1].replace(/^第/, ""));
  if (!instanceIndex) {
    return null;
  }
  return {
    instanceIndex,
    sourceText: match[0],
  };
}

function parseChineseInteger(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] ?? 1 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[value];
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

function appendCustomerNote(
  documentInfo: Record<string, unknown>,
  note: NonNullable<DictionaryExtractionItem["notes_raw"]>[number],
): void {
  const existing = Array.isArray(documentInfo.customer_notes)
    ? documentInfo.customer_notes
    : [];
  documentInfo.customer_notes = [...existing, note];
}

function resolveCustomerNoteFieldConflicts(params: {
  fields: DictionaryExtractionField[];
  itemIndex: number;
  warnings: DictionaryExtractionWarning[];
}): DictionaryExtractionField[] {
  const mainFields = params.fields.filter(
    (field) => field.source !== "customer_note_reparse",
  );
  const result: DictionaryExtractionField[] = [];

  for (const field of params.fields) {
    if (field.source !== "customer_note_reparse") {
      result.push(field);
      continue;
    }

    const conflictingField = mainFields.find(
      (mainField) =>
        mainField.dictionary.term_type &&
        mainField.dictionary.term_type === field.dictionary.term_type &&
        (mainField.qualifier?.position ?? "") ===
          (field.qualifier?.position ?? "") &&
        (mainField.qualifier?.area ?? "") === (field.qualifier?.area ?? "") &&
        (mainField.qualifier?.layer ?? "") === (field.qualifier?.layer ?? "") &&
        (mainField.qualifier?.layerIndex ?? "") ===
          (field.qualifier?.layerIndex ?? "") &&
        (mainField.qualifier?.instanceIndex ?? "") ===
          (field.qualifier?.instanceIndex ?? "") &&
        comparableValue(mainField) !== comparableValue(field),
    );
    if (!conflictingField) {
      result.push(field);
      continue;
    }

    const warning: DictionaryExtractionWarning = {
      type: "customer_note_config_conflict",
      message: "备注中发现的疑似配置与主配置字段冲突，已保留主配置字段",
      item_index: params.itemIndex,
      field_name: field.field_name,
      raw_value: field.raw_value,
      term_type: field.dictionary.term_type,
      source: "customer_note_reparse",
      evidence: {
        noteField: {
          fieldName: field.field_name,
          rawValue: field.raw_value,
          qualifier: field.qualifier,
        },
        mainField: {
          fieldName: conflictingField.field_name,
          rawValue: conflictingField.raw_value,
          qualifier: conflictingField.qualifier,
        },
      },
    };
    field.warnings.push(warning);
    params.warnings.push(warning);
  }

  return result;
}

function comparableValue(field: DictionaryExtractionField): string {
  return String(
    field.dictionary.canonical_value ??
      field.dictionary.normalized_value ??
      field.raw_value ??
      "",
  )
    .trim()
    .toLowerCase();
}

function normalizeQualifierRawField(rawField: LlmRawField): LlmRawField {
  const qualifierConcept = detectQualifierConcept({
    fieldName: rawField.field_name,
    rawValue: rawField.value,
    evidence: rawField.evidence,
  });
  if (
    !qualifierConcept ||
    !qualifierConcept.qualifier ||
    !qualifierConcept.baseFieldName ||
    qualifierConcept.baseFieldName === rawField.field_name
  ) {
    return rawField;
  }

  return {
    ...rawField,
    field_name: qualifierConcept.baseFieldName,
    qualifier: {
      ...qualifierConcept.qualifier,
      ...rawField.qualifier,
      sourceText:
        rawField.qualifier?.sourceText ??
        qualifierConcept.qualifier.sourceText ??
        qualifierConcept.sourceText,
    },
    evidence: NormalizationRuleRegistry.mergeSignalsIntoEvidence(
      {
        ...(rawField.evidence && typeof rawField.evidence === "object" && !Array.isArray(rawField.evidence)
          ? (rawField.evidence as Record<string, unknown>)
          : rawField.evidence === undefined || rawField.evidence === null
            ? {}
            : { sourceEvidence: rawField.evidence }),
        originalFieldName: rawField.field_name,
        baseFieldName: qualifierConcept.baseFieldName,
        matchedQualifierAlias: qualifierConcept.matchedQualifierAlias,
        qualifierKey: qualifierConcept.qualifierKey,
        qualifierKind: qualifierConcept.qualifierKind,
        qualifierRule: qualifierConcept.rule,
        rule: qualifierConcept.rule,
        qualifier: {
          ...qualifierConcept.qualifier,
          ...rawField.qualifier,
        },
        qualifierSourceText:
          qualifierConcept.qualifier.sourceText ?? qualifierConcept.sourceText,
      },
      [
        NormalizationRuleRegistry.signal("structured_qualifier_normalized", {
          confidence: 0.86,
          before: { fieldName: rawField.field_name },
          after: {
            fieldName: qualifierConcept.baseFieldName,
            qualifier: {
              ...qualifierConcept.qualifier,
              ...rawField.qualifier,
            },
          },
        }),
      ],
    ),
  };
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
    const profile = createNormalizationProfile();
    const occurrenceBuffer = new Map<string, OccurrenceBufferRow>();
    const splitResolutionBuffer: SplitResolutionBufferRow[] = [];
    const dictionaryCacheReady = measureProfile(
      profile,
      "dictionaryCacheWarmMs",
      () =>
        typeof this.dictionaryService.ensureCacheFresh === "function"
          ? this.dictionaryService.ensureCacheFresh()
          : Promise.resolve(),
    );
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
    const productTypeOptions = await measureProfile(
      profile,
      "productTypeOptionsMs",
      () => this.dictionaryService.getProductTypeOptions(),
    );
    await dictionaryCacheReady;
    const productTypeMap = new Map(
      productTypeOptions.map((item) => [item.canonicalValue, item]),
    );
    const llmWarningsForPreprocess =
      (params.llmResult.warnings ??= []);
    const preprocessedItems = splitIndexedInstanceItems({
      items: params.llmResult.extraction.items,
      warnings: llmWarningsForPreprocess,
    }).map((item) => ({
      ...item,
      raw_fields: groupLayerExtruderConfigFields(item.raw_fields),
    }));
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
      const manualSplits = await measureProfile(profile, "manualSplitLoadMs", () =>
        splitResolutionRepo.find({
          where: { extractionResultId, source: "candidate_review" },
        }),
      );
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
      await measureProfile(profile, "manualSplitDeleteMs", () =>
        splitResolutionRepo.delete({
          extractionResultId,
          source: "llm_extract",
        }),
      );
    }

    for (const { item, route } of itemRoutes) {
      warnings.push(...route.warnings);
      rawFieldCount += item.raw_fields.length;
      const fields: DictionaryExtractionField[] =
        pendingRedirectedFields.get(item.item_index) ?? [];
      const notesRaw: DictionaryExtractionItem["notes_raw"] = [];
      pendingRedirectedFields.delete(item.item_index);
      const rewrittenRawFields: LlmRawField[] = [];

      for (const originalRawField of item.raw_fields) {
        const rawField = normalizeContextualLipGapRawField({
          rawField: originalRawField,
          itemRawFields: item.raw_fields,
          itemProductTypeHint: route.itemProductTypeHint,
        });

        if (isCustomerNoteFieldName(rawField.field_name)) {
          const note = createExtractionNote({
            rawField,
            itemIndex: item.item_index,
            documentId: stringifyOptionalId(params.documentId),
            extractionResultId: stringifyOptionalId(params.extractionResultId),
          });
          notesRaw.push(note);
          appendCustomerNote(documentInfo, note);
          const reparsedFields = reparseCustomerNote(rawField);
          rewrittenRawFields.push(rawField, ...reparsedFields);
          for (const reparsedField of reparsedFields) {
            const builtFields = await this.buildFieldWithDerivedFields({
              rawField: reparsedField,
              itemIndex: item.item_index,
              itemProductTypeHint: route.itemProductTypeHint,
              documentId: stringifyOptionalId(params.documentId),
              extractionResultId: stringifyOptionalId(params.extractionResultId),
              source: "customer_note_reparse",
              requiresReview: true,
              trustLevel: reparsedField.confidence >= 0.7 ? "medium" : "low",
              suppressValueCandidate: true,
              profile,
              occurrenceBuffer,
            });
            for (const field of builtFields) {
              if (field.dictionary.matched) {
                dictionaryMatchedCount += 1;
              }
              if (field.candidate?.candidate_type === "term_type") {
                termTypeCandidateCount += 1;
              }
              warnings.push(...field.warnings);
              fields.push(field);
            }
          }
          continue;
        }

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
        const rawFieldsToNormalize = await measureProfile(
          profile,
          "expandRawFieldMs",
          () => this.expandRawField({
            rawField: rawFieldWithManualSplit,
            itemRawFields: item.raw_fields,
            itemProductTypeHint: route.itemProductTypeHint,
            itemIndex: item.item_index,
            documentId: stringifyOptionalId(params.documentId),
            extractionResultId: stringifyOptionalId(params.extractionResultId),
            fields,
            warnings,
            profile,
            splitResolutionBuffer,
          }),
        );
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
              ? await measureProfile(profile, "expandRawFieldMs", () =>
                  this.expandRawField({
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
                    profile,
                    splitResolutionBuffer,
                  }),
                )
              : null;
          if (nestedRawFieldsToNormalize) {
            splitResolutionCount += nestedRawFieldsToNormalize.splitResolutionCount;
            rewrittenRawFields.push(...nestedRawFieldsToNormalize.rewrittenRawFields);
          }

          const fieldsToBuild =
            nestedRawFieldsToNormalize?.fieldsToNormalize ?? [normalizedRawField];
          for (const fieldToBuild of fieldsToBuild) {
            if (isCustomerNoteFieldName(fieldToBuild.field_name)) {
              const note = createExtractionNote({
                rawField: fieldToBuild,
                itemIndex: item.item_index,
                documentId: stringifyOptionalId(params.documentId),
                extractionResultId: stringifyOptionalId(params.extractionResultId),
              });
              notesRaw.push(note);
              appendCustomerNote(documentInfo, note);
              const reparsedFields = reparseCustomerNote(fieldToBuild);
              rewrittenRawFields.push(...reparsedFields);
              for (const reparsedField of reparsedFields) {
                const builtFields = await this.buildFieldWithDerivedFields({
                  rawField: reparsedField,
                  itemIndex: item.item_index,
                  itemProductTypeHint: route.itemProductTypeHint,
                  documentId: stringifyOptionalId(params.documentId),
                  extractionResultId: stringifyOptionalId(params.extractionResultId),
                  source: "customer_note_reparse",
                  requiresReview: true,
                  trustLevel: reparsedField.confidence >= 0.7 ? "medium" : "low",
                  suppressValueCandidate: true,
                  profile,
                  occurrenceBuffer,
                });
                for (const field of builtFields) {
                  if (field.dictionary.matched) {
                    dictionaryMatchedCount += 1;
                  }
                  if (field.candidate?.candidate_type === "term_type") {
                    termTypeCandidateCount += 1;
                  }
                  warnings.push(...field.warnings);
                  fields.push(field);
                }
              }
              continue;
            }

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
            const builtFields = await this.buildFieldWithDerivedFields({
              rawField: fieldToBuild,
              itemIndex: redirectRoute?.item.item_index ?? item.item_index,
              itemProductTypeHint:
                redirectRoute?.route.itemProductTypeHint ??
                route.itemProductTypeHint,
              documentId: stringifyOptionalId(params.documentId),
              extractionResultId: stringifyOptionalId(params.extractionResultId),
              profile,
              occurrenceBuffer,
            });

            for (const field of builtFields) {
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
        notes_raw: notesRaw.length ? notesRaw : undefined,
        fields: resolveCustomerNoteFieldConflicts({
          fields: mergedFields,
          itemIndex: item.item_index,
          warnings,
        }),
      };
      const masterDataAttributeMatchResult = await measureProfile(
        profile,
        "masterDataAttributeMatchMs",
        () => this.applyMasterDataAttributeMatch(normalizedItem),
      );
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
    await this.flushSplitResolutionBuffer(splitResolutionBuffer, profile);
    await this.flushOccurrenceBuffer(occurrenceBuffer, profile);
    await measureProfile(profile, "flushAliasUsageStatsMs", () =>
      this.dictionaryService.flushAliasUsageStats(),
    );

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
      profile: finalizeProfile(profile),
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
          notes_raw: item.notes_raw,
          fields: item.fields.map((field) => ({
            field_name: field.field_name,
            raw_value: field.raw_value,
            selected: field.selected,
            raw_text: field.raw_text,
            evidence: field.evidence,
            confidence: field.llm_confidence,
            source: field.source,
            requires_review: field.requires_review,
            trust_level: field.trust_level,
            qualifier: field.qualifier,
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
    profile?: NormalizationProfileAccumulator;
    splitResolutionBuffer?: SplitResolutionBufferRow[];
  }): Promise<{
    fieldsToNormalize: LlmRawField[];
    rewrittenRawFields: LlmRawField[];
    splitResolutionCount: number;
  }> {
    const layerSplitFields = hasSplitFields(params.rawField)
      ? []
      : splitLayerConfigCompositeField(params.rawField);
    if (layerSplitFields.length > 0) {
      return this.expandRawField({
        ...params,
        rawField: {
          ...params.rawField,
          split_fields: layerSplitFields,
        },
      });
    }

    const holeSplitFields = hasSplitFields(params.rawField)
      ? []
      : splitThermocoupleAndPressureHoleField(params.rawField);
    if (holeSplitFields.length > 0) {
      return this.expandRawField({
        ...params,
        rawField: {
          ...params.rawField,
          split_fields: holeSplitFields,
        },
      });
    }

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
      const row: SplitResolutionBufferRow = {
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
        itemIndex: params.itemIndex,
        rawFieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        rawText: params.rawField.raw_text ?? null,
        splitFields: splitRawFields,
        evidence: params.rawField.evidence ?? null,
        source: "llm_extract",
      };
      if (params.splitResolutionBuffer) {
        params.splitResolutionBuffer.push(row);
      } else {
        const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
        await measureProfile(
          params.profile ?? disabledNormalizationProfile(),
          "splitResolutionSaveMs",
          () => splitResolutionRepo.save(splitResolutionRepo.create(row)),
        );
        if (params.profile?.enabled) {
          params.profile.splitResolutionsSaved += 1;
        }
      }
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
    source?: string;
    requiresReview?: boolean;
    trustLevel?: "low" | "medium" | "high";
    suppressValueCandidate?: boolean;
    profile?: NormalizationProfileAccumulator;
    occurrenceBuffer?: Map<string, OccurrenceBufferRow>;
  }): Promise<DictionaryExtractionField> {
    const buildStartedAt = Date.now();
    params.profile && (params.profile.fieldsBuilt += 1);
    const finishBuildProfile = () => {
      if (params.profile?.enabled) {
        params.profile.buildFieldMs += Date.now() - buildStartedAt;
      }
    };
    const rawField = normalizeQualifierRawField(params.rawField);
    const field = createBaseField(rawField);
    field.source = params.source;
    field.requires_review = params.requiresReview;
    field.trust_level = params.trustLevel;

    if (isExplicitUnselectedOption(rawField)) {
      finishBuildProfile();
      return field;
    }

    if (isBlankValue(rawField.value)) {
      field.warnings.push(
        createWarning({
          type: "empty_value",
          message: "字段值为空，已跳过字典匹配",
          itemIndex: params.itemIndex,
          fieldName: rawField.field_name,
          rawValue: rawField.value,
          evidence: rawField.evidence,
        }),
      );
      finishBuildProfile();
      return field;
    }

    if (isUnknownValue(rawField.value)) {
      field.warnings.push(
        createWarning({
          type: "unknown_value",
          message: "字段值为 UNKNOWN，已跳过字典匹配",
          itemIndex: params.itemIndex,
          fieldName: rawField.field_name,
          rawValue: rawField.value,
          evidence: rawField.evidence,
        }),
      );
      finishBuildProfile();
      return field;
    }

    const splitValues = hasSplitFields(rawField)
      ? rawField.split_fields!.map((sf) => sf.value)
      : undefined;

    const standaloneVoltagePart = normalizeStandaloneVoltagePart(rawField);
    if (standaloneVoltagePart) {
      field.dictionary = {
        matched: true,
        field_matched: true,
        normalized_field_name: standaloneVoltagePart.normalizedFieldName,
        normalized_value: standaloneVoltagePart.normalizedValue,
        term_type: standaloneVoltagePart.termType,
        canonical_value: standaloneVoltagePart.canonicalValue,
        display_name: standaloneVoltagePart.displayName,
        value_kind: standaloneVoltagePart.valueKind,
        number_unit: standaloneVoltagePart.numberUnit,
        match_method: "term_type_only",
      };
      consolidateQualifiedTermType(field);
      applyQualifier(field);
      applyRoughness(field);
      finishBuildProfile();
      return field;
    }

    const rangeBoundField = parseRangeBoundFieldName(rawField.field_name);
    const numberUnitPartField = parseNumberUnitPartFieldName(
      rawField.field_name,
    );
    const indexedInstanceField = parseIndexedInstanceFieldName(
      rawField.field_name,
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
    const normalized = await measureProfile(
      params.profile ?? disabledNormalizationProfile(),
      "dictionaryNormalizeMs",
      () =>
        this.dictionaryService.normalizeField({
          documentId: params.documentId,
          extractionResultId: params.extractionResultId,
          itemIndex: params.itemIndex,
          itemProductTypeHint: params.itemProductTypeHint,
          fieldName:
            rangeBoundField?.baseFieldName ??
            numberUnitPartField?.baseFieldName ??
            indexedInstanceField?.baseFieldName ??
            rawField.field_name,
          rawValue: rawField.value,
          splitRawValues: splitValues,
          evidence: NormalizationRuleRegistry.mergeSignalsIntoEvidence(
            rawField.evidence,
            ruleSignals,
          ),
          suppressValueCandidate: params.suppressValueCandidate,
        }),
    );

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
      material_prefix_split: normalized.materialPrefixSplit,
      match_method:
        normalized.matchMethod ?? (normalized.matched ? "alias_exact" : "none"),
    };

    if (indexedInstanceField) {
      const warning = createWarning({
        type: "indexed_instance_field_normalized",
        message: "字段名末尾数字按同类 item 实例序号处理，字典匹配使用基础字段名",
        itemIndex: params.itemIndex,
        fieldName: rawField.field_name,
        rawValue: rawField.value,
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
        fieldName: rawField.field_name,
        rawValue: rawField.value,
        evidence: rawField.evidence,
        profile: params.profile,
        occurrenceBuffer: params.occurrenceBuffer,
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
        fieldName: rawField.field_name,
        rawValue: rawField.value,
        evidence: rawField.evidence,
        profile: params.profile,
        occurrenceBuffer: params.occurrenceBuffer,
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
          evidence: rawField.evidence,
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
          evidence: rawField.evidence,
        }),
      );
    }

    consolidateQualifiedTermType(field);
    applyQualifier(field);
    applyRoughness(field);

    finishBuildProfile();
    return field;
  }

  private async buildFieldWithDerivedFields(params: {
    rawField: LlmRawField;
    itemIndex: number;
    itemProductTypeHint: string;
    documentId?: string;
    extractionResultId?: string;
    source?: string;
    requiresReview?: boolean;
    trustLevel?: "low" | "medium" | "high";
    suppressValueCandidate?: boolean;
    profile?: NormalizationProfileAccumulator;
    occurrenceBuffer?: Map<string, OccurrenceBufferRow>;
  }): Promise<DictionaryExtractionField[]> {
    const field = await this.buildField(params);
    const derivedRawFields = applyVoltageComposite(field).splitFields;
    const heatingConfigField = deriveHeatingConfigField(field);
    if (heatingConfigField) derivedRawFields.push(heatingConfigField);
    if (derivedRawFields.length === 0) {
      return expandBothMoldQualifier(field);
    }

    const derivedFields: DictionaryExtractionField[] = [];
    for (const rawField of derivedRawFields) {
      derivedFields.push(
        await this.buildField({
          ...params,
          rawField,
        }),
      );
    }
    return [...expandBothMoldQualifier(field), ...derivedFields];
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
    profile?: NormalizationProfileAccumulator;
    occurrenceBuffer?: Map<string, OccurrenceBufferRow>;
  }): Promise<void> {
    if (!params.documentId || !params.extractionResultId) {
      return;
    }

    const row: OccurrenceBufferRow = {
      candidateType: params.candidateType,
      candidateId: params.candidateId,
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex: params.itemIndex,
      sourceProductType: params.sourceProductType ?? "unknown",
      fieldName: params.fieldName,
      rawValue: params.rawValue ?? null,
      evidence: params.evidence ?? null,
    };
    if (params.occurrenceBuffer) {
      params.occurrenceBuffer.set(occurrenceBufferKey(row), row);
      return;
    }

    const occurrenceRepo =
      this.dataSource.getRepository(DictionaryCandidateOccurrence);

    await measureProfile(
      params.profile ?? disabledNormalizationProfile(),
      "recordOccurrenceMs",
      () =>
        occurrenceRepo.upsert(
          occurrenceRepo.create({
            candidateType: row.candidateType,
            candidateId: row.candidateId,
            documentId: row.documentId,
            extractionResultId: row.extractionResultId,
            itemIndex: row.itemIndex,
            sourceProductType: row.sourceProductType,
            fieldName: row.fieldName,
            rawValue: row.rawValue,
            evidence: row.evidence,
          }) as unknown as Parameters<typeof occurrenceRepo.upsert>[0],
          [
            "candidateType",
            "candidateId",
            "extractionResultId",
            "itemIndex",
            "fieldName",
          ],
        ),
    );
    if (params.profile?.enabled) {
      params.profile.occurrencesRecorded += 1;
    }
  }

  private async flushOccurrenceBuffer(
    occurrenceBuffer: Map<string, OccurrenceBufferRow>,
    profile: NormalizationProfileAccumulator,
  ): Promise<void> {
    if (occurrenceBuffer.size === 0) {
      return;
    }

    const occurrenceRepo =
      this.dataSource.getRepository(DictionaryCandidateOccurrence);
    const rows = [...occurrenceBuffer.values()].map((row) =>
      occurrenceRepo.create(row),
    );
    await measureProfile(profile, "recordOccurrenceMs", () =>
      occurrenceRepo.upsert(
        rows as unknown as Parameters<typeof occurrenceRepo.upsert>[0],
        [
          "candidateType",
          "candidateId",
          "extractionResultId",
          "itemIndex",
          "fieldName",
        ],
      ),
    );
    if (profile.enabled) {
      profile.occurrencesRecorded += rows.length;
    }
  }

  private async flushSplitResolutionBuffer(
    splitResolutionBuffer: SplitResolutionBufferRow[],
    profile: NormalizationProfileAccumulator,
  ): Promise<void> {
    if (splitResolutionBuffer.length === 0) {
      return;
    }

    const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
    await measureProfile(profile, "splitResolutionSaveMs", () =>
      splitResolutionRepo.save(
        splitResolutionBuffer.map((row) => splitResolutionRepo.create(row)),
      ),
    );
    if (profile.enabled) {
      profile.splitResolutionsSaved += splitResolutionBuffer.length;
    }
  }
}

function occurrenceBufferKey(row: OccurrenceBufferRow): string {
  return [
    row.candidateType,
    row.candidateId,
    row.extractionResultId,
    row.itemIndex,
    row.fieldName,
  ].join("\u001f");
}

export { ExtractionNormalizationService as DictionaryExtractionService };
