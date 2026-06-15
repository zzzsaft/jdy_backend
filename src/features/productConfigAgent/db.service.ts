import { In, Repository } from "typeorm";
import { PgDataSource } from "../../config/data-source.js";
import {
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  DictionaryTermTypeCandidate,
} from "./dictionary/entity/index.js";
import { DocumentBlocks } from "./workflow/entity/documentBlocks.entity.js";
import { Documents } from "./workflow/entity/documents.entity.js";
import { ExtractionResults } from "./extraction/entity/extractionResults.entity.js";
import { ContractArchive } from "./archive/entity/index.js";
import { buildExtractionItemNameMap } from "./extractionItemNames.js";

export interface ProductConfigAgentRepository {
  findDocumentByHash(fileHash: string): Promise<any | null>;
  findDocumentsByHashes(fileHashes: string[]): Promise<any[]>;
  createDocument(data: {
    fileName?: string;
    fileHash: string;
    filePath: string;
    source?: string;
    status?: string;
  }): Promise<any>;
  createDocuments(
    data: Array<{
      fileName?: string;
      fileHash: string;
      filePath: string;
      source?: string;
      status?: string;
    }>
  ): Promise<any[]>;

  updateDocumentStatus(documentId: number, status: string): Promise<void>;
  updateDocumentsStatus(documentIds: number[], status: string): Promise<void>;
  markDocumentsDictionaryDirty(documentIds: number[]): Promise<void>;
  findDocumentById(documentId: number): Promise<any | null>;
  listDocuments(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
  }): Promise<{
    page: number;
    pageSize: number;
    total: number;
    items: any[];
  }>;
  findDocumentsMissingExtraction(params?: { limit?: number }): Promise<any[]>;
  findDictionaryDirtyDocuments(params?: { limit?: number }): Promise<any[]>;
  findDocumentsMissingPlan(params: {
    limit?: number;
    promptVersion: string;
    dictionaryVersion: number;
    llmModel: string;
  }): Promise<any[]>;

  findBlocksByDocumentId(documentId: number): Promise<any | null>;
  findBlocksByDocumentIds(documentIds: number[]): Promise<any[]>;
  upsertBlocks(data: {
    documentId: number;
    blocksJson: any;
    parserVersion?: string;
  }): Promise<any>;
  upsertBlocksMany(
    data: Array<{
      documentId: number;
      blocksJson: any;
      parserVersion?: string;
    }>
  ): Promise<any[]>;

  findLatestExtraction(params: {
    documentId: number;
    promptVersion?: string;
    dictionaryVersion?: number;
    llmModel?: string;
  }): Promise<any | null>;
  findLatestExtractionByDocumentId(documentId: number): Promise<any | null>;
  findLatestExtractionDetailByDocumentId(documentId: number): Promise<any | null>;
  findExtractionById(extractionResultId: number): Promise<any | null>;

  createExtraction(data: {
    documentId: number;
    extractionJson: any;
    dictionaryProposals?: any;
    warnings?: any;
    llmPlanJson?: any;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    status?: string;
  }): Promise<any>;
  updateExtractionAfterLlm(data: {
    extractionResultId: number;
    extractionJson: any;
    warnings?: any;
    llmPlanJson?: any;
    status?: string;
  }): Promise<any>;
  findPlannedExtractions(params: {
    limit?: number;
    promptVersion: string;
    dictionaryVersion: number;
    llmModel: string;
    productType?: string;
  }): Promise<any[]>;
  updateExtractionDictionary(data: {
    extractionResultId: number;
    normalizedExtractionJson?: any;
    dictionaryProposals: any;
    dictionaryVersion?: number;
    status?: string;
  }): Promise<any>;
  findExtractionsForRenormalization(params?: {
    limit?: number;
    onlyMissingNormalized?: boolean;
  }): Promise<any[]>;
  countExtractionsForRenormalization(params?: {
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
  }): Promise<number>;
  findExtractionsForRenormalizationBatch(params: {
    limit: number;
    onlyMissingNormalized?: boolean;
    cursorCreatedAt?: Date;
    cursorId?: number;
  }): Promise<any[]>;
  findExtractionsForPendingCandidateRenormalizationBatch(params: {
    limit: number;
    cursorCreatedAt?: Date;
    cursorId?: number;
  }): Promise<any[]>;
  findAffectedDocumentIdsForCandidate(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
  }): Promise<number[]>;
  findAffectedDocumentIdsForCandidates(params: Array<{
    candidateType: "term_type" | "value";
    candidateId: string;
  }>): Promise<Map<string, number[]>>;
  findCandidates(params?: { status?: string; documentId?: number }): Promise<{
    termTypeCandidates: any[];
    valueCandidates: any[];
  }>;
}

