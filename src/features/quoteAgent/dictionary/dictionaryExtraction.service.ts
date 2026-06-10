import { DataSource } from "typeorm";
import {
  DictionaryCandidateOccurrence,
} from "./entity/index.js";
import { SplitResolution } from "../entity/splitResolution.entity.js";
import {
  DictionaryService,
  type DictionaryValueKind,
  type NormalizedFieldResult,
} from "./dictionary.service.js";
import type {
  LlmExtractionItem,
  LlmExtractionResult,
  LlmRawField,
} from "../llm/types.js";
import type { QuoteAgentMasterDataMatch } from "../masterData.service.js";

export interface DictionaryExtractionResult {
  summary: {
    item_count: number;
    raw_field_count: number;
    rewritten_field_count: number;
    split_resolution_count: number;
    dictionary_matched_count: number;
    value_candidate_count: number;
    term_type_candidate_count: number;
    warning_count: number;
  };
  document_info?: unknown;
  items: DictionaryExtractionItem[];
  warnings: DictionaryExtractionWarning[];
  raw_llm_result: LlmExtractionResult;
  extraction_json: NormalizedExtractionJson;
}

export interface NormalizedExtractionJson {
  document_info?: unknown;
  items: Array<{
    item_index: number;
    item_name?: string;
    item_quantity?: string;
    itemProductTypeHint: string;
    itemProductTypeHintRawValue?: string;
    itemProductTypeHintDisplayName?: string;
    itemProductTypeHintConfidence?: number;
    warnings?: DictionaryExtractionWarning[];
    fields: Array<{
      field_name: string;
      raw_value: string;
      selected?: boolean;
      raw_text?: string;
      evidence?: unknown;
      confidence?: number;
      dictionary: DictionaryExtractionField["dictionary"];
      candidate?: DictionaryExtractionField["candidate"];
      warnings?: DictionaryExtractionWarning[];
      original?: boolean;
    }>;
  }>;
  warnings: DictionaryExtractionWarning[];
  summary: DictionaryExtractionResult["summary"];
}

export interface DictionaryExtractionItem {
  item_index: number;
  item_name?: string;
  item_quantity?: string;
  itemProductTypeHint: string;
  itemProductTypeHintRawValue?: string;
  itemProductTypeHintDisplayName?: string;
  itemProductTypeHintConfidence?: number;
  warnings: DictionaryExtractionWarning[];
  fields: DictionaryExtractionField[];
}

export interface DictionaryExtractionField {
  field_name: string;
  raw_value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  llm_confidence?: number;
  dictionary: {
    matched: boolean;
    field_matched: boolean;
    normalized_field_name?: string;
    normalized_value?: string;
    term_type?: string;
    candidate_term_types?: string[];
    canonical_value?: string;
    display_name?: string;
    confidence?: number;
    risk_level?: string;
    note?: string | null;
    value_kind?: DictionaryValueKind;
    match_method?: string;
    values?: Array<{
      canonicalValue: string;
      displayName: string;
      rawValue: string;
      confidence: number;
    }>;
    masterDataMatch?: QuoteAgentMasterDataMatch;
  };
  candidate?: {
    candidate_type: "term_type" | "value";
    candidate_id?: string;
    term_type?: string;
    raw_field_name?: string;
    raw_value?: string;
    source_product_type?: string;
    item_index?: number;
    status?: string;
  };
  warnings: DictionaryExtractionWarning[];
}

export interface DictionaryExtractionWarning {
  type: string;
  message: string;
  item_index?: number;
  field_name?: string;
  raw_value?: string;
  term_type?: string;
  source?: string;
  evidence?: unknown;
}

export function coerceLlmExtractionResult(value: unknown): LlmExtractionResult {
  if (!isObject(value) || !isObject(value.extraction)) {
    throw new Error("LLM extraction result must contain extraction object");
  }

  if (!Array.isArray(value.extraction.items)) {
    throw new Error("LLM extraction result must contain extraction.items array");
  }

  return {
    extraction: {
      document_info: isObject(value.extraction.document_info)
        ? (value.extraction
            .document_info as LlmExtractionResult["extraction"]["document_info"])
        : undefined,
      items: value.extraction.items as LlmExtractionItem[],
    },
    warnings: Array.isArray(value.warnings)
      ? (value.warnings as LlmExtractionResult["warnings"])
      : [],
  };
}

function stringifyOptionalId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTextForKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function isBlankValue(value: string): boolean {
  return value.trim() === "";
}

function isUnknownValue(value: string): boolean {
  return ["unknown", "未知", "未识别"].includes(value.trim().toLowerCase());
}

