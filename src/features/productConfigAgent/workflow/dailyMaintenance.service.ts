import { logger } from "../../../config/logger.js";
import { PgDataSource } from "../../../config/data-source.js";
import { productConfigAgentArchiveService } from "../archive/contractArchive.service.js";
import { productConfigAgentService } from "../service.js";
import { elapsedMs, TWO_STAGE_PROMPT_VERSION } from "./common.js";
import {
  readBooleanEnv,
  readPositiveIntEnv,
} from "../utils/envParsing.js";
import { withTryAdvisoryLock } from "../utils/advisoryLock.js";

const DAILY_MAINTENANCE_ADVISORY_LOCK_KEY = 2001000;
const ARCHIVE_EXISTING_ADVISORY_LOCK_KEY = 2001002;

type ArchiveCandidate = {
  documentId: number;
  extractionResultId: number;
  fileName: string | null;
  extractionCreatedAt: string;
};

async function findArchiveCandidates(limit: number): Promise<ArchiveCandidate[]> {
  const rows = await PgDataSource.query(
    `
      WITH latest_normalized AS (
        SELECT DISTINCT ON (extraction.document_id)
          extraction.document_id,
          extraction.id AS extraction_result_id,
          extraction.created_at AS extraction_created_at
        FROM quote_agent.extraction_results extraction
        WHERE extraction.status = 'normalized'
          AND extraction.normalized_extraction_json IS NOT NULL
          AND jsonb_typeof(extraction.normalized_extraction_json->'items') = 'array'
          AND jsonb_array_length(extraction.normalized_extraction_json->'items') > 0
          AND (
            extraction.prompt_version <> $1
            OR (
              jsonb_typeof(extraction.llm_plan_json->'items') = 'array'
              AND jsonb_array_length(extraction.llm_plan_json->'items') > 0
              AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(extraction.llm_plan_json->'items') plan_item
                WHERE NOT (
                  plan_item ? 'extracted_at'
                  OR plan_item->>'extraction_status' = 'extracted'
                )
              )
            )
          )
        ORDER BY extraction.document_id, extraction.created_at DESC, extraction.id DESC
      )
      SELECT
        document.id::int AS "documentId",
        latest.extraction_result_id::int AS "extractionResultId",
        document.file_name AS "fileName",
        latest.extraction_created_at AS "extractionCreatedAt"
      FROM latest_normalized latest
      INNER JOIN quote_agent.documents document
        ON document.id = latest.document_id
      LEFT JOIN quote_agent.contract_archives archive
        ON archive.document_id = latest.document_id
       AND archive.extraction_result_id = latest.extraction_result_id
      WHERE archive.id IS NULL
      ORDER BY latest.extraction_created_at ASC, latest.extraction_result_id ASC
      LIMIT $2
    `,
    [TWO_STAGE_PROMPT_VERSION, limit],
  );
  return rows as ArchiveCandidate[];
}

