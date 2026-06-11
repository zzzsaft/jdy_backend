import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { buildLlmText, parseExcel } from "./excelParser/index.js";
import type { ExcelParserOptions } from "./excelParser/index.js";
import {
  extractItemsFromPlanWithXh,
  extractProductConfigWithLLM,
  extractProductConfigWithTwoStageXh,
  getInferAiChatModel,
  planDocumentWithXh,
} from "./llm/index.js";
import {
  DictionaryService,
  type LlmDictionaryContext,
} from "./dictionary/dictionary.service.js";
import {
  coerceLlmExtractionResult,
  DictionaryExtractionService,
  type DictionaryExtractionResult,
} from "./dictionary/dictionaryExtraction.service.js";
import { quoteAgentRepository } from "./db.service.js";
import type { QuoteAgentRepository } from "./db.service.js";
import { PgDataSource } from "../../config/data-source.js";
import { logger } from "../../config/logger.js";

const DEFAULT_PARSER_VERSION = "v1";
const DEFAULT_PROMPT_VERSION = "v2";
const DEFAULT_DICTIONARY_VERSION = 1;
const DEFAULT_LLM_MODEL = "gemma4:12b";
const DEFAULT_PENDING_LLM_BATCH_LIMIT = 500;
const DEFAULT_PENDING_LLM_CONCURRENCY = 3;
const TWO_STAGE_PROMPT_VERSION = "v3-plan-item";

function safeJsonByteLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return -1;
  }
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

type PendingLlmUploadJobStatus = "running" | "completed" | "failed";

export type PendingLlmDocumentProgress = {
  documentId: number;
  fileName: string;
  contentLength: number;
  chunkCount: number;
  status: "running" | "success" | "failed";
  finishReason?: string | null;
  error?: string;
};

export type PendingLlmUploadJob = {
  id: string;
  status: PendingLlmUploadJobStatus;
  llmModel: string;
  limit: number;
  concurrency: number;
  startedAt: string;
  finishedAt?: string;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  currentDocumentId?: number;
  currentDocumentIds?: number[];
  documentProgress: PendingLlmDocumentProgress[];
  errors: Array<{
    documentId: number;
    fileName: string;
    error: string;
  }>;
};

export type QuoteAgentProcessParams = {
  filePath: string;
  fileName?: string;
  source?: string;
  parserVersion?: string;
  promptVersion?: string;
  dictionaryVersion?: number;
  dictionaryContext?: LlmDictionaryContext;
  llmModel?: string;
  forceReparse?: boolean;
  forceReextract?: boolean;
  parserOptions?: ExcelParserOptions;
};

export type QuoteAgentProcessResult = {
  document: any;
  blocks: any;
  extraction: any;
  dictionary: DictionaryExtractionResult | null;
  reusedBlocks: boolean;
  reusedExtraction: boolean;
};

export type QuoteAgentParseAndSaveBlocksResult = {
  document: any;
  blocks: any;
  reusedBlocks: boolean;
};

export type QuoteAgentParseAndSaveBlocksBatchSuccess =
  QuoteAgentParseAndSaveBlocksResult & {
    fileName: string;
    filePath: string;
  };

export type QuoteAgentParseAndSaveBlocksBatchError = {
  fileName: string;
  filePath: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
};

export type QuoteAgentParseAndSaveBlocksBatchResult = {
  successes: QuoteAgentParseAndSaveBlocksBatchSuccess[];
  errors: QuoteAgentParseAndSaveBlocksBatchError[];
};

type ExtractWithLLMParams = {
  blocksJson: any;
  dictionaryContext: LlmDictionaryContext;
  fileName?: string;
  llmModel?: string;
  promptVersion?: string;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
};

async function markFailed(
  repository: QuoteAgentRepository,
  documentId: number | undefined
) {
  if (!documentId) return;
  try {
    await repository.updateDocumentStatus(documentId, "failed");
  } catch {
    return;
  }
}

function wrapStageError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix} ${message}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createBatchError(params: QuoteAgentProcessParams, data: {
  stage: string;
  errorCode: string;
  error: unknown;
}): QuoteAgentParseAndSaveBlocksBatchError {
  return {
    fileName: params.fileName ?? path.basename(params.filePath),
    filePath: params.filePath,
    stage: data.stage,
    errorCode: data.errorCode,
    errorMessage: getErrorMessage(data.error),
  };
}

async function updateDocumentStatus(
  repository: QuoteAgentRepository,
  document: any,
  status: string
) {
  await repository.updateDocumentStatus(document.id, status);
  document.status = status;
}

function getFirstSheetName(blocksJson: any) {
  const blocks = blocksJson?.blocks || [];
  return blocks.find((block: any) => block?.source?.sheet_name)?.source
    ?.sheet_name;
}

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

