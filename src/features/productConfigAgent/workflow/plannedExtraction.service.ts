import { buildLlmText } from "../excelParser/index.js";
import {
  extractItemBatchFromPlansWithXh,
  extractItemsFromPlanWithXh,
  planDocumentWithXh,
} from "../extraction/index.js";
import type {
  BatchItemExtractResult,
  BatchPlanItemInput,
} from "../extraction/index.js";
import type { ProductConfigAgentRepository } from "../db.service.js";
import type { DictionaryService, LlmDictionaryContext } from "../dictionary/dictionary.service.js";
import type { NormalizationRefreshService } from "../normalization/normalizationRefresh.service.js";
import {
  DEFAULT_DICTIONARY_VERSION,
  DEFAULT_LLM_MODEL,
  getFirstSheetName,
  TWO_STAGE_PROMPT_VERSION,
  updateDocumentStatus,
} from "./common.js";

function mergeExtractionJson(existing: any, next: any) {
  const existingItems = Array.isArray(existing?.items) ? existing.items : [];
  const nextItems = Array.isArray(next?.items) ? next.items : [];
  const itemsByIndex = new Map<number, any>();

  for (const item of existingItems) {
    if (typeof item?.item_index === "number") {
      itemsByIndex.set(item.item_index, item);
    }
  }

  for (const item of nextItems) {
    if (typeof item?.item_index === "number") {
      itemsByIndex.set(item.item_index, item);
    }
  }

  return {
    document_info: {
      ...(existing?.document_info ?? {}),
      ...(next?.document_info ?? {}),
    },
    items: [...itemsByIndex.values()].sort(
      (a, b) => Number(a.item_index) - Number(b.item_index),
    ),
  };
}

type BatchItemStatus = {
  documentId: number;
  extractionResultId: number;
  itemIndex: number;
  productType: string;
  status: "success" | "failed";
  error?: string;
};

type PreparedBatchItem = BatchPlanItemInput & {
  productType: string;
  document: any;
  extraction: any;
};

export class PlannedExtractionService {
  constructor(
    private readonly repository: ProductConfigAgentRepository,
    private readonly dictionaryService: DictionaryService,
    private readonly normalizationRefreshService: NormalizationRefreshService,
  ) {}

  async planDocumentBlocksWithLlm(params: {
    documentId: number;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    dictionaryContext?: LlmDictionaryContext;
    forceReplan?: boolean;
  }): Promise<any> {
    const promptVersion = params.promptVersion ?? TWO_STAGE_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const document = await this.repository.findDocumentById(params.documentId);
    if (!document) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    const blocks = await this.repository.findBlocksByDocumentId(params.documentId);
    if (!blocks) {
      throw new Error(`Document blocks not found: ${params.documentId}`);
    }

    if (params.forceReplan !== true) {
      const existing = await this.repository.findLatestExtraction({
        documentId: document.id,
        promptVersion,
        dictionaryVersion,
        llmModel,
      });
      if (existing?.llmPlanJson) {
        return {
          document,
          blocks,
          extraction: existing,
          plan: existing.llmPlanJson,
          reusedPlan: true,
        };
      }
    }

    const dictionaryContext =
      params.dictionaryContext ??
      (await this.dictionaryService.getLlmDictionaryContext());
    const llmText = blocks.blocksJson.llm_text || buildLlmText(blocks.blocksJson);
    const plan = await planDocumentWithXh(
      {
        llmText,
        textBlocks: blocks.blocksJson.blocks,
        blocksJson: blocks.blocksJson,
        dictionaryContext,
        fileName: document.fileName,
        sheetName: getFirstSheetName(blocks.blocksJson),
      },
      llmModel,
    );

    const extraction = await this.repository.createExtraction({
      documentId: document.id,
      extractionJson: { document_info: {}, items: [] },
      dictionaryProposals: [],
      warnings: plan.warnings ?? [],
      llmPlanJson: plan,
      llmModel,
      promptVersion,
      dictionaryVersion,
      status: "planned",
    });

    if (!["normalized", "dictionary_dirty"].includes(document.status)) {
      await updateDocumentStatus(this.repository, document, "planned");
    }

    return {
      document,
      blocks,
      extraction,
      plan,
      reusedPlan: false,
    };
  }

