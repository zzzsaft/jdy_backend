import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { productConfigAgentService } from "../service.js";
import {
  readArgAny,
  readOptionalBooleanArgAny,
  readBooleanEnv,
  readOptionalPositiveIntEnv,
} from "./scriptArgs.js";

type NormalizationScope =
  | "all"
  | "missing_normalized"
  | "outdated_dictionary"
  | "with_pending_candidates";

function readNormalizationScope(): NormalizationScope {
  const raw =
    readArgAny(["scope", "full-normalize-scope"]) ??
    process.env.QUOTE_AGENT_FULL_NORMALIZE_SCOPE;
  if (!raw || raw.trim() === "") {
    return "all";
  }
  const scope = raw.trim();
  if (
    scope !== "all" &&
    scope !== "missing_normalized" &&
    scope !== "outdated_dictionary" &&
    scope !== "with_pending_candidates"
  ) {
    throw new Error(
      "QUOTE_AGENT_FULL_NORMALIZE_SCOPE must be all, missing_normalized, outdated_dictionary, or with_pending_candidates"
    );
  }
  return scope;
}

function readPositiveIntOption(params: {
  argNames: string[];
  envName: string;
}): number | undefined {
  const raw = readArgAny(params.argNames);
  if (raw !== undefined) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new Error(`--${params.argNames[0]} must be a positive integer`);
    }
    return value;
  }
  return readOptionalPositiveIntEnv(params.envName);
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
      [documentIds]
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
      [documentIds]
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
  const limit = readPositiveIntOption({
    argNames: ["limit"],
    envName: "QUOTE_AGENT_FULL_NORMALIZE_LIMIT",
  });
  const batchSize = readPositiveIntOption({
    argNames: ["batchSize", "batch-size"],
    envName: "QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE",
  });
  const concurrency = readPositiveIntOption({
    argNames: ["concurrency"],
    envName: "QUOTE_AGENT_FULL_NORMALIZE_CONCURRENCY",
  });
  const scope = readNormalizationScope();
  const recheckCandidates =
    readOptionalBooleanArgAny(["recheckCandidates", "recheck-candidates"]) ??
    readBooleanEnv("QUOTE_AGENT_FULL_NORMALIZE_RECHECK_CANDIDATES");
  const recheckLimit = readPositiveIntOption({
    argNames: ["recheckLimit", "recheck-limit"],
    envName: "QUOTE_AGENT_FULL_NORMALIZE_RECHECK_LIMIT",
  });
  const startedAt = Date.now();
  console.log(
    `[productConfigAgent:full-normalize] starting scope=${scope} limit=${
      limit ?? "all"
    } batchSize=${batchSize ?? 100} concurrency=${
      concurrency ?? 1
    } recheckCandidates=${recheckCandidates}`
  );
  PgDataSource.setOptions({
    logging: false,
    maxQueryExecutionTime: 0,
  });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const targetDictionaryVersion =
      await productConfigAgentService.getCurrentDictionaryVersion();
    const targetCount =
      await productConfigAgentService.countRenormalizationTargets({
        onlyMissingNormalized: scope === "missing_normalized",
        withPendingCandidates: scope === "with_pending_candidates",
        targetDictionaryVersion:
          scope === "outdated_dictionary" ? targetDictionaryVersion : undefined,
      });
    const plannedCount =
      limit === undefined ? targetCount : Math.min(targetCount, limit);
    console.log(
      `[productConfigAgent:full-normalize] targetCount=${targetCount} plannedCount=${plannedCount}` +
        (targetDictionaryVersion === undefined
          ? ""
          : ` targetDictionaryVersion=${targetDictionaryVersion}`)
    );

    let lastLoggedProcessed = 0;
    const result =
      await productConfigAgentService.renormalizeExistingExtractionsInBatches({
        limit,
        batchSize,
        concurrency,
        onlyMissingNormalized: scope === "missing_normalized",
        withPendingCandidates: scope === "with_pending_candidates",
        targetDictionaryVersion,
        onProgress: (event) => {
          if (event.processedCount <= lastLoggedProcessed) {
            return;
          }
          lastLoggedProcessed = event.processedCount;
          console.log(
            `[productConfigAgent:full-normalize] batch=${event.batchIndex} size=${event.batchCount} ` +
              `processed=${event.processedCount} success=${event.successCount} failed=${event.failedCount}`
          );
        },
      });
    console.log(
      `[productConfigAgent:full-normalize] normalization done processed=${result.processedCount} ` +
        `success=${result.successCount} failed=${
          result.failedCount
        } elapsedMs=${Date.now() - startedAt}`
    );
    const processedDocumentIds = Array.from(
      new Set(result.results.map((item) => item.documentId))
    );
    console.log(
      `[productConfigAgent:full-normalize] loading master data summary for processed documents=${processedDocumentIds.length}`
    );
    const summary = await loadMasterDataSummary(processedDocumentIds);
    const candidateRecheck = recheckCandidates
      ? await new DictionaryService(
          PgDataSource
        ).recheckPendingCandidatesAfterDictionaryUpdate({
          limit: recheckLimit,
        })
      : null;
    const conceptResolverDrainStartedAt = Date.now();
    await productConfigAgentService.waitForConceptResolverIdle();
    const conceptResolverDrainMs = Date.now() - conceptResolverDrainStartedAt;
    console.log(
      JSON.stringify(
        {
          mode: "full_normalization_with_master_data",
          scope,
          targetCount,
          plannedCount,
          limit: limit ?? null,
          batchSize: result.batchSize,
          normalization: {
            requestedLimit: result.requestedLimit,
            batchSize: result.batchSize,
            concurrency: result.concurrency,
            onlyMissingNormalized: result.onlyMissingNormalized,
            withPendingCandidates: result.withPendingCandidates,
            targetDictionaryVersion: result.targetDictionaryVersion,
            processedCount: result.processedCount,
            successCount: result.successCount,
            failedCount: result.failedCount,
            failedResults: result.results.filter(
              (item) => item.status === "failed"
            ),
            resultPreview: result.results.slice(0, 20),
            profilePreview: result.results
              .filter((item) => item.profile)
              .slice(0, 20)
              .map((item) => ({
                extractionResultId: item.extractionResultId,
                documentId: item.documentId,
                profile: item.profile,
              })),
          },
          conceptResolverDrainMs,
          candidateRecheck,
          masterDataSummary: summary,
        },
        null,
        2
      )
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
