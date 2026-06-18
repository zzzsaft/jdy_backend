import type { LlmDictionaryContext } from "../../dictionary/dictionary.service.js";
import { requestRoutedChatJson } from "../../../../llm/index.js";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "../validation/parseExtractResult.js";
import type {
  LlmChatMessage,
} from "../../../../llm/deepseekClient.js";
import type {
  LlmExtractionItem,
  LlmExtractParams,
  LlmExtractResult,
} from "../types.js";

const FALLBACK_PRODUCT_TYPE_HINTS = [
  "flat_die",
  "feedblock",
  "filter",
  "metering_pump",
  "hydraulic_station",
  "melt_pipe",
  "blown_film_die",
  "coating_die",
  "sizing_die",
  "thickness_gauge",
  "manifold",
  "air_knife",
  "static_mixer",
  "spinneret_plate",
  "monomer_extraction",
  "ibc_cooling_unit",
  "valve",
  "hot_air_pipe",
  "insulation_cover",
  "temperature_control_system",
  "die_cart",
  "unknown",
];

const MAX_ITEM_DICTIONARY_TERM_TYPES = 120;

type Warning = NonNullable<LlmExtractResult["warnings"]>[number];
type ProductTypeContext = NonNullable<LlmDictionaryContext["product_types"]>[number];

export type DocumentPlan = {
  document_info?: Record<string, unknown>;
  items: DocumentPlanItem[];
  global_context?: Record<string, unknown> | string | null;
  warnings?: Warning[];
};

export type DocumentPlanItem = {
  item_index: number;
  item_name?: string | null;
  product_type_hint?: string | null;
  product_type_raw?: string | null;
  item_quantity?: string | null;
  block_ids?: string[];
  llm_text_ranges?: Array<{
    start_line?: number;
    end_line?: number;
  }>;
  related_item_indexes?: number[];
  relation_note?: string | null;
};

export type TwoStageParams = LlmExtractParams & {
  blocksJson?: any;
  maxItemConcurrency?: number;
};

export type BatchPlanItemInput = {
  documentId: number;
  extractionResultId: number;
  fileName?: string;
  sheetName?: string;
  plan: DocumentPlan;
  item: DocumentPlanItem;
  llmText: string;
  blocksJson?: any;
};

export type BatchItemExtractResult = {
  documentId: number;
  extractionResultId: number;
  itemIndex: number;
  result: LlmExtractResult;
};

function normalizeWarningArray(value: unknown, defaultType: string): Warning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { type: defaultType, message: item };
      }
      if (item && typeof item === "object") {
        const warning = item as Record<string, unknown>;
        return {
          type: typeof warning.type === "string" ? warning.type : defaultType,
          message:
            typeof warning.message === "string"
              ? warning.message
              : JSON.stringify(item),
          ...(Object.prototype.hasOwnProperty.call(warning, "evidence")
            ? { evidence: warning.evidence }
            : {}),
        };
      }
      return {
        type: defaultType,
        message: String(item),
      };
    })
    .filter((item) => item.message);
}

export function normalizeLlmExtractionShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const root = value as Record<string, any>;
  root.warnings = normalizeWarningArray(root.warnings, "llm_warning");

  const items = root.extraction?.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item && typeof item === "object") {
        item.raw_fields = Array.isArray(item.raw_fields) ? item.raw_fields : [];
      }
    }
  }

  return root;
}

function validateXhExtractionContent(content: string): LlmExtractResult {
  return validateLlmExtractionResult(
    normalizeLlmExtractionShape(parseJsonContent(content)),
  );
}