export class ProductConfigAgentDailyMaintenanceService {
  async runDailyMaintenance(params?: {
    dirtyLimit?: number;
    dirtyBatchSize?: number;
    archiveLimit?: number;
    archivedBy?: string;
    forceArchive?: boolean;
  }) {
    const startedAt = Date.now();
    const locked = await withTryAdvisoryLock(
      PgDataSource,
      DAILY_MAINTENANCE_ADVISORY_LOCK_KEY,
      async () => {
        const dirtyLimit =
          params?.dirtyLimit ??
          readPositiveIntEnv("PRODUCT_CONFIG_AGENT_DAILY_DIRTY_LIMIT", 1000);
        const dirtyBatchSize =
          params?.dirtyBatchSize ??
          readPositiveIntEnv("PRODUCT_CONFIG_AGENT_DAILY_DIRTY_BATCH_SIZE", 10);
        const archiveLimit =
          params?.archiveLimit ??
          readPositiveIntEnv("PRODUCT_CONFIG_AGENT_DAILY_ARCHIVE_LIMIT", 1000);
        const archivedBy =
          params?.archivedBy ??
          process.env.PRODUCT_CONFIG_AGENT_DAILY_ARCHIVED_BY ??
          "system:daily-product-config-maintenance";
        const forceArchive =
          params?.forceArchive ??
          readBooleanEnv("PRODUCT_CONFIG_AGENT_DAILY_FORCE_ARCHIVE", false);

        logger.info(
          `[productConfigAgent:daily-maintenance:start] dirtyLimit=${dirtyLimit} ` +
            `dirtyBatchSize=${dirtyBatchSize} archiveLimit=${archiveLimit} ` +
            `forceArchive=${forceArchive}`,
        );

        const dirtyRefresh = await productConfigAgentService.runDirtyDataRefreshJobNow({
          limit: dirtyLimit,
          batchSize: dirtyBatchSize,
        });
        const archive = await this.archiveExisting({
          limit: archiveLimit,
          archivedBy,
          force: forceArchive,
        });

        const result = {
          status: "completed" as const,
          dirtyRefresh: {
            total: dirtyRefresh.total,
            processed: dirtyRefresh.processed,
            successCount: dirtyRefresh.successCount,
            failedCount: dirtyRefresh.failedCount,
            archiveUpdatedCount: dirtyRefresh.archiveUpdatedCount,
            archiveVersionCount: dirtyRefresh.archiveVersionCount,
          },
          archive,
          elapsedMs: elapsedMs(startedAt),
        };
        logger.info(
          `[productConfigAgent:daily-maintenance:end] ` +
            `dirtyProcessed=${result.dirtyRefresh.processed} ` +
            `archiveProcessed=${archive.processedCount} ` +
            `archiveSuccess=${archive.successCount} archiveFailed=${archive.failedCount} ` +
            `totalMs=${result.elapsedMs}`,
        );
        return result;
      },
    );
    if (!locked.acquired) {
      logger.warn(
        "[productConfigAgent:daily-maintenance] skipped: another daily maintenance job is already running",
      );
      return { status: "skipped" as const, reason: "lock_not_acquired" };
    }
    return locked.value;
  }

  private async archiveExisting(params: {
    limit: number;
    archivedBy: string;
    force: boolean;
  }) {
    const locked = await withTryAdvisoryLock(
      PgDataSource,
      ARCHIVE_EXISTING_ADVISORY_LOCK_KEY,
      async () => {
        const candidates = await findArchiveCandidates(params.limit);
        const results: Array<{
          documentId: number;
          extractionResultId: number;
          fileName: string | null;
          status: "archived" | "failed";
          archiveId?: number;
          error?: string;
        }> = [];

        for (const candidate of candidates) {
          try {
            const result = await productConfigAgentArchiveService.archiveDocument({
              documentId: candidate.documentId,
              archivedBy: params.archivedBy,
              force: params.force,
            });
            results.push({
              documentId: candidate.documentId,
              extractionResultId: candidate.extractionResultId,
              fileName: candidate.fileName,
              status: "archived",
              archiveId: Number(result.archive.id),
            });
          } catch (error) {
            results.push({
              documentId: candidate.documentId,
              extractionResultId: candidate.extractionResultId,
              fileName: candidate.fileName,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return {
          status: "completed" as const,
          processedCount: results.length,
          successCount: results.filter((item) => item.status === "archived").length,
          failedCount: results.filter((item) => item.status === "failed").length,
          failedResults: results.filter((item) => item.status === "failed"),
        };
      },
    );
    if (!locked.acquired) {
      logger.warn(
        "[productConfigAgent:daily-maintenance:archive] skipped: another archive-existing job is already running",
      );
      return {
        status: "skipped" as const,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        failedResults: [],
      };
    }
    return locked.value;
  }
}

export const productConfigAgentDailyMaintenanceService =
  new ProductConfigAgentDailyMaintenanceService();
