import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { buildLlmText, parseExcel } from "./excelParser";
import type { ExcelParserOptions } from "./excelParser";
import { extractProductConfigWithLLM, getInferAiChatModel } from "./llm";
import {
  DictionaryService,
  type LlmDictionaryContext,
} from "./dictionary/dictionary.service";
import {
  coerceLlmExtractionResult,
  DictionaryExtractionService,
  type DictionaryExtractionResult,
} from "./dictionary/dictionaryExtraction.service";
import { quoteAgentRepository } from "./db.service";
import type { QuoteAgentRepository } from "./db.service";
import { PgDataSource } from "../../config/data-source";

const DEFAULT_PARSER_VERSION = "v1";
const DEFAULT_PROMPT_VERSION = "v2";
const DEFAULT_DICTIONARY_VERSION = 1;
const DEFAULT_LLM_MODEL = "gemma4:12b";
const DEFAULT_PENDING_LLM_BATCH_LIMIT = 500;
const DEFAULT_PENDING_LLM_CONCURRENCY = 3;

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
        });

        extraction = await this.repository.createExtraction({
          documentId: document.id,
          extractionJson: llmResult.extraction,
          dictionaryProposals: [],
          warnings: llmResult.warnings,
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
          onStreamProgress: params.onStreamProgress,
        });

        extraction = await this.repository.createExtraction({
          documentId: document.id,
          extractionJson: llmResult.extraction,
          dictionaryProposals: [],
          warnings: llmResult.warnings,
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

  async getCandidates(params?: { status?: string; documentId?: number }) {
    return this.repository.findCandidates(params);
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

  async reviewCandidateAndRefresh(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    refreshAffectedDocuments?: boolean;
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
    const affectedBefore = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });

    await this.applyCandidateReviewAction({ ...params, bumpVersion: true });

    const affectedAfter = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });
    const documentIds = [...new Set([...affectedBefore, ...affectedAfter])];
    const refreshed: any[] = [];
    const candidateRecheck = this.isDictionaryChangingReviewAction(params.action)
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;
    const dirtyDocumentIds = [
      ...new Set([
        ...documentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];

    if (params.refreshAffectedDocuments === true) {
      for (const documentId of dirtyDocumentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
    } else if (this.isDictionaryChangingReviewAction(params.action)) {
      await this.repository.updateDocumentsStatus(dirtyDocumentIds, "dictionary_dirty");
    }

    return {
      candidateType: params.candidateType,
      candidateId: params.candidateId,
      action: params.action,
      affectedDocumentIds: dirtyDocumentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
      candidateRecheck,
      refreshed,
    };
  }

  async reviewCandidatesBatch(params: {
    refreshAffectedDocuments?: boolean;
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
    const operations = params.operations.slice(0, 200);
    const affectedDocumentIds = new Set<number>();
    const results: Array<{
      candidateType: "term_type" | "value";
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }> = [];
    let dictionaryChanged = false;

    for (const operation of operations) {
      try {
        const affectedBefore =
          await this.repository.findAffectedDocumentIdsForCandidate({
            candidateType: operation.candidateType,
            candidateId: operation.candidateId,
          });
        await this.applyCandidateReviewAction({
          ...operation,
          bumpVersion: false,
        });
        const affectedAfter =
          await this.repository.findAffectedDocumentIdsForCandidate({
            candidateType: operation.candidateType,
            candidateId: operation.candidateId,
          });
        for (const documentId of [...affectedBefore, ...affectedAfter]) {
          affectedDocumentIds.add(documentId);
        }
        dictionaryChanged =
          dictionaryChanged ||
          this.isDictionaryChangingReviewAction(operation.action);
        results.push({
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "ok",
        });
      } catch (error) {
        results.push({
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (dictionaryChanged) {
      await this.dictionaryService.bumpDictionaryVersion();
    }
    const candidateRecheck = dictionaryChanged
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;

    const documentIds = [
      ...new Set([
        ...affectedDocumentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];
    const refreshed: any[] = [];
    if (params.refreshAffectedDocuments === true) {
      for (const documentId of documentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
    } else if (dictionaryChanged) {
      await this.repository.updateDocumentsStatus(documentIds, "dictionary_dirty");
    }

    return {
      requestedCount: params.operations.length,
      processedCount: operations.length,
      successCount: results.filter((item) => item.status === "ok").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      affectedDocumentIds: documentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
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

  private async generateDictionaryForExtraction(params: {
    documentId: number;
    extraction: any;
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
      status: "normalized",
      dictionaryVersion: params.extraction.dictionaryVersion,
    });
    await this.repository.updateDocumentStatus(params.documentId, "normalized");

    return dictionaryResult;
  }
}

export const quoteAgentService = new QuoteAgentService();

export type QuoteAgentExtractParams = QuoteAgentProcessParams;
