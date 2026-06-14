import { buildLlmText } from "../excelParser/index.js";
import {
  extractItemsFromPlanWithXh,
  planDocumentWithXh,
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
}