export async function calculateFileSha256(filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

export async function parseExcelToBlocks(
  filePath: string,
  options?: ExcelParserOptions
) {
  const parsed = await parseExcel(filePath, options);

  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function extractWithLLM(params: ExtractWithLLMParams) {
  const llmText = params.blocksJson.llm_text || buildLlmText(params.blocksJson);

  if (params.promptVersion === TWO_STAGE_PROMPT_VERSION) {
    return extractProductConfigWithTwoStageXh(
      {
        llmText,
        textBlocks: params.blocksJson.blocks,
        blocksJson: params.blocksJson,
        dictionaryContext: params.dictionaryContext,
        fileName: params.blocksJson.file_name ?? params.fileName,
        sheetName: getFirstSheetName(params.blocksJson),
        onStreamProgress: params.onStreamProgress,
      },
      params.llmModel,
    );
  }

  return extractProductConfigWithLLM(
    {
      llmText,
      dictionaryContext: params.dictionaryContext,
      fileName: params.blocksJson.file_name ?? params.fileName,
      sheetName: getFirstSheetName(params.blocksJson),
      onStreamProgress: params.onStreamProgress,
    },
    params.llmModel
  );
}

export async function normalizeExtraction(..._args: any[]) {
  return null;
}

export async function submitToJiandaoyunReview(..._args: any[]) {
  return null;
}

export async function publishApprovedExtraction(..._args: any[]) {
  return null;
}

export class QuoteAgentService {
  private pendingLlmUploadJob: PendingLlmUploadJob | null = null;
  private candidateRecheckJobRunning = false;
  private candidateRecheckJobPending = false;
  private candidateRecheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private repository: QuoteAgentRepository = quoteAgentRepository,
    private dictionaryService: DictionaryService = new DictionaryService(
      PgDataSource
    )
  ) {}

  private createDictionaryExtractionService() {
    return new DictionaryExtractionService(PgDataSource, this.dictionaryService);
  }

  async process(
    params: QuoteAgentProcessParams
  ): Promise<QuoteAgentProcessResult> {
    const promptVersion = params.promptVersion ?? DEFAULT_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const fileName = params.fileName ?? path.basename(params.filePath);

    const { document, blocks, reusedBlocks } = await this.parseAndSaveBlocks(
      params
    );

    let extraction: any | null = null;
    let reusedExtraction = false;

    try {
      if (params.forceReextract !== true) {
        extraction = await this.repository.findLatestExtraction({
          documentId: document.id,
          promptVersion,
          dictionaryVersion,
          llmModel,
        });
      }

      if (extraction) {
        reusedExtraction = true;
      } else {
        const dictionaryContext =
          params.dictionaryContext ??
          (await this.dictionaryService.getLlmDictionaryContext());

        const llmResult = await extractWithLLM({
          blocksJson: blocks.blocksJson,
          dictionaryContext,
          fileName,
          llmModel,
          promptVersion,
        });

        extraction = await this.repository.createExtraction({
          documentId: document.id,
          extractionJson: llmResult.extraction,
          dictionaryProposals: [],
          warnings: llmResult.warnings,
          llmPlanJson: llmResult.llmPlanJson,
          llmModel,
          promptVersion,
          dictionaryVersion,
          status: "parsed",
        });

        await updateDocumentStatus(this.repository, document, "extracted");
      }
    } catch (error) {
      await markFailed(this.repository, document.id);
      throw wrapStageError("[quoteAgent:llmExtract]", error);
    }

    let dictionary: DictionaryExtractionResult | null = null;

    try {
      dictionary = await this.generateDictionaryForExtraction({
        documentId: document.id,
        extraction,
      });
      extraction.normalizedExtractionJson = dictionary.extraction_json;
      extraction.dictionaryProposals = dictionary;
      extraction.status = "normalized";
      await updateDocumentStatus(this.repository, document, "normalized");
    } catch (error) {
      await markFailed(this.repository, document.id);
      throw wrapStageError("[quoteAgent:dictionary]", error);
    }

    return {
      document,
      blocks,
      extraction,
      dictionary,
      reusedBlocks,
      reusedExtraction,
    };
  }

  async extractDocumentBlocksWithLlm(params: {
    documentId: number;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    dictionaryContext?: LlmDictionaryContext;
    forceReextract?: boolean;
    onStreamProgress?: (progress: {
      contentLength: number;
      chunkCount: number;
      finishReason?: string | null;
    }) => void;
  }): Promise<QuoteAgentProcessResult> {
    const promptVersion = params.promptVersion ?? DEFAULT_PROMPT_VERSION;
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

    let extraction: any | null = null;
    let reusedExtraction = false;

    try {
      if (params.forceReextract !== true) {
        extraction = await this.repository.findLatestExtraction({
          documentId: document.id,
          promptVersion,
          dictionaryVersion,
          llmModel,
        });
      }

      if (extraction) {
        reusedExtraction = true;
      } else {
        const dictionaryContext =
          params.dictionaryContext ??
          (await this.dictionaryService.getLlmDictionaryContext());
        const llmResult = await extractWithLLM({
          blocksJson: blocks.blocksJson,
          dictionaryContext,
          fileName: document.fileName,
          llmModel,
          promptVersion,
          onStreamProgress: params.onStreamProgress,
        });

        extraction = await this.repository.createExtraction({
          documentId: document.id,
          extractionJson: llmResult.extraction,
          dictionaryProposals: [],
          warnings: llmResult.warnings,
          llmPlanJson: llmResult.llmPlanJson,
          llmModel,
          promptVersion,
          dictionaryVersion,
          status: "parsed",
        });

        await updateDocumentStatus(this.repository, document, "extracted");
      }
    } catch (error) {
      await markFailed(this.repository, document.id);
      throw wrapStageError("[quoteAgent:llmExtract]", error);
    }

    let dictionary: DictionaryExtractionResult | null = null;

    try {
      dictionary = await this.generateDictionaryForExtraction({
        documentId: document.id,
        extraction,
      });
      extraction.normalizedExtractionJson = dictionary.extraction_json;
      extraction.dictionaryProposals = dictionary;
      extraction.status = "normalized";
      await updateDocumentStatus(this.repository, document, "normalized");
    } catch (error) {
      await markFailed(this.repository, document.id);
      throw wrapStageError("[quoteAgent:dictionary]", error);
    }

    return {
      document,
      blocks,
      extraction,
      dictionary,
      reusedBlocks: true,
      reusedExtraction,
    };
  }

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

    const dictionary = await this.generateDictionaryForExtraction({
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

  async parseAndSaveBlocks(
    params: QuoteAgentProcessParams
  ): Promise<QuoteAgentParseAndSaveBlocksResult> {
    const parserVersion = params.parserVersion ?? DEFAULT_PARSER_VERSION;
    const fileName = params.fileName ?? path.basename(params.filePath);

    let fileHash: string;
    let document: any | null = null;

    try {
      fileHash = await calculateFileSha256(params.filePath);
    } catch (error) {
      throw wrapStageError("[quoteAgent:hash]", error);
    }

    try {
      document = await this.repository.findDocumentByHash(fileHash);

      if (!document) {
        document = await this.repository.createDocument({
          fileName,
          fileHash,
          filePath: params.filePath,
          source: params.source,
          status: "uploaded",
        });
      }
    } catch (error) {
      await markFailed(this.repository, document?.id);
      throw wrapStageError("[quoteAgent:document]", error);
    }

    let blocks: any | null = null;
    let reusedBlocks = false;

    try {
      if (params.forceReparse !== true) {
        blocks = await this.repository.findBlocksByDocumentId(document.id);
      }

      if (blocks) {
        reusedBlocks = true;
      } else {
        const blocksJson = await parseExcelToBlocks(
          params.filePath,
          params.parserOptions
        );

        blocks = await this.repository.upsertBlocks({
          documentId: document.id,
          blocksJson,
          parserVersion,
        });

        await updateDocumentStatus(this.repository, document, "parsed_blocks");
      }
    } catch (error) {
      await markFailed(this.repository, document.id);
      throw wrapStageError("[quoteAgent:parseBlocks]", error);
    }

    return {
      document,
      blocks,
      reusedBlocks,
    };
  }

  async parseAndSaveBlocksBatch(
    paramsList: QuoteAgentProcessParams[]
  ): Promise<QuoteAgentParseAndSaveBlocksBatchResult> {
    const successes: QuoteAgentParseAndSaveBlocksBatchSuccess[] = [];
    const errors: QuoteAgentParseAndSaveBlocksBatchError[] = [];
    const hashedItems: Array<{
      params: QuoteAgentProcessParams;
      fileName: string;
      fileHash: string;
    }> = [];

    for (const params of paramsList) {
      try {
        hashedItems.push({
          params,
          fileName: params.fileName ?? path.basename(params.filePath),
          fileHash: await calculateFileSha256(params.filePath),
        });
      } catch (error) {
        errors.push(
          createBatchError(params, {
            stage: "quoteAgent:hash",
            errorCode: "QUOTE_AGENT_HASH_FAILED",
            error,
          })
        );
      }
    }

    if (hashedItems.length === 0) {
      return { successes, errors };
    }

    const firstItemByHash = new Map<string, (typeof hashedItems)[number]>();
    for (const item of hashedItems) {
      if (!firstItemByHash.has(item.fileHash)) {
        firstItemByHash.set(item.fileHash, item);
      }
    }

    const fileHashes = [...firstItemByHash.keys()];
    let documentByHash = new Map<string, any>();

    try {
      const existingDocuments = await this.repository.findDocumentsByHashes(
        fileHashes
      );
      documentByHash = new Map(
        existingDocuments.map((document: any) => [document.fileHash, document])
      );

      const missingDocuments = fileHashes
        .filter((fileHash) => !documentByHash.has(fileHash))
        .map((fileHash) => {
          const item = firstItemByHash.get(fileHash)!;
          return {
            fileName: item.fileName,
            fileHash,
            filePath: item.params.filePath,
            source: item.params.source,
            status: "uploaded",
          };
        });

      if (missingDocuments.length > 0) {
        await this.repository.createDocuments(missingDocuments);
        const documents = await this.repository.findDocumentsByHashes(fileHashes);
        documentByHash = new Map(
          documents.map((document: any) => [document.fileHash, document])
        );
      }
    } catch (error) {
      for (const item of hashedItems) {
        errors.push(
          createBatchError(item.params, {
            stage: "quoteAgent:document",
            errorCode: "QUOTE_AGENT_DOCUMENT_FAILED",
            error,
          })
        );
      }
      return { successes, errors };
    }

    const itemsWithDocuments: Array<{
      params: QuoteAgentProcessParams;
      fileName: string;
      fileHash: string;
      document: any;
    }> = [];

    for (const item of hashedItems) {
      const document = documentByHash.get(item.fileHash);
      if (!document) {
        errors.push(
          createBatchError(item.params, {
            stage: "quoteAgent:document",
            errorCode: "QUOTE_AGENT_DOCUMENT_NOT_FOUND",
            error: `Document not found after batch create: ${item.fileHash}`,
          })
        );
        continue;
      }

      itemsWithDocuments.push({ ...item, document });
    }

    const uniqueDocumentIds = [
      ...new Set(itemsWithDocuments.map((item) => Number(item.document.id))),
    ];
    const blocksByDocumentId = new Map<number, any>();

    try {
      const documentIdsToFind = [
        ...new Set(
          itemsWithDocuments
            .filter((item) => item.params.forceReparse !== true)
            .map((item) => Number(item.document.id))
        ),
      ];
      const existingBlocks = await this.repository.findBlocksByDocumentIds(
        documentIdsToFind
      );

      for (const blocks of existingBlocks) {
        blocksByDocumentId.set(Number(blocks.documentId), blocks);
      }
    } catch (error) {
      for (const item of itemsWithDocuments) {
        errors.push(
          createBatchError(item.params, {
            stage: "quoteAgent:findBlocks",
            errorCode: "QUOTE_AGENT_FIND_BLOCKS_FAILED",
            error,
          })
        );
      }
      return { successes, errors };
    }

    const itemsByDocumentId = new Map<number, typeof itemsWithDocuments>();
    for (const item of itemsWithDocuments) {
      const documentId = Number(item.document.id);
      const items = itemsByDocumentId.get(documentId) ?? [];
      items.push(item);
      itemsByDocumentId.set(documentId, items);
    }

    const needsParseByDocumentId = new Map<number, boolean>();
    for (const documentId of uniqueDocumentIds) {
      const items = itemsByDocumentId.get(documentId) ?? [];
      const hasForceReparse = items.some(
        (item) => item.params.forceReparse === true
      );
      needsParseByDocumentId.set(
        documentId,
        hasForceReparse || !blocksByDocumentId.has(documentId)
      );
    }

    const failedDocumentIds = new Set<number>();
    const upsertRecords: Array<{
      documentId: number;
      blocksJson: any;
      parserVersion?: string;
    }> = [];

    for (const [documentId, needsParse] of needsParseByDocumentId) {
      if (!needsParse) continue;

      const items = itemsByDocumentId.get(documentId) ?? [];
      const item = items[0];
      if (!item) continue;

      try {
        upsertRecords.push({
          documentId,
          blocksJson: await parseExcelToBlocks(
            item.params.filePath,
            item.params.parserOptions
          ),
          parserVersion: item.params.parserVersion ?? DEFAULT_PARSER_VERSION,
        });
      } catch (error) {
        failedDocumentIds.add(documentId);
        await markFailed(this.repository, documentId);
        for (const failedItem of items) {
          errors.push(
            createBatchError(failedItem.params, {
              stage: "quoteAgent:parseBlocks",
              errorCode: "QUOTE_AGENT_PARSE_BLOCKS_FAILED",
              error,
            })
          );
        }
      }
    }

    try {
      const upsertedBlocks = await this.repository.upsertBlocksMany(
        upsertRecords
      );
      const parsedDocumentIds = upsertRecords.map((item) => item.documentId);
      await this.repository.updateDocumentsStatus(
        parsedDocumentIds,
        "parsed_blocks"
      );

      for (const blocks of upsertedBlocks) {
        blocksByDocumentId.set(Number(blocks.documentId), blocks);
      }
      for (const documentId of parsedDocumentIds) {
        const items = itemsByDocumentId.get(documentId) ?? [];
        for (const item of items) {
          item.document.status = "parsed_blocks";
        }
      }
    } catch (error) {
      for (const record of upsertRecords) {
        failedDocumentIds.add(record.documentId);
        await markFailed(this.repository, record.documentId);
        const items = itemsByDocumentId.get(record.documentId) ?? [];
        for (const item of items) {
          errors.push(
            createBatchError(item.params, {
              stage: "quoteAgent:upsertBlocks",
              errorCode: "QUOTE_AGENT_UPSERT_BLOCKS_FAILED",
              error,
            })
          );
        }
      }
    }

    for (const item of itemsWithDocuments) {
      const documentId = Number(item.document.id);
      if (failedDocumentIds.has(documentId)) continue;

      const blocks = blocksByDocumentId.get(documentId);
      if (!blocks) {
        errors.push(
          createBatchError(item.params, {
            stage: "quoteAgent:blocks",
            errorCode: "QUOTE_AGENT_BLOCKS_NOT_FOUND",
            error: `Blocks not found after batch upsert: ${documentId}`,
          })
        );
        continue;
      }

      successes.push({
        fileName: item.fileName,
        filePath: item.params.filePath,
        document: item.document,
        blocks,
        reusedBlocks: needsParseByDocumentId.get(documentId) !== true,
      });
    }

    return { successes, errors };
  }

  async extract(
    params: QuoteAgentProcessParams
  ): Promise<QuoteAgentProcessResult> {
    return this.process(params);
  }

  async generateDictionaryForDocument(documentId: number) {
    const startedAt = Date.now();
    const document = await this.repository.findDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extraction = await this.repository.findLatestExtractionByDocumentId(
      documentId
    );
    if (!extraction) {
      throw new Error(`Extraction not found for document: ${documentId}`);
    }

    const dictionary = await this.generateDictionaryForExtraction({
      documentId,
      extraction,
    });
    logger.info(
      `[quoteAgent:refreshAffectedDocuments:document] documentId=${documentId} totalMs=${elapsedMs(startedAt)} ` +
        `extractionResultId=${extraction.id} items=${dictionary.summary?.item_count ?? dictionary.items?.length ?? 0} ` +
        `warnings=${dictionary.summary?.warning_count ?? dictionary.warnings?.length ?? 0}`,
    );

    return { document, extraction, dictionary };
  }

  async getContract(documentId: number) {
    const document = await this.repository.findDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extraction = await this.repository.findLatestExtractionByDocumentId(
      documentId
    );

    return {
      document,
      extraction,
      dictionary_proposals: extraction?.dictionaryProposals ?? null,
    };
  }

  async getExtractionDetail(documentId: number) {
    const startedAt = Date.now();
    const documentStartedAt = Date.now();
    const document = await this.repository.findDocumentById(documentId);
    const documentMs = Date.now() - documentStartedAt;
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extractionStartedAt = Date.now();
    const extraction =
      await this.repository.findLatestExtractionDetailByDocumentId(documentId);
    const extractionMs = Date.now() - extractionStartedAt;
    const dictionaryProposals = extraction?.dictionaryProposals ?? null;
    const normalizedExtractionJson = extraction?.normalizedExtractionJson ?? null;
    const totalMs = Date.now() - startedAt;

    logger.info(
      `[quoteAgent:getExtractionDetail] documentId=${documentId} totalMs=${totalMs} documentMs=${documentMs} extractionMs=${extractionMs} ` +
        `extractionId=${extraction?.id ?? "none"} status=${extraction?.status ?? "none"} ` +
        `items=${dictionaryProposals?.summary?.item_count ?? dictionaryProposals?.items?.length ?? 0} ` +
        `warnings=${dictionaryProposals?.summary?.warning_count ?? dictionaryProposals?.warnings?.length ?? 0} ` +
        `termTypeCandidates=${dictionaryProposals?.summary?.term_type_candidate_count ?? 0} ` +
        `valueCandidates=${dictionaryProposals?.summary?.value_candidate_count ?? 0} ` +
        `dictionaryBytes=${safeJsonByteLength(dictionaryProposals)} normalizedBytes=${safeJsonByteLength(normalizedExtractionJson)}`,
    );

    return {
      document,
      extraction,
      dictionary_proposals: dictionaryProposals,
    };
  }

  async reextractDocumentWithLlm(params: {
    documentId: number;
    llmModel?: string;
  }): Promise<QuoteAgentProcessResult> {
    const document = await this.repository.findDocumentById(params.documentId);
    if (!document) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    return this.extractDocumentBlocksWithLlm({
      documentId: document.id,
      llmModel: params.llmModel
        ? getInferAiChatModel(params.llmModel)
        : getInferAiChatModel(),
      forceReextract: true,
    });
  }

  async listExtractions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
  }) {
    return this.repository.listDocuments(params);
  }

  async getCandidates(params?: {
    status?: string;
    documentId?: number;
    recheckPendingCandidates?: boolean;
  }) {
    if (
      params?.recheckPendingCandidates === true &&
      (!params?.status || params.status === "pending") &&
      !params?.documentId
    ) {
      await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate();
    }
    const startedAt = Date.now();
    const result = await this.repository.findCandidates(params);
    logger.info(
      `[quoteAgent:getCandidates] totalMs=${Date.now() - startedAt} status=${params?.status ?? "pending"} documentId=${params?.documentId ?? "all"} ` +
        `termTypeCandidates=${result.termTypeCandidates.length} valueCandidates=${result.valueCandidates.length}`,
    );
    return result;
  }

  getPendingLlmUploadJob() {
    return this.pendingLlmUploadJob;
  }

  startPendingLlmUploadJob(params?: {
    limit?: number;
    llmModel?: string;
    concurrency?: number;
  }): PendingLlmUploadJob {
    if (this.pendingLlmUploadJob?.status === "running") {
      return this.pendingLlmUploadJob;
    }

    const limit = params?.limit ?? DEFAULT_PENDING_LLM_BATCH_LIMIT;
    const concurrency = Math.max(
      1,
      Math.min(10, Math.floor(params?.concurrency ?? DEFAULT_PENDING_LLM_CONCURRENCY)),
    );
    const llmModel = getInferAiChatModel(params?.llmModel);
    const job: PendingLlmUploadJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "running",
      llmModel,
      limit,
      concurrency,
      startedAt: new Date().toISOString(),
      total: 0,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      currentDocumentIds: [],
      documentProgress: [],
      errors: [],
    };

    this.pendingLlmUploadJob = job;
    setImmediate(() => {
      void this.runPendingLlmUploadJob(job);
    });

    return job;
  }

  private async runPendingLlmUploadJob(job: PendingLlmUploadJob) {
    try {
      const documents = await this.repository.findDocumentsMissingExtraction({
        limit: job.limit,
      });
      job.total = documents.length;

      let cursor = 0;
      const currentDocumentIds = new Set<number>();
      const progressByDocumentId = new Map<number, PendingLlmDocumentProgress>();
      const updateJobProgress = (
        documentId: number,
        patch: Partial<PendingLlmDocumentProgress>,
      ) => {
        const existing = progressByDocumentId.get(documentId);
        if (!existing) return;
        progressByDocumentId.set(documentId, { ...existing, ...patch });
        job.documentProgress = [...progressByDocumentId.values()];
      };
      const runWorker = async () => {
        while (cursor < documents.length) {
          const document = documents[cursor];
          cursor += 1;
          const documentId = Number(document.id);
          progressByDocumentId.set(documentId, {
            documentId,
            fileName: document.fileName,
            contentLength: 0,
            chunkCount: 0,
            status: "running",
            finishReason: null,
          });
          job.documentProgress = [...progressByDocumentId.values()];
          currentDocumentIds.add(documentId);
          job.currentDocumentId = documentId;
          job.currentDocumentIds = [...currentDocumentIds];

          try {
            await this.extractDocumentBlocksWithLlm({
              documentId,
              llmModel: job.llmModel,
              forceReextract: true,
              onStreamProgress: (progress) => {
                updateJobProgress(documentId, {
                  contentLength: progress.contentLength,
                  chunkCount: progress.chunkCount,
                  finishReason: progress.finishReason,
                  status: "running",
                });
              },
            });
            updateJobProgress(documentId, { status: "success" });
            job.successCount += 1;
          } catch (error) {
            updateJobProgress(documentId, {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
            job.failedCount += 1;
            job.errors.push({
              documentId,
              fileName: document.fileName,
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            currentDocumentIds.delete(documentId);
            job.currentDocumentIds = [...currentDocumentIds];
            job.currentDocumentId = job.currentDocumentIds[0];
            job.processed += 1;
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(job.concurrency, documents.length) },
          () => runWorker(),
        ),
      );

      job.status = "completed";
      job.currentDocumentId = undefined;
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.errors.push({
        documentId: job.currentDocumentId ?? 0,
        fileName: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async renormalizeExistingExtractions(params?: {
    limit?: number;
    onlyMissingNormalized?: boolean;
  }) {
    const extractions = await this.repository.findExtractionsForRenormalization({
      limit: params?.limit ?? 20,
      onlyMissingNormalized: params?.onlyMissingNormalized ?? true,
    });
    const results: Array<{
      extractionResultId: number;
      documentId: number;
      status: "normalized" | "failed";
      error?: string;
    }> = [];

    for (const extraction of extractions) {
      try {
        await this.generateDictionaryForExtraction({
          documentId: extraction.documentId,
          extraction,
        });
        results.push({
          extractionResultId: extraction.id,
          documentId: extraction.documentId,
          status: "normalized",
        });
      } catch (error) {
        results.push({
          extractionResultId: extraction.id,
          documentId: extraction.documentId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      requestedLimit: params?.limit ?? 20,
      onlyMissingNormalized: params?.onlyMissingNormalized ?? true,
      processedCount: results.length,
      successCount: results.filter((item) => item.status === "normalized").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  }

  async renormalizeExistingExtractionsInBatches(params?: {
    limit?: number;
    batchSize?: number;
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
    onProgress?: (event: {
      batchIndex: number;
      batchCount: number;
      processedCount: number;
      successCount: number;
      failedCount: number;
      cursorId?: number;
      cursorCreatedAt?: Date;
    }) => void;
  }) {
    const totalLimit =
      params?.limit && params.limit > 0 ? Math.floor(params.limit) : undefined;
    const batchSize = Math.min(
      500,
      Math.max(1, Math.floor(params?.batchSize ?? 100)),
    );
    const onlyMissingNormalized = params?.onlyMissingNormalized ?? true;
    const results: Array<{
      extractionResultId: number;
      documentId: number;
      status: "normalized" | "failed";
      error?: string;
    }> = [];
    let cursorCreatedAt: Date | undefined;
    let cursorId: number | undefined;
    let batchIndex = 0;

    while (totalLimit === undefined || results.length < totalLimit) {
      const remaining =
        totalLimit === undefined ? batchSize : totalLimit - results.length;
      const batchLimit = Math.min(batchSize, remaining);
      const extractions = params?.withPendingCandidates === true
        ? await this.repository.findExtractionsForPendingCandidateRenormalizationBatch({
            limit: batchLimit,
            cursorCreatedAt,
            cursorId,
          })
        : await this.repository.findExtractionsForRenormalizationBatch({
            limit: batchLimit,
            onlyMissingNormalized,
            cursorCreatedAt,
            cursorId,
          });

      if (extractions.length === 0) {
        break;
      }

      batchIndex += 1;
      params?.onProgress?.({
        batchIndex,
        batchCount: extractions.length,
        processedCount: results.length,
        successCount: results.filter((item) => item.status === "normalized").length,
        failedCount: results.filter((item) => item.status === "failed").length,
        cursorId,
        cursorCreatedAt,
      });

      for (const extraction of extractions) {
        try {
          await this.generateDictionaryForExtraction({
            documentId: extraction.documentId,
            extraction,
          });
          results.push({
            extractionResultId: extraction.id,
            documentId: extraction.documentId,
            status: "normalized",
          });
        } catch (error) {
          results.push({
            extractionResultId: extraction.id,
            documentId: extraction.documentId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const last = extractions[extractions.length - 1];
      cursorCreatedAt = last.createdAt;
      cursorId = last.id;
      params?.onProgress?.({
        batchIndex,
        batchCount: extractions.length,
        processedCount: results.length,
        successCount: results.filter((item) => item.status === "normalized").length,
        failedCount: results.filter((item) => item.status === "failed").length,
        cursorId,
        cursorCreatedAt,
      });
    }

    return {
      requestedLimit: totalLimit ?? null,
      batchSize,
      onlyMissingNormalized,
      withPendingCandidates: params?.withPendingCandidates === true,
      processedCount: results.length,
      successCount: results.filter((item) => item.status === "normalized").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  }

  async reviewCandidateAndRefresh(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    action:
      | "create_term_type"
      | "approve_term_type_as_alias"
      | "create_value"
      | "approve_value_as_alias"
      | "split_value"
      | "move_value_to_other_term_type"
      | "update_term_type_value_kind"
      | "reject";
    payload: any;
  }) {
    const startedAt = Date.now();
    logger.info(
      `[quoteAgent:reviewCandidateAndRefresh:start] candidateType=${params.candidateType} candidateId=${params.candidateId} ` +
        `action=${params.action} refreshAffectedDocuments=${params.refreshAffectedDocuments === true}`,
    );
    const affectedBeforeStartedAt = Date.now();
    const affectedBefore = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });
    const affectedBeforeMs = elapsedMs(affectedBeforeStartedAt);

    const operationStartedAt = Date.now();
    const fastTermTypeAction = this.isFastTermTypeReviewAction(params);
    if (fastTermTypeAction) {
      const fastResults =
        await this.dictionaryService.reviewTermTypeCandidatesBatch([
          {
            candidateId: params.candidateId,
            action: params.action as
              | "create_term_type"
              | "approve_term_type_as_alias",
            payload: params.payload,
          },
        ]);
      const fastResult = fastResults[0];
      if (!fastResult || fastResult.status === "failed") {
        throw new Error(
          fastResult?.error ?? `candidate review failed: ${params.candidateId}`,
        );
      }
      await this.dictionaryService.bumpDictionaryVersion();
    } else {
      await this.applyCandidateReviewAction({ ...params, bumpVersion: true });
    }
    const operationMs = elapsedMs(operationStartedAt);

    const affectedAfterStartedAt = Date.now();
    const affectedAfter = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });
    const affectedAfterMs = elapsedMs(affectedAfterStartedAt);
    const documentIds = [...new Set([...affectedBefore, ...affectedAfter])];
    const refreshed: any[] = [];
    const recheckStartedAt = Date.now();
    const dictionaryChanged = this.isDictionaryChangingReviewAction(params.action);
    const candidateRecheck = dictionaryChanged && params.deferCandidateRecheck !== true
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;
    const recheckMs = elapsedMs(recheckStartedAt);
    const dirtyDocumentIds = [
      ...new Set([
        ...documentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];

    if (params.refreshAffectedDocuments === true) {
      logger.info(
        `[quoteAgent:refreshAffectedDocuments:start] source=single documentCount=${dirtyDocumentIds.length} ` +
          `documentIds=${dirtyDocumentIds.join(",")}`,
      );
      const refreshStartedAt = Date.now();
      for (const documentId of dirtyDocumentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
      logger.info(
        `[quoteAgent:refreshAffectedDocuments:end] source=single documentCount=${dirtyDocumentIds.length} totalMs=${elapsedMs(refreshStartedAt)}`,
      );
    } else if (this.isDictionaryChangingReviewAction(params.action)) {
      await this.repository.updateDocumentsStatus(dirtyDocumentIds, "dictionary_dirty");
    }
    if (dictionaryChanged && params.deferCandidateRecheck === true) {
      this.scheduleDeferredCandidateRecheck("reviewCandidateAndRefresh");
    }

    logger.info(
      `[quoteAgent:reviewCandidateAndRefresh:end] candidateType=${params.candidateType} candidateId=${params.candidateId} ` +
        `action=${params.action} totalMs=${elapsedMs(startedAt)} affectedBeforeMs=${affectedBeforeMs} ` +
        `operationMs=${operationMs} affectedAfterMs=${affectedAfterMs} recheckMs=${recheckMs} ` +
        `affectedDocumentCount=${dirtyDocumentIds.length} refreshedCount=${refreshed.length}`,
    );

    return {
      candidateType: params.candidateType,
      candidateId: params.candidateId,
      action: params.action,
      affectedDocumentIds: dirtyDocumentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
      candidateRecheckDeferred:
        dictionaryChanged && params.deferCandidateRecheck === true,
      candidateRecheck,
      refreshed,
    };
  }

  async reviewCandidatesBatch(params: {
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    operations: Array<{
      candidateType: "term_type" | "value";
      candidateId: string;
      action:
        | "create_term_type"
        | "approve_term_type_as_alias"
        | "create_value"
        | "approve_value_as_alias"
        | "split_value"
        | "move_value_to_other_term_type"
        | "update_term_type_value_kind"
        | "reject";
      payload: any;
    }>;
  }) {
    const startedAt = Date.now();
    if (params.operations.length > 200) {
      throw new Error("operations length must be <= 200");
    }
    const operations = params.operations;
    const affectedDocumentIdsByCandidate =
      await this.repository.findAffectedDocumentIdsForCandidates(
        operations.map((operation) => ({
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
        })),
      );
    const affectedDocumentIds = new Set<number>();
    let results: Array<{
      candidateType: "term_type" | "value";
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }> = [];
    let dictionaryChanged = false;
    logger.info(
      `[quoteAgent:reviewCandidatesBatch:start] requestedCount=${params.operations.length} processedCount=${operations.length} ` +
        `refreshAffectedDocuments=${params.refreshAffectedDocuments === true} deferCandidateRecheck=${params.deferCandidateRecheck === true}`,
    );

    const resultByOperationIndex = new Map<number, {
      candidateType: "term_type" | "value";
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }>();
    const fastTermTypeOperations = operations
      .map((operation, index) => ({ operation, index }))
      .filter(({ operation }) => this.isFastTermTypeReviewAction(operation));

    if (fastTermTypeOperations.length > 0) {
      const fastStartedAt = Date.now();
      const fastResults =
        await this.dictionaryService.reviewTermTypeCandidatesBatch(
          fastTermTypeOperations.map(({ operation }) => ({
            candidateId: operation.candidateId,
            action: operation.action as
              | "create_term_type"
              | "approve_term_type_as_alias",
            payload: operation.payload,
          })),
        );

      fastResults.forEach((result, resultIndex) => {
        const { operation, index } = fastTermTypeOperations[resultIndex];
        const affectedBefore =
          affectedDocumentIdsByCandidate.get(
            `${operation.candidateType}:${operation.candidateId}`,
          ) ?? [];
        if (result.status === "ok") {
          dictionaryChanged = true;
          for (const documentId of affectedBefore) {
            affectedDocumentIds.add(documentId);
          }
        }
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: result.status,
          error: result.error,
        });
        logger.info(
          `[quoteAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=${result.status} ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `fastPath=true affectedBeforeCount=${affectedBefore.length}${result.error ? ` error=${result.error}` : ""}`,
        );
      });
      logger.info(
        `[quoteAgent:reviewCandidatesBatch:fastTermType] operationCount=${fastTermTypeOperations.length} totalMs=${elapsedMs(fastStartedAt)}`,
      );
    }

    for (const [index, operation] of operations.entries()) {
      if (resultByOperationIndex.has(index)) {
        continue;
      }
      const operationStartedAt = Date.now();
      let affectedBeforeMs = 0;
      let dictionaryWriteMs = 0;
      let affectedAfterMs = 0;
      try {
        const affectedBeforeStartedAt = Date.now();
        const affectedBefore =
          affectedDocumentIdsByCandidate.get(
            `${operation.candidateType}:${operation.candidateId}`,
          ) ?? [];
        affectedBeforeMs = elapsedMs(affectedBeforeStartedAt);
        const dictionaryWriteStartedAt = Date.now();
        await this.applyCandidateReviewAction({
          ...operation,
          bumpVersion: false,
        });
        dictionaryWriteMs = elapsedMs(dictionaryWriteStartedAt);
        const affectedAfterStartedAt = Date.now();
        const affectedAfter =
          await this.repository.findAffectedDocumentIdsForCandidate({
            candidateType: operation.candidateType,
            candidateId: operation.candidateId,
          });
        affectedAfterMs = elapsedMs(affectedAfterStartedAt);
        for (const documentId of [...affectedBefore, ...affectedAfter]) {
          affectedDocumentIds.add(documentId);
        }
        dictionaryChanged =
          dictionaryChanged ||
          this.isDictionaryChangingReviewAction(operation.action);
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "ok",
        });
        logger.info(
          `[quoteAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=ok ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `totalMs=${elapsedMs(operationStartedAt)} affectedBeforeMs=${affectedBeforeMs} dictionaryWriteMs=${dictionaryWriteMs} ` +
            `affectedAfterMs=${affectedAfterMs} affectedBeforeCount=${affectedBefore.length} affectedAfterCount=${affectedAfter.length}`,
        );
      } catch (error) {
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        logger.info(
          `[quoteAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=failed ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `totalMs=${elapsedMs(operationStartedAt)} affectedBeforeMs=${affectedBeforeMs} dictionaryWriteMs=${dictionaryWriteMs} ` +
            `affectedAfterMs=${affectedAfterMs} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    results = operations.map((operation, index) => {
      return (
        resultByOperationIndex.get(index) ?? {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "failed" as const,
          error: "operation was not processed",
        }
      );
    });

    let bumpVersionMs = 0;
    if (dictionaryChanged) {
      const bumpVersionStartedAt = Date.now();
      await this.dictionaryService.bumpDictionaryVersion();
      bumpVersionMs = elapsedMs(bumpVersionStartedAt);
    }
    const recheckStartedAt = Date.now();
    const candidateRecheck = dictionaryChanged && params.deferCandidateRecheck !== true
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;
    const recheckMs = elapsedMs(recheckStartedAt);

    const documentIds = [
      ...new Set([
        ...affectedDocumentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];
    const refreshed: any[] = [];
    if (params.refreshAffectedDocuments === true) {
      logger.info(
        `[quoteAgent:refreshAffectedDocuments:start] source=batch documentCount=${documentIds.length} ` +
          `documentIds=${documentIds.join(",")}`,
      );
      const refreshStartedAt = Date.now();
      for (const documentId of documentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
      logger.info(
        `[quoteAgent:refreshAffectedDocuments:end] source=batch documentCount=${documentIds.length} totalMs=${elapsedMs(refreshStartedAt)}`,
      );
    } else if (dictionaryChanged) {
      await this.repository.updateDocumentsStatus(documentIds, "dictionary_dirty");
    }
    if (dictionaryChanged && params.deferCandidateRecheck === true) {
      this.scheduleDeferredCandidateRecheck("reviewCandidatesBatch");
    }

    logger.info(
      `[quoteAgent:reviewCandidatesBatch:end] requestedCount=${params.operations.length} processedCount=${operations.length} ` +
        `successCount=${results.filter((item) => item.status === "ok").length} failedCount=${results.filter((item) => item.status === "failed").length} ` +
        `dictionaryChanged=${dictionaryChanged} bumpVersionMs=${bumpVersionMs} recheckMs=${recheckMs} deferCandidateRecheck=${params.deferCandidateRecheck === true} ` +
        `affectedDocumentCount=${documentIds.length} refreshedCount=${refreshed.length} totalMs=${elapsedMs(startedAt)}`,
    );

    return {
      requestedCount: params.operations.length,
      processedCount: operations.length,
      successCount: results.filter((item) => item.status === "ok").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      affectedDocumentIds: documentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
      candidateRecheckDeferred:
        dictionaryChanged && params.deferCandidateRecheck === true,
      candidateRecheck,
      refreshed,
      results,
    };
  }

  private async applyCandidateReviewAction(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    action:
      | "create_term_type"
      | "approve_term_type_as_alias"
      | "create_value"
      | "approve_value_as_alias"
      | "split_value"
      | "move_value_to_other_term_type"
      | "update_term_type_value_kind"
      | "reject";
    payload: any;
    bumpVersion: boolean;
  }): Promise<void> {
    if (params.action === "create_term_type") {
      await this.dictionaryService.createTermTypeFromCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "approve_term_type_as_alias") {
      await this.dictionaryService.approveTermTypeCandidateAsAlias({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "create_value") {
      await this.dictionaryService.createValueFromCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "approve_value_as_alias") {
      await this.dictionaryService.approveValueCandidateAsAlias({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "split_value") {
      await this.dictionaryService.splitValueCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "move_value_to_other_term_type") {
      await this.dictionaryService.moveValueCandidateToTermType({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "update_term_type_value_kind") {
      await this.dictionaryService.updateTermTypeValueKind({
        termType: params.payload.termType,
        valueKind: params.payload.valueKind,
        resolvedValueCandidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        bumpVersion: params.bumpVersion,
      });
    } else if (
      params.action === "reject" &&
      params.candidateType === "term_type"
    ) {
      await this.dictionaryService.rejectTermTypeCandidate({
        candidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        reason: params.payload.reason,
      });
    } else if (params.action === "reject" && params.candidateType === "value") {
      await this.dictionaryService.rejectValueCandidate({
        candidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        reason: params.payload.reason,
      });
    }
  }

  private isDictionaryChangingReviewAction(action: string): boolean {
    return !["reject", "move_value_to_other_term_type"].includes(action);
  }

  private isFastTermTypeReviewAction(operation: {
    candidateType: "term_type" | "value";
    action: string;
  }): boolean {
    return (
      operation.candidateType === "term_type" &&
      (operation.action === "create_term_type" ||
      operation.action === "approve_term_type_as_alias")
    );
  }

  private scheduleDeferredCandidateRecheck(source: string): void {
    if (this.candidateRecheckJobRunning) {
      this.candidateRecheckJobPending = true;
      logger.info(
        `[quoteAgent:dictionary:deferredCandidateRecheck:queued] source=${source} reason=already_running`,
      );
      return;
    }

    if (this.candidateRecheckTimer) {
      clearTimeout(this.candidateRecheckTimer);
    }
    this.candidateRecheckTimer = setTimeout(() => {
      this.candidateRecheckTimer = null;
      this.candidateRecheckJobRunning = true;
      void (async () => {
        const startedAt = Date.now();
        try {
          logger.info(
            `[quoteAgent:dictionary:deferredCandidateRecheck:start] source=${source}`,
          );
          const result =
            await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate();
          if (result.affectedDocumentIds.length > 0) {
            await this.repository.updateDocumentsStatus(
              result.affectedDocumentIds,
              "dictionary_dirty",
            );
          }
          logger.info(
            `[quoteAgent:dictionary:deferredCandidateRecheck:end] source=${source} totalMs=${elapsedMs(startedAt)} ` +
              `affectedDocumentCount=${result.affectedDocumentIds.length} ` +
              `resolvedTermTypeCandidateCount=${result.resolvedTermTypeCandidateCount} ` +
              `resolvedValueCandidateCount=${result.resolvedValueCandidateCount}`,
          );
        } catch (error) {
          logger.error(
            `[quoteAgent:dictionary:deferredCandidateRecheck:failed] source=${source} totalMs=${elapsedMs(startedAt)} ` +
              `error=${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          this.candidateRecheckJobRunning = false;
          if (this.candidateRecheckJobPending) {
            this.candidateRecheckJobPending = false;
            this.scheduleDeferredCandidateRecheck("queued_dictionary_update");
          }
        }
      })();
    }, 1500);
  }

  private async generateDictionaryForExtraction(params: {
    documentId: number;
    extraction: any;
    status?: string;
    documentStatus?: string;
  }): Promise<DictionaryExtractionResult> {
    const dictionaryResult = await this.createDictionaryExtractionService()
      .normalizeExtraction({
        documentId: params.documentId,
        extractionResultId: params.extraction.id,
        llmResult: coerceLlmExtractionResult({
          extraction: params.extraction.extractionJson,
          warnings: params.extraction.warnings,
        }),
      });

    await this.repository.updateExtractionDictionary({
      extractionResultId: params.extraction.id,
      normalizedExtractionJson: dictionaryResult.extraction_json,
      dictionaryProposals: dictionaryResult,
      status: params.status ?? "normalized",
      dictionaryVersion: params.extraction.dictionaryVersion,
    });
    await this.repository.updateDocumentStatus(
      params.documentId,
      params.documentStatus ?? "normalized",
    );

    return dictionaryResult;
  }
}

export const quoteAgentService = new QuoteAgentService();

export type QuoteAgentExtractParams = QuoteAgentProcessParams;
