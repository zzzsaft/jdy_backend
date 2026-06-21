import { Brackets, In } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import {
  DictionaryCandidateOccurrence,
  DictionaryTermType,
  DictionaryTermTypeCandidate,
} from "../dictionary/entity/index.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { normalizeText } from "../dictionary/dictionary.utils.js";
import { ExtractionResults } from "../extraction/entity/extractionResults.entity.js";
import {
  buildItemInputText,
  type DocumentPlanItem,
} from "../extraction/twoStage/twoStageExtract.js";
import { productConfigAgentRepository } from "../db.service.js";
import { NormalizationRefreshService } from "../normalization/normalizationRefresh.service.js";
import { isDocInfoFieldName } from "../archive/utils/docInfo.js";

type AuditGroup =
  | "range_misaligned_reextract"
  | "field_redirectable"
  | "doc_info_candidate"
  | "dictionary_applicability_gap"
  | "needs_human_review";

type AuditRecord = {
  candidateId: string;
  status: string;
  reason: string | null;
  sourceProductType: string;
  rawFieldName: string;
  normalizedFieldName: string;
  proposedTermType: string | null;
  extractionResultId: string | null;
  itemIndex: number | null;
  group: AuditGroup;
  targetProductType?: string;
  targetItemIndex?: number;
  rejectReason?: string;
  notes: string[];
};

const DIE_FIELD_PATTERNS = [
  "\u6a21\u5934\u6709\u6548\u5bbd\u5ea6",
  "\u6a21\u5934\u51fa\u6599\u6709\u6548\u5bbd\u5ea6",
  "\u6a21\u5934\u5bbd\u5ea6\u8c03\u8282\u65b9\u5f0f",
  "\u6a21\u5507",
  "\u53e3\u6a21\u5bbd\u5ea6",
  "\u53e3\u6a21\u6709\u6548\u5bbd\u5ea6",
];

const HYDRAULIC_STATION_FIELD_PATTERNS = [
  "\u6db2\u538b\u7ad9",
  "\u6cb9\u7bb1\u5bb9\u91cf",
  "\u6db2\u538b\u538b\u529b",
  "\u63a7\u5236\u65b9\u5f0f",
  "\u7535\u673a\u529f\u7387",
  "\u7535\u673a\u7535\u538b",
];

const FILTER_FIELD_PATTERNS = ["\u6ee4\u7f51", "\u6362\u7f51", "\u8fc7\u6ee4"];

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const valueOf = (name: string, fallback?: string) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  return {
    apply: args.has("--apply"),
    rerun: args.has("--rerun"),
    limit: Number(valueOf("--limit", "5000")),
    candidateId: valueOf("--candidate-id"),
  };
}

function text(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.value === "string") return objectValue.value;
  }
  return String(value ?? "");
}

function fieldText(candidate: DictionaryTermTypeCandidate): string {
  return [
    candidate.rawFieldName,
    candidate.normalizedFieldName,
    candidate.proposedTermType,
  ].join(" ");
}

function includesAny(raw: string, patterns: string[]): boolean {
  const normalized = normalizeText(raw);
  return patterns.some((pattern) =>
    normalized.includes(normalizeText(pattern))
  );
}

function itemProductType(item: any): string {
  return text(item?.product_type_hint).trim() || "unknown";
}

function itemName(item: any): string {
  return text(item?.item_name).trim() || text(item?.product_type_raw).trim();
}

function normalizedItems(
  extraction: ExtractionResults | null | undefined
): any[] {
  const root = extraction?.normalizedExtractionJson as any;
  return Array.isArray(root?.items) ? root.items : [];
}

function rawPlanItems(extraction: ExtractionResults | null | undefined): any[] {
  const root = extraction?.llmPlanJson as any;
  const items = Array.isArray(root?.items)
    ? root.items
    : Array.isArray(root?.document_plan?.items)
    ? root.document_plan.items
    : [];
  return items;
}

