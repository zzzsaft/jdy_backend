import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { getRoutedChatModel, normalizeRoutedChatModel } from "../../../llm/index.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { productConfigAgentRepository } from "../db.service.js";
import { productConfigAgentService } from "../service.js";
import { TWO_STAGE_PROMPT_VERSION } from "../workflow/common.js";
import { readArg, readOptionalPositiveIntArg } from "./scriptArgs.js";

type CandidateRef = {
  candidateType: "term_type" | "value";
  candidateId: string;
  targetReason: "cross_concept_split_value" | "wrong_scope_or_extraction_error";
};
type TargetDocument = { documentId: number; fileName: string; status: string };

const DIRTY_REASON = "prompt_cross_concept_reextract";
const TARGET_PROMPT_VERSION = "v3-plan-item-20260616-cross-concept-20260621";

function readMode(): "mark" | "reextract" | "resume" | "resume-batch" {
  const mode = readArg("mode") ?? "mark";
  if (!["mark", "reextract", "resume", "resume-batch"].includes(mode)) {
    throw new Error("--mode must be mark, reextract, resume, or resume-batch");
  }
  return mode as "mark" | "reextract" | "resume" | "resume-batch";
}

async function pendingCounts() {
  const rows = await PgDataSource.query(`
    SELECT 'value' AS candidate_type, count(*)::int AS count
    FROM quote_agent.dictionary_candidates
    WHERE status = 'pending'
    UNION ALL
    SELECT 'term_type' AS candidate_type, count(*)::int AS count
    FROM quote_agent.dictionary_term_type_candidates
    WHERE status = 'pending'
    ORDER BY candidate_type
  `);
  return Object.fromEntries(rows.map((row: any) => [row.candidate_type, Number(row.count)]));
}

async function findCandidateRefs(limit: number): Promise<CandidateRef[]> {
  return PgDataSource.query(
    `
      WITH value_candidates AS (
        SELECT
          'value'::text AS "candidateType",
          id::text AS "candidateId",
          CASE
            WHEN term_type IN ('plastic_material', 'application')
              AND (
                resolver_decision_jsonb->>'recommendedAction' = 'split_value'
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                    CASE
                      WHEN jsonb_typeof(resolver_decision_jsonb->'issues') = 'array'
                        THEN resolver_decision_jsonb->'issues'
                      ELSE '[]'::jsonb
                    END
                  ) issue
                  WHERE issue->>'recommendedAction' = 'split_value'
                )
              )
              THEN 'cross_concept_split_value'
            ELSE 'wrong_scope_or_extraction_error'
          END AS "targetReason"
        FROM quote_agent.dictionary_candidates
        WHERE status = 'pending'
          AND resolver_decision_jsonb IS NOT NULL
          AND (
            (
              term_type IN ('plastic_material', 'application')
              AND (
                resolver_decision_jsonb->>'recommendedAction' = 'split_value'
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                    CASE
                      WHEN jsonb_typeof(resolver_decision_jsonb->'issues') = 'array'
                        THEN resolver_decision_jsonb->'issues'
                      ELSE '[]'::jsonb
                    END
                  ) issue
                  WHERE issue->>'recommendedAction' = 'split_value'
                )
              )
            )
            OR resolver_decision_jsonb->>'relationType' IN ('wrong_scope', 'extraction_error')
            OR resolver_decision_jsonb->>'recommendedAction' IN ('move_scope', 'mark_extraction_error')
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(resolver_decision_jsonb->'issues') = 'array'
                    THEN resolver_decision_jsonb->'issues'
                  ELSE '[]'::jsonb
                END
              ) issue
              WHERE issue->>'relationType' IN ('wrong_scope', 'extraction_error')
                 OR issue->>'recommendedAction' IN ('move_scope', 'mark_extraction_error')
            )
          )
      ), term_type_candidates AS (
        SELECT
          'term_type'::text AS "candidateType",
          id::text AS "candidateId",
          'wrong_scope_or_extraction_error'::text AS "targetReason"
        FROM quote_agent.dictionary_term_type_candidates
        WHERE status = 'pending'
          AND resolver_decision_jsonb IS NOT NULL
          AND (
            resolver_decision_jsonb->>'relationType' IN ('wrong_scope', 'extraction_error')
            OR resolver_decision_jsonb->>'recommendedAction' IN ('move_scope', 'mark_extraction_error')
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(resolver_decision_jsonb->'issues') = 'array'
                    THEN resolver_decision_jsonb->'issues'
                  ELSE '[]'::jsonb
                END
              ) issue
              WHERE issue->>'relationType' IN ('wrong_scope', 'extraction_error')
                 OR issue->>'recommendedAction' IN ('move_scope', 'mark_extraction_error')
            )
          )
      )
      SELECT * FROM value_candidates
      UNION ALL
      SELECT * FROM term_type_candidates
      ORDER BY "targetReason", "candidateType", "candidateId"
      LIMIT $1
    `,
    [limit],
  );
}

