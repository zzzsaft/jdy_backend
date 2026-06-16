import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../config/data-source.js";
import {
  DictionaryService,
  type DictionaryValueKind,
  type NormalizedFieldResult,
} from "./dictionary/dictionary.service.js";
import { coerceLlmExtractionResult } from "./normalization/index.js";
import type {
  LlmExtractionResult,
  LlmRawField,
} from "./extraction/types.js";

const localFilePath =
  "/Users/zzzsaft/Documents/生产明细单/jxyxbyy/2023/生产明细（231411）2023-06-10-1900mmCPE流延膜手动模头.xls";

interface LlmDictionaryTestResult {
  summary: {
    item_count: number;
    raw_field_count: number;
    dictionary_matched_count: number;
    value_candidate_count: number;
    term_type_candidate_count: number;
    warning_count: number;
  };
  document_info?: unknown;
  items: LlmDictionaryTestItem[];
  warnings: LlmDictionaryTestWarning[];
  raw_llm_result: LlmExtractionResult;
}

interface LlmDictionaryTestItem {
  item_index: number;
  item_name?: string;
  fields: LlmDictionaryTestField[];
}

interface LlmDictionaryTestField {
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
  };
  candidate?: {
    candidate_type: "term_type" | "value";
    candidate_id?: string;
    term_type?: string;
    raw_field_name?: string;
    raw_value?: string;
    status?: string;
  };
  warnings: LlmDictionaryTestWarning[];
}

interface LlmDictionaryTestWarning {
  type: string;
  message: string;
  item_index?: number;
  field_name?: string;
  raw_value?: string;
  term_type?: string;
  evidence?: unknown;
}

type TestLlmWithDictionaryParams = {
  filePath?: string;
  documentId?: string;
  extractionResultId?: string;
  llmResult?: LlmExtractionResult;
};

function stringifyOptionalId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value);
}

function isBlankValue(value: string): boolean {
  return value.trim() === "";
}