function validateXhBatchExtractionContent(
  content: string,
  inputs: BatchPlanItemInput[],
  dictionaryContext: LlmDictionaryContext,
): BatchItemExtractResult[] {
  const parsed = parseJsonContent(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Batch extraction JSON result must be an object");
  }

  const root = parsed as Record<string, any>;
  if (!Array.isArray(root.results)) {
    throw new Error('Batch extraction JSON result is missing required field "results"');
  }

  const inputKeys = new Set(inputs.map(batchInputKey));
  const inputsByKey = new Map(inputs.map((input) => [batchInputKey(input), input]));
  const seenKeys = new Set<string>();
  const results: BatchItemExtractResult[] = [];

  for (const [index, item] of root.results.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`results[${index}] must be an object`);
    }
    const documentId = Number(item.documentId);
    const extractionResultId = Number(item.extractionResultId);
    const itemIndex = Number(item.item_index ?? item.itemIndex);
    if (!Number.isFinite(documentId) || !Number.isFinite(extractionResultId) || !Number.isFinite(itemIndex)) {
      throw new Error(`results[${index}] must include numeric documentId, extractionResultId, and item_index`);
    }

    const key = batchResultKey({ documentId, extractionResultId, itemIndex });
    if (!inputKeys.has(key)) {
      throw new Error(`results[${index}] does not match any requested batch item: ${key}`);
    }
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate batch result for ${key}`);
    }
    seenKeys.add(key);

    const input = inputsByKey.get(key);
    const result = validateLlmExtractionResult(
      normalizeLlmExtractionShape({
        extraction: item.extraction,
        warnings: item.warnings,
      }),
    );
    result.extraction.items = normalizeMergedItems(
      result.extraction.items,
      input ? [input.item, ...relatedPlanItems(input)] : [],
      dictionaryContext,
    );
    results.push({
      documentId,
      extractionResultId,
      itemIndex,
      result,
    });
  }

  for (const key of inputKeys) {
    if (!seenKeys.has(key)) {
      throw new Error(`Batch extraction result is missing requested item: ${key}`);
    }
  }

  return results;
}

function getProductTypeContexts(
  dictionaryContext?: LlmDictionaryContext,
): ProductTypeContext[] {
  const productTypes = dictionaryContext?.product_types ?? [];
  if (productTypes.length) {
    return productTypes;
  }

  return FALLBACK_PRODUCT_TYPE_HINTS.filter((value) => value !== "unknown").map(
    (value) => ({
      canonical_value: value,
      display_name: value,
      description: null,
      aliases: [],
    }),
  );
}

function getAllowedProductTypeHints(
  dictionaryContext?: LlmDictionaryContext,
): string[] {
  return [
    ...getProductTypeContexts(dictionaryContext).map(
      (item) => item.canonical_value,
    ),
    "unknown",
  ];
}

function normalizeProductTypeHint(
  value: unknown,
  dictionaryContext?: LlmDictionaryContext,
): string {
  const text = String(value ?? "").trim();
  return getAllowedProductTypeHints(dictionaryContext).includes(text)
    ? text
    : "unknown";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function normalizeDocumentPlan(
  value: unknown,
  dictionaryContext?: LlmDictionaryContext,
): DocumentPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Document plan must be an object");
  }

  const root = value as Record<string, any>;
  const items = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.document_plan?.items)
      ? root.document_plan.items
      : [];

  if (!items.length) {
    throw new Error("Document plan must include at least one item");
  }

  return {
    document_info:
      root.document_info && typeof root.document_info === "object"
        ? root.document_info
        : undefined,
    global_context: root.global_context ?? null,
    warnings: normalizeWarningArray(root.warnings, "plan_warning"),
    items: items.map((item: any, index: number) => ({
      item_index: asNumber(item?.item_index, index + 1),
      item_name: asStringOrNull(item?.item_name ?? item?.raw_product_name),
      product_type_hint: normalizeProductTypeHint(
        item?.product_type_hint,
        dictionaryContext,
      ),
      product_type_raw: asStringOrNull(item?.product_type_raw),
      item_quantity: asStringOrNull(item?.item_quantity),
      block_ids: Array.isArray(item?.block_ids)
        ? item.block_ids.filter((id: unknown) => typeof id === "string")
        : [],
      llm_text_ranges: Array.isArray(item?.llm_text_ranges)
        ? item.llm_text_ranges.map((range: any) => ({
            start_line: Number(range?.start_line),
            end_line: Number(range?.end_line),
          }))
        : [],
      related_item_indexes: Array.isArray(item?.related_item_indexes)
        ? item.related_item_indexes
            .map((itemIndex: unknown) => Number(itemIndex))
            .filter((itemIndex: number) => Number.isFinite(itemIndex))
        : [],
      relation_note: asStringOrNull(item?.relation_note),
    })),
  };
}

function numberLlmText(llmText: string): string {
  return llmText
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, "0")}: ${line}`)
    .join("\n");
}

type ItemInputTextResult = {
  text: string;
  warnings: Warning[];
  rangeSource: "physical_line" | "excel_row_mapped" | "block_ids" | "fallback";
};

function sliceLlmTextByRanges(
  llmText: string,
  ranges: DocumentPlanItem["llm_text_ranges"],
): string {
  const lines = llmText.split(/\r?\n/);
  const selected = new Set<number>();

  for (const range of ranges ?? []) {
    const start = Number(range.start_line);
    const end = Number(range.end_line);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let lineIndex = Math.max(1, start); lineIndex <= Math.min(lines.length, end); lineIndex += 1) {
      selected.add(lineIndex - 1);
    }
  }

  if (!selected.size) {
    return "";
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((lineIndex) => lines[lineIndex])
    .join("\n");
}

function buildExcelRowLineIndex(llmText: string): Map<number, number> {
  const rowToLineIndex = new Map<number, number>();
  llmText.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^Row\s+(\d+)\s*:/i);
    if (!match) return;
    const rowNumber = Number(match[1]);
    if (Number.isFinite(rowNumber) && !rowToLineIndex.has(rowNumber)) {
      rowToLineIndex.set(rowNumber, index + 1);
    }
  });
  return rowToLineIndex;
}

function mapExcelRowRangesToPhysicalRanges(
  llmText: string,
  ranges: DocumentPlanItem["llm_text_ranges"],
): DocumentPlanItem["llm_text_ranges"] {
  const rowToLineIndex = buildExcelRowLineIndex(llmText);
  const sortedRows = [...rowToLineIndex.keys()].sort((a, b) => a - b);
  const nextMappedLineAfter = (rowNumber: number): number | undefined => {
    const nextRow = sortedRows.find((candidateRow) => candidateRow > rowNumber);
    return nextRow === undefined ? undefined : rowToLineIndex.get(nextRow);
  };
  return (ranges ?? []).map((range) => {
    const start = Number(range.start_line);
    const end = Number(range.end_line);
    const mappedStart = rowToLineIndex.get(start);
    const mappedEnd = rowToLineIndex.get(end + 1);
    const fallbackEnd = rowToLineIndex.get(end);
    const nextRowEnd = nextMappedLineAfter(end);
    const startNextRowEnd = nextMappedLineAfter(start);
    return {
      start_line: mappedStart ?? start,
      end_line:
        mappedEnd !== undefined
          ? mappedEnd - 1
          : fallbackEnd !== undefined
            ? fallbackEnd
            : nextRowEnd !== undefined
              ? nextRowEnd - 1
              : startNextRowEnd !== undefined
                ? startNextRowEnd - 1
                : end,
    };
  });
}