async function findDocumentsForCandidates(refs: CandidateRef[]): Promise<TargetDocument[]> {
  if (!refs.length) return [];
  const valueIds = refs.filter((ref) => ref.candidateType === "value").map((ref) => ref.candidateId);
  const termTypeIds = refs
    .filter((ref) => ref.candidateType === "term_type")
    .map((ref) => ref.candidateId);
  return PgDataSource.query(
    `
      WITH affected AS (
        SELECT occurrence.document_id
        FROM quote_agent.dictionary_candidate_occurrences occurrence
        WHERE (occurrence.candidate_type = 'value' AND occurrence.candidate_id = ANY($1::bigint[]))
           OR (occurrence.candidate_type = 'term_type' AND occurrence.candidate_id = ANY($2::bigint[]))
        UNION
        SELECT document_id FROM quote_agent.dictionary_candidates WHERE id = ANY($1::bigint[])
        UNION
        SELECT document_id FROM quote_agent.dictionary_term_type_candidates WHERE id = ANY($2::bigint[])
      )
      SELECT document.id AS "documentId", document.file_name AS "fileName", document.status
      FROM affected
      JOIN quote_agent.documents document ON document.id = affected.document_id
      WHERE affected.document_id IS NOT NULL
      ORDER BY document.id
    `,
    [valueIds, termTypeIds],
  );
}

async function findMarkedDocuments(limit: number): Promise<TargetDocument[]> {
  return PgDataSource.query(
    `
      SELECT id AS "documentId", file_name AS "fileName", status
      FROM quote_agent.documents
      WHERE dirty_reason = $1
        AND status = 'planned_needs_reextract'
      ORDER BY id
      LIMIT $2
    `,
    [DIRTY_REASON, limit],
  );
}

async function markDocuments(documentIds: number[]) {
  if (!documentIds.length) return;
  await PgDataSource.query(
    `
      UPDATE quote_agent.documents
      SET status = 'planned_needs_reextract', dirty_reason = $1
      WHERE id = ANY($2::bigint[])
    `,
    [DIRTY_REASON, documentIds],
  );
}

async function clearDocumentMarker(documentId: number) {
  await PgDataSource.query(
    `
      UPDATE quote_agent.documents
      SET dirty_reason = NULL,
          dirty_source_run_id = NULL,
          dirty_dictionary_version = NULL,
          dirty_normalization_rule_version = NULL,
          dirty_resolver_version = NULL
      WHERE id = $1 AND dirty_reason = $2
    `,
    [documentId, DIRTY_REASON],
  );
}

