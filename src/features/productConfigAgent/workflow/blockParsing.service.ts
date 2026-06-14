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
            stage: "productConfigAgent:hash",
            errorCode: "QUOTE_AGENT_HASH_FAILED",
            error,
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

    try {
      const existingDocuments = await this.repository.findDocumentsByHashes(
        fileHashes,
      );
      documentByHash = new Map(
        existingDocuments.map((document: any) => [document.fileHash, document]),
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
          documents.map((document: any) => [document.fileHash, document]),
        );
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
    const blocksByDocumentId = new Map<number, any>();

    try {
      const documentIdsToFind = [
        ...new Set(
          itemsWithDocuments
            .filter((item) => item.params.forceReparse !== true)
            .map((item) => Number(item.document.id)),
        ),
      ];
      const existingBlocks = await this.repository.findBlocksByDocumentIds(
        documentIdsToFind,
      );

      for (const blocks of existingBlocks) {
        blocksByDocumentId.set(Number(blocks.documentId), blocks);
      }
    } catch (error) {
      for (const item of itemsWithDocuments) {
        errors.push(
          createBatchError(item.params, {
            stage: "productConfigAgent:findBlocks",
            errorCode: "QUOTE_AGENT_FIND_BLOCKS_FAILED",
            error,
          }),
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
            item.params.parserOptions,
          ),
          parserVersion: item.params.parserVersion ?? DEFAULT_PARSER_VERSION,
        });
      } catch (error) {
        failedDocumentIds.add(documentId);
        await markFailed(this.repository, documentId);
        for (const failedItem of items) {
          errors.push(
            createBatchError(failedItem.params, {
              stage: "productConfigAgent:parseBlocks",
              errorCode: "QUOTE_AGENT_PARSE_BLOCKS_FAILED",
              error,
            }),
          );
        }
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
