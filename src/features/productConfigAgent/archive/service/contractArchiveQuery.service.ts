import { DataSource, EntityManager } from "typeorm";
import { Documents } from "../../workflow/entity/documents.entity.js";
import { ExtractionResults } from "../../extraction/entity/extractionResults.entity.js";
import {
  ContractArchive,
  ContractArchiveItemProduct,
  ContractArchiveVersion,
} from "../entity/index.js";
import { UPLOADED_STATUSES } from "../types.js";
import { extractDocInfoValue, normalizeDocInfo } from "../utils/docInfo.js";
import { normalizePage } from "../utils/pagination.js";
import { mapArchive, mapVersion } from "./contractArchive.mapper.js";
import {
  applyContractArchiveListFilters,
  applyContractDocumentListFilters,
} from "../../utils/archiveListFilters.js";

export class ContractArchiveQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getContractsSummary() {
    const [uploadedRows, normalizedRows, archivedRows] = await Promise.all([
      this.dataSource.getRepository(Documents).count({
        where: UPLOADED_STATUSES.map((status) => ({ status })),
      }),
      this.dataSource.getRepository(Documents).count({
        where: { status: "normalized" },
      }),
      this.dataSource.getRepository(ContractArchive).count({
        where: { status: "archived" },
      }),
    ]);

