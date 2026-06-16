import type { ProductConfigAgentRepository } from "../db.service.js";
import { elapsedMs } from "./common.js";
import type {
  DirtyDataRefreshDocumentProgress,
  DirtyDataRefreshJob,
} from "./types.js";
import { logger } from "../../../config/logger.js";
import { PgDataSource } from "../../../config/data-source.js";

const DIRTY_DATA_REFRESH_ADVISORY_LOCK_KEY = 2001001;

export class DirtyDataRefreshJobService {
  private dirtyDataRefreshJob: DirtyDataRefreshJob | null = null;

  constructor(
    private readonly repository: ProductConfigAgentRepository,
    private readonly refreshDocumentDictionary: (documentId: number) => Promise<unknown>,
    private readonly refreshArchivesForDocument: (documentId: number) => Promise<{
      updatedCount: number;
      versionCount: number;
    }>,
  ) {}

  getDirtyDataRefreshJob() {
    return this.dirtyDataRefreshJob;
  }

  startDirtyDataRefreshJob(params?: {
    limit?: number;
    batchSize?: number;
  }): DirtyDataRefreshJob {
    if (this.dirtyDataRefreshJob?.status === "running") {
      return this.dirtyDataRefreshJob;
    }

    const limit = Math.max(1, Math.floor(params?.limit ?? 100));
    const batchSize = Math.min(
      50,
      Math.max(1, Math.floor(params?.batchSize ?? 10)),
    );
    const job: DirtyDataRefreshJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "running",
      limit,
      batchSize,
      startedAt: new Date().toISOString(),
      total: 0,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      archiveUpdatedCount: 0,
      archiveVersionCount: 0,
      documentProgress: [],
      errors: [],
    };

    this.dirtyDataRefreshJob = job;
    setImmediate(() => {
      void this.runDirtyDataRefreshJob(job);
    });

    return job;
  }

  private async runDirtyDataRefreshJob(job: DirtyDataRefreshJob) {
    const startedAt = Date.now();
    let lockAcquired = false;
    try {
      const lockRows = await PgDataSource.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [DIRTY_DATA_REFRESH_ADVISORY_LOCK_KEY],
      );
      lockAcquired = lockRows?.[0]?.locked === true;
      if (!lockAcquired) {
        throw new Error("another dictionary dirty refresh job is already running");
      }

      const documents = await this.repository.findDictionaryDirtyDocuments({
        limit: job.limit,
      });
      job.total = documents.length;

      for (const document of documents) {
        const documentId = Number(document.id);
        const progress: DirtyDataRefreshDocumentProgress = {
          documentId,
          fileName: document.fileName,
          status: "running",
          archiveUpdatedCount: 0,
          archiveVersionCount: 0,
        };
        job.currentDocumentId = documentId;
        job.documentProgress = [
          progress,
          ...job.documentProgress.filter((item) => item.documentId !== documentId),
        ].slice(0, job.batchSize);

        try {
          await this.refreshDocumentDictionary(documentId);
          const archiveResult = await this.refreshArchivesForDocument(documentId);
          progress.status = "success";
          progress.archiveUpdatedCount = archiveResult.updatedCount;
          progress.archiveVersionCount = archiveResult.versionCount;
          job.successCount += 1;
          job.archiveUpdatedCount += archiveResult.updatedCount;
          job.archiveVersionCount += archiveResult.versionCount;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.status = "failed";
          progress.error = message;
          job.failedCount += 1;
          job.errors.push({
            documentId,
            fileName: document.fileName,
            error: message,
          });
        } finally {
          job.processed += 1;
          job.documentProgress = [
            progress,
            ...job.documentProgress.filter((item) => item.documentId !== documentId),
          ].slice(0, job.batchSize);
          job.currentDocumentId = undefined;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      job.status = "completed";
      job.finishedAt = new Date().toISOString();
      logger.info(
        `[productConfigAgent:dirtyDataRefresh:end] jobId=${job.id} total=${job.total} ` +
          `successCount=${job.successCount} failedCount=${job.failedCount} ` +
          `archiveVersionCount=${job.archiveVersionCount} totalMs=${elapsedMs(startedAt)}`,
      );
    } catch (error) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.errors.push({
        documentId: job.currentDocumentId ?? 0,
        fileName: "",
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error(
        `[productConfigAgent:dirtyDataRefresh:failed] jobId=${job.id} totalMs=${elapsedMs(startedAt)} ` +
          `error=${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (lockAcquired) {
        await PgDataSource.query(
          "SELECT pg_advisory_unlock($1)",
          [DIRTY_DATA_REFRESH_ADVISORY_LOCK_KEY],
        );
      }
    }
  }
}
