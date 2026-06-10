import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { quoteAgentService } from "../service.js";

function readOptionalPositiveInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.floor(value);
}

async function loadMasterDataSummary() {
  const [fieldRows, warningRows] = await Promise.all([
    PgDataSource.query(`
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
        AND field->'dictionary'->>'term_type' IN (
          'metering_pump_model',
          'filter_model'
        )
      GROUP BY field->'dictionary'->>'term_type'
      ORDER BY field->'dictionary'->>'term_type'
    `),
    PgDataSource.query(`
      SELECT
        warning->>'term_type' AS "termType",
        warning->>'source' AS "source",
        COUNT(*)::int AS "warningCount"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        extraction.normalized_extraction_json->'warnings'
      ) warning
      WHERE extraction.normalized_extraction_json IS NOT NULL
        AND warning->>'type' = 'master_data_no_match'
      GROUP BY warning->>'term_type', warning->>'source'
      ORDER BY warning->>'term_type', warning->>'source'
    `),
  ]);

  return {
    modelFields: fieldRows,
    masterDataNoMatchWarnings: warningRows,
  };
}

async function main() {
  const limit = readOptionalPositiveInt("QUOTE_AGENT_FULL_NORMALIZE_LIMIT");
  const batchSize = readOptionalPositiveInt("QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE");
  const startedAt = Date.now();
  console.log(
    `[quoteAgent:full-normalize] starting limit=${limit ?? "all"} batchSize=${batchSize ?? 100}`,
  );
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const result = await quoteAgentService.renormalizeExistingExtractionsInBatches({
      limit,
      batchSize,
      onlyMissingNormalized: false,
      onProgress: (event) => {
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
    console.log("[quoteAgent:full-normalize] loading master data summary");
    const summary = await loadMasterDataSummary();
    console.log(
      JSON.stringify(
        {
          mode: "full_normalization_with_master_data",
          limit: limit ?? null,
          batchSize: result.batchSize,
          normalization: {
            requestedLimit: result.requestedLimit,
            batchSize: result.batchSize,
            onlyMissingNormalized: result.onlyMissingNormalized,
            processedCount: result.processedCount,
            successCount: result.successCount,
            failedCount: result.failedCount,
            failedResults: result.results.filter(
              (item) => item.status === "failed",
            ),
          },
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