function isUnknownValue(value: string): boolean {
  return ["unknown", "未知", "未识别"].includes(value.trim().toLowerCase());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function createTestWarning(params: {
  type: string;
  message: string;
  itemIndex?: number;
  fieldName?: string;
  rawValue?: string;
  termType?: string;
  evidence?: unknown;
}): LlmDictionaryTestWarning {
  return {
    type: params.type,
    message: params.message,
    item_index: params.itemIndex,
    field_name: params.fieldName,
    raw_value: params.rawValue,
    term_type: params.termType,
    evidence: params.evidence,
  };
}

function createBaseTestField(rawField: LlmRawField): LlmDictionaryTestField {
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

function mapDictionaryWarnings(
  result: NormalizedFieldResult,
  itemIndex: number
): LlmDictionaryTestWarning[] {
  return result.warnings.map((warning) =>
    createTestWarning({
      type: warning.type,
      message: warning.message,
      itemIndex,
      fieldName: result.rawFieldName,
      rawValue: warning.rawValue ?? result.rawValue,
      termType: warning.termType ?? result.termType,
    })
  );
}

async function buildLlmDictionaryTestField(params: {
  dictionaryService: DictionaryService;
  rawField: LlmRawField;
  itemIndex: number;
  documentId?: string;
  extractionResultId?: string;
}): Promise<LlmDictionaryTestField> {
  const field = createBaseTestField(params.rawField);

  if (isExplicitUnselectedOption(params.rawField)) {
    return field;
  }

  if (isBlankValue(params.rawField.value)) {
    field.warnings.push(
      createTestWarning({
        type: "empty_value",
        message: "字段值为空，已跳过字典匹配",
        itemIndex: params.itemIndex,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: params.rawField.evidence,
      })
    );
    return field;
  }

  if (isUnknownValue(params.rawField.value)) {
    field.warnings.push(
      createTestWarning({
        type: "unknown_value",
        message: "字段值为 UNKNOWN，已跳过字典匹配",
        itemIndex: params.itemIndex,
        fieldName: params.rawField.field_name,
        rawValue: params.rawField.value,
        evidence: params.rawField.evidence,
      })
    );
    return field;
  }

  const normalized = await params.dictionaryService.normalizeField({
    documentId: params.documentId,
    extractionResultId: params.extractionResultId,
    fieldName: params.rawField.field_name,
    rawValue: params.rawField.value,
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
    match_method:
      normalized.matchMethod ?? (normalized.matched ? "alias_exact" : "none"),
  };

  if (normalized.termTypeCandidate) {
    field.candidate = {
      candidate_type: "term_type",
      candidate_id: normalized.termTypeCandidate.id,
      raw_field_name: normalized.termTypeCandidate.rawFieldName,
      status: normalized.termTypeCandidate.status,
    };
  }

  if (normalized.valueCandidate) {
    field.candidate = {
      candidate_type: "value",
      candidate_id: normalized.valueCandidate.id,
      term_type: normalized.valueCandidate.termType,
      raw_value: normalized.valueCandidate.rawValue,
      status: normalized.valueCandidate.status,
    };
  }

  field.warnings.push(...mapDictionaryWarnings(normalized, params.itemIndex));

  if (
    normalized.termTypeCandidate &&
    !field.warnings.some((warning) => warning.type === "term_type_no_match")
  ) {
    field.warnings.push(
      createTestWarning({
        type: "term_type_no_match",
        message: "字段名未命中字典，已创建字段名候选",
        itemIndex: params.itemIndex,
        fieldName: normalized.rawFieldName,
        rawValue: normalized.rawValue,
        evidence: params.rawField.evidence,
      })
    );
  }

  if (
    normalized.valueCandidate &&
    !field.warnings.some((warning) => warning.type === "value_no_match")
  ) {
    field.warnings.push(
      createTestWarning({
        type: "value_no_match",
        message: "字段值未命中字典，已创建字段值候选",
        itemIndex: params.itemIndex,
        fieldName: normalized.rawFieldName,
        rawValue: normalized.rawValue,
        termType: normalized.valueCandidate.termType,
        evidence: params.rawField.evidence,
      })
    );
  }

  return field;
}

async function buildLlmDictionaryTestResult(params: {
  dictionaryService: DictionaryService;
  llmResult: LlmExtractionResult;
  documentId?: string;
  extractionResultId?: string;
}): Promise<LlmDictionaryTestResult> {
  const items: LlmDictionaryTestItem[] = [];
  const warnings: LlmDictionaryTestWarning[] = [];
  let rawFieldCount = 0;
  let dictionaryMatchedCount = 0;
  let valueCandidateCount = 0;
  let termTypeCandidateCount = 0;

  for (const item of params.llmResult.extraction.items) {
    rawFieldCount += item.raw_fields.length;
    const fields: LlmDictionaryTestField[] = [];

    for (const rawField of item.raw_fields) {
      const field = await buildLlmDictionaryTestField({
        dictionaryService: params.dictionaryService,
        rawField,
        itemIndex: item.item_index,
        documentId: params.documentId,
        extractionResultId: params.extractionResultId,
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

    items.push({
      item_index: item.item_index,
      item_name: item.item_name?.value,
      fields,
    });
  }

  const llmWarnings = (params.llmResult.warnings ?? []).map((warning) =>
    createTestWarning({
      type: warning.type,
      message: warning.message,
      evidence: warning.evidence,
    })
  );
  warnings.push(...llmWarnings);

  return {
    summary: {
      item_count: params.llmResult.extraction.items.length,
      raw_field_count: rawFieldCount,
      dictionary_matched_count: dictionaryMatchedCount,
      value_candidate_count: valueCandidateCount,
      term_type_candidate_count: termTypeCandidateCount,
      warning_count: warnings.length,
    },
    document_info: params.llmResult.extraction.document_info,
    items,
    warnings,
    raw_llm_result: params.llmResult,
  };
}

async function testLlmWithDictionary(
  params: TestLlmWithDictionaryParams
): Promise<LlmDictionaryTestResult> {
  const { productConfigAgentService } = await import("./service.js");
  const dictionaryService = new DictionaryService(PgDataSource);
  let documentId = params.documentId;
  let extractionResultId = params.extractionResultId;
  let llmResult = params.llmResult;

  if (!llmResult) {
    if (!params.filePath) {
      throw new Error("filePath is required when llmResult is not provided");
    }

    const processed = await productConfigAgentService.process({
      filePath: params.filePath,
      source: "dictionary_test",
      forceReparse: false,
      forceReextract: true,
    });

    documentId = documentId ?? stringifyOptionalId(processed.document?.id);
    extractionResultId =
      extractionResultId ?? stringifyOptionalId(processed.extraction?.id);
    llmResult = coerceLlmExtractionResult({
      extraction: processed.extraction?.extractionJson,
      warnings: processed.extraction?.warnings,
    });
  }

  return buildLlmDictionaryTestResult({
    dictionaryService,
    llmResult,
    documentId,
    extractionResultId,
  });
}

export async function main() {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }

  const { productConfigAgentService } = await import("./service.js");

  const result = await productConfigAgentService.process({
    filePath: localFilePath,
    source: "local_test",
    forceReparse: false,
    forceReextract: false,
  });

  console.log(
    JSON.stringify(
      {
        documentId: result.document?.id,
        documentStatus: result.document?.status,
        blocksId: result.blocks?.id,
        extractionId: result.extraction?.id,
        reusedBlocks: result.reusedBlocks,
        reusedExtraction: result.reusedExtraction,
      },
      null,
      2
    )
  );

  const dictionaryTestResult = await testLlmWithDictionary({
    documentId: stringifyOptionalId(result.document?.id),
    extractionResultId: stringifyOptionalId(result.extraction?.id),
    llmResult: coerceLlmExtractionResult({
      extraction: result.extraction?.extractionJson,
      warnings: result.extraction?.warnings,
    }),
  });

  console.log(JSON.stringify(dictionaryTestResult.summary, null, 2));
  console.log(JSON.stringify(dictionaryTestResult.items, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
