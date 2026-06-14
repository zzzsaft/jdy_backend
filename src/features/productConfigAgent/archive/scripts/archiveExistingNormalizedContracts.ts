import "../../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../../config/data-source.js";
import { productConfigAgentArchiveService } from "../contractArchive.service.js";

type ArchiveCandidate = {
  documentId: number;
  extractionResultId: number;
  fileName: string | null;
  extractionCreatedAt: string;
};

function readLimit(): number | undefined {
  const raw = process.env.QUOTE_AGENT_ARCHIVE_EXISTING_LIMIT;
  if (!raw || raw.trim() === "") {
    return 100;
  }
  if (raw.trim().toLowerCase() === "all") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("QUOTE_AGENT_ARCHIVE_EXISTING_LIMIT must be a positive number or all");
  }
  return Math.floor(value);
}

function readBooleanEnv(name: string): boolean {
  return process.env[name] === "1" || process.env[name] === "true";
}

function readArchivedBy(): string {
  return (
    process.env.QUOTE_AGENT_ARCHIVE_EXISTING_BY?.trim() ||
    "script:archive-existing-normalized-contracts"
  );
}

async function findArchiveCandidates(limit: number | undefined) {
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
      ${limit === undefined ? "" : "LIMIT $1"}
    `,
    limit === undefined ? [] : [limit],
  );

  return rows as ArchiveCandidate[];
}

async function main() {
  const limit = readLimit();
  const dryRun = readBooleanEnv("QUOTE_AGENT_ARCHIVE_EXISTING_DRY_RUN");
  const force = readBooleanEnv("QUOTE_AGENT_ARCHIVE_EXISTING_FORCE");
  const archivedBy = readArchivedBy();
  const startedAt = Date.now();

  console.log(
    `[productConfigAgent:archive-existing] starting limit=${limit ?? "all"} dryRun=${dryRun} force=${force} archivedBy=${archivedBy}`,
  );

  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const candidates = await findArchiveCandidates(limit);
    console.log(
      `[productConfigAgent:archive-existing] found candidates=${candidates.length}`,
    );

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            limit: limit ?? null,
            force,
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 50),
          },
          null,
          2,
        ),
      );
      return;
    }

    const results: Array<{
      documentId: number;
      extractionResultId: number;
      fileName: string | null;
      status: "archived" | "failed";
      archiveId?: number;
      currentVersion?: number;
      error?: string;
    }> = [];

    for (const [index, candidate] of candidates.entries()) {
      try {
        const result = await productConfigAgentArchiveService.archiveDocument({
          documentId: candidate.documentId,
          archivedBy,
          force,
        });
        results.push({
          documentId: candidate.documentId,
          extractionResultId: candidate.extractionResultId,
          fileName: candidate.fileName,
          status: "archived",
          archiveId: result.archive.id,
          currentVersion: result.archive.currentVersion,
        });
        console.log(
          `[productConfigAgent:archive-existing] ${index + 1}/${candidates.length} archived documentId=${candidate.documentId} archiveId=${result.archive.id}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          documentId: candidate.documentId,
          extractionResultId: candidate.extractionResultId,
          fileName: candidate.fileName,
          status: "failed",
          error: message,
        });
        console.error(
          `[productConfigAgent:archive-existing] ${index + 1}/${candidates.length} failed documentId=${candidate.documentId}: ${message}`,
        );
      }
    }

    const successCount = results.filter((item) => item.status === "archived").length;
    const failedCount = results.filter((item) => item.status === "failed").length;
    console.log(
      JSON.stringify(
        {
          mode: "archive_existing_normalized_contracts",
          limit: limit ?? null,
          force,
          processedCount: results.length,
          successCount,
          failedCount,
          elapsedMs: Date.now() - startedAt,
          failedResults: results.filter((item) => item.status === "failed"),
          resultPreview: results.slice(0, 50),
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
