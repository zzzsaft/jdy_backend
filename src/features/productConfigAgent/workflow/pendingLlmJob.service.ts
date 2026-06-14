import type { ProductConfigAgentRepository } from "../db.service.js";
import { getInferAiChatModel } from "../extraction/index.js";
import {
  DEFAULT_PENDING_LLM_BATCH_LIMIT,
  DEFAULT_PENDING_LLM_CONCURRENCY,
} from "./common.js";
import type {
  PendingLlmDocumentProgress,
  PendingLlmUploadJob,
} from "./types.js";

export class PendingLlmJobService {
  private pendingLlmUploadJob: PendingLlmUploadJob | null = null;

  constructor(
    private readonly repository: ProductConfigAgentRepository,
    private readonly extractDocumentBlocksWithLlm: (params: {
      documentId: number;
      llmModel?: string;
      forceReextract?: boolean;
      onStreamProgress?: (progress: {
        contentLength: number;
        chunkCount: number;
        finishReason?: string | null;
      }) => void;
    }) => Promise<unknown>,
  ) {}

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
}