  async extractPlannedItemsWithLlm(params: {
    extractionResultId: number;
    llmModel?: string;
    itemProductType?: string;
    maxItemConcurrency?: number;
  }): Promise<any> {
    const extraction = await this.repository.findExtractionById(
      params.extractionResultId,
    );
    if (!extraction) {
      throw new Error(`Extraction not found: ${params.extractionResultId}`);
    }
    if (!extraction.llmPlanJson?.items?.length) {
      throw new Error(`Extraction has no llm_plan_json items: ${params.extractionResultId}`);
    }

    const document = await this.repository.findDocumentById(extraction.documentId);
    if (!document) {
      throw new Error(`Document not found: ${extraction.documentId}`);
    }

    const blocks = await this.repository.findBlocksByDocumentId(extraction.documentId);
    if (!blocks) {
      throw new Error(`Document blocks not found: ${extraction.documentId}`);
    }

    const productType = params.itemProductType?.trim();
    const plannedItems = Array.isArray(extraction.llmPlanJson.items)
      ? extraction.llmPlanJson.items
      : [];
    const pendingItems = plannedItems.filter((item: any) => {
      if (item?.extracted_at) return false;
      if (!productType) return true;
      return item?.product_type_hint === productType;
    });

    if (!pendingItems.length) {
      return {
        document,
        extraction,
        skipped: true,
        reason: productType
          ? `No pending planned items for product type: ${productType}`
          : "No pending planned items",
      };
    }

    const dictionaryContext = await this.dictionaryService.getLlmDictionaryContext();
    const llmText = blocks.blocksJson.llm_text || buildLlmText(blocks.blocksJson);
    const llmResult = await extractItemsFromPlanWithXh(
      {
        llmText,
        textBlocks: blocks.blocksJson.blocks,
        blocksJson: blocks.blocksJson,
        dictionaryContext,
        fileName: document.fileName,
        sheetName: getFirstSheetName(blocks.blocksJson),
        plan: extraction.llmPlanJson,
        itemProductType: productType,
        itemIndexes: pendingItems.map((item: any) => Number(item.item_index)),
        maxItemConcurrency: params.maxItemConcurrency,
      },
      params.llmModel ?? extraction.llmModel,
    );

    const extractedItemIndexes = new Set(
      llmResult.extraction.items.map((item) => item.item_index),
    );
    const now = new Date().toISOString();
    const nextPlan = {
      ...extraction.llmPlanJson,
      items: plannedItems.map((item: any) =>
        extractedItemIndexes.has(Number(item.item_index))
          ? {
              ...item,
              extraction_status: "extracted",
              extracted_at: now,
            }
          : item,
      ),
    };
    const allItemsExtracted = nextPlan.items.every((item: any) => item?.extracted_at);
    const mergedExtractionJson = mergeExtractionJson(
      extraction.extractionJson,
      llmResult.extraction,
    );

    const updatedExtraction = await this.repository.updateExtractionAfterLlm({
      extractionResultId: extraction.id,
      extractionJson: mergedExtractionJson,
      warnings: llmResult.warnings ?? [],
      llmPlanJson: nextPlan,
      status: allItemsExtracted ? "parsed" : "planned_partial",
    });

    const dictionary =
      await this.normalizationRefreshService.generateDictionaryForExtraction({
        documentId: document.id,
        extraction: updatedExtraction,
        status: allItemsExtracted ? "normalized" : "planned_partial",
        documentStatus: allItemsExtracted ? "normalized" : "planned_partial",
      });
    updatedExtraction.normalizedExtractionJson = dictionary.extraction_json;
    updatedExtraction.dictionaryProposals = dictionary;
    updatedExtraction.status = allItemsExtracted
      ? "normalized"
      : "planned_partial";

    return {
      document,
      extraction: updatedExtraction,
      dictionary,
      skipped: false,
      extractedItemCount: llmResult.extraction.items.length,
      allItemsExtracted,
    };
  }