function findTargetItem(items: any[], targetProductType: string): any | null {
  return (
    items.find((item) => itemProductType(item) === targetProductType) ??
    items.find((item) => itemName(item).includes(targetProductType)) ??
    null
  );
}

function redirectTarget(
  candidate: DictionaryTermTypeCandidate,
  extraction: ExtractionResults | null
): { productType: string; itemIndex: number | null } | null {
  const items = [...normalizedItems(extraction), ...rawPlanItems(extraction)];
  const raw = fieldText(candidate);

  if (
    candidate.sourceProductType !== "flat_die" &&
    includesAny(raw, DIE_FIELD_PATTERNS)
  ) {
    const target = findTargetItem(items, "flat_die");
    if (target) {
      return { productType: "flat_die", itemIndex: Number(target.item_index) };
    }
  }

  if (
    candidate.sourceProductType !== "hydraulic_station" &&
    includesAny(raw, HYDRAULIC_STATION_FIELD_PATTERNS)
  ) {
    const target = findTargetItem(items, "hydraulic_station");
    if (target) {
      return {
        productType: "hydraulic_station",
        itemIndex: Number(target.item_index),
      };
    }
  }

  if (
    candidate.sourceProductType !== "filter" &&
    includesAny(raw, FILTER_FIELD_PATTERNS)
  ) {
    const target = findTargetItem(items, "filter");
    if (target) {
      return { productType: "filter", itemIndex: Number(target.item_index) };
    }
  }

  return null;
}