function isExplicitUnselectedOption(rawField: LlmRawField): boolean {
  if (rawField.selected !== false) {
    return false;
  }

  const evidenceText = isObject(rawField.evidence)
    ? String(rawField.evidence.text ?? "")
    : "";
  const rawText = rawField.raw_text ?? evidenceText;

  return /\[\s*\]|□/.test(rawText) && !/\[SEL\]|■|☑|✔|✓/.test(rawText);
}

function createWarning(params: {
  type: string;
  message: string;
  itemIndex?: number;
  fieldName?: string;
  rawValue?: string;
  termType?: string;
  source?: string;
  evidence?: unknown;
}): DictionaryExtractionWarning {
  return {
    type: params.type,
    message: params.message,
    item_index: params.itemIndex,
    field_name: params.fieldName,
    raw_value: params.rawValue,
    term_type: params.termType,
    source: params.source,
    evidence: params.evidence,
  };
}

function createBaseField(rawField: LlmRawField): DictionaryExtractionField {
  return {
    field_name: rawField.field_name,
    raw_value: rawField.value,
    selected: rawField.selected,
    raw_text: rawField.raw_text,
    evidence: rawField.evidence,
    llm_confidence: rawField.confidence,
    dictionary: {
      matched: false,
      field_matched: false,
    },
    warnings: [],
  };
}

function hasSplitFields(rawField: LlmRawField): boolean {
  return Array.isArray(rawField.split_fields) && rawField.split_fields.length > 0;
}

function isOriginalRetainedField(rawField: LlmRawField): boolean {
  return (rawField as unknown as { _original?: boolean })._original === true;
}

function splitFieldToRawField(
  parent: LlmRawField,
  splitField: NonNullable<LlmRawField["split_fields"]>[number],
): LlmRawField {
  return {
    field_name: splitField.field_name,
    value: splitField.value,
    selected: splitField.selected ?? parent.selected,
    raw_text: splitField.raw_text ?? parent.raw_text,
    evidence: splitField.evidence ?? parent.evidence,
    confidence: splitField.confidence ?? parent.confidence,
  };
}

function mapDictionaryWarnings(
  result: NormalizedFieldResult,
  itemIndex: number,
): DictionaryExtractionWarning[] {
  return result.warnings.map((warning) =>
    createWarning({
      type: warning.type,
      message: warning.message,
      itemIndex,
      fieldName: result.rawFieldName,
      rawValue: warning.rawValue ?? result.rawValue,
      termType: warning.termType ?? result.termType,
      source: warning.source,
    }),
  );
}

type ProductTypeOption = {
  canonicalValue: string;
  displayName: string;
};

function resolveItemProductTypeHint(params: {
  item: LlmExtractionItem;
  productTypeMap: Map<string, ProductTypeOption>;
}): {
  itemProductTypeHint: string;
  rawValue?: string;
  displayName?: string;
  confidence?: number;
  warnings: DictionaryExtractionWarning[];
} {
  const hint = params.item.item_type_hint ?? params.item.product_type_hint;
  const value = String(hint?.value ?? "").trim();
  const rawValue = hint?.raw_value ?? value;
  const matched = value ? params.productTypeMap.get(value) : undefined;

  if (matched) {
    return {
      itemProductTypeHint: matched.canonicalValue,
      rawValue,
      displayName: hint?.display_name ?? matched.displayName,
      confidence: hint?.confidence,
      warnings: [],
    };
  }

  if (!value || value === "unknown") {
    return {
      itemProductTypeHint: "unknown",
      rawValue,
      displayName: hint?.display_name,
      confidence: hint?.confidence,
      warnings: [],
    };
  }

  return {
    itemProductTypeHint: "unknown",
    rawValue,
    displayName: hint?.display_name,
    confidence: hint?.confidence,
    warnings: [
      createWarning({
        type: "unknown_product_type_hint",
        message: "item 产品类型 hint 未命中 product_type 字典，已按 unknown 路由",
        itemIndex: params.item.item_index,
        rawValue,
        evidence: hint?.evidence,
      }),
    ],
  };
}

