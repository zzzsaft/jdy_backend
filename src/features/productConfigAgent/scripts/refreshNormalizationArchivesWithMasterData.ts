import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { productConfigAgentArchiveService } from "../archive/contractArchive.service.js";
import { productConfigAgentService } from "../service.js";
import {
  readApplyFlag,
  readBooleanEnv,
  readOptionalPositiveIntEnv,
} from "./scriptArgs.js";

type NormalizationScope =
  | "all"
  | "missing_normalized"
  | "with_pending_candidates";

type ArchiveCandidate = {
  documentId: number;
  extractionResultId: number;
  fileName: string | null;
  extractionCreatedAt: string;
};

function readNormalizationScope(): NormalizationScope {
  const raw = process.env.QUOTE_AGENT_MASTERDATA_REFRESH_SCOPE;
  if (!raw || raw.trim() === "") {
    return "all";
  }
  const scope = raw.trim();
  if (
    scope !== "all" &&
    scope !== "missing_normalized" &&
    scope !== "with_pending_candidates"
  ) {
    throw new Error(
      "QUOTE_AGENT_MASTERDATA_REFRESH_SCOPE must be all, missing_normalized, or with_pending_candidates",
    );
  }
  return scope;
}

function readEditedBy(): string {
  return (
    process.env.QUOTE_AGENT_MASTERDATA_REFRESH_BY?.trim() ||
    "script:refresh-normalization-archives-with-master-data"
  );
}

async function loadMasterDataSummary(documentIds: number[]) {
  if (documentIds.length === 0) {
    return {
      scope: "processed_documents",
      documentCount: 0,
      fieldMasterDataMatches: [],
      itemMasterDataMatches: [],
      attributeReviewWarnings: [],
      masterDataNoMatchWarnings: [],
    };
  }

  const [
    fieldMasterDataMatches,
    itemMasterDataMatches,
    attributeReviewWarnings,
    masterDataNoMatchWarnings,
  ] = await Promise.all([
    PgDataSource.query(
      `
      SELECT
        field->'dictionary'->>'term_type' AS "termType",
        field->'dictionary'->'masterDataMatch'->>'matchMethod' AS "matchMethod",
        COUNT(*)::int AS "matchCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(extraction.normalized_extraction_json->'items', '[]'::jsonb)
      ) item
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(item->'fields', '[]'::jsonb)
      ) field
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND extraction.document_id = ANY($1::int[])
        AND field->'dictionary'->'masterDataMatch'->>'matched' = 'true'
        AND field->'dictionary'->>'term_type' IN (
          'metering_pump_model',
          'filter_model'
        )
      GROUP BY
        field->'dictionary'->>'term_type',
        field->'dictionary'->'masterDataMatch'->>'matchMethod'
      ORDER BY "termType", "matchMethod"
      `,
      [documentIds],
    ),
    PgDataSource.query(
      `
      SELECT
        item->>'itemProductTypeHint' AS "productType",
        item->'masterDataMatch'->>'matchMethod' AS "matchMethod",
        COUNT(*)::int AS "matchCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(extraction.normalized_extraction_json->'items', '[]'::jsonb)
      ) item
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND extraction.document_id = ANY($1::int[])
        AND item->'masterDataMatch'->>'matched' = 'true'
      GROUP BY
        item->>'itemProductTypeHint',
        item->'masterDataMatch'->>'matchMethod'
      ORDER BY "productType", "matchMethod"
      `,
      [documentIds],
    ),
    PgDataSource.query(
      `
      SELECT
        item->>'itemProductTypeHint' AS "productType",
        warning->>'type' AS "warningType",
        COUNT(*)::int AS "warningCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(extraction.normalized_extraction_json->'items', '[]'::jsonb)
      ) item
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(item->'warnings', '[]'::jsonb)
      ) warning
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND extraction.document_id = ANY($1::int[])
        AND warning->>'type' IN (
          'master_data_attribute_match_needs_review',
          'master_data_attribute_match_applied'
        )
      GROUP BY item->>'itemProductTypeHint', warning->>'type'
      ORDER BY "productType", "warningType"
      `,
      [documentIds],
    ),
    PgDataSource.query(
      `
      SELECT
        warning->>'term_type' AS "termType",
        warning->>'source' AS "source",
        COUNT(*)::int AS "warningCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(extraction.normalized_extraction_json->'warnings', '[]'::jsonb)
      ) warning
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND extraction.document_id = ANY($1::int[])
        AND warning->>'type' = 'master_data_no_match'
      GROUP BY warning->>'term_type', warning->>'source'
      ORDER BY warning->>'term_type', warning->>'source'
      `,
      [documentIds],
    ),
  ]);

  return {
    scope: "processed_documents",
    documentCount: documentIds.length,
    fieldMasterDataMatches,
    itemMasterDataMatches,
    attributeReviewWarnings,
    masterDataNoMatchWarnings,
  };
}

