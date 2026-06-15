import type { DataSource } from "typeorm";
import type { ProductConfigAgentRepository } from "../db.service.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import {
  coerceLlmExtractionResult,
  ExtractionNormalizationService,
  type DictionaryExtractionResult,
} from "./index.js";
import { elapsedMs } from "../workflow/common.js";
import { logger } from "../../../config/logger.js";

export class NormalizationRefreshService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: ProductConfigAgentRepository,
    private readonly dictionaryService: DictionaryService,
  ) {}

  async generateDictionaryForDocument(documentId: number) {
    const startedAt = Date.now();
    const document = await this.repository.findDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extraction = await this.repository.findLatestExtractionByDocumentId(
      documentId,
    );
    if (!extraction) {
      throw new Error(`Extraction not found for document: ${documentId}`);
    }

    const dictionary = await this.generateDictionaryForExtraction({
      documentId,
      extraction,
    });
    logger.info(
      `[productConfigAgent:refreshAffectedDocuments:document] documentId=${documentId} totalMs=${elapsedMs(startedAt)} ` +
        `extractionResultId=${extraction.id} items=${dictionary.summary?.item_count ?? dictionary.items?.length ?? 0} ` +
        `warnings=${dictionary.summary?.warning_count ?? dictionary.warnings?.length ?? 0}`,
    );

    return { document, extraction, dictionary };
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

  async countRenormalizationTargets(params?: {
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
  }): Promise<number> {
    return this.repository.countExtractionsForRenormalization({
      onlyMissingNormalized: params?.onlyMissingNormalized ?? true,
      withPendingCandidates: params?.withPendingCandidates === true,
    });
  }

  async renormalizeExistingExtractionsInBatches(params?: {
    limit?: number;
    batchSize?: number;
    concurrency?: number;
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
    const concurrency = Math.min(
      batchSize,
      Math.min(16, Math.max(1, Math.floor(params?.concurrency ?? 1))),
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

      results.push(
        ...(await mapWithConcurrency(extractions, concurrency, async (extraction) => {
          try {
            await this.generateDictionaryForExtraction({
              documentId: extraction.documentId,
              extraction,
            });
            return {
              extractionResultId: extraction.id,
              documentId: extraction.documentId,
              status: "normalized" as const,
            };
          } catch (error) {
            return {
              extractionResultId: extraction.id,
              documentId: extraction.documentId,
              status: "failed" as const,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })),
      );

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
      concurrency,
      onlyMissingNormalized,
      withPendingCandidates: params?.withPendingCandidates === true,
      processedCount: results.length,
      successCount: results.filter((item) => item.status === "normalized").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  }

  async generateDictionaryForExtraction(params: {
    documentId: number;
    extraction: any;
    status?: string;
    documentStatus?: string;
  }): Promise<DictionaryExtractionResult> {
    const dictionaryResult = await new ExtractionNormalizationService(
      this.dataSource,
      this.dictionaryService,
    ).normalizeExtraction({
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