function wrapDbError(method: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[productConfigAgent:db] ${method} failed: ${message}`);
}

function pendingCandidateRenormalizationWhereSql(): string {
  return `(
    EXISTS (
      SELECT 1
      FROM quote_agent.dictionary_candidate_occurrences occurrence
      JOIN quote_agent.dictionary_candidates candidate
        ON occurrence.candidate_type = 'value'
       AND occurrence.candidate_id = candidate.id
      WHERE occurrence.extraction_result_id = extraction.id
        AND candidate.status = 'pending'
    )
    OR EXISTS (
      SELECT 1
      FROM quote_agent.dictionary_candidate_occurrences occurrence
      JOIN quote_agent.dictionary_term_type_candidates candidate
        ON occurrence.candidate_type = 'term_type'
       AND occurrence.candidate_id = candidate.id
      WHERE occurrence.extraction_result_id = extraction.id
        AND candidate.status = 'pending'
    )
    OR EXISTS (
      SELECT 1
      FROM quote_agent.dictionary_candidates candidate
      WHERE candidate.extraction_result_id = extraction.id
        AND candidate.status = 'pending'
    )
    OR EXISTS (
      SELECT 1
      FROM quote_agent.dictionary_term_type_candidates candidate
      WHERE candidate.extraction_result_id = extraction.id
        AND candidate.status = 'pending'
    )
  )`;
}

export class TypeOrmProductConfigAgentRepository implements ProductConfigAgentRepository {
  private documentsRepo: Repository<Documents>;
  private blocksRepo: Repository<DocumentBlocks>;
  private extractionRepo: Repository<ExtractionResults>;

  constructor() {
    this.documentsRepo = PgDataSource.getRepository(Documents);
    this.blocksRepo = PgDataSource.getRepository(DocumentBlocks);
    this.extractionRepo = PgDataSource.getRepository(ExtractionResults);
  }

  async findDocumentByHash(fileHash: string): Promise<any | null> {
    try {
      return await this.documentsRepo.findOne({
        where: { fileHash },
      });
    } catch (error) {
      throw wrapDbError("findDocumentByHash", error);
    }
  }

  async findDocumentsByHashes(fileHashes: string[]): Promise<any[]> {
    if (fileHashes.length === 0) return [];

    try {
      return await this.documentsRepo.find({
        where: { fileHash: In(fileHashes) },
      });
    } catch (error) {
      throw wrapDbError("findDocumentsByHashes", error);
    }
  }

  async createDocument(data: {
    fileName?: string;
    fileHash: string;
    filePath: string;
    source?: string;
    status?: string;
  }): Promise<any> {
    try {
      const document = this.documentsRepo.create({
        fileName: data.fileName ?? "",
        fileHash: data.fileHash,
        filePath: data.filePath,
        source: data.source ?? "uploaded",
        status: data.status ?? "uploaded",
      });

      return await this.documentsRepo.save(document);
    } catch (error) {
      throw wrapDbError("createDocument", error);
    }
  }

  async createDocuments(
    data: Array<{
      fileName?: string;
      fileHash: string;
      filePath: string;
      source?: string;
      status?: string;
    }>
  ): Promise<any[]> {
    if (data.length === 0) return [];

    try {
      const documents = this.documentsRepo.create(
        data.map((item) => ({
          fileName: item.fileName ?? "",
          fileHash: item.fileHash,
          filePath: item.filePath,
          source: item.source ?? "uploaded",
          status: item.status ?? "uploaded",
        }))
      );

      return await this.documentsRepo.save(documents);
    } catch (error) {
      throw wrapDbError("createDocuments", error);
    }
  }

  async updateDocumentStatus(
    documentId: number,
    status: string
  ): Promise<void> {
    try {
      await this.documentsRepo.update({ id: documentId }, { status });
    } catch (error) {
      throw wrapDbError("updateDocumentStatus", error);
    }
  }

  async updateDocumentsStatus(
    documentIds: number[],
    status: string
  ): Promise<void> {
    if (documentIds.length === 0) return;

    try {
      await this.documentsRepo.update({ id: In(documentIds) }, { status });
    } catch (error) {
      throw wrapDbError("updateDocumentsStatus", error);
    }
  }

  async markDocumentsDictionaryDirty(documentIds: number[]): Promise<void> {
    const uniqueDocumentIds = [...new Set(documentIds)].filter((id) => id > 0);
    if (uniqueDocumentIds.length === 0) return;

    try {
      await PgDataSource.transaction(async (manager) => {
        await manager
          .getRepository(Documents)
          .update({ id: In(uniqueDocumentIds) }, { status: "dictionary_dirty" });
        await manager
          .getRepository(ContractArchive)
          .update(
            { documentId: In(uniqueDocumentIds.map((id) => String(id))) },
            { status: "dictionary_dirty" },
          );
      });
    } catch (error) {
      throw wrapDbError("markDocumentsDictionaryDirty", error);
    }
  }

  async findDocumentById(documentId: number): Promise<any | null> {
    try {
      return await this.documentsRepo.findOne({
        where: { id: documentId },
      });
    } catch (error) {
      throw wrapDbError("findDocumentById", error);
    }
  }

  async listDocuments(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
  }): Promise<{
    page: number;
    pageSize: number;
    total: number;
    items: any[];
  }> {
    try {
      const page = Math.max(1, Number(params?.page ?? 1) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, Number(params?.pageSize ?? 20) || 20),
      );
      const query = this.documentsRepo
        .createQueryBuilder("document")
        .leftJoin(
          ExtractionResults,
          "extraction",
          `extraction.id = (
            SELECT latest.id
            FROM quote_agent.extraction_results latest
            WHERE latest.document_id = document.id
            ORDER BY
              CASE
                WHEN latest.status IN ('normalized', 'parsed') THEN 0
                ELSE 1
              END,
              latest.created_at DESC
            LIMIT 1
          )`,
        )
        .select([
          "document.id AS id",
          "document.file_name AS \"fileName\"",
          "document.file_path AS \"filePath\"",
          "document.source AS source",
          "document.status AS status",
          "document.created_at AS \"uploadTime\"",
          "extraction.id AS \"extractionResultId\"",
          "extraction.status AS \"extractionStatus\"",
          "extraction.created_at AS \"parsedAt\"",
          "extraction.normalized_extraction_json AS \"normalizedExtractionJson\"",
          "extraction.dictionary_proposals AS \"dictionaryProposals\"",
        ])
        .orderBy("document.created_at", "DESC")
        .offset((page - 1) * pageSize)
        .limit(pageSize);

      const countQuery = this.documentsRepo.createQueryBuilder("document");

      if (params?.status) {
        query.andWhere("document.status = :status", { status: params.status });
        countQuery.andWhere("document.status = :status", {
          status: params.status,
        });
      }

      if (params?.q) {
        query.andWhere("document.file_name ILIKE :q", { q: `%${params.q}%` });
        countQuery.andWhere("document.file_name ILIKE :q", {
          q: `%${params.q}%`,
        });
      }

      const [rows, total] = await Promise.all([
        query.getRawMany(),
        countQuery.getCount(),
      ]);

      return {
        page,
        pageSize,
        total,
        items: rows.map((row) => {
          const dictionary = row.dictionaryProposals;
          const summary = dictionary?.summary ?? row.normalizedExtractionJson?.summary;
          return {
            documentId: Number(row.id),
            extractionJobId: row.extractionResultId
              ? Number(row.extractionResultId)
              : null,
            fileName: row.fileName,
            filePath: row.filePath,
            source: row.source,
            status: row.status,
            extractionStatus: row.extractionStatus,
            uploadTime: row.uploadTime,
            parsedAt: row.parsedAt,
            itemCount: summary?.item_count ?? 0,
            warningCount: summary?.warning_count ?? 0,
            candidateCount:
              (summary?.term_type_candidate_count ?? 0) +
              (summary?.value_candidate_count ?? 0),
          };
        }),
      };
    } catch (error) {
      throw wrapDbError("listDocuments", error);
    }
  }

  async findDocumentsMissingExtraction(params?: { limit?: number }): Promise<any[]> {
    try {
      const query = this.documentsRepo
        .createQueryBuilder("document")
        .innerJoin(
          DocumentBlocks,
          "blocks",
          "blocks.document_id = document.id"
        )
        .leftJoin(
          ExtractionResults,
          "latestExtraction",
          `latestExtraction.id = (
            SELECT latest.id
            FROM quote_agent.extraction_results latest
            WHERE latest.document_id = document.id
            ORDER BY latest.created_at DESC
            LIMIT 1
          )`
        )
        .where("latestExtraction.id IS NULL")
        .orWhere("document.status = :failedStatus", {
          failedStatus: "failed",
        })
        .orWhere("latestExtraction.status = :failedStatus", {
          failedStatus: "failed",
        })
        .orderBy("document.id", "ASC");

      if (params?.limit && params.limit > 0) {
        query.limit(params.limit);
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError("findDocumentsMissingExtraction", error);
    }
  }

  async findDictionaryDirtyDocuments(params?: { limit?: number }): Promise<any[]> {
    try {
      return await this.documentsRepo
        .createQueryBuilder("document")
        .leftJoin(
          ContractArchive,
          "archive",
          "archive.document_id = document.id",
        )
        .where("document.status = :dirtyStatus", {
          dirtyStatus: "dictionary_dirty",
        })
        .orWhere("archive.status = :dirtyStatus", {
          dirtyStatus: "dictionary_dirty",
        })
        .select([
          "document.id",
          "document.fileName",
          "document.fileHash",
          "document.filePath",
          "document.source",
          "document.status",
          "document.createdAt",
        ])
        .distinct(true)
        .orderBy("document.createdAt", "ASC")
        .limit(Math.max(1, params?.limit ?? 100))
        .getMany();
    } catch (error) {
      throw wrapDbError("findDictionaryDirtyDocuments", error);
    }
  }

  async findDocumentsMissingPlan(params: {
    limit?: number;
    promptVersion: string;
    dictionaryVersion: number;
    llmModel: string;
  }): Promise<any[]> {
    try {
      const query = this.documentsRepo
        .createQueryBuilder("document")
        .innerJoin(
          DocumentBlocks,
          "blocks",
          "blocks.document_id = document.id"
        )
        .leftJoin(
          ExtractionResults,
          "plannedExtraction",
          `plannedExtraction.id = (
            SELECT planned.id
            FROM quote_agent.extraction_results planned
            WHERE planned.document_id = document.id
              AND planned.prompt_version = :promptVersion
              AND planned.dictionary_version = :dictionaryVersion
              AND planned.llm_model = :llmModel
              AND planned.llm_plan_json IS NOT NULL
            ORDER BY planned.created_at DESC
            LIMIT 1
          )`,
          {
            promptVersion: params.promptVersion,
            dictionaryVersion: params.dictionaryVersion,
            llmModel: params.llmModel,
          }
        )
        .where("plannedExtraction.id IS NULL")
        .orderBy("document.id", "ASC");

      if (params.limit && params.limit > 0) {
        query.limit(params.limit);
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError("findDocumentsMissingPlan", error);
    }
  }

  async findBlocksByDocumentId(documentId: number): Promise<any | null> {
    try {
      return await this.blocksRepo.findOne({
        where: { documentId },
      });
    } catch (error) {
      throw wrapDbError("findBlocksByDocumentId", error);
    }
  }

  async findBlocksByDocumentIds(documentIds: number[]): Promise<any[]> {
    if (documentIds.length === 0) return [];

    try {
      return await this.blocksRepo.find({
        where: { documentId: In(documentIds) },
      });
    } catch (error) {
      throw wrapDbError("findBlocksByDocumentIds", error);
    }
  }

  async upsertBlocks(data: {
    documentId: number;
    blocksJson: any;
    parserVersion?: string;
  }): Promise<any> {
    try {
      await this.blocksRepo.upsert(
        {
          documentId: data.documentId,
          blocksJson: data.blocksJson,
          parserVersion: data.parserVersion,
        } as any,
        {
          conflictPaths: ["documentId"],
          skipUpdateIfNoValuesChanged: true,
        }
      );

      return await this.blocksRepo.findOne({
        where: { documentId: data.documentId },
      });
    } catch (error) {
      throw wrapDbError("upsertBlocks", error);
    }
  }

  async upsertBlocksMany(
    data: Array<{
      documentId: number;
      blocksJson: any;
      parserVersion?: string;
    }>
  ): Promise<any[]> {
    if (data.length === 0) return [];

    try {
      await this.blocksRepo.upsert(
        data.map((item) => ({
          documentId: item.documentId,
          blocksJson: item.blocksJson,
          parserVersion: item.parserVersion,
        })) as any,
        {
          conflictPaths: ["documentId"],
          skipUpdateIfNoValuesChanged: true,
        }
      );

      return await this.blocksRepo.find({
        where: { documentId: In(data.map((item) => item.documentId)) },
      });
    } catch (error) {
      throw wrapDbError("upsertBlocksMany", error);
    }
  }

  async findLatestExtraction(params: {
    documentId: number;
    promptVersion?: string;
    dictionaryVersion?: number;
    llmModel?: string;
  }): Promise<any | null> {
    try {
      const where: any = {
        documentId: params.documentId,
      };

      if (params.promptVersion !== undefined) {
        where.promptVersion = params.promptVersion;
      }

      if (params.dictionaryVersion !== undefined) {
        where.dictionaryVersion = params.dictionaryVersion;
      }

      if (params.llmModel !== undefined) {
        where.llmModel = params.llmModel;
      }

      return await this.extractionRepo.findOne({
        where,
        order: { createdAt: "DESC" },
      });
    } catch (error) {
      throw wrapDbError("findLatestExtraction", error);
    }
  }

  async findLatestExtractionByDocumentId(documentId: number): Promise<any | null> {
    try {
      return await this.extractionRepo
        .createQueryBuilder("extraction")
        .where("extraction.document_id = :documentId", { documentId })
        .orderBy(
          `CASE
            WHEN extraction.status IN ('normalized', 'parsed') THEN 0
            ELSE 1
          END`,
          "ASC",
        )
        .addOrderBy("extraction.created_at", "DESC")
        .getOne();
    } catch (error) {
      throw wrapDbError("findLatestExtractionByDocumentId", error);
    }
  }

  async findLatestExtractionDetailByDocumentId(documentId: number): Promise<any | null> {
    try {
      return await this.extractionRepo
        .createQueryBuilder("extraction")
        .select([
          "extraction.id",
          "extraction.documentId",
          "extraction.normalizedExtractionJson",
          "extraction.dictionaryProposals",
          "extraction.warnings",
          "extraction.llmModel",
          "extraction.promptVersion",
          "extraction.dictionaryVersion",
          "extraction.status",
          "extraction.createdAt",
        ])
        .where("extraction.document_id = :documentId", { documentId })
        .orderBy(
          `CASE
            WHEN extraction.status IN ('normalized', 'parsed') THEN 0
            ELSE 1
          END`,
          "ASC",
        )
        .addOrderBy("extraction.created_at", "DESC")
        .getOne();
    } catch (error) {
      throw wrapDbError("findLatestExtractionDetailByDocumentId", error);
    }
  }

  async findExtractionById(extractionResultId: number): Promise<any | null> {
    try {
      return await this.extractionRepo.findOne({
        where: { id: extractionResultId },
      });
    } catch (error) {
      throw wrapDbError("findExtractionById", error);
    }
  }

  async createExtraction(data: {
    documentId: number;
    extractionJson: any;
    dictionaryProposals?: any;
    warnings?: any;
    llmPlanJson?: any;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    status?: string;
  }): Promise<any> {
    try {
      const extraction = this.extractionRepo.create({
        documentId: data.documentId,
        extractionJson: data.extractionJson,
        dictionaryProposals: data.dictionaryProposals,
        warnings: data.warnings,
        llmPlanJson: data.llmPlanJson,
        llmModel: data.llmModel,
        promptVersion: data.promptVersion,
        dictionaryVersion: data.dictionaryVersion,
        status: data.status,
      });

      return await this.extractionRepo.save(extraction);
    } catch (error) {
      throw wrapDbError("createExtraction", error);
    }
  }

  async updateExtractionAfterLlm(data: {
    extractionResultId: number;
    extractionJson: any;
    warnings?: any;
    llmPlanJson?: any;
    status?: string;
  }): Promise<any> {
    try {
      const updateData: Partial<ExtractionResults> = {
        extractionJson: data.extractionJson,
      };

      if (data.warnings !== undefined) {
        updateData.warnings = data.warnings;
      }

      if (data.llmPlanJson !== undefined) {
        updateData.llmPlanJson = data.llmPlanJson;
      }

      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      await this.extractionRepo.update(
        { id: data.extractionResultId },
        updateData as any,
      );

      return await this.extractionRepo.findOne({
        where: { id: data.extractionResultId },
      });
    } catch (error) {
      throw wrapDbError("updateExtractionAfterLlm", error);
    }
  }

  async findPlannedExtractions(params: {
    limit?: number;
    promptVersion: string;
    dictionaryVersion: number;
    llmModel: string;
    productType?: string;
  }): Promise<any[]> {
    try {
      const query = this.extractionRepo
        .createQueryBuilder("extraction")
        .where("extraction.prompt_version = :promptVersion", {
          promptVersion: params.promptVersion,
        })
        .andWhere("extraction.dictionary_version = :dictionaryVersion", {
          dictionaryVersion: params.dictionaryVersion,
        })
        .andWhere("extraction.llm_model = :llmModel", {
          llmModel: params.llmModel,
        })
        .andWhere("extraction.llm_plan_json IS NOT NULL")
        .andWhere("extraction.status IN (:...statuses)", {
          statuses: ["planned", "planned_partial"],
        })
        .orderBy("extraction.created_at", "ASC");

      if (params.productType) {
        query.andWhere(
          `extraction.llm_plan_json->'items' @> CAST(:productTypeFilter AS jsonb)`,
          {
            productTypeFilter: JSON.stringify([
              { product_type_hint: params.productType },
            ]),
          },
        );
      }

      if (params.limit && params.limit > 0) {
        query.limit(params.limit);
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError("findPlannedExtractions", error);
    }
  }

  async updateExtractionDictionary(data: {
    extractionResultId: number;
    normalizedExtractionJson?: any;
    dictionaryProposals: any;
    dictionaryVersion?: number;
    status?: string;
  }): Promise<any> {
    try {
      const updateData: Partial<ExtractionResults> = {
        dictionaryProposals: data.dictionaryProposals,
      };

      if (data.normalizedExtractionJson !== undefined) {
        updateData.normalizedExtractionJson = data.normalizedExtractionJson;
      }

      if (data.dictionaryVersion !== undefined) {
        updateData.dictionaryVersion = data.dictionaryVersion;
      }

      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      await this.extractionRepo.update({ id: data.extractionResultId }, updateData as any);

      return await this.extractionRepo.findOne({
        where: { id: data.extractionResultId },
      });
    } catch (error) {
      throw wrapDbError("updateExtractionDictionary", error);
    }
  }

  async findExtractionsForRenormalization(params?: {
    limit?: number;
    onlyMissingNormalized?: boolean;
  }): Promise<any[]> {
    try {
      const query = this.extractionRepo
        .createQueryBuilder("extraction")
        .where("extraction.extraction_json IS NOT NULL")
        .andWhere("jsonb_typeof(extraction.extraction_json->'items') = 'array'")
        .andWhere("jsonb_array_length(extraction.extraction_json->'items') > 0")
        .orderBy("extraction.created_at", "DESC");

      if (params?.onlyMissingNormalized !== false) {
        query.andWhere("extraction.normalized_extraction_json IS NULL");
      }

      if (params?.limit && params.limit > 0) {
        query.limit(params.limit);
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError("findExtractionsForRenormalization", error);
    }
  }

  async countExtractionsForRenormalization(params?: {
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
  }): Promise<number> {
    try {
      const query = this.extractionRepo
        .createQueryBuilder("extraction")
        .where("extraction.extraction_json IS NOT NULL")
        .andWhere("jsonb_typeof(extraction.extraction_json->'items') = 'array'")
        .andWhere("jsonb_array_length(extraction.extraction_json->'items') > 0");

      if (params?.onlyMissingNormalized !== false) {
        query.andWhere("extraction.normalized_extraction_json IS NULL");
      }

      if (params?.withPendingCandidates === true) {
        query.andWhere(pendingCandidateRenormalizationWhereSql());
      }

      return await query.getCount();
    } catch (error) {
      throw wrapDbError("countExtractionsForRenormalization", error);
    }
  }

  async findExtractionsForRenormalizationBatch(params: {
    limit: number;
    onlyMissingNormalized?: boolean;
    cursorCreatedAt?: Date;
    cursorId?: number;
  }): Promise<any[]> {
    try {
      const query = this.extractionRepo
        .createQueryBuilder("extraction")
        .select([
          "extraction.id",
          "extraction.documentId",
          "extraction.extractionJson",
          "extraction.warnings",
          "extraction.dictionaryVersion",
          "extraction.createdAt",
        ])
        .where("extraction.extraction_json IS NOT NULL")
        .andWhere("jsonb_typeof(extraction.extraction_json->'items') = 'array'")
        .andWhere("jsonb_array_length(extraction.extraction_json->'items') > 0")
        .orderBy("extraction.created_at", "DESC")
        .addOrderBy("extraction.id", "DESC")
        .limit(Math.max(1, params.limit));

      if (params.onlyMissingNormalized !== false) {
        query.andWhere("extraction.normalized_extraction_json IS NULL");
      }

      if (params.cursorCreatedAt && params.cursorId) {
        query.andWhere(
          `(
            extraction.created_at < :cursorCreatedAt
            OR (
              extraction.created_at = :cursorCreatedAt
              AND extraction.id < :cursorId
            )
          )`,
          {
            cursorCreatedAt: params.cursorCreatedAt,
            cursorId: params.cursorId,
          },
        );
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError("findExtractionsForRenormalizationBatch", error);
    }
  }

  async findExtractionsForPendingCandidateRenormalizationBatch(params: {
    limit: number;
    cursorCreatedAt?: Date;
    cursorId?: number;
  }): Promise<any[]> {
    try {
      const query = this.extractionRepo
        .createQueryBuilder("extraction")
        .select([
          "extraction.id",
          "extraction.documentId",
          "extraction.extractionJson",
          "extraction.warnings",
          "extraction.dictionaryVersion",
          "extraction.createdAt",
        ])
        .where("extraction.extraction_json IS NOT NULL")
        .andWhere(pendingCandidateRenormalizationWhereSql())
        .orderBy("extraction.created_at", "DESC")
        .addOrderBy("extraction.id", "DESC")
        .limit(Math.max(1, params.limit));

      if (params.cursorCreatedAt && params.cursorId) {
        query.andWhere(
          `(
            extraction.created_at < :cursorCreatedAt
            OR (
              extraction.created_at = :cursorCreatedAt
              AND extraction.id < :cursorId
            )
          )`,
          {
            cursorCreatedAt: params.cursorCreatedAt,
            cursorId: params.cursorId,
          },
        );
      }

      return await query.getMany();
    } catch (error) {
      throw wrapDbError(
        "findExtractionsForPendingCandidateRenormalizationBatch",
        error,
      );
    }
  }

  async findAffectedDocumentIdsForCandidate(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
  }): Promise<number[]> {
    try {
      const occurrenceRepo = PgDataSource.getRepository(DictionaryCandidateOccurrence);
      const occurrences = await occurrenceRepo.find({
        where: {
          candidateType: params.candidateType,
          candidateId: params.candidateId,
        },
      });
      const documentIds = occurrences.map((item) => Number(item.documentId));

      if (documentIds.length > 0) {
        return [...new Set(documentIds)];
      }

      if (params.candidateType === "value") {
        const candidate = await PgDataSource
          .getRepository(DictionaryCandidate)
          .findOne({ where: { id: params.candidateId } });
        return candidate?.documentId ? [Number(candidate.documentId)] : [];
      }

      const candidate = await PgDataSource
        .getRepository(DictionaryTermTypeCandidate)
        .findOne({ where: { id: params.candidateId } });
      return candidate?.documentId ? [Number(candidate.documentId)] : [];
    } catch (error) {
      throw wrapDbError("findAffectedDocumentIdsForCandidate", error);
    }
  }

  async findAffectedDocumentIdsForCandidates(params: Array<{
    candidateType: "term_type" | "value";
    candidateId: string;
  }>): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const keyFor = (candidateType: "term_type" | "value", candidateId: string) =>
      `${candidateType}:${candidateId}`;
    for (const item of params) {
      result.set(keyFor(item.candidateType, item.candidateId), []);
    }
    if (params.length === 0) {
      return result;
    }

    try {
      const occurrenceRepo = PgDataSource.getRepository(DictionaryCandidateOccurrence);
      const valueCandidateIds = [
        ...new Set(
          params
            .filter((item) => item.candidateType === "value")
            .map((item) => item.candidateId),
        ),
      ];
      const termTypeCandidateIds = [
        ...new Set(
          params
            .filter((item) => item.candidateType === "term_type")
            .map((item) => item.candidateId),
        ),
      ];

      const occurrenceQueries = await Promise.all([
        valueCandidateIds.length
          ? occurrenceRepo.find({
              where: {
                candidateType: "value",
                candidateId: In(valueCandidateIds),
              },
            })
          : Promise.resolve([]),
        termTypeCandidateIds.length
          ? occurrenceRepo.find({
              where: {
                candidateType: "term_type",
                candidateId: In(termTypeCandidateIds),
              },
            })
          : Promise.resolve([]),
      ]);

      const keysWithOccurrences = new Set<string>();
      for (const occurrence of occurrenceQueries.flat()) {
        const key = keyFor(
          occurrence.candidateType as "term_type" | "value",
          occurrence.candidateId,
        );
        keysWithOccurrences.add(key);
        result.set(key, [
          ...new Set([...(result.get(key) ?? []), Number(occurrence.documentId)]),
        ]);
      }

      const missingValueIds = valueCandidateIds.filter(
        (candidateId) => !keysWithOccurrences.has(keyFor("value", candidateId)),
      );
      const missingTermTypeIds = termTypeCandidateIds.filter(
        (candidateId) => !keysWithOccurrences.has(keyFor("term_type", candidateId)),
      );
      const [valueCandidates, termTypeCandidates] = await Promise.all([
        missingValueIds.length
          ? PgDataSource.getRepository(DictionaryCandidate).findBy({
              id: In(missingValueIds),
            })
          : Promise.resolve([]),
        missingTermTypeIds.length
          ? PgDataSource.getRepository(DictionaryTermTypeCandidate).findBy({
              id: In(missingTermTypeIds),
            })
          : Promise.resolve([]),
      ]);

      for (const candidate of valueCandidates) {
        if (candidate.documentId) {
          result.set(keyFor("value", candidate.id), [Number(candidate.documentId)]);
        }
      }
      for (const candidate of termTypeCandidates) {
        if (candidate.documentId) {
          result.set(keyFor("term_type", candidate.id), [
            Number(candidate.documentId),
          ]);
        }
      }

      return result;
    } catch (error) {
      throw wrapDbError("findAffectedDocumentIdsForCandidates", error);
    }
  }

  async findCandidates(params?: { status?: string; documentId?: number }): Promise<{
    termTypeCandidates: any[];
    valueCandidates: any[];
  }> {
    try {
      const candidateStatus = params?.status || "pending";
      const documentId = params?.documentId;
      const termTypeCandidateRepo = PgDataSource.getRepository(
        DictionaryTermTypeCandidate,
      );
      const valueCandidateRepo = PgDataSource.getRepository(DictionaryCandidate);
      const occurrenceRepo = PgDataSource.getRepository(
        DictionaryCandidateOccurrence,
      );

      let termTypeWhere: any = { status: candidateStatus };
      let valueWhere: any = { status: candidateStatus };
      if (documentId) {
        const [termTypeOccurrences, valueOccurrences] = await Promise.all([
          occurrenceRepo.find({
            where: {
              candidateType: "term_type",
              documentId: String(documentId),
            },
          }),
          occurrenceRepo.find({
            where: {
              candidateType: "value",
              documentId: String(documentId),
            },
          }),
        ]);
        const termTypeCandidateIds = [
          ...new Set(termTypeOccurrences.map((item) => String(item.candidateId))),
        ];
        const valueCandidateIds = [
          ...new Set(valueOccurrences.map((item) => String(item.candidateId))),
        ];
        termTypeWhere = [
          { status: candidateStatus, documentId: String(documentId) },
          ...(termTypeCandidateIds.length
            ? [{ status: candidateStatus, id: In(termTypeCandidateIds) }]
            : []),
        ];
        valueWhere = [
          { status: candidateStatus, documentId: String(documentId) },
          ...(valueCandidateIds.length
            ? [{ status: candidateStatus, id: In(valueCandidateIds) }]
            : []),
        ];
      }

      const termTypeCandidates = await termTypeCandidateRepo.find({
        where: termTypeWhere,
        order: { createdAt: "DESC" },
      });
      const valueCandidates = await valueCandidateRepo.find({
        where: valueWhere,
        order: { createdAt: "DESC" },
      });

      const [enrichedTermTypeCandidates, enrichedValueCandidates] =
        await Promise.all([
          this.attachCandidateDocuments("term_type", termTypeCandidates, documentId),
          this.attachCandidateDocuments("value", valueCandidates, documentId),
        ]);

      return {
        termTypeCandidates: this.filterCandidatesByDocument(
          enrichedTermTypeCandidates,
          documentId,
        ),
        valueCandidates: this.filterCandidatesByDocument(
          enrichedValueCandidates,
          documentId,
        ),
      };
    } catch (error) {
      throw wrapDbError("findCandidates", error);
    }
  }

  private filterCandidatesByDocument(candidates: any[], documentId?: number): any[] {
    if (!documentId) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      if (Number(candidate.documentId) === documentId) {
        return true;
      }
      if (
        Array.isArray(candidate.relatedDocuments) &&
        candidate.relatedDocuments.some(
          (document: any) => Number(document.id) === documentId,
        )
      ) {
        return true;
      }
      return (
        candidate.latestOccurrence &&
        Number(candidate.latestOccurrence.documentId) === documentId
      );
    });
  }

  private async attachCandidateDocuments(
    candidateType: "term_type" | "value",
    candidates: any[],
    documentId?: number,
  ): Promise<any[]> {
    if (candidates.length === 0) {
      return candidates;
    }

    const occurrenceRepo = PgDataSource.getRepository(DictionaryCandidateOccurrence);
    const occurrences = await occurrenceRepo.find({
      where: {
        candidateType,
        candidateId: In(candidates.map((item) => String(item.id))),
        ...(documentId ? { documentId: String(documentId) } : {}),
      },
      order: { createdAt: "DESC" },
    });
    const documentIds = [
      ...new Set(
        [
          ...candidates.map((item) => item.documentId).filter(Boolean),
          ...occurrences.map((item) => item.documentId).filter(Boolean),
        ].map((id) => Number(id)),
      ),
    ];
    const documents = documentIds.length
      ? await this.documentsRepo.find({ where: { id: In(documentIds) } })
      : [];
    const documentMap = new Map(documents.map((document) => [document.id, document]));
    const extractionResultIds = [
      ...new Set(
        [
          ...candidates.map((item) => item.extractionResultId).filter(Boolean),
          ...occurrences.map((item) => item.extractionResultId).filter(Boolean),
        ].map((id) => Number(id)),
      ),
    ];
    const itemNameMap = await this.buildItemNameMap(extractionResultIds);
    const occurrencesByCandidate = new Map<string, DictionaryCandidateOccurrence[]>();
    for (const occurrence of occurrences) {
      const key = String(occurrence.candidateId);
      occurrencesByCandidate.set(key, [
        ...(occurrencesByCandidate.get(key) ?? []),
        occurrence,
      ]);
    }

    return candidates.map((candidate) => {
      const candidateOccurrences =
        occurrencesByCandidate.get(String(candidate.id)) ?? [];
      const relatedDocuments = [
        ...new Map(
          [
            candidate.documentId
              ? documentMap.get(Number(candidate.documentId))
              : null,
            ...candidateOccurrences.map((occurrence) =>
              documentMap.get(Number(occurrence.documentId)),
            ),
          ]
            .filter(Boolean)
            .map((document: any) => [document.id, document]),
        ).values(),
      ].map((document: any) => ({
        id: document.id,
        fileName: document.fileName,
        filePath: document.filePath,
        status: document.status,
      }));

      return {
        ...candidate,
        itemName: itemNameMap.get(
          `${candidate.extractionResultId ?? ""}:${candidate.itemIndex ?? ""}`,
        ) ?? null,
        relatedDocuments,
        latestOccurrence: candidateOccurrences[0]
          ? {
              ...candidateOccurrences[0],
              itemName:
                itemNameMap.get(
                  `${candidateOccurrences[0].extractionResultId}:${candidateOccurrences[0].itemIndex}`,
                ) ?? null,
            }
          : null,
      };
    });
  }

  private async buildItemNameMap(extractionResultIds: number[]): Promise<Map<string, string>> {
    return buildExtractionItemNameMap(PgDataSource, extractionResultIds);
  }
}

export const productConfigAgentRepository = new TypeOrmProductConfigAgentRepository();