  async extractPlannedItemsBatchWithLlm(params: {
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    itemProductType?: string;
    limit?: number;
    batchSize?: number;
    concurrency?: number;
  }): Promise<{
    skipped: boolean;
    itemCount: number;
    successItemCount: number;
    failedItemCount: number;
    updatedExtractionCount: number;
    batchCount: number;
    results: BatchItemStatus[];
  }> {
    const promptVersion = params.promptVersion ?? TWO_STAGE_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const batchSize = Math.max(1, Math.min(20, Number(params.batchSize ?? 5) || 5));
    const concurrency = Math.max(1, Math.min(16, Number(params.concurrency ?? 4) || 4));
    const productType = params.itemProductType?.trim();
    const extractions = await this.repository.findPlannedExtractions({
      limit: params.limit,
      promptVersion,
      dictionaryVersion,
      llmModel,
      productType,
    });

    const preparedItems = await this.collectPendingBatchItems({
      extractions,
      productType,
    });
    if (!preparedItems.length) {
      return {
        skipped: true,
        itemCount: 0,
        successItemCount: 0,
        failedItemCount: 0,
        updatedExtractionCount: 0,
        batchCount: 0,
        results: [],
      };
    }

    const dictionaryContext = await this.dictionaryService.getLlmDictionaryContext();
    const batches = chunkBatchItems(groupBatchItems(preparedItems), batchSize);
    const extractionMap = new Map(
      preparedItems.map((item) => [item.extractionResultId, item.extraction]),
    );
    const documentMap = new Map(
      preparedItems.map((item) => [item.documentId, item.document]),
    );
    const successResults: BatchItemExtractResult[] = [];
    const failedResults: BatchItemStatus[] = [];

    await mapWithConcurrency(batches, concurrency, async (batch) => {
      const results = await this.extractBatchWithSplit({
        items: batch.items,
        productType: batch.productType,
        dictionaryContext,
        model: llmModel,
      });
      successResults.push(...results.successes);
      failedResults.push(...results.failures);
    });

    const updateResults = await this.updateExtractionsFromBatchResults({
      successResults,
      extractionMap,
      documentMap,
    });
    const updateFailureKeys = new Set(updateResults.failures.map(batchStatusKey));
    const successStatuses = successResults
      .filter((item) => !updateFailureKeys.has(batchResultStatusKey(item)))
      .map((item) => ({
        documentId: item.documentId,
        extractionResultId: item.extractionResultId,
        itemIndex: item.itemIndex,
        productType: getPreparedProductType(preparedItems, item),
        status: "success" as const,
      }));
    const results = [...successStatuses, ...failedResults, ...updateResults.failures];

    return {
      skipped: false,
      itemCount: preparedItems.length,
      successItemCount: successStatuses.length,
      failedItemCount: failedResults.length + updateResults.failures.length,
      updatedExtractionCount: updateResults.updatedExtractionCount,
      batchCount: batches.length,
      results,
    };
  }

  private async collectPendingBatchItems(params: {
    extractions: any[];
    productType?: string;
  }): Promise<PreparedBatchItem[]> {
    const preparedItems: PreparedBatchItem[] = [];

    for (const extraction of params.extractions) {
      if (!extraction.llmPlanJson?.items?.length) {
        continue;
      }
      const document = await this.repository.findDocumentById(extraction.documentId);
      if (!document) {
        continue;
      }
      const blocks = await this.repository.findBlocksByDocumentId(extraction.documentId);
      if (!blocks) {
        continue;
      }
      const plannedItems = Array.isArray(extraction.llmPlanJson.items)
        ? extraction.llmPlanJson.items
        : [];
      const llmText = blocks.blocksJson.llm_text || buildLlmText(blocks.blocksJson);
      const sheetName = getFirstSheetName(blocks.blocksJson);

      for (const item of plannedItems) {
        if (item?.extracted_at) continue;
        const productType = String(item?.product_type_hint ?? "unknown").trim() || "unknown";
        if (params.productType && productType !== params.productType) continue;
        preparedItems.push({
          documentId: Number(document.id),
          extractionResultId: Number(extraction.id),
          fileName: document.fileName,
          sheetName,
          plan: extraction.llmPlanJson,
          item,
          llmText,
          blocksJson: blocks.blocksJson,
          productType,
          document,
          extraction,
        });
      }
    }

    return preparedItems;
  }