async function stageMarkedDocumentsForItemBatch(model: string, limit: number) {
  return PgDataSource.query(
    `
      WITH marked AS (
        SELECT document.id
        FROM quote_agent.documents document
        LEFT JOIN quote_agent.document_blocks blocks ON blocks.document_id = document.id
        WHERE document.dirty_reason = $1
          AND document.status = 'planned_needs_reextract'
        ORDER BY length(COALESCE(blocks.blocks_json->>'llm_text', '')), document.id
        LIMIT $2
      ), source_plans AS (
        SELECT marked.id AS target_document_id, source.*
        FROM marked
        JOIN LATERAL (
          SELECT extraction.*
          FROM quote_agent.extraction_results extraction
          WHERE extraction.document_id = marked.id
            AND jsonb_typeof(extraction.llm_plan_json->'items') = 'array'
            AND jsonb_array_length(extraction.llm_plan_json->'items') > 0
          ORDER BY
            CASE WHEN extraction.status IN ('normalized', 'parsed') THEN 0 ELSE 1 END,
            extraction.created_at DESC,
            extraction.id DESC
          LIMIT 1
        ) source ON true
        WHERE NOT EXISTS (
          SELECT 1
          FROM quote_agent.extraction_results staged
          WHERE staged.document_id = marked.id
            AND staged.prompt_version = $3
            AND staged.llm_model = $4
            AND staged.status IN ('planned', 'planned_partial', 'normalized')
        )
      ), inserted AS (
        INSERT INTO quote_agent.extraction_results (
          document_id, extraction_json, normalized_extraction_json,
          dictionary_proposals, warnings, llm_plan_json, llm_model,
          prompt_version, dictionary_version, status
        )
        SELECT
          source.target_document_id,
          '{"document_info":{},"items":[]}'::jsonb,
          NULL,
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_set(
            source.llm_plan_json,
            '{items}',
            COALESCE((
              SELECT jsonb_agg(
                item - 'extracted_at' - 'extraction_status' - 'extraction_error'
                ORDER BY ordinal
              )
              FROM jsonb_array_elements(source.llm_plan_json->'items')
                WITH ORDINALITY AS plan_item(item, ordinal)
            ), '[]'::jsonb)
          ),
          $4,
          $3,
          1,
          'planned'
        FROM source_plans source
        RETURNING id, document_id
      )
      SELECT id AS "extractionResultId", document_id AS "documentId"
      FROM inserted
      ORDER BY document_id
    `,
    [DIRTY_REASON, limit, TARGET_PROMPT_VERSION, model],
  );
}

async function clearCompletedBatchMarkers() {
  const rows = await PgDataSource.query(
    `
      WITH completed AS (
        SELECT DISTINCT document.id
        FROM quote_agent.documents document
        JOIN quote_agent.extraction_results extraction
          ON extraction.document_id = document.id
        WHERE document.dirty_reason = $1
          AND extraction.prompt_version = $2
          AND extraction.status = 'normalized'
      )
      UPDATE quote_agent.documents document
      SET dirty_reason = NULL,
          dirty_source_run_id = NULL,
          dirty_dictionary_version = NULL,
          dirty_normalization_rule_version = NULL,
          dirty_resolver_version = NULL
      FROM completed
      WHERE document.id = completed.id
      RETURNING document.id
    `,
    [DIRTY_REASON, TARGET_PROMPT_VERSION],
  );
  const returnedRows = Array.isArray(rows?.[0]) ? rows[0] : rows;
  return Array.isArray(returnedRows) ? returnedRows.length : 0;
}

async function runResumeBatch(params: {
  model: string;
  limit: number;
  concurrency: number;
  batchSize: number;
  roundLimit: number;
  before: Record<string, number>;
  candidateRefs: CandidateRef[];
}) {
  const staged = await stageMarkedDocumentsForItemBatch(params.model, params.limit);
  console.log(JSON.stringify({
    phase: "batch_staged",
    promptVersion: TARGET_PROMPT_VERSION,
    stagedExtractionCount: staged.length,
  }));

  const rounds: any[] = [];
  while (true) {
    const result = await productConfigAgentService.extractPlannedItemsBatchWithLlm({
      llmModel: params.model,
      promptVersion: TARGET_PROMPT_VERSION,
      dictionaryVersion: 1,
      limit: params.roundLimit,
      batchSize: params.batchSize,
      concurrency: params.concurrency,
    });
    const round = {
      round: rounds.length + 1,
      batchCount: result.batchCount,
      itemCount: result.itemCount,
      successItemCount: result.successItemCount,
      failedItemCount: result.failedItemCount,
      updatedExtractionCount: result.updatedExtractionCount,
      skipped: result.skipped,
    };
    rounds.push(round);
    console.log(JSON.stringify({ phase: "batch_round", ...round }));
    if (result.skipped || result.itemCount === 0 || result.successItemCount === 0) break;
  }

  const clearedDocumentCount = await clearCompletedBatchMarkers();
  const recheck = await new DictionaryService(PgDataSource)
    .recheckPendingCandidatesAfterDictionaryUpdate({ limit: 5000 });
  console.log(JSON.stringify({
    phase: "complete",
    promptVersion: TARGET_PROMPT_VERSION,
    stagedExtractionCount: staged.length,
    clearedDocumentCount,
    remainingMarkedDocumentCount: Number((await PgDataSource.query(
      `SELECT count(*)::int AS count FROM quote_agent.documents WHERE dirty_reason = $1`,
      [DIRTY_REASON],
    ))[0].count),
    pendingBefore: params.before,
    pendingAfter: await pendingCounts(),
    targetCandidateStatuses: await candidateStatuses(params.candidateRefs),
    recheck,
    rounds,
  }, null, 2));
}