function normalizeForRangeMatch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function itemRangeAnchors(item: DocumentPlanItem): string[] {
  return [
    item.item_name,
    item.product_type_raw,
  ]
    .map(normalizeForRangeMatch)
    .filter((value) => value.length >= 2);
}

function textMatchesItemRange(text: string, item: DocumentPlanItem): boolean {
  const normalizedText = normalizeForRangeMatch(text);
  return itemRangeAnchors(item).some((anchor) => normalizedText.includes(anchor));
}

function rangeWarning(params: {
  type: string;
  message: string;
  item: DocumentPlanItem;
  evidence?: unknown;
}): Warning {
  return {
    type: params.type,
    message: params.message,
    evidence: {
      item_index: params.item.item_index,
      item_name: params.item.item_name,
      product_type_hint: params.item.product_type_hint,
      ...(params.evidence && typeof params.evidence === "object"
        ? params.evidence
        : {}),
    },
  };
}

function selectBlocksByIds(blocksJson: any, blockIds: string[] | undefined) {
  const ids = new Set(blockIds ?? []);
  if (!ids.size || !Array.isArray(blocksJson?.blocks)) {
    return [];
  }
  return blocksJson.blocks.filter((block: any) => ids.has(block?.block_id));
}

export function buildItemInputText(
  llmText: string,
  blocksJson: any,
  item: DocumentPlanItem,
): ItemInputTextResult {
  const byRange = sliceLlmTextByRanges(llmText, item.llm_text_ranges);
  const mappedRanges = mapExcelRowRangesToPhysicalRanges(
    llmText,
    item.llm_text_ranges,
  );
  const mappedByRange = sliceLlmTextByRanges(llmText, mappedRanges);
  if (byRange.trim()) {
    if (textMatchesItemRange(byRange, item)) {
      return { text: byRange, warnings: [], rangeSource: "physical_line" };
    }

    if (mappedByRange.trim() && textMatchesItemRange(mappedByRange, item)) {
      return {
        text: mappedByRange,
        rangeSource: "excel_row_mapped",
        warnings: [
          rangeWarning({
            type: "plan_range_excel_row_mapped",
            message:
              "planner range looked like Excel Row numbers and was mapped to numbered_llm_text physical line numbers",
            item,
            evidence: {
              original_ranges: item.llm_text_ranges,
              mapped_ranges: mappedRanges,
            },
          }),
        ],
      };
    }

    return {
      text: byRange,
      rangeSource: "physical_line",
      warnings: [
        rangeWarning({
          type: "plan_range_suspected_misaligned",
          message:
            "planner range did not appear to include the planned item anchor; using original range with warning",
          item,
          evidence: {
            original_ranges: item.llm_text_ranges,
            mapped_ranges: mappedRanges,
          },
        }),
      ],
    };
  }

  if (mappedByRange.trim() && textMatchesItemRange(mappedByRange, item)) {
    return {
      text: mappedByRange,
      rangeSource: "excel_row_mapped",
      warnings: [
        rangeWarning({
          type: "plan_range_excel_row_mapped",
          message:
            "planner range looked like Excel Row numbers and was mapped to numbered_llm_text physical line numbers",
          item,
          evidence: {
            original_ranges: item.llm_text_ranges,
            mapped_ranges: mappedRanges,
          },
        }),
      ],
    };
  }

  const byBlocks = selectBlocksByIds(blocksJson, item.block_ids);
  if (byBlocks.length) {
    return {
      text: byBlocks
        .map((block: any) => `[${block.block_id}]\n${block.text ?? block.raw_text ?? ""}`)
        .join("\n\n"),
      warnings: [],
      rangeSource: "block_ids",
    };
  }

  return {
    text: llmText,
    warnings: [
      rangeWarning({
        type: "plan_range_suspected_misaligned",
        message:
          "planner item had no usable llm_text_ranges or block_ids; falling back to full text",
        item,
      }),
    ],
    rangeSource: "fallback",
  };
}

export function filterDictionaryContextForProductType(
  dictionaryContext: LlmDictionaryContext,
  productTypeHint: string | null | undefined,
): LlmDictionaryContext {
  const productType = normalizeProductTypeHint(productTypeHint, dictionaryContext);
  const termTypes = dictionaryContext.term_types
    .filter((termType) => {
      const applicable = termType.applicable_product_types ?? [];
      if (!applicable.length) return true;
      return applicable.includes("common") || applicable.includes(productType);
    })
    .sort((left, right) =>
      dictionaryTermTypePromptScore(right, productType) -
      dictionaryTermTypePromptScore(left, productType),
    )
    .slice(0, MAX_ITEM_DICTIONARY_TERM_TYPES);

  return {
    product_types: dictionaryContext.product_types,
    term_types: termTypes,
  };
}

function dictionaryTermTypePromptScore(
  termType: LlmDictionaryContext["term_types"][number],
  productType: string,
): number {
  const applicable = termType.applicable_product_types ?? [];
  const productScore = applicable.includes(productType)
    ? 100
    : applicable.includes("common")
      ? 60
      : applicable.length === 0
        ? 40
        : 0;
  const aliasScore = Math.min(12, termType.aliases?.length ?? 0);
  const valueKindScore =
    termType.value_kind === "enum" || termType.value_kind === "enums" ? 8 : 4;
  return productScore + aliasScore + valueKindScore;
}

