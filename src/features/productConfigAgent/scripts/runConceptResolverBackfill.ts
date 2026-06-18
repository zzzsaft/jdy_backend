import "../../../config/env.js";
import "reflect-metadata";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import {
  ConceptResolverRun,
  ConceptResolution,
} from "../dictionary/entity/index.js";
import {
  CONCEPT_RESOLVER_VERSION,
  ConceptResolverService,
} from "../dictionary/conceptResolver.service.js";
import {
  readBooleanEnv,
  readBoundedPositiveIntEnv,
  readPositiveIntEnv,
} from "./scriptArgs.js";

type CandidateType = "term_type" | "value";

type BackfillStats = {
  candidateType: CandidateType;
  processedCount: number;
  successCount: number;
  failedCount: number;
  routeCounts: Record<string, number>;
  relationCounts: Record<string, number>;
  recommendedActionCounts: Record<string, number>;
  failures: Array<{ candidateType: CandidateType; candidateId: string; error: string }>;
};

function readCandidateTypes(): CandidateType[] {
  const raw = String(process.env.QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE ?? "all");
  if (raw === "term_type") return ["term_type"];
  if (raw === "value") return ["value"];
  if (raw !== "all") {
    throw new Error("QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE must be all, term_type, or value");
  }
  return ["term_type", "value"];
}

function addCount(map: Record<string, number>, key: string | null | undefined) {
  const normalized = key || "unknown";
  map[normalized] = (map[normalized] ?? 0) + 1;
}