async function candidateStatuses(refs: CandidateRef[]) {
  const valueIds = refs.filter((ref) => ref.candidateType === "value").map((ref) => ref.candidateId);
  const termTypeIds = refs
    .filter((ref) => ref.candidateType === "term_type")
    .map((ref) => ref.candidateId);
  const rows = await PgDataSource.query(
    `
      SELECT 'value' AS candidate_type, status, count(*)::int AS count
      FROM quote_agent.dictionary_candidates
      WHERE id = ANY($1::bigint[])
      GROUP BY status
      UNION ALL
      SELECT 'term_type' AS candidate_type, status, count(*)::int AS count
      FROM quote_agent.dictionary_term_type_candidates
      WHERE id = ANY($2::bigint[])
      GROUP BY status
      ORDER BY candidate_type, status
    `,
    [valueIds, termTypeIds],
  );
  return rows;
}

function countCandidateTargetReasons(refs: CandidateRef[]) {
  return refs.reduce<Record<string, number>>((counts, ref) => {
    counts[ref.targetReason] = (counts[ref.targetReason] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  const mode = readMode();
  const limit = readOptionalPositiveIntArg("limit", 5000)!;
  const concurrency = Math.min(10, readOptionalPositiveIntArg("concurrency", 1)!);
  const batchSize = Math.min(20, readOptionalPositiveIntArg("batchSize", 5)!);
  const roundLimit = readOptionalPositiveIntArg("roundLimit", 10)!;
  const model = getRoutedChatModel(readArg("model") ?? "inferaichat:deepseek-v4-flash");

  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  const before = await pendingCounts();
  const candidateRefs = await findCandidateRefs(limit);
  const documents = mode === "resume"
    ? await findMarkedDocuments(limit)
    : mode === "resume-batch"
      ? await findMarkedDocuments(limit)
    : await findDocumentsForCandidates(candidateRefs);
  const documentIds = documents.map((document) => Number(document.documentId));
  await markDocuments(documentIds);

  console.log(JSON.stringify({
    phase: "marked",
    mode,
    model: normalizeRoutedChatModel(model),
    pendingBefore: before,
    candidateCount: candidateRefs.length,
    candidateTargetReasons: countCandidateTargetReasons(candidateRefs),
    documentCount: documents.length,
    documents,
  }, null, 2));

  if (mode === "mark" || !documents.length) return;

  if (mode === "resume-batch") {
    await runResumeBatch({
      model,
      limit,
      concurrency,
      batchSize,
      roundLimit,
      before,
      candidateRefs,
    });
    return;
  }

  const results: any[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < documents.length) {
      const document = documents[cursor++];
      try {
        const result = await productConfigAgentService.extractDocumentBlocksWithLlm({
          documentId: Number(document.documentId),
          llmModel: model,
          promptVersion: TWO_STAGE_PROMPT_VERSION,
          forceReextract: true,
        });
        const summary = result.dictionary?.summary;
        const record = {
          documentId: Number(document.documentId),
          fileName: document.fileName,
          status: "success",
          extractionId: result.extraction?.id,
          candidateCount: (summary?.term_type_candidate_count ?? 0) +
            (summary?.value_candidate_count ?? 0),
        };
        await clearDocumentMarker(Number(document.documentId));
        results.push(record);
        console.log(JSON.stringify(record));
      } catch (error) {
        await markDocuments([Number(document.documentId)]);
        const record = {
          documentId: Number(document.documentId),
          fileName: document.fileName,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        results.push(record);
        console.error(JSON.stringify(record));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, documents.length) }, worker));

  const recheck = await new DictionaryService(PgDataSource)
    .recheckPendingCandidatesAfterDictionaryUpdate({ limit: 5000 });
  const after = await pendingCounts();
  console.log(JSON.stringify({
    phase: "complete",
    successCount: results.filter((result) => result.status === "success").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    pendingBefore: before,
    pendingAfter: after,
    targetCandidateStatuses: await candidateStatuses(candidateRefs),
    recheck,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) await PgDataSource.destroy();
  });