function extractLlmText(
  blocksJson: unknown,
  extraction: ExtractionResults | null
): string {
  const blocks = blocksJson as any;
  const extractionJson = extraction?.extractionJson as any;
  for (const candidate of [
    blocks?.llm_text,
    blocks?.llmText,
    blocks?.text,
    extractionJson?.llm_text,
    extractionJson?.llmText,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (Array.isArray(blocks?.blocks)) {
    return blocks.blocks
      .map((block: any) => text(block?.text ?? block?.raw_text))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function planItemForCandidate(
  extraction: ExtractionResults | null,
  candidate: DictionaryTermTypeCandidate
): DocumentPlanItem | null {
  const items = rawPlanItems(extraction);
  const itemIndex = Number(candidate.itemIndex);
  const item = items.find((entry) => Number(entry?.item_index) === itemIndex);
  if (!item) return null;
  return {
    item_index: Number(item.item_index),
    item_name: text(item.item_name ?? item.raw_product_name) || null,
    product_type_hint: text(item.product_type_hint) || null,
    product_type_raw: text(item.product_type_raw) || null,
    block_ids: Array.isArray(item.block_ids) ? item.block_ids : [],
    llm_text_ranges: Array.isArray(item.llm_text_ranges)
      ? item.llm_text_ranges
      : [],
  };
}

function hasCurrentItemBlocksEvidence(
  candidate: DictionaryTermTypeCandidate,
  occurrences: DictionaryCandidateOccurrence[]
): boolean {
  const values = [
    candidate.evidence,
    ...occurrences.map((item) => item.evidence),
  ];
  return values.some((value) =>
    JSON.stringify(value ?? "").includes("current_item_blocks")
  );
}

function classify(params: {
  candidate: DictionaryTermTypeCandidate;
  extraction: ExtractionResults | null;
  blocksJson: unknown;
  occurrences: DictionaryCandidateOccurrence[];
  termTypeByName: Map<string, DictionaryTermType>;
}): AuditRecord {
  const { candidate, extraction, blocksJson, occurrences, termTypeByName } =
    params;
  const notes: string[] = [];
  const base: AuditRecord = {
    candidateId: candidate.id,
    status: candidate.status,
    reason: candidate.reason,
    sourceProductType: candidate.sourceProductType,
    rawFieldName: candidate.rawFieldName,
    normalizedFieldName: candidate.normalizedFieldName,
    proposedTermType: candidate.proposedTermType,
    extractionResultId: candidate.extractionResultId,
    itemIndex: candidate.itemIndex,
    group: "needs_human_review",
    notes,
  };

  if (
    isDocInfoFieldName(candidate.rawFieldName) ||
    isDocInfoFieldName(candidate.normalizedFieldName)
  ) {
    notes.push("raw field is a document_info key");
    return {
      ...base,
      group: "doc_info_candidate",
      rejectReason: "document_info_field_not_product_term_type",
    };
  }

  const target = redirectTarget(candidate, extraction);
  if (target) {
    notes.push(`more applicable item exists: ${target.productType}`);
    return {
      ...base,
      group: "field_redirectable",
      targetProductType: target.productType,
      targetItemIndex: target.itemIndex ?? undefined,
      rejectReason: "field_moved_to_more_applicable_item",
    };
  }

  const planItem = planItemForCandidate(extraction, candidate);
  const llmText = extractLlmText(blocksJson, extraction);
  if (planItem && llmText.trim()) {
    const input = buildItemInputText(llmText, blocksJson, planItem);
    const warningTypes = input.warnings.map((warning) => warning.type);
    if (
      warningTypes.includes("plan_range_excel_row_mapped") ||
      warningTypes.includes("plan_range_suspected_misaligned")
    ) {
      notes.push(`plan range warning: ${warningTypes.join(",")}`);
      if (
        warningTypes.includes("plan_range_suspected_misaligned") ||
        hasCurrentItemBlocksEvidence(candidate, occurrences)
      ) {
        return {
          ...base,
          group: "range_misaligned_reextract",
          rejectReason: "plan_range_misaligned_candidate",
          notes,
        };
      }
    }
  }

  const termType = candidate.proposedTermType
    ? termTypeByName.get(candidate.proposedTermType)
    : null;
  if (
    candidate.reason === "term_type_cross_product_fallback" &&
    termType &&
    !termType.applicableProductTypes.includes(candidate.sourceProductType) &&
    candidate.status !== "pending"
  ) {
    notes.push("historically reviewed cross-product fallback");
    return {
      ...base,
      group: "dictionary_applicability_gap",
      notes,
    };
  }

  return base;
}

function summarize(records: AuditRecord[]) {
  const groups = new Map<AuditGroup, AuditRecord[]>();
  for (const record of records) {
    groups.set(record.group, [...(groups.get(record.group) ?? []), record]);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    count: items.length,
    candidateIds: items.slice(0, 20).map((item) => item.candidateId),
    extractionIds: [
      ...new Set(items.map((item) => item.extractionResultId).filter(Boolean)),
    ].slice(0, 20),
  }));
}

async function main() {
  const args = parseArgs();
  await PgDataSource.initialize();

  const candidateRepo = PgDataSource.getRepository(DictionaryTermTypeCandidate);
  const occurrenceRepo = PgDataSource.getRepository(
    DictionaryCandidateOccurrence
  );
  const extractionRepo = PgDataSource.getRepository(ExtractionResults);
  const termTypeRepo = PgDataSource.getRepository(DictionaryTermType);

  const query = candidateRepo
    .createQueryBuilder("candidate")
    .where(
      new Brackets((qb) => {
        qb.where("candidate.status = :pending", { pending: "pending" })
          .orWhere("candidate.reason = :cross", {
            cross: "term_type_cross_product_fallback",
          })
          .orWhere("candidate.sourceProductType = :unknown", {
            unknown: "unknown",
          });
      })
    )
    .orderBy("candidate.id", "ASC")
    .limit(Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 5000);

  if (args.candidateId) {
    query.andWhere("candidate.id = :candidateId", {
      candidateId: args.candidateId,
    });
  }

  const candidates = await query.getMany();
  const candidateIds = candidates.map((candidate) => candidate.id);
  const extractionIds = [
    ...new Set(
      candidates
        .map((candidate) => Number(candidate.extractionResultId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  const documentIds = [
    ...new Set(
      candidates
        .map((candidate) => Number(candidate.documentId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  const [occurrences, extractions, termTypes, blockRows] = await Promise.all([
    candidateIds.length
      ? occurrenceRepo.find({
          where: { candidateType: "term_type", candidateId: In(candidateIds) },
        })
      : [],
    extractionIds.length
      ? extractionRepo.findBy({ id: In(extractionIds) })
      : [],
    termTypeRepo.find(),
    documentIds.length
      ? PgDataSource.createQueryBuilder()
          .select("blocks.document_id", "documentId")
          .addSelect("blocks.blocks_json", "blocksJson")
          .from("quote_agent.document_blocks", "blocks")
          .where("blocks.document_id IN (:...documentIds)", { documentIds })
          .getRawMany()
      : [],
  ]);

  const occurrencesByCandidate = new Map<
    string,
    DictionaryCandidateOccurrence[]
  >();
  for (const occurrence of occurrences) {
    occurrencesByCandidate.set(occurrence.candidateId, [
      ...(occurrencesByCandidate.get(occurrence.candidateId) ?? []),
      occurrence,
    ]);
  }
  const extractionById = new Map<string, ExtractionResults>(
    extractions.map((item) => [String(item.id), item] as const)
  );
  const blocksByDocumentId = new Map<string, unknown>(
    blockRows.map(
      (row: any) => [String(row.documentId), row.blocksJson] as const
    )
  );
  const termTypeByName = new Map<string, DictionaryTermType>(
    termTypes.map((item) => [item.termType, item] as const)
  );

  const records = candidates.map((candidate) =>
    classify({
      candidate,
      extraction: candidate.extractionResultId
        ? extractionById.get(String(candidate.extractionResultId)) ?? null
        : null,
      blocksJson: candidate.documentId
        ? blocksByDocumentId.get(String(candidate.documentId))
        : null,
      occurrences: occurrencesByCandidate.get(candidate.id) ?? [],
      termTypeByName,
    })
  );

  const summary = summarize(records);
  console.log(JSON.stringify({ total: records.length, summary }, null, 2));
  console.log(
    JSON.stringify(
      records
        .filter((record) => record.group !== "needs_human_review")
        .slice(0, 100),
      null,
      2
    )
  );

  if (!args.apply) {
    return;
  }

  const applyTargets = records.filter((record) => {
    if (record.status === "rejected") return false;
    if (record.group === "doc_info_candidate")
      return record.status === "pending";
    if (record.group === "field_redirectable") return true;
    return (
      record.group === "range_misaligned_reextract" &&
      record.reason === "term_type_cross_product_fallback"
    );
  });
  const applied: Array<{
    candidateId: string;
    status: string;
    error?: string;
  }> = [];
  for (const record of applyTargets) {
    try {
      await candidateRepo.update(record.candidateId, {
        status: "rejected",
        reason: record.rejectReason,
        reviewedBy: "codex_audit",
        reviewedAt: new Date(),
      });
      applied.push({ candidateId: record.candidateId, status: "rejected" });
    } catch (error) {
      applied.push({
        candidateId: record.candidateId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const rerunTargets = [
    ...new Set(
      records
        .filter((record) =>
          ["range_misaligned_reextract", "field_redirectable"].includes(
            record.group
          )
        )
        .map((record) => Number(record.extractionResultId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  const rerunResults: Array<{
    extractionResultId: number;
    status: "normalized" | "failed";
    error?: string;
  }> = [];
  if (args.rerun && rerunTargets.length) {
    const refresh = new NormalizationRefreshService(
      PgDataSource,
      productConfigAgentRepository,
      new DictionaryService(PgDataSource)
    );
    for (const extractionResultId of rerunTargets) {
      try {
        await refresh.generateDictionaryForExtractionId(extractionResultId);
        rerunResults.push({ extractionResultId, status: "normalized" });
      } catch (error) {
        rerunResults.push({
          extractionResultId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        appliedCount: applied.filter((item) => item.status === "rejected")
          .length,
        applyFailedCount: applied.filter((item) => item.status === "failed")
          .length,
        applied,
        rerunRequested: args.rerun,
        rerunCount: rerunResults.filter((item) => item.status === "normalized")
          .length,
        rerunFailedCount: rerunResults.filter(
          (item) => item.status === "failed"
        ).length,
        rerunResults,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