function buildPlanMessages(params: TwoStageParams): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: buildDocumentPlanSystemPrompt(params.dictionaryContext),
    },
    {
      role: "user",
      content: JSON.stringify({
        file_name: params.fileName ?? "",
        sheet_name: params.sheetName ?? "",
        numbered_llm_text: numberLlmText(params.llmText ?? ""),
      }),
    },
  ];
}

function buildItemMessages(params: {
  fileName?: string;
  sheetName?: string;
  plan: DocumentPlan;
  item: DocumentPlanItem;
  itemText: string;
  relatedItemSummaries: DocumentPlanItem[];
  dictionaryContext: LlmDictionaryContext;
}): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: buildItemExtractSystemPrompt(
        normalizeProductTypeHint(
          params.item.product_type_hint,
          params.dictionaryContext,
        ),
        params.dictionaryContext,
      ),
    },
    {
      role: "user",
      content: JSON.stringify({
        file_name: params.fileName ?? "",
        sheet_name: params.sheetName ?? "",
        document_info: params.plan.document_info ?? {},
        global_context: params.plan.global_context ?? null,
        boundary_guard: buildBoundaryGuardPayload({
          mode: "single",
          item: params.item,
        }),
        current_item: params.item,
        current_item_blocks: params.itemText,
        related_item_summaries: params.relatedItemSummaries,
        dictionary_context: params.dictionaryContext,
      }),
    },
  ];
}

function buildBoundaryGuardPayload(params: {
  mode: "single" | "batch";
  item: DocumentPlanItem;
}) {
  return {
    instruction:
      "Use only current_item_blocks for raw_fields. If current_item_blocks is clearly for another planned item or mostly contains previous/next item text, return an empty extraction and report current_item_blocks_mismatch.",
    mismatch_warning: {
      type: "current_item_blocks_mismatch",
      message:
        "current_item_blocks does not match the planned item; backend should replan, recut, or fall back",
      evidence: {
        item_index: params.item.item_index,
        expected_item_name: params.item.item_name ?? null,
        expected_product_type: params.item.product_type_hint ?? null,
        expected_product_type_raw: params.item.product_type_raw ?? null,
        mode: params.mode,
      },
    },
    empty_extraction_shape:
      params.mode === "batch"
        ? { document_info: {}, items: [] }
        : { extraction: { document_info: {}, items: [] }, warnings: [] },
  };
}

function buildBatchItemMessages(params: {
  productTypeHint: string;
  inputs: BatchPlanItemInput[];
  dictionaryContext: LlmDictionaryContext;
}): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: buildBatchItemExtractSystemPrompt(
        params.productTypeHint,
        params.dictionaryContext,
      ),
    },
    {
      role: "user",
      content: JSON.stringify({
        product_type_hint: params.productTypeHint,
        batch_items: params.inputs.map((input) => ({
          documentId: input.documentId,
          extractionResultId: input.extractionResultId,
          file_name: input.fileName ?? "",
          sheet_name: input.sheetName ?? "",
          document_info: input.plan.document_info ?? {},
          global_context: input.plan.global_context ?? null,
          item_index: input.item.item_index,
          product_type_hint: input.item.product_type_hint ?? params.productTypeHint,
          boundary_guard: buildBoundaryGuardPayload({
            mode: "batch",
            item: input.item,
          }),
          current_item: input.item,
          current_item_blocks: buildItemInputText(
            input.llmText,
            input.blocksJson,
            input.item,
          ).text,
          related_item_summaries: relatedPlanItems(input),
        })),
        dictionary_context: params.dictionaryContext,
      }),
    },
  ];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

export async function planDocumentWithXh(
  params: TwoStageParams,
  model?: string,
): Promise<DocumentPlan> {
  const llmText = params.llmText ?? "";

  const planContent = await requestRoutedChatJson({
    model,
    purpose: "product_config_agent_plan",
    messages: buildPlanMessages(params),
    input: {
      fileName: params.fileName,
      sheetName: params.sheetName,
      llmTextLength: llmText.length,
    },
    responseFormat: "json_object",
    maxTokens: 12000,
  });
  return normalizeDocumentPlan(parseJsonContent(planContent), params.dictionaryContext);
}

