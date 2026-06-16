import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { parseExcel } from "../excelParser/index.js";
import type { ExcelParserOptions } from "../excelParser/index.js";
import type { ProductConfigAgentRepository } from "../db.service.js";
import {
  DEFAULT_PARSER_VERSION,
  getErrorMessage,
  markFailed,
  updateDocumentStatus,
  wrapStageError,
} from "./common.js";
import type {
  ProductConfigAgentParseAndSaveBlocksBatchError,
  ProductConfigAgentParseAndSaveBlocksBatchResult,
  ProductConfigAgentParseAndSaveBlocksBatchSuccess,
  ProductConfigAgentParseAndSaveBlocksResult,
  ProductConfigAgentProcessParams,
} from "./types.js";

const DEFAULT_BATCH_HASH_CONCURRENCY = positiveIntegerFromEnv(
  "PRODUCT_CONFIG_AGENT_BATCH_HASH_CONCURRENCY",
  8,
);
const DEFAULT_BATCH_PARSE_CONCURRENCY = positiveIntegerFromEnv(
  "PRODUCT_CONFIG_AGENT_BATCH_PARSE_CONCURRENCY",
  4,
);

function positiveIntegerFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function calculateFileSha256(filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

export async function parseExcelToBlocks(
  filePath: string,
  options?: ExcelParserOptions,
) {
  const parsed = await parseExcel(filePath, options);

  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

function createBatchError(params: ProductConfigAgentProcessParams, data: {
  stage: string;
  errorCode: string;
  error: unknown;
}): ProductConfigAgentParseAndSaveBlocksBatchError {
  return {
    fileName: params.fileName ?? path.basename(params.filePath),
    filePath: params.filePath,
    stage: data.stage,
    errorCode: data.errorCode,
    errorMessage: getErrorMessage(data.error),
  };
}

function documentFromParseState(state: any) {
  return {
    id: Number(state.documentId),
    fileName: state.fileName,
    fileHash: state.fileHash,
    filePath: state.filePath,
    source: state.source,
    status: state.status,
    createdAt: state.createdAt,
  };
}

function blocksMetadataFromParseState(state: any) {
  if (!state.blocksId) return null;

  return {
    id: Number(state.blocksId),
    documentId: Number(state.documentId),
    parserVersion: state.parserVersion,
    createdAt: state.blocksCreatedAt,
  };
}

export class BlockParsingService {
  constructor(private readonly repository: ProductConfigAgentRepository) {}

  async parseAndSaveBlocks(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentParseAndSaveBlocksResult> {
    const parserVersion = params.parserVersion ?? DEFAULT_PARSER_VERSION;
    const fileName = params.fileName ?? path.basename(params.filePath);

    let fileHash: string;
    let document: any | null = null;

    try {
      fileHash = await calculateFileSha256(params.filePath);
    } catch (error) {
      throw wrapStageError("[productConfigAgent:hash]", error);
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
      throw wrapStageError("[productConfigAgent:document]", error);
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
          params.parserOptions,
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
      throw wrapStageError("[productConfigAgent:parseBlocks]", error);
    }

    return {
      document,
      blocks,
      reusedBlocks,
    };
  }

  async parseAndSaveBlocksBatch(
    paramsList: ProductConfigAgentProcessParams[],
  ): Promise<ProductConfigAgentParseAndSaveBlocksBatchResult> {
    const successes: ProductConfigAgentParseAndSaveBlocksBatchSuccess[] = [];
    const errors: ProductConfigAgentParseAndSaveBlocksBatchError[] = [];
    const hashedItems: Array<{
      params: ProductConfigAgentProcessParams;
      fileName: string;
      fileHash: string;
    }> = [];

    const hashResults = await mapWithConcurrency(
      paramsList,
      DEFAULT_BATCH_HASH_CONCURRENCY,
      async (params) => {
        try {
          return {
            success: true as const,
            item: {
              params,
              fileName: params.fileName ?? path.basename(params.filePath),
              fileHash: await calculateFileSha256(params.filePath),
            },
          };
        } catch (error) {
          return {
            success: false as const,
            params,
            error,
          };
        }
      },
    );

    for (const result of hashResults) {
      if (result.success) {
        hashedItems.push(result.item);
      } else {
        errors.push(
          createBatchError(result.params, {
            stage: "productConfigAgent:hash",
            errorCode: "QUOTE_AGENT_HASH_FAILED",
            error: result.error,
          }),
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
    let blocksByDocumentId = new Map<number, any>();

    try {
      const existingStates = await this.repository.findDocumentParseStatesByHashes(
        fileHashes,
      );
      for (const state of existingStates) {
        const document = documentFromParseState(state);
        documentByHash.set(document.fileHash, document);

        const blocks = blocksMetadataFromParseState(state);
        if (blocks) {
          blocksByDocumentId.set(Number(blocks.documentId), blocks);
        }
      }

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
        const states = await this.repository.findDocumentParseStatesByHashes(
          fileHashes,
        );
        documentByHash = new Map();
        blocksByDocumentId = new Map();

        for (const state of states) {
          const document = documentFromParseState(state);
          documentByHash.set(document.fileHash, document);

          const blocks = blocksMetadataFromParseState(state);
          if (blocks) {
            blocksByDocumentId.set(Number(blocks.documentId), blocks);
          }
        }
      }
    } catch (error) {
      for (const item of hashedItems) {
        errors.push(
          createBatchError(item.params, {
            stage: "productConfigAgent:document",
            errorCode: "QUOTE_AGENT_DOCUMENT_FAILED",
            error,
          }),
        );
      }
      return { successes, errors };
    }

    const itemsWithDocuments: Array<{
      params: ProductConfigAgentProcessParams;
      fileName: string;
      fileHash: string;
      document: any;
    }> = [];

    for (const item of hashedItems) {
      const document = documentByHash.get(item.fileHash);
      if (!document) {
        errors.push(
          createBatchError(item.params, {
            stage: "productConfigAgent:document",
            errorCode: "QUOTE_AGENT_DOCUMENT_NOT_FOUND",
            error: `Document not found after batch create: ${item.fileHash}`,
          }),
        );
        continue;
      }

      itemsWithDocuments.push({ ...item, document });
    }

    const uniqueDocumentIds = [
      ...new Set(itemsWithDocuments.map((item) => Number(item.document.id))),
    ];

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
        (item) => item.params.forceReparse === true,
      );
      needsParseByDocumentId.set(
        documentId,
        hasForceReparse || !blocksByDocumentId.has(documentId),
      );
    }

    const failedDocumentIds = new Set<number>();
    const upsertRecords: Array<{
      documentId: number;
      blocksJson: any;
      parserVersion?: string;
    }> = [];

    const documentIdsToParse = Array.from(needsParseByDocumentId.entries())
      .filter(([, needsParse]) => needsParse)
      .map(([documentId]) => documentId);

    const parseResults = await mapWithConcurrency(
      documentIdsToParse,
      DEFAULT_BATCH_PARSE_CONCURRENCY,
      async (documentId) => {
        const items = itemsByDocumentId.get(documentId) ?? [];
        const item = items[0];
        if (!item) return { documentId, blocksRecord: null, error: null };

        try {
          return {
            documentId,
            blocksRecord: {
              documentId,
              blocksJson: await parseExcelToBlocks(
                item.params.filePath,
                item.params.parserOptions,
              ),
              parserVersion:
                item.params.parserVersion ?? DEFAULT_PARSER_VERSION,
            },
            error: null,
          };
        } catch (error) {
          return { documentId, blocksRecord: null, error };
        }
      },
    );

    for (const result of parseResults) {
      if (!result.error && result.blocksRecord) {
        upsertRecords.push(result.blocksRecord);
        continue;
      }

      if (!result.error) continue;

      failedDocumentIds.add(result.documentId);
      await markFailed(this.repository, result.documentId);

      const items = itemsByDocumentId.get(result.documentId) ?? [];
      for (const failedItem of items) {
        errors.push(
          createBatchError(failedItem.params, {
            stage: "productConfigAgent:parseBlocks",
            errorCode: "QUOTE_AGENT_PARSE_BLOCKS_FAILED",
            error: result.error,
          }),
        );
      }
    }

    try {
      const upsertedBlocks = await this.repository.upsertBlocksMany(
        upsertRecords,
      );
      const parsedDocumentIds = upsertRecords.map((item) => item.documentId);
      await this.repository.updateDocumentsStatus(
        parsedDocumentIds,
        "parsed_blocks",
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
              stage: "productConfigAgent:upsertBlocks",
              errorCode: "QUOTE_AGENT_UPSERT_BLOCKS_FAILED",
              error,
            }),
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
            stage: "productConfigAgent:blocks",
            errorCode: "QUOTE_AGENT_BLOCKS_NOT_FOUND",
            error: `Blocks not found after batch upsert: ${documentId}`,
          }),
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
}
