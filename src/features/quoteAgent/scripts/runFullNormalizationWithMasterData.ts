import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { quoteAgentService } from "../service.js";

type NormalizationScope =
  | "all"
  | "missing_normalized"
  | "with_pending_candidates";

function readOptionalPositiveInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.floor(value);
}

function readNormalizationScope(): NormalizationScope {
  const raw = process.env.QUOTE_AGENT_FULL_NORMALIZE_SCOPE;
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
      "QUOTE_AGENT_FULL_NORMALIZE_SCOPE must be all, missing_normalized, or with_pending_candidates",
    );
  }
  return scope;
}

function readBooleanEnv(name: string): boolean {
  return process.env[name] === "1" || process.env[name] === "true";
}

async function loadMasterDataSummary(documentIds: number[]) {
  if (documentIds.length === 0) {
    return {
      scope: "processed_documents",
      documentCount: 0,
      modelFields: [],
      masterDataNoMatchWarnings: [],
    };
  }

  const [fieldRows, warningRows] = await Promise.all([
    PgDataSource.query(
      `
      SELECT
        field->'dictionary'->>'term_type' AS "termType",
        COUNT(*)::int AS "fieldCount",
        COUNT(*) FILTER (
          WHERE field->'dictionary'->'masterDataMatch'->>'matched' = 'true'
        )::int AS "matchedCount",
        COUNT(*) FILTER (
          WHERE field->'dictionary'->'masterDataMatch'->>'matched' = 'false'
        )::int AS "unmatchedCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        extraction.normalized_extraction_json->'items'
      ) item
      CROSS JOIN LATERAL jsonb_array_elements(item->'fields') field
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND extraction.document_id = ANY($1::int[])
        AND field->'dictionary'->>'term_type' IN (
          'metering_pump_model',
          'filter_model'
        )
      GROUP BY field->'dictionary'->>'term_type'
      ORDER BY field->'dictionary'->>'term_type'
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
        extraction.normalized_extraction_json->'warnings'
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
    modelFields: fieldRows,
    masterDataNoMatchWarnings: warningRows,
  };
}

async function main() {
  const limit = readOptionalPositiveInt("QUOTE_AGENT_FULL_NORMALIZE_LIMIT");
  const batchSize = readOptionalPositiveInt("QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE");
  const scope = readNormalizationScope();
  const recheckCandidates = readBooleanEnv(
    "QUOTE_AGENT_FULL_NORMALIZE_RECHECK_CANDIDATES",
  );
  const recheckLimit = readOptionalPositiveInt(
    "QUOTE_AGENT_FULL_NORMALIZE_RECHECK_LIMIT",
  );
  const startedAt = Date.now();
  console.log(
    `[quoteAgent:full-normalize] starting scope=${scope} limit=${limit ?? "all"} batchSize=${batchSize ?? 100} recheckCandidates=${recheckCandidates}`,
  );
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    let lastLoggedProcessed = 0;
    const result = await quoteAgentService.renormalizeExistingExtractionsInBatches({
      limit,
      batchSize,
      onlyMissingNormalized: scope === "missing_normalized",
      withPendingCandidates: scope === "with_pending_candidates",
      onProgress: (event) => {
        if (event.processedCount <= lastLoggedProcessed) {
          return;
        }
        lastLoggedProcessed = event.processedCount;
        console.log(
          `[quoteAgent:full-normalize] batch=${event.batchIndex} size=${event.batchCount} ` +
            `processed=${event.processedCount} success=${event.successCount} failed=${event.failedCount}`,
        );
      },
    });
    console.log(
      `[quoteAgent:full-normalize] normalization done processed=${result.processedCount} ` +
        `success=${result.successCount} failed=${result.failedCount} elapsedMs=${Date.now() - startedAt}`,
    );
    const processedDocumentIds = Array.from(
      new Set(result.results.map((item) => item.documentId)),
    );
    console.log(
      `[quoteAgent:full-normalize] loading master data summary for processed documents=${processedDocumentIds.length}`,
    );
    const summary = await loadMasterDataSummary(processedDocumentIds);
    const candidateRecheck = recheckCandidates
      ? await new DictionaryService(PgDataSource)
          .recheckPendingCandidatesAfterDictionaryUpdate({
            limit: recheckLimit,
          })
      : null;
    console.log(
      JSON.stringify(
        {
          mode: "full_normalization_with_master_data",
          scope,
          limit: limit ?? null,
          batchSize: result.batchSize,
          normalization: {
            requestedLimit: result.requestedLimit,
            batchSize: result.batchSize,
            onlyMissingNormalized: result.onlyMissingNormalized,
            withPendingCandidates: result.withPendingCandidates,
            processedCount: result.processedCount,
            successCount: result.successCount,
            failedCount: result.failedCount,
            failedResults: result.results.filter(
              (item) => item.status === "failed",
            ),
            resultPreview: result.results.slice(0, 20),
          },
          candidateRecheck,
          masterDataSummary: summary,
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