export async function extractItemsFromPlanWithXh(
  params: TwoStageParams & {
    plan: DocumentPlan;
    itemProductType?: string;
    itemIndexes?: number[];
  },
  model?: string,
): Promise<LlmExtractResult> {
  const llmText = params.llmText ?? "";
  const plan = params.plan;
  const targetProductType = params.itemProductType
    ? normalizeProductTypeHint(params.itemProductType, params.dictionaryContext)
    : null;
  const targetItemIndexes = new Set(params.itemIndexes ?? []);
  const planItems = targetProductType
    ? plan.items.filter(
        (item) =>
          normalizeProductTypeHint(
            item.product_type_hint,
            params.dictionaryContext,
          ) === targetProductType,
      )
    : plan.items;
  const selectedPlanItems = targetItemIndexes.size
    ? planItems.filter((item) => targetItemIndexes.has(item.item_index))
    : planItems;

  if (!selectedPlanItems.length) {
    throw new Error(
      targetProductType
        ? `No planned items found for product type: ${targetProductType}`
        : "Document plan contains no items",
    );
  }

  const itemResults = await mapWithConcurrency(
    selectedPlanItems,
    params.maxItemConcurrency ?? 2,
    async (item) => {
      const productType = normalizeProductTypeHint(
        item.product_type_hint,
        params.dictionaryContext,
      );
      const relatedItemSummaries = plan.items.filter((other) =>
        item.related_item_indexes?.includes(other.item_index),
      );
      const filteredDictionaryContext = filterDictionaryContextForProductType(
        params.dictionaryContext,
        productType,
      );
      const itemInputText = buildItemInputText(llmText, params.blocksJson, item);
      const content = await requestRoutedChatJson({
        model,
        purpose: `product_config_agent_item_extract_${productType}`,
        messages: buildItemMessages({
          fileName: params.fileName,
          sheetName: params.sheetName,
          plan,
          item,
          itemText: itemInputText.text,
          relatedItemSummaries,
          dictionaryContext: filteredDictionaryContext,
        }),
        input: {
          fileName: params.fileName,
          item,
          relatedItemSummaries,
          dictionaryTermTypeCount: filteredDictionaryContext.term_types.length,
        },
        responseFormat: "json_object",
        maxTokens: 60000,
      });

      const result = validateXhExtractionContent(content);
      result.warnings = [
        ...(itemInputText.warnings ?? []),
        ...(result.warnings ?? []),
      ];
      return result;
    },
  );

  const documentInfo =
    itemResults.find((result) => result.extraction.document_info)?.extraction
      .document_info ?? normalizePlanDocumentInfo(plan.document_info);
  const warnings = [
    ...normalizeWarningArray(plan.warnings, "plan_warning"),
    ...itemResults.flatMap((result) => result.warnings ?? []),
  ];
  const items = itemResults.flatMap((result) => result.extraction.items);

  return {
    extraction: {
      ...(documentInfo ? { document_info: documentInfo } : {}),
      items: normalizeMergedItems(items, plan.items, params.dictionaryContext),
    },
    warnings,
    llmPlanJson: {
      document_info: plan.document_info ?? {},
      items: plan.items,
      global_context: plan.global_context ?? null,
      warnings: plan.warnings ?? [],
    },
  };
}

export async function extractItemBatchFromPlansWithXh(
  params: {
    productTypeHint: string;
    inputs: BatchPlanItemInput[];
    dictionaryContext: LlmDictionaryContext;
  },
  model?: string,
): Promise<BatchItemExtractResult[]> {
  if (!params.inputs.length) {
    return [];
  }

  const productType = normalizeProductTypeHint(
    params.productTypeHint,
    params.dictionaryContext,
  );
  const filteredDictionaryContext = filterDictionaryContextForProductType(
    params.dictionaryContext,
    productType,
  );
  const content = await requestRoutedChatJson({
    model,
    purpose: `product_config_agent_item_extract_batch_${productType}`,
    messages: buildBatchItemMessages({
      productTypeHint: productType,
      inputs: params.inputs,
      dictionaryContext: filteredDictionaryContext,
    }),
    input: {
      productType,
      itemCount: params.inputs.length,
      extractionResultIds: [
        ...new Set(params.inputs.map((item) => item.extractionResultId)),
      ],
      dictionaryTermTypeCount: filteredDictionaryContext.term_types.length,
    },
    responseFormat: "json_object",
    maxTokens: 60000,
  });

  return validateXhBatchExtractionContent(
    content,
    params.inputs,
    filteredDictionaryContext,
  );
}

export async function extractProductConfigWithTwoStageXh(
  params: TwoStageParams,
  model?: string,
): Promise<LlmExtractResult> {
  const plan = await planDocumentWithXh(params, model);
  return extractItemsFromPlanWithXh({ ...params, plan }, model);
}