  private async extractBatchWithSplit(params: {
    items: PreparedBatchItem[];
    productType: string;
    dictionaryContext: LlmDictionaryContext;
    model: string;
  }): Promise<{
    successes: BatchItemExtractResult[];
    failures: BatchItemStatus[];
  }> {
    try {
      const successes = await extractItemBatchFromPlansWithXh(
        {
          productTypeHint: params.productType,
          inputs: params.items,
          dictionaryContext: params.dictionaryContext,
        },
        params.model,
      );
      return { successes, failures: [] };
    } catch (error) {
      if (params.items.length === 1) {
        const item = params.items[0];
        return {
          successes: [],
          failures: [
            {
              documentId: item.documentId,
              extractionResultId: item.extractionResultId,
              itemIndex: item.item.item_index,
              productType: item.productType,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }

      const middle = Math.ceil(params.items.length / 2);
      const [left, right] = await Promise.all([
        this.extractBatchWithSplit({
          ...params,
          items: params.items.slice(0, middle),
        }),
        this.extractBatchWithSplit({
          ...params,
          items: params.items.slice(middle),
        }),
      ]);
      return {
        successes: [...left.successes, ...right.successes],
        failures: [...left.failures, ...right.failures],
      };
    }
  }

  private async updateExtractionsFromBatchResults(params: {
    successResults: BatchItemExtractResult[];
    extractionMap: Map<number, any>;
    documentMap: Map<number, any>;
  }): Promise<{ updatedExtractionCount: number; failures: BatchItemStatus[] }> {
    const byExtraction = new Map<number, BatchItemExtractResult[]>();
    for (const result of params.successResults) {
      byExtraction.set(result.extractionResultId, [
        ...(byExtraction.get(result.extractionResultId) ?? []),
        result,
      ]);
    }

    let updatedExtractionCount = 0;
    const failures: BatchItemStatus[] = [];
    for (const [extractionResultId, results] of byExtraction.entries()) {
      const extraction = params.extractionMap.get(extractionResultId);
      const document = params.documentMap.get(Number(extraction?.documentId));
      if (!extraction || !document) {
        failures.push(
          ...results.map((result) => ({
            documentId: result.documentId,
            extractionResultId: result.extractionResultId,
            itemIndex: result.itemIndex,
            productType: String(
              result.result.extraction.items[0]?.product_type_hint?.value ?? "unknown",
            ),
            status: "failed" as const,
            error: "Extraction or document was not found while updating batch results",
          })),
        );
        continue;
      }

      try {
        const plannedItems = Array.isArray(extraction.llmPlanJson?.items)
          ? extraction.llmPlanJson.items
          : [];
        const extractedItemIndexes = new Set(results.map((result) => result.itemIndex));
        const now = new Date().toISOString();
        const nextPlan = {
          ...extraction.llmPlanJson,
          items: plannedItems.map((item: any) =>
            extractedItemIndexes.has(Number(item.item_index))
              ? {
                  ...item,
                  extraction_status: "extracted",
                  extracted_at: now,
                }
              : item,
          ),
        };
        const allItemsExtracted = nextPlan.items.every((item: any) => item?.extracted_at);
        const combinedExtraction = {
          document_info: results.reduce(
            (documentInfo, result) => ({
              ...documentInfo,
              ...(result.result.extraction.document_info ?? {}),
            }),
            {},
          ),
          items: results.flatMap((result) => result.result.extraction.items),
        };
        const mergedExtractionJson = mergeExtractionJson(
          extraction.extractionJson,
          combinedExtraction,
        );
        const updatedExtraction = await this.repository.updateExtractionAfterLlm({
          extractionResultId: extraction.id,
          extractionJson: mergedExtractionJson,
          warnings: results.flatMap((result) => result.result.warnings ?? []),
          llmPlanJson: nextPlan,
          status: allItemsExtracted ? "parsed" : "planned_partial",
        });

        const dictionary =
          await this.normalizationRefreshService.generateDictionaryForExtraction({
            documentId: document.id,
            extraction: updatedExtraction,
            status: allItemsExtracted ? "normalized" : "planned_partial",
            documentStatus: allItemsExtracted ? "normalized" : "planned_partial",
          });
        updatedExtraction.normalizedExtractionJson = dictionary.extraction_json;
        updatedExtraction.dictionaryProposals = dictionary;
        updatedExtraction.status = allItemsExtracted
          ? "normalized"
          : "planned_partial";
        updatedExtractionCount += 1;
      } catch (error) {
        failures.push(
          ...results.map((result) => ({
            documentId: result.documentId,
            extractionResultId: result.extractionResultId,
            itemIndex: result.itemIndex,
            productType: String(
              result.result.extraction.items[0]?.product_type_hint?.value ?? "unknown",
            ),
            status: "failed" as const,
            error: error instanceof Error ? error.message : String(error),
          })),
        );
      }
    }

    return { updatedExtractionCount, failures };
  }
}

function groupBatchItems(
  items: PreparedBatchItem[],
): Array<{ productType: string; items: PreparedBatchItem[] }> {
  const grouped = new Map<string, PreparedBatchItem[]>();
  for (const item of items) {
    grouped.set(item.productType, [...(grouped.get(item.productType) ?? []), item]);
  }
  return [...grouped.entries()].map(([productType, groupedItems]) => ({
    productType,
    items: groupedItems,
  }));
}

function chunkBatchItems(
  groups: Array<{ productType: string; items: PreparedBatchItem[] }>,
  batchSize: number,
): Array<{ productType: string; items: PreparedBatchItem[] }> {
  const batches: Array<{ productType: string; items: PreparedBatchItem[] }> = [];
  for (const group of groups) {
    for (let index = 0; index < group.items.length; index += batchSize) {
      batches.push({
        productType: group.productType,
        items: group.items.slice(index, index + batchSize),
      });
    }
  }
  return batches;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await mapper(item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

function getPreparedProductType(
  preparedItems: PreparedBatchItem[],
  result: BatchItemExtractResult,
): string {
  return (
    preparedItems.find(
      (item) =>
        item.documentId === result.documentId &&
        item.extractionResultId === result.extractionResultId &&
        item.item.item_index === result.itemIndex,
    )?.productType ?? "unknown"
  );
}

function batchStatusKey(status: BatchItemStatus): string {
  return `${status.documentId}:${status.extractionResultId}:${status.itemIndex}`;
}

function batchResultStatusKey(result: BatchItemExtractResult): string {
  return `${result.documentId}:${result.extractionResultId}:${result.itemIndex}`;
}