    return {
      uploadedCount: uploadedRows,
      normalizedCount: normalizedRows,
      archivedCount: archivedRows,
    };
  }

  async listContracts(params?: {
    page?: number;
    pageSize?: number;
    status?: "uploaded" | "normalized" | "archived";
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    if (params?.status === "archived") {
      return this.listContractArchives(params);
    }

    const { page, pageSize } = normalizePage(params);
    const query = this.dataSource
      .getRepository(Documents)
      .createQueryBuilder("document")
      .leftJoin(
        ExtractionResults,
        "extraction",
        `extraction.id = (
          SELECT latest.id
          FROM quote_agent.extraction_results latest
          WHERE latest.document_id = document.id
          ORDER BY
            CASE WHEN latest.status = 'normalized' THEN 0 ELSE 1 END,
            latest.created_at DESC
          LIMIT 1
        )`,
      )
      .leftJoin(
        ContractArchive,
        "archive",
        "archive.document_id = document.id AND archive.extraction_result_id = extraction.id",
      )
      .select([
        "document.id AS \"documentId\"",
        "document.file_name AS \"fileName\"",
        "document.status AS status",
        "document.created_at AS \"createdAt\"",
        "extraction.id AS \"extractionResultId\"",
        "extraction.status AS \"extractionStatus\"",
        "extraction.normalized_extraction_json AS \"normalizedExtractionJson\"",
        "archive.id AS \"archiveId\"",
        "archive.product_number AS \"productNumber\"",
        "archive.contract_number AS \"contractNumber\"",
        "archive.order_number AS \"orderNumber\"",
        "archive.customer_id AS \"customerId\"",
        "archive.current_version AS \"currentVersion\"",
        "archive.updated_at AS \"updatedAt\"",
      ])
      .orderBy("document.created_at", "DESC")
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const countQuery = this.dataSource
      .getRepository(Documents)
      .createQueryBuilder("document")
      .leftJoin(
        ExtractionResults,
        "extraction",
        `extraction.id = (
          SELECT latest.id
          FROM quote_agent.extraction_results latest
          WHERE latest.document_id = document.id
          ORDER BY
            CASE WHEN latest.status = 'normalized' THEN 0 ELSE 1 END,
            latest.created_at DESC
          LIMIT 1
        )`,
      )
      .leftJoin(
        ContractArchive,
        "archive",
        "archive.document_id = document.id AND archive.extraction_result_id = extraction.id",
      );

    applyContractDocumentListFilters(query, params);
    applyContractDocumentListFilters(countQuery as any, params);

    const [rows, total] = await Promise.all([
      query.getRawMany(),
      countQuery.getCount(),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => {
        const docInfo = normalizeDocInfo(row.normalizedExtractionJson?.document_info);
        return {
          documentId: Number(row.documentId),
          archiveId: row.archiveId ? Number(row.archiveId) : null,
          extractionResultId: row.extractionResultId
            ? Number(row.extractionResultId)
            : null,
          fileName: row.fileName,
          status: row.archiveId ? "archived" : row.status,
          extractionStatus: row.extractionStatus,
          productNumber:
            row.productNumber ?? extractDocInfoValue(docInfo, "product_number"),
          contractNumber:
            row.contractNumber ?? extractDocInfoValue(docInfo, "contract_number"),
          orderNumber:
            row.orderNumber ?? extractDocInfoValue(docInfo, "order_number"),
          customerId: row.customerId ?? extractDocInfoValue(docInfo, "customer_id"),
          currentVersion: row.currentVersion ?? null,
          updatedAt: row.updatedAt ?? null,
          createdAt: row.createdAt,
        };
      }),
    };
  }

  async listContractArchives(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    const { page, pageSize } = normalizePage(params);
    const query = this.dataSource
      .getRepository(ContractArchive)
      .createQueryBuilder("archive")
      .leftJoin(Documents, "document", "document.id = archive.document_id")
      .leftJoin(
        ContractArchiveItemProduct,
        "binding",
        "binding.archive_id = archive.id",
      )
      .select([
        "archive.id AS \"archiveId\"",
        "archive.document_id AS \"documentId\"",
        "archive.extraction_result_id AS \"extractionResultId\"",
        "archive.status AS status",
        "archive.product_number AS \"productNumber\"",
        "archive.contract_number AS \"contractNumber\"",
        "archive.order_number AS \"orderNumber\"",
        "archive.customer_id AS \"customerId\"",
        "archive.current_version AS \"currentVersion\"",
        "archive.created_at AS \"createdAt\"",
        "archive.updated_at AS \"updatedAt\"",
        "document.file_name AS \"fileName\"",
        "COUNT(DISTINCT binding.archive_item_id) AS \"boundItemCount\"",
      ])
      .groupBy("archive.id")
      .addGroupBy("document.file_name")
      .orderBy("archive.updated_at", "DESC")
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const countQuery = this.dataSource
      .getRepository(ContractArchive)
      .createQueryBuilder("archive")
      .leftJoin(
        ContractArchiveItemProduct,
        "binding",
        "binding.archive_id = archive.id",
      )
      .select("COUNT(DISTINCT archive.id)", "count");

    applyContractArchiveListFilters(query, params);
    applyContractArchiveListFilters(countQuery, params);

    const [rows, countRow] = await Promise.all([
      query.getRawMany(),
      countQuery.getRawOne(),
    ]);

    return {
      page,
      pageSize,
      total: Number(countRow?.count ?? 0),
      items: rows.map((row) => ({
        archiveId: Number(row.archiveId),
        documentId: Number(row.documentId),
        extractionResultId: Number(row.extractionResultId),
        fileName: row.fileName,
        status: row.status,
        productNumber: row.productNumber,
        contractNumber: row.contractNumber,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        currentVersion: Number(row.currentVersion),
        boundItemCount: Number(row.boundItemCount ?? 0),
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      })),
    };
  }

  async getArchiveDetail(archiveId: number, manager?: EntityManager) {
    const entityManager = manager ?? this.dataSource.manager;
    const archive = await entityManager.getRepository(ContractArchive).findOne({
      where: { id: String(archiveId) },
      relations: { items: { productBindings: true }, document: true },
    });
    if (!archive) {
      throw new Error(`Contract archive not found: ${archiveId}`);
    }

    const latestVersion = await entityManager
      .getRepository(ContractArchiveVersion)
      .findOne({
        where: { archiveId: archive.id },
        order: { version: "DESC" },
      });

    return {
      archive: mapArchive(archive),
      latestVersion: latestVersion ? mapVersion(latestVersion, false) : null,
    };
  }
}
