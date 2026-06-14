import { DataSource, EntityManager } from "typeorm";
import { ExtractionResults } from "../../extraction/entity/extractionResults.entity.js";
import type { ArchiveReadiness, JsonObject } from "../types.js";
import { extractDocInfoValue, normalizeDocInfo } from "../utils/docInfo.js";

function getSummaryNumber(
  extraction: ExtractionResults,
  key: string,
): number {
  const dictionarySummary = (extraction.dictionaryProposals as JsonObject | null)
    ?.summary;
  const normalizedSummary = (extraction.normalizedExtractionJson as JsonObject | null)
    ?.summary;
  const value = dictionarySummary?.[key] ?? normalizedSummary?.[key] ?? 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getNormalizedItems(extraction: ExtractionResults): any[] {
  const normalizedJson = extraction.normalizedExtractionJson as JsonObject | null;
  return Array.isArray(normalizedJson?.items) ? normalizedJson.items : [];
}

function getDocInfoWithSource(extraction: ExtractionResults): {
  docInfo: JsonObject;
  source: ArchiveReadiness["summary"]["docInfoSource"];
} {
  const normalizedJson = extraction.normalizedExtractionJson as JsonObject | null;
  const planJson = extraction.llmPlanJson as JsonObject | null;
  if (
    normalizedJson?.document_info &&
    typeof normalizedJson.document_info === "object" &&
    !Array.isArray(normalizedJson.document_info) &&
    Object.keys(normalizedJson.document_info).length > 0
  ) {
    return {
      docInfo: normalizeDocInfo(normalizedJson.document_info),
      source: "normalized_extraction_json",
    };
  }
  if (
    planJson?.document_info &&
    typeof planJson.document_info === "object" &&
    !Array.isArray(planJson.document_info) &&
    Object.keys(planJson.document_info).length > 0
  ) {
    return {
      docInfo: normalizeDocInfo(planJson.document_info),
      source: "llm_plan_json",
    };
  }
  return { docInfo: {}, source: "none" };
}

export class ContractArchiveReadinessService {
  constructor(private readonly dataSource: DataSource) {}

  async findNormalizedExtractionForArchive(
    documentId: number,
    manager?: EntityManager,
  ): Promise<ExtractionResults | null> {
    const entityManager = manager ?? this.dataSource.manager;
    return await entityManager
      .getRepository(ExtractionResults)
      .createQueryBuilder("extraction")
      .where("extraction.document_id = :documentId", { documentId })
      .andWhere("extraction.status = :status", { status: "normalized" })
      .andWhere("extraction.normalized_extraction_json IS NOT NULL")
      .andWhere("jsonb_typeof(extraction.normalized_extraction_json->'items') = 'array'")
      .andWhere("jsonb_array_length(extraction.normalized_extraction_json->'items') > 0")
      .orderBy("extraction.created_at", "DESC")
      .getOne();
  }

  async checkDocument(documentId: number, manager?: EntityManager) {
    const extraction = await this.findNormalizedExtractionForArchive(
      documentId,
      manager,
    );
    return this.checkExtraction(documentId, extraction);
  }

  checkExtraction(
    documentId: number,
    extraction: ExtractionResults | null,
  ): ArchiveReadiness {
    if (!extraction) {
      return {
        documentId,
        extractionResultId: null,
        canArchive: false,
        forceRequired: false,
        blockers: [
          {
            type: "normalized_extraction_not_found",
            message: "没有找到 items 非空的 normalized extraction",
          },
        ],
        warnings: [],
        summary: {
          itemCount: 0,
          termTypeCandidateCount: 0,
          valueCandidateCount: 0,
          productNumber: null,
          docInfoSource: "none",
        },
      };
    }

    const items = getNormalizedItems(extraction);
    const termTypeCandidateCount = getSummaryNumber(
      extraction,
      "term_type_candidate_count",
    );
    const valueCandidateCount = getSummaryNumber(
      extraction,
      "value_candidate_count",
    );
    const { docInfo, source } = getDocInfoWithSource(extraction);
    const productNumber = extractDocInfoValue(docInfo, "product_number");
    const blockers: ArchiveReadiness["blockers"] = [];
    const warnings: ArchiveReadiness["warnings"] = [];

    if (items.length === 0) {
      blockers.push({
        type: "empty_items",
        message: "normalized_extraction_json.items 为空，不能归档",
      });
    }
    if (termTypeCandidateCount > 0) {
      blockers.push({
        type: "term_type_candidates",
        message: "存在字段名候选，需先审核或 force 归档",
        details: { termTypeCandidateCount },
      });
    }
    if (!productNumber) {
      blockers.push({
        type: "missing_product_number",
        message: "没有识别到当前产品编号，需要补录或 force 归档",
      });
    }
    if (valueCandidateCount > 0) {
      warnings.push({
        type: "value_candidates",
        message: "存在值候选，归档后仍需在候选审核中处理",
        details: { valueCandidateCount },
      });
    }
    if (source === "llm_plan_json") {
      warnings.push({
        type: "doc_info_from_plan",
        message: "docInfo 来自 llm_plan_json.document_info",
      });
    }
    if (source === "none") {
      warnings.push({
        type: "missing_doc_info",
        message: "没有可用 docInfo，归档后需人工补录",
      });
    }

    return {
      documentId,
      extractionResultId: Number(extraction.id),
      canArchive: blockers.length === 0,
      forceRequired: blockers.length > 0,
      blockers,
      warnings,
      summary: {
        itemCount: items.length,
        termTypeCandidateCount,
        valueCandidateCount,
        productNumber,
        docInfoSource: source,
      },
    };
  }

  getArchiveDocInfo(extraction: ExtractionResults) {
    return getDocInfoWithSource(extraction);
  }
}