function normalizePlanDocumentInfo(
  documentInfo: DocumentPlan["document_info"],
): LlmExtractResult["extraction"]["document_info"] | undefined {
  if (!documentInfo) return undefined;

  const result: NonNullable<LlmExtractResult["extraction"]["document_info"]> = {};
  for (const [key, value] of Object.entries(documentInfo)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const field = value as Record<string, unknown>;
      if (typeof field.value === "string") {
        result[key] = {
          value: field.value,
          evidence: field.evidence ?? {},
          confidence:
            typeof field.confidence === "number" ? field.confidence : 0.7,
        };
        continue;
      }
    }
    if (typeof value === "string") {
      result[key] = {
        value,
        evidence: {},
        confidence: 0.7,
      };
    }
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizeMergedItems(
  items: LlmExtractionItem[],
  planItems: DocumentPlanItem[],
  dictionaryContext?: LlmDictionaryContext,
): LlmExtractionItem[] {
  return items.map((item, index) => {
    const planItem =
      planItems.find((candidate) => candidate.item_index === item.item_index) ??
      planItems[index];
    return {
      ...item,
      item_index: planItem?.item_index ?? item.item_index ?? index + 1,
      ...(item.product_type_hint
        ? {}
        : {
            product_type_hint: {
              value: normalizeProductTypeHint(
                planItem?.product_type_hint,
                dictionaryContext,
              ),
              raw_value: planItem?.product_type_raw ?? planItem?.item_name ?? "",
              display_name: planItem?.product_type_hint ?? "unknown",
              evidence: {},
              confidence: 0.75,
            },
          }),
    };
  });
}

function relatedPlanItems(input: BatchPlanItemInput): DocumentPlanItem[] {
  return input.plan.items.filter((other) =>
    input.item.related_item_indexes?.includes(other.item_index),
  );
}

function batchInputKey(input: BatchPlanItemInput): string {
  return batchResultKey({
    documentId: input.documentId,
    extractionResultId: input.extractionResultId,
    itemIndex: input.item.item_index,
  });
}

function batchResultKey(params: {
  documentId: number;
  extractionResultId: number;
  itemIndex: number;
}): string {
  return `${params.documentId}:${params.extractionResultId}:${params.itemIndex}`;
}

function formatProductTypeOptions(
  dictionaryContext?: LlmDictionaryContext,
): string {
  return getProductTypeContexts(dictionaryContext)
    .map((item) => {
      const details = [
        item.display_name,
        item.description,
        item.aliases?.length ? `aliases: ${item.aliases.join("、")}` : null,
      ]
        .filter(Boolean)
        .join("；");
      return `* ${item.canonical_value}：${details || item.canonical_value}`;
    })
    .join("\n");
}

function buildDocumentPlanSystemPrompt(
  dictionaryContext?: LlmDictionaryContext,
): string {
  return `
你是企业级 Excel/生产明细表 Document Planner。你的任务是只判断文件结构和产品 item 范围，不做字段抽取，不做标准化。

只输出一个合法 JSON object，不要 Markdown、解释、代码块或注释。

输入是带行号的 numbered_llm_text。每行前缀形如 "0001: ..."。你的 block/range 输出必须引用这些四位数物理行号。
注意：文本内容里的 "Row 67:" 是 Excel 原始行号，不是 llm_text_ranges 行号。不要把 Excel Row 号直接填入 start_line/end_line；除非它左侧前缀也正好是同一个四位数物理行号。

必须输出：
{
  "document_info": {
    "product_number": {"value":"原文当前产品编号/当前制品编号/当前模头编号/当前配件编号","evidence":{"line":12,"text":"原文"},"confidence":0.9},
    "contract_number": {"value":"原文合同编号","evidence":{"line":12,"text":"原文"},"confidence":0.9},
    "order_number": {"value":"原文订单编号","evidence":{"line":12,"text":"原文"},"confidence":0.9}
  },
  "items": [
    {
      "item_index": 1,
      "item_name": "原文产品名称",
      "product_type_hint": "flat_die",
      "product_type_raw": "支持判断产品类型的原文",
      "item_quantity": "1套",
      "llm_text_ranges": [{"start_line": 20, "end_line": 80}],
      "block_ids": [],
      "related_item_indexes": [2],
      "relation_note": "模头与分配器属于同一套系统"
    }
  ],
  "global_context": {
    "shared_notes": "文档级共享说明",
    "business_relations": "多个 item 之间的业务关联"
  },
  "warnings": []
}

product_type_hint 只能取下列正式 product_type 字典值，无法判断时取 unknown：
${formatProductTypeOptions(dictionaryContext)}
* unknown：无法判断产品类型。

规则：
1. 只判断文档级信息、产品 item、产品类型、数量、文本范围和 item 之间关系。
2. 不要输出 raw_fields，不要抽配置字段，不要输出 term_type/canonical_value/parsed_value。
3. 如果文件包含“模头 + 定型模 + 分配器 + 连接器/联结器/换网器/计量泵/液压站”等多个可报价对象，必须拆成多个 items。
4. 如果多个 item 属于一套系统，用 related_item_indexes 和 relation_note 表达，不要把它们合并成一个 item。
5. document_info 只放文档级信息：当前产品编号、合同/订单、客户、发货/物流、日期、业务人员、使用市场、国家等。当前产品编号统一使用 product_number；客户写入 customer_name，客户编号/客户ID 写入 customer_id；发货/运输类写入 shipping_method；国内/出口/使用地类写入 usage_market；国家/出口国家类写入 country；模头、制品、喷丝板/喷丝组件、配件等当前对象编号都归入 product_number。同义变体按语义归类。
6. “原产品编号 / 参考产品编号 / 历史产品编号 / 互配产品编号”不是当前产品编号，不要放入 document_info.product_number；它属于 item 配置字段 reference_product，应留给 item 抽取阶段处理。
7. global_context 保留会影响后续 item 抽取的共用备注、系统关系、整套说明。
8. llm_text_ranges 要覆盖当前 item 的标题、字段区和备注区；start_line/end_line 必须使用 numbered_llm_text 左侧的四位物理行号（例如 "0067:"），不能使用 Excel "Row 67:" 的 67；宁可稍宽，不要漏掉同一 item 的上下文。
9. 定型模、二级定型模、sizing die 应作为 sizing_die item；不要合并到平模头、涂布模头或其他模头 item。
10. 风刀、气刀、贴辊风刀、真空箱、负压箱、air knife、vacuum box 等位于模头和冷却辊/滚筒之间、用于吹风或负压吸附使薄膜贴紧滚筒的装置，优先作为 air_knife item。
11. 静态混合器、喷丝板/喷丝组件、单体抽吸、IBC 气泡冷却单元、开车阀/换向阀、热风管道、保温罩、控温系统等，如果以独立标题、产品编号、数量或独立配置块出现，应拆成独立 item；如果只在主产品配置项、勾选项或备注里出现，则作为当前 item 的配置字段。
12. 如果某个配套产品的配置藏在另一个产品块里，也必须拆出独立 item，并用 related_item_indexes 关联原块。例如换网器块内出现“配液压站/液压站功率/油箱容量/液压压力/液压站控制方式”等，应额外输出 hydraulic_station item，文本范围覆盖这些液压站相关行；换网器 item 保留自身过滤/换网字段。
`;
}

function buildProductTypeFocus(
  productTypeHint: string,
  dictionaryContext?: LlmDictionaryContext,
): string {
  const productType = getProductTypeContexts(dictionaryContext).find(
    (item) => item.canonical_value === productTypeHint,
  );
  if (!productType) {
    return "未知产品类型，抽取明确属于当前 item 的产品配置字段，避免抽文档级人员/日期字段。";
  }

  return [
    productType.display_name,
    productType.description,
    productType.aliases?.length
      ? `常见别名/表述：${productType.aliases.join("、")}`
      : null,
  ]
    .filter(Boolean)
    .join("；");
}

function buildItemExtractSystemPrompt(
  productTypeHint: string,
  dictionaryContext?: LlmDictionaryContext,
): string {
  const productFocus = buildProductTypeFocus(productTypeHint, dictionaryContext);
  return `
你是企业级生产明细表 Item Raw Extraction 专家。你现在只抽取一个 item 或与它强相关的一组 item。

当前 product_type_hint = ${productTypeHint}
抽取重点：${productFocus}

你只做 raw extraction，不做 normalization。

必须遵守：
1. 只输出一个合法 JSON object，不输出 Markdown、解释、代码块或注释。
2. 输出结构必须是当前系统兼容格式：{"extraction":{"document_info":{},"items":[...]},"warnings":[]}。
3. items 通常只输出 current_item 对应的一个 item；如果输入显示当前 item 必须和相关 item 成组才能解释，可以输出多个 items，但不要重复抽无关 item。
4. raw_fields 中禁止出现 term_type、canonical_value、parsed_value、dictionary_proposals。
5. value/raw_text 必须保留原文，不要翻译、标准化或改写。
6. 每个 item 必须有 item_index、product_type_hint、raw_fields。
7. 每个 raw_field 必须有 field_name、value、raw_text、evidence、confidence。
8. 如果字段值明显包含多个业务属性，在该 raw_field 上输出 split_fields；split_fields 也只能用中文 field_name 和原文 value。
9. 只输出属于当前 product_type 或 current_item 的配置字段；不要把 related_item_summaries 里的字段误放到 current item。
10. document_info 可以带回阶段一已有文档级信息；客户、发货/物流、业务员、制单人、使用市场、国家等文档级字段不能放进 raw_fields，只能写入 document_info。同义变体按语义归类。
11. dictionary_context 只用于理解字段边界和字段适用产品范围；不要输出其中的 term_type 或 canonical value。
12. [SEL]、■、☑、✔、✓ 表示选中；[ ]、□ 表示未选中。多选字段只输出选中的选项。
13. 如果 current_item_blocks 中同时包含当前 item 和隐藏的配套 item 配置，可以输出多个 items 来保留边界。典型场景：换网器配置块里写“配液压站”、液压站型号、功率、油箱容量、液压压力、控制方式等，这些字段必须放入 product_type_hint.value = "hydraulic_station" 的 item，不要混入 filter item。
14. 如果当前 product_type_hint 是 sizing_die，应抽取定型模/二级定型模/sizing die 自身配置；不要因为它属于模具体系就改成 flat_die 或 coating_die。
15. 如果当前 product_type_hint 是 air_knife，应抽取风刀/气刀/贴辊风刀/真空箱/负压箱自身配置；不要因为它安装在模头和滚筒之间就合并到 flat_die 或冷却辊 item。
16. “模头有效宽度 / 口模宽度 / 口模有效宽度”属于模头 item，不要放入 feedblock/分配器 item；如果 current_item_blocks 同时覆盖分配器和模头字段，应拆出或归回模头 item。
17. 如果 current_item_blocks 里出现静态混合器、喷丝板/喷丝组件、单体抽吸、IBC 气泡冷却单元、开车阀/换向阀、热风管道、保温罩、控温系统等独立标题、产品编号、数量或配置块，可以输出对应独立 item；如果只是当前产品的勾选配置或备注，不要拆 item。
18. 字段名末尾出现实例序号（半角数字 1/2/3/N、全角数字 １/２/３/N、中文数字 一/二/三/十等）是同类产品多实例配置的重要信号，不限定产品类型。例如“尺寸1/尺寸2/尺寸3”、“重量1/重量2/重量3”、“排量1/排量2/排量3 + 转速1/转速2/转速3”。
19. 如果当前 item 数量大于 1，或多个字段共享连续实例序号 1..N，且能判断这些字段属于同一 product_type 的 N 个配置实例，应拆成 N 个同 product_type items。第一个 item 使用 current_item.item_index；其余 item 可以先使用相同 item_index 或合理新 index，后端会 reindex。
20. 拆分后的每个 item 只保留对应实例序号的字段，并把字段名还原为基础字段。例如“尺寸2”在第二个 item 中输出为“尺寸”。缺失字段不要编造。
21. 如果序号不连续或证据不足，例如只有“尺寸3”或只有“尺寸1/尺寸3”，不要自动补齐或强拆；保留原字段，并在 warnings 中输出 possible_indexed_instance_fields_needs_review。

输出示例：
{
  "extraction": {
    "document_info": {},
    "items": [
      {
        "item_index": 1,
        "item_name": {"value":"原文产品名","evidence":{},"confidence":0.9},
        "item_quantity": {"value":"1套","evidence":{},"confidence":0.9},
        "product_type_hint": {
          "value": "${productTypeHint}",
          "raw_value": "支持判断产品类型的原文",
          "display_name": "中文产品类型",
          "evidence": {},
          "confidence": 0.9
        },
        "raw_fields": [
          {
            "field_name": "中文字段名",
            "value": "原文值",
            "selected": true,
            "raw_text": "支持抽取的原文片段",
            "evidence": {},
            "confidence": 0.95
          }
        ]
      }
    ]
  },
  "warnings": []
}
`;
}

function buildBatchItemExtractSystemPrompt(
  productTypeHint: string,
  dictionaryContext?: LlmDictionaryContext,
): string {
  const productFocus = buildProductTypeFocus(productTypeHint, dictionaryContext);
  return `
你是企业级生产明细表 Batch Item Raw Extraction 专家。你现在会收到多个不同 document/extraction 中、相同 product_type_hint 的待抽取 item。

当前批次 product_type_hint = ${productTypeHint}
抽取重点：${productFocus}

你只做 raw extraction，不做 normalization。

必须遵守：
1. 只输出一个合法 JSON object，不输出 Markdown、解释、代码块或注释。
2. 输出结构必须是 {"results":[...]}。
3. results 中必须为每个输入 batch_items 输出一个结果，不能漏项、不能重复、不能输出输入之外的 document/extraction/item。
4. 每个 result 必须带回输入中的 documentId、extractionResultId、item_index。
5. 每个 result.extraction 必须使用现有兼容格式：{"document_info":{},"items":[...]}；每个 result 也必须有 warnings 数组。
6. result.extraction.items 通常只输出当前 item；如果 current_item_blocks 显示当前 item 必须和隐藏配套 item 成组才能解释，可以输出多个 items，但不要重复抽无关 item。
7. raw_fields 中禁止出现 term_type、canonical_value、parsed_value、dictionary_proposals。
8. value/raw_text 必须保留原文，不要翻译、标准化或改写。
9. 每个 item 必须有 item_index、product_type_hint、raw_fields。
10. 每个 raw_field 必须有 field_name、value、raw_text、evidence、confidence。
11. 如果字段值明显包含多个业务属性，在该 raw_field 上输出 split_fields；split_fields 也只能用中文 field_name 和原文 value。
12. 只输出属于当前 product_type 或 current_item 的配置字段；不要把 related_item_summaries 里的字段误放到 current item。
13. 禁止把客户、发货/物流、使用市场、国家等文档级字段放入 raw_fields；这些字段只属于 document_info。客户写入 customer_name；发货/运输类写入 shipping_method；国内/出口/使用地类写入 usage_market；国家/出口国家类写入 country。同义变体按语义归类。
14. dictionary_context 只用于理解字段边界和字段适用产品范围；不要输出其中的 term_type 或 canonical value。
15. [SEL]、■、☑、✔、✓ 表示选中；[ ]、□ 表示未选中。多选字段只输出选中的选项。
16. 如果 current_item_blocks 中同时包含当前 item 和隐藏的配套 item 配置，可以输出多个 items 来保留边界。典型场景：换网器配置块里写“配液压站”、液压站型号、功率、油箱容量、液压压力、控制方式等，这些字段必须放入 product_type_hint.value = "hydraulic_station" 的 item，不要混入 filter item。
17. 如果当前 product_type_hint 是 sizing_die，应抽取定型模/二级定型模/sizing die 自身配置；不要因为它属于模具体系就改成 flat_die 或 coating_die。
18. 如果当前 product_type_hint 是 air_knife，应抽取风刀/气刀/贴辊风刀/真空箱/负压箱自身配置；不要因为它安装在模头和滚筒之间就合并到 flat_die 或冷却辊 item。
19. “模头有效宽度 / 口模宽度 / 口模有效宽度”属于模头 item，不要放入 feedblock/分配器 item；如果 current_item_blocks 同时覆盖分配器和模头字段，应拆出或归回模头 item。
20. 如果 current_item_blocks 里出现静态混合器、喷丝板/喷丝组件、单体抽吸、IBC 气泡冷却单元、开车阀/换向阀、热风管道、保温罩、控温系统等独立标题、产品编号、数量或配置块，可以输出对应独立 item；如果只是当前产品的勾选配置或备注，不要拆 item。
21. 字段名末尾出现实例序号（半角数字 1/2/3/N、全角数字 １/２/３/N、中文数字 一/二/三/十等）是同类产品多实例配置的重要信号，不限定产品类型。例如“尺寸1/尺寸2/尺寸3”、“重量1/重量2/重量3”、“排量1/排量2/排量3 + 转速1/转速2/转速3”。
22. 如果当前 item 数量大于 1，或多个字段共享连续实例序号 1..N，且能判断这些字段属于同一 product_type 的 N 个配置实例，应拆成 N 个同 product_type items。第一个 item 使用输入 item_index；其余 item 可以先使用相同 item_index 或合理新 index，后端会 reindex。
23. 拆分后的每个 item 只保留对应实例序号的字段，并把字段名还原为基础字段。例如“尺寸2”在第二个 item 中输出为“尺寸”。缺失字段不要编造。
24. 如果序号不连续或证据不足，例如只有“尺寸3”或只有“尺寸1/尺寸3”，不要自动补齐或强拆；保留原字段，并在 warnings 中输出 possible_indexed_instance_fields_needs_review。

输出示例：
{
  "results": [
    {
      "documentId": 100,
      "extractionResultId": 200,
      "item_index": 1,
      "extraction": {
        "document_info": {},
        "items": [
          {
            "item_index": 1,
            "item_name": {"value":"原文产品名","evidence":{},"confidence":0.9},
            "item_quantity": {"value":"1套","evidence":{},"confidence":0.9},
            "product_type_hint": {
              "value": "${productTypeHint}",
              "raw_value": "支持判断产品类型的原文",
              "display_name": "中文产品类型",
              "evidence": {},
              "confidence": 0.9
            },
            "raw_fields": [
              {
                "field_name": "中文字段名",
                "value": "原文值",
                "selected": true,
                "raw_text": "支持抽取的原文片段",
                "evidence": {},
                "confidence": 0.95
              }
            ]
          }
        ]
      },
      "warnings": []
    }
  ]
}
`;
}
