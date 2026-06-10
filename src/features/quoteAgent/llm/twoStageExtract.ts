import type { LlmDictionaryContext } from "../dictionary/dictionary.service.js";
import { getXhClient, requestXhChatJson } from "../../../llm/xhClient.js";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseExtractResult.js";
import type {
  LlmChatMessage,
} from "../../../llm/deepseekClient.js";
import type {
  LlmExtractionItem,
  LlmExtractParams,
  LlmExtractResult,
} from "./types.js";

const FALLBACK_PRODUCT_TYPE_HINTS = [
  "flat_die",
  "feedblock",
  "filter",
  "metering_pump",
  "hydraulic_station",
  "melt_pipe",
  "blown_film_die",
  "coating_die",
  "die_cart",
  "unknown",
];

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

function selectBlocksByIds(blocksJson: any, blockIds: string[] | undefined) {
  const ids = new Set(blockIds ?? []);
  if (!ids.size || !Array.isArray(blocksJson?.blocks)) {
    return [];
  }
  return blocksJson.blocks.filter((block: any) => ids.has(block?.block_id));
}

function buildItemInputText(
  llmText: string,
  blocksJson: any,
  item: DocumentPlanItem,
): string {
  const byRange = sliceLlmTextByRanges(llmText, item.llm_text_ranges);
  if (byRange.trim()) {
    return byRange;
  }

  const byBlocks = selectBlocksByIds(blocksJson, item.block_ids);
  if (byBlocks.length) {
    return byBlocks
      .map((block: any) => `[${block.block_id}]\n${block.text ?? block.raw_text ?? ""}`)
      .join("\n\n");
  }

  return llmText;
}

export function filterDictionaryContextForProductType(
  dictionaryContext: LlmDictionaryContext,
  productTypeHint: string | null | undefined,
): LlmDictionaryContext {
  const productType = normalizeProductTypeHint(productTypeHint, dictionaryContext);
  return {
    product_types: dictionaryContext.product_types,
    term_types: dictionaryContext.term_types.filter((termType) => {
      const applicable = termType.applicable_product_types ?? [];
      if (!applicable.length) return true;
      return applicable.includes("common") || applicable.includes(productType);
    }),
  };
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
        current_item: params.item,
        current_item_blocks: params.itemText,
        related_item_summaries: params.relatedItemSummaries,
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
  const client = getXhClient();
  const llmText = params.llmText ?? "";

  const planContent = await requestXhChatJson({
    client,
    model,
    purpose: "quote_agent_plan",
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
  const client = getXhClient();
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
      const itemText = buildItemInputText(llmText, params.blocksJson, item);
      const content = await requestXhChatJson({
        client,
        model,
        purpose: `quote_agent_item_extract_${productType}`,
        messages: buildItemMessages({
          fileName: params.fileName,
          sheetName: params.sheetName,
          plan,
          item,
          itemText,
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

输入是带行号的 numbered_llm_text。每行前缀形如 "0001: ..."。你的 block/range 输出要尽量引用这些行号。

必须输出：
{
  "document_info": {
    "die_number": {"value":"原文值","evidence":{"line":12,"text":"原文"},"confidence":0.9}
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
3. 如果文件包含“模头 + 分配器 + 连接器/联结器/换网器/计量泵”等多个可报价对象，必须拆成多个 items。
4. 如果多个 item 属于一套系统，用 related_item_indexes 和 relation_note 表达，不要把它们合并成一个 item。
5. document_info 只放订单号、客户、日期、业务人员等文档级信息。
6. global_context 保留会影响后续 item 抽取的共用备注、系统关系、整套说明。
7. llm_text_ranges 要覆盖当前 item 的标题、字段区和备注区；宁可稍宽，不要漏掉同一 item 的上下文。
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
10. document_info 可以带回阶段一已有文档级信息，但不要把业务员、制单人等人员字段放进 raw_fields。
11. dictionary_context 只用于理解字段边界和字段适用产品范围；不要输出其中的 term_type 或 canonical value。
12. [SEL]、■、☑、✔、✓ 表示选中；[ ]、□ 表示未选中。多选字段只输出选中的选项。

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