export class DictionaryExtractionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dictionaryService: DictionaryService,
  ) {}

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
    const manualSplitMap = new Map<string, LlmRawField["split_fields"]>();
    const manualSplitValueKeys = new Set<string>();
    const productTypeOptions =
      await this.dictionaryService.getProductTypeOptions();
    const productTypeMap = new Map(
      productTypeOptions.map((item) => [item.canonicalValue, item]),
    );

    if (params.documentId && params.extractionResultId) {
      const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
      const extractionResultId = stringifyOptionalId(params.extractionResultId);
      const manualSplits = await splitResolutionRepo.find({
        where: { extractionResultId, source: "candidate_review" },
      });
      for (const split of manualSplits) {
        manualSplitMap.set(
          this.manualSplitKey({
            itemIndex: split.itemIndex,
            fieldName: split.rawFieldName,
            rawValue: split.rawValue,
          }),
          Array.isArray(split.splitFields)
            ? (split.splitFields as LlmRawField["split_fields"])
            : [],
        );
        manualSplitValueKeys.add(
          this.manualSplitValueKey({
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

    for (const item of params.llmResult.extraction.items) {
      const route = resolveItemProductTypeHint({ item, productTypeMap });
      warnings.push(...route.warnings);
      rawFieldCount += item.raw_fields.length;
      const fields: DictionaryExtractionField[] = [];
      const rewrittenRawFields: LlmRawField[] = [];

      for (const rawField of item.raw_fields) {
        const manualSplitFields = manualSplitMap.get(
          this.manualSplitKey({
            itemIndex: item.item_index,
            fieldName: rawField.field_name,
            rawValue: rawField.value,
          }),
        );
        if (
          !manualSplitFields &&
          manualSplitValueKeys.has(
            this.manualSplitValueKey({
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
          itemIndex: item.item_index,
          documentId: stringifyOptionalId(params.documentId),
          extractionResultId: stringifyOptionalId(params.extractionResultId),
          fields,
          warnings,
        });
        splitResolutionCount += rawFieldsToNormalize.splitResolutionCount;
        rewrittenRawFields.push(...rawFieldsToNormalize.rewrittenRawFields);

        for (const normalizedRawField of rawFieldsToNormalize.fieldsToNormalize) {
          const field = await this.buildField({
            rawField: normalizedRawField,
            itemIndex: item.item_index,
            itemProductTypeHint: route.itemProductTypeHint,
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
          fields.push(field);
        }
      }

      rewrittenFieldCount += rewrittenRawFields.length;
      items.push({
        item_index: item.item_index,
        item_name: item.item_name?.value,
        item_quantity: item.item_quantity?.value,
        itemProductTypeHint: route.itemProductTypeHint,
        itemProductTypeHintRawValue: route.rawValue,
        itemProductTypeHintDisplayName: route.displayName,
        itemProductTypeHintConfidence: route.confidence,
        warnings: route.warnings,
        fields,
      });
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
        item_count: params.llmResult.extraction.items.length,
        raw_field_count: rawFieldCount,
        rewritten_field_count: rewrittenFieldCount,
        split_resolution_count: splitResolutionCount,
        dictionary_matched_count: dictionaryMatchedCount,
        value_candidate_count: valueCandidateCount,
        term_type_candidate_count: termTypeCandidateCount,
        warning_count: warnings.length,
      },
      document_info: params.llmResult.extraction.document_info,
      items,
      warnings,
      raw_llm_result: params.llmResult,
      extraction_json: {
        document_info: params.llmResult.extraction.document_info,
        items: items.map((item) => ({
          item_index: item.item_index,
          item_name: item.item_name,
          item_quantity: item.item_quantity,
          itemProductTypeHint: item.itemProductTypeHint,
          itemProductTypeHintRawValue: item.itemProductTypeHintRawValue,
          itemProductTypeHintDisplayName: item.itemProductTypeHintDisplayName,
          itemProductTypeHintConfidence: item.itemProductTypeHintConfidence,
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
            original: field.dictionary.note === "复合字段已拆分，原字段仅保留作追溯",
          })),
        })),
        warnings,
        summary: {
          item_count: params.llmResult.extraction.items.length,
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
    if (isOriginalRetainedField(params.rawField) || !hasSplitFields(params.rawField)) {
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

    const splitRawFields = params.rawField.split_fields!.map((splitField) =>
      splitFieldToRawField(params.rawField, splitField),
    );
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

  private manualSplitKey(params: {
    itemIndex: number;
    fieldName: string;
    rawValue: string;
  }) {
    return `${params.itemIndex}|${normalizeTextForKey(params.fieldName)}|${normalizeTextForKey(params.rawValue)}`;
  }

  private manualSplitValueKey(params: {
    itemIndex: number;
    rawValue: string;
  }) {
    return `${params.itemIndex}|${normalizeTextForKey(params.rawValue)}`;
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

    const splitValues =
      hasSplitFields(params.rawField)
        ? params.rawField.split_fields!.map((sf) => sf.value)
        : undefined;

    const normalized = await this.dictionaryService.normalizeField({
      documentId: params.documentId,
      extractionResultId: params.extractionResultId,
      itemIndex: params.itemIndex,
      itemProductTypeHint: params.itemProductTypeHint,
      fieldName: params.rawField.field_name,
      rawValue: params.rawField.value,
      splitRawValues: splitValues,
      evidence: params.rawField.evidence,
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
      match_method:
        normalized.matchMethod ?? (normalized.matched ? "alias_exact" : "none"),
    };

    if (normalized.termTypeCandidate) {
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

    field.warnings.push(...mapDictionaryWarnings(normalized, params.itemIndex));

    if (
      normalized.termTypeCandidate &&
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