async function findMissingArchiveCandidates(
  documentIds: number[],
): Promise<ArchiveCandidate[]> {
  if (documentIds.length === 0) return [];

  const rows = await PgDataSource.query(
    `
      WITH latest_normalized AS (
        SELECT DISTINCT ON (extraction.document_id)
          extraction.document_id,
          extraction.id AS extraction_result_id,
          extraction.created_at AS extraction_created_at
        FROM quote_agent.extraction_results extraction
        WHERE extraction.status = 'normalized'
          AND extraction.document_id = ANY($1::int[])
          AND extraction.normalized_extraction_json IS NOT NULL
          AND jsonb_typeof(extraction.normalized_extraction_json->'items') = 'array'
          AND jsonb_array_length(extraction.normalized_extraction_json->'items') > 0
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
    `,
    [documentIds],
  );

  return rows as ArchiveCandidate[];
}

async function main() {
  const scope = readNormalizationScope();
  const limit = readOptionalPositiveIntEnv("QUOTE_AGENT_MASTERDATA_REFRESH_LIMIT");
  const batchSize =
    readOptionalPositiveIntEnv("QUOTE_AGENT_MASTERDATA_REFRESH_BATCH_SIZE") ?? 100;
  const concurrency =
    readOptionalPositiveIntEnv("QUOTE_AGENT_MASTERDATA_REFRESH_CONCURRENCY") ?? 1;
  const apply = readApplyFlag({
    envName: "QUOTE_AGENT_MASTERDATA_REFRESH_APPLY",
  });
  const dryRun = !apply || readBooleanEnv("QUOTE_AGENT_MASTERDATA_REFRESH_DRY_RUN");
  const refreshArchives = readBooleanEnv(
    "QUOTE_AGENT_MASTERDATA_REFRESH_ARCHIVES",
    true,
  );
  const createMissingArchives = readBooleanEnv(
    "QUOTE_AGENT_MASTERDATA_REFRESH_CREATE_MISSING_ARCHIVES",
  );
  const forceArchive = readBooleanEnv(
    "QUOTE_AGENT_MASTERDATA_REFRESH_FORCE_ARCHIVE",
  );
  const recheckCandidates = readBooleanEnv(
    "QUOTE_AGENT_MASTERDATA_REFRESH_RECHECK_CANDIDATES",
  );
  const recheckLimit = readOptionalPositiveIntEnv(
    "QUOTE_AGENT_MASTERDATA_REFRESH_RECHECK_LIMIT",
  );
  const editedBy = readEditedBy();
  const startedAt = Date.now();

  console.log(
    `[productConfigAgent:masterdata-refresh] starting scope=${scope} limit=${
      limit ?? "all"
    } batchSize=${batchSize} concurrency=${concurrency} apply=${apply} dryRun=${dryRun} ` +
      `refreshArchives=${refreshArchives} createMissingArchives=${createMissingArchives}`,
  );

  PgDataSource.setOptions({
    logging: false,
    maxQueryExecutionTime: 0,
  });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const targetCount =
      await productConfigAgentService.countRenormalizationTargets({
        onlyMissingNormalized: scope === "missing_normalized",
        withPendingCandidates: scope === "with_pending_candidates",
      });
    const plannedCount =
      limit === undefined ? targetCount : Math.min(targetCount, limit);
    console.log(
      `[productConfigAgent:masterdata-refresh] targetCount=${targetCount} plannedCount=${plannedCount}`,
    );

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            scope,
            targetCount,
            plannedCount,
            limit: limit ?? null,
            batchSize,
            concurrency,
            apply,
            refreshArchives,
            createMissingArchives,
          },
          null,
          2,
        ),
      );
      return;
    }

    let lastLoggedProcessed = 0;
    const normalizationResult =
      await productConfigAgentService.renormalizeExistingExtractionsInBatches({
        limit,
        batchSize,
        concurrency,
        onlyMissingNormalized: scope === "missing_normalized",
        withPendingCandidates: scope === "with_pending_candidates",
        onProgress: (event) => {
          if (event.processedCount <= lastLoggedProcessed) {
            return;
          }
          lastLoggedProcessed = event.processedCount;
          console.log(
            `[productConfigAgent:masterdata-refresh] batch=${event.batchIndex} size=${event.batchCount} ` +
              `processed=${event.processedCount} success=${event.successCount} failed=${event.failedCount}`,
          );
        },
      });

    const processedDocumentIds = Array.from(
      new Set(
        normalizationResult.results
          .filter((item) => item.status === "normalized")
          .map((item) => item.documentId),
      ),
    );
    const masterDataSummary =
      await loadMasterDataSummary(processedDocumentIds);

    const archiveRefresh =
      refreshArchives && processedDocumentIds.length > 0
        ? await productConfigAgentArchiveService.refreshArchivesForDocuments({
            documentIds: processedDocumentIds,
            editedBy,
          })
        : {
            updatedCount: 0,
            versionCount: 0,
            archiveIds: [],
            results: [],
          };

    const missingArchiveCandidates = createMissingArchives
      ? await findMissingArchiveCandidates(processedDocumentIds)
      : [];
    const archiveCreateResults: Array<{
      documentId: number;
      extractionResultId: number;
      fileName: string | null;
      status: "archived" | "failed";
      archiveId?: number;
      currentVersion?: number;
      error?: string;
    }> = [];

    for (const [index, candidate] of missingArchiveCandidates.entries()) {
      try {
        const result = await productConfigAgentArchiveService.archiveDocument({
          documentId: candidate.documentId,
          archivedBy: editedBy,
          force: forceArchive,
        });
        archiveCreateResults.push({
          documentId: candidate.documentId,
          extractionResultId: candidate.extractionResultId,
          fileName: candidate.fileName,
          status: "archived",
          archiveId: result.archive.id,
          currentVersion: result.archive.currentVersion,
        });
        console.log(
          `[productConfigAgent:masterdata-refresh] ${index + 1}/${
            missingArchiveCandidates.length
          } archived missing documentId=${candidate.documentId} archiveId=${result.archive.id}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        archiveCreateResults.push({
          documentId: candidate.documentId,
          extractionResultId: candidate.extractionResultId,
          fileName: candidate.fileName,
          status: "failed",
          error: message,
        });
        console.error(
          `[productConfigAgent:masterdata-refresh] ${index + 1}/${
            missingArchiveCandidates.length
          } archive failed documentId=${candidate.documentId}: ${message}`,
        );
      }
    }

    const candidateRecheck = recheckCandidates
      ? await new DictionaryService(
          PgDataSource,
        ).recheckPendingCandidatesAfterDictionaryUpdate({
          limit: recheckLimit,
        })
      : null;

    console.log(
      JSON.stringify(
        {
          mode: "refresh_normalization_archives_with_master_data",
          scope,
          targetCount,
          plannedCount,
          limit: limit ?? null,
          batchSize: normalizationResult.batchSize,
          concurrency: normalizationResult.concurrency,
          elapsedMs: Date.now() - startedAt,
          normalization: {
            requestedLimit: normalizationResult.requestedLimit,
            processedCount: normalizationResult.processedCount,
            successCount: normalizationResult.successCount,
            failedCount: normalizationResult.failedCount,
            failedResults: normalizationResult.results.filter(
              (item) => item.status === "failed",
            ),
            resultPreview: normalizationResult.results.slice(0, 20),
          },
          archives: {
            refreshEnabled: refreshArchives,
            refreshedCount: archiveRefresh.updatedCount,
            versionCount: archiveRefresh.versionCount,
            archiveIds: archiveRefresh.archiveIds.slice(0, 100),
            createMissingArchives,
            forceArchive,
            missingCandidateCount: missingArchiveCandidates.length,
            createSuccessCount: archiveCreateResults.filter(
              (item) => item.status === "archived",
            ).length,
            createFailedCount: archiveCreateResults.filter(
              (item) => item.status === "failed",
            ).length,
            createFailedResults: archiveCreateResults.filter(
              (item) => item.status === "failed",
            ),
            createResultPreview: archiveCreateResults.slice(0, 50),
          },
          candidateRecheck,
          masterDataSummary,
        },
        null,
        2,
      ),
    );
  } finally {
    await PgDataSource.destroy();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  process.exit(1);
});