async function applyMigrationIfRequested() {
  if (!readBooleanEnv("QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_APPLY_MIGRATION")) {
    return false;
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationPath = path.join(
    __dirname,
    "migration_add_concept_resolver_v1.sql",
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  await PgDataSource.query(sql);
  return true;
}

async function getDictionaryVersion(): Promise<number> {
  const rows = await PgDataSource.query(
    `
    SELECT version_value::bigint AS "versionValue"
    FROM quote_agent.dictionary_versions
    WHERE version_key = 'dictionary'
    `,
  );
  return Number(rows[0]?.versionValue ?? 0);
}

async function countCandidates(candidateType: CandidateType): Promise<number> {
  const table =
    candidateType === "term_type"
      ? "quote_agent.dictionary_term_type_candidates"
      : "quote_agent.dictionary_candidates";
  const rows = await PgDataSource.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(rows[0]?.count ?? 0);
}

async function loadCandidateIds(params: {
  candidateType: CandidateType;
  lastId: string;
  batchSize: number;
}): Promise<string[]> {
  const table =
    params.candidateType === "term_type"
      ? "quote_agent.dictionary_term_type_candidates"
      : "quote_agent.dictionary_candidates";
  const rows = await PgDataSource.query(
    `
    SELECT id::text AS id
    FROM ${table}
    WHERE id::bigint > $1::bigint
    ORDER BY id::bigint ASC
    LIMIT $2
    `,
    [params.lastId, params.batchSize],
  );
  return rows.map((row: any) => String(row.id));
}

async function summarizeDictionaryIssues(limit: number) {
  const [routeSummary, relationSummary, patternSummary, candidateSamples] =
    await Promise.all([
      PgDataSource.query(
        `
        SELECT route, COUNT(*)::int AS count
        FROM quote_agent.concept_resolutions
        WHERE resolver_version = $1
        GROUP BY route
        ORDER BY count DESC
        `,
        [CONCEPT_RESOLVER_VERSION],
      ),
      PgDataSource.query(
        `
        SELECT relation_type AS "relationType", recommended_action AS "recommendedAction", COUNT(*)::int AS count
        FROM quote_agent.concept_resolutions
        WHERE resolver_version = $1
        GROUP BY relation_type, recommended_action
        ORDER BY count DESC
        `,
        [CONCEPT_RESOLVER_VERSION],
      ),
      PgDataSource.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (pattern_key, candidate_type, candidate_id)
            *
          FROM quote_agent.concept_resolutions
          WHERE resolver_version = $1
          ORDER BY pattern_key, candidate_type, candidate_id, created_at DESC
        )
        SELECT
          pattern_key AS "patternKey",
          candidate_type AS "candidateType",
          relation_type AS "relationType",
          recommended_action AS "recommendedAction",
          route,
          risk_level AS "riskLevel",
          COUNT(*)::int AS "candidateCount",
          AVG(score)::float AS "avgScore"
        FROM latest
        WHERE route IN ('human_review', 'auto_reject_pending', 'defer_until_more_occurrences')
           OR risk_level = 'high'
        GROUP BY pattern_key, candidate_type, relation_type, recommended_action, route, risk_level
        ORDER BY
          CASE WHEN risk_level = 'high' THEN 0 ELSE 1 END,
          "candidateCount" DESC,
          "avgScore" DESC
        LIMIT $2
        `,
        [CONCEPT_RESOLVER_VERSION, limit],
      ),
      PgDataSource.query(
        `
        SELECT
          resolution.candidate_type AS "candidateType",
          resolution.candidate_id AS "candidateId",
          resolution.relation_type AS "relationType",
          resolution.recommended_action AS "recommendedAction",
          resolution.route,
          resolution.risk_level AS "riskLevel",
          resolution.score::float AS score,
          resolution.reason,
          CASE
            WHEN resolution.candidate_type = 'term_type' THEN term_candidate.raw_field_name
            ELSE value_candidate.term_type
          END AS "fieldName",
          CASE
            WHEN resolution.candidate_type = 'term_type' THEN term_candidate.raw_value
            ELSE value_candidate.raw_value
          END AS "rawValue",
          CASE
            WHEN resolution.candidate_type = 'term_type' THEN term_candidate.source_product_type
            ELSE value_candidate.source_product_type
          END AS "sourceProductType"
        FROM quote_agent.concept_resolutions resolution
        LEFT JOIN quote_agent.dictionary_term_type_candidates term_candidate
          ON resolution.candidate_type = 'term_type'
         AND resolution.candidate_id = term_candidate.id
        LEFT JOIN quote_agent.dictionary_candidates value_candidate
          ON resolution.candidate_type = 'value'
         AND resolution.candidate_id = value_candidate.id
        WHERE resolution.resolver_version = $1
          AND (
            resolution.route IN ('human_review', 'auto_reject_pending')
            OR resolution.risk_level = 'high'
          )
        ORDER BY
          CASE WHEN resolution.risk_level = 'high' THEN 0 ELSE 1 END,
          resolution.score DESC,
          resolution.created_at DESC
        LIMIT $2
        `,
        [CONCEPT_RESOLVER_VERSION, limit],
      ),
    ]);

  return {
    routeSummary,
    relationSummary,
    patternSummary,
    candidateSamples,
  };
}

async function processCandidateType(params: {
  candidateType: CandidateType;
  batchSize: number;
  concurrency: number;
  limit?: number;
  runId: string;
  service: ConceptResolverService;
}): Promise<BackfillStats> {
  const stats: BackfillStats = {
    candidateType: params.candidateType,
    processedCount: 0,
    successCount: 0,
    failedCount: 0,
    routeCounts: {},
    relationCounts: {},
    recommendedActionCounts: {},
    failures: [],
  };
  let lastId = "0";
  while (true) {
    if (params.limit !== undefined && stats.processedCount >= params.limit) {
      break;
    }
    const remaining =
      params.limit === undefined
        ? params.batchSize
        : Math.min(params.batchSize, params.limit - stats.processedCount);
    const ids = await loadCandidateIds({
      candidateType: params.candidateType,
      lastId,
      batchSize: remaining,
    });
    if (ids.length === 0) break;
    const processOne = async (candidateId: string) => {
      lastId = candidateId;
      stats.processedCount += 1;
      try {
        const decision = await params.service.resolveCandidate({
          candidateType: params.candidateType,
          candidateId,
          runId: params.runId,
          force: true,
        });
        stats.successCount += 1;
        addCount(stats.routeCounts, decision.route);
        addCount(stats.relationCounts, decision.relationType);
        addCount(stats.recommendedActionCounts, decision.recommendedAction);
      } catch (error) {
        stats.failedCount += 1;
        if (stats.failures.length < 50) {
          stats.failures.push({
            candidateType: params.candidateType,
            candidateId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    for (let index = 0; index < ids.length; index += params.concurrency) {
      await Promise.all(ids.slice(index, index + params.concurrency).map(processOne));
    }
    console.log(
      `[concept-resolver-backfill] ${params.candidateType} processed=${stats.processedCount} ` +
        `success=${stats.successCount} failed=${stats.failedCount} lastId=${lastId}`,
    );
  }
  return stats;
}

async function main() {
  const batchSize = readPositiveIntEnv(
    "QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_BATCH_SIZE",
    100,
  );
  const concurrency = readBoundedPositiveIntEnv(
    "QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_CONCURRENCY",
    8,
    32,
  );
  const totalLimitRaw = process.env.QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT;
  const totalLimit =
    totalLimitRaw === undefined || totalLimitRaw === ""
      ? undefined
      : readPositiveIntEnv("QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT", 0);
  const reportLimit = readPositiveIntEnv(
    "QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_REPORT_LIMIT",
    50,
  );
  const candidateTypes = readCandidateTypes();
  const startedAt = Date.now();

  PgDataSource.setOptions({ logging: false, maxQueryExecutionTime: 0 });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const migrationApplied = await applyMigrationIfRequested();
    const dictionaryVersion = await getDictionaryVersion();
    const service = new ConceptResolverService(PgDataSource);
    const run = await PgDataSource.getRepository(ConceptResolverRun).save(
      PgDataSource.getRepository(ConceptResolverRun).create({
        scope: "historical_candidate_backfill",
        mode: "dry_run",
        status: "running",
        dictionaryVersionAtStart: String(dictionaryVersion),
        resolverVersion: CONCEPT_RESOLVER_VERSION,
        stats: null,
        error: null,
        finishedAt: null,
      }),
    );
    const totals = Object.fromEntries(
      await Promise.all(
        candidateTypes.map(async (candidateType) => [
          candidateType,
          await countCandidates(candidateType),
        ]),
      ),
    );
    console.log(
      `[concept-resolver-backfill] start runId=${run.id} dictionaryVersion=${dictionaryVersion} ` +
        `migrationApplied=${migrationApplied} batchSize=${batchSize} concurrency=${concurrency} ` +
        `limit=${totalLimit ?? "all"} ` +
        `totals=${JSON.stringify(totals)}`,
    );

    const stats: BackfillStats[] = [];
    for (const candidateType of candidateTypes) {
      stats.push(
        await processCandidateType({
          candidateType,
          batchSize,
          concurrency,
          limit: totalLimit,
          runId: run.id,
          service,
        }),
      );
    }
    const issueSummary = await summarizeDictionaryIssues(reportLimit);
    run.status = "completed";
    run.finishedAt = new Date();
    run.stats = {
      elapsedMs: Date.now() - startedAt,
      migrationApplied,
      dictionaryVersion,
      totals,
      stats,
      issueSummary,
    };
    await PgDataSource.getRepository(ConceptResolverRun).save(run);

    console.log(
      JSON.stringify(
        {
          mode: "concept_resolver_backfill",
          runId: run.id,
          elapsedMs: Date.now() - startedAt,
          migrationApplied,
          dictionaryVersion,
          totals,
          stats,
          issueSummary,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error);
    try {
      const latestRun = await PgDataSource.getRepository(ConceptResolverRun).findOne({
        where: { status: "running", scope: "historical_candidate_backfill" },
        order: { createdAt: "DESC" },
      });
      if (latestRun) {
        latestRun.status = "failed";
        latestRun.error = error instanceof Error ? error.message : String(error);
        latestRun.finishedAt = new Date();
        await PgDataSource.getRepository(ConceptResolverRun).save(latestRun);
      }
    } catch {
      // Ignore status update failures while surfacing the original error.
    }
    process.exitCode = 1;
  } finally {
    await PgDataSource.destroy();
  }
}

main();
