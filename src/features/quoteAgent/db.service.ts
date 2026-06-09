import { In, Repository } from "typeorm";
import { PgDataSource } from "../../config/data-source";
import {
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  DictionaryTermTypeCandidate,
} from "./dictionary/entity";
import { DocumentBlocks } from "./entity/documentBlocks.entity";
import { Documents } from "./entity/documents.entity";
import { ExtractionResults } from "./entity/extractionResults.entity";

export interface QuoteAgentRepository {
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
  findAffectedDocumentIdsForCandidate(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
  }): Promise<number[]>;
  findCandidates(params?: { status?: string; documentId?: number }): Promise<{
    termTypeCandidates: any[];
    valueCandidates: any[];
  }>;
}

function wrapDbError(method: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[quoteAgent:db] ${method} failed: ${message}`);
}

export class TypeOrmQuoteAgentRepository implements QuoteAgentRepository {
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
            ORDER BY latest.created_at DESC
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
      return await this.extractionRepo.findOne({
        where: { documentId },
        order: { createdAt: "DESC" },
      });
    } catch (error) {
      throw wrapDbError("findLatestExtractionByDocumentId", error);
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

  async findCandidates(params?: { status?: string; documentId?: number }): Promise<{
    termTypeCandidates: any[];
    valueCandidates: any[];
  }> {
    try {
      const candidateStatus = params?.status || "pending";
      const documentId = params?.documentId;
      const termTypeCandidates = await PgDataSource
        .getRepository(DictionaryTermTypeCandidate)
        .find({
          where: { status: candidateStatus },
          order: { createdAt: "DESC" },
        });
      const valueCandidates = await PgDataSource
        .getRepository(DictionaryCandidate)
        .find({
          where: { status: candidateStatus },
          order: { createdAt: "DESC" },
        });

      const [enrichedTermTypeCandidates, enrichedValueCandidates] =
        await Promise.all([
          this.attachCandidateDocuments("term_type", termTypeCandidates),
          this.attachCandidateDocuments("value", valueCandidates),
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
  ): Promise<any[]> {
    if (candidates.length === 0) {
      return candidates;
    }

    const occurrenceRepo = PgDataSource.getRepository(DictionaryCandidateOccurrence);
    const occurrences = await occurrenceRepo.find({
      where: {
        candidateType,
        candidateId: In(candidates.map((item) => String(item.id))),
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
    if (extractionResultIds.length === 0) {
      return new Map();
    }
    const rows = await PgDataSource.getRepository(ExtractionResults).find({
      where: { id: In(extractionResultIds) },
    });
    const result = new Map<string, string>();
    for (const row of rows) {
      const source =
        (row.normalizedExtractionJson as any)?.items ??
        (row.extractionJson as any)?.items ??
        (row.extractionJson as any)?.extraction?.items ??
        [];
      if (!Array.isArray(source)) continue;
      for (const item of source) {
        const itemIndex = item?.item_index ?? item?.itemIndex;
        const rawItemName = item?.item_name ?? item?.itemName;
        const itemName =
          typeof rawItemName === "string"
            ? rawItemName
            : typeof rawItemName?.value === "string"
              ? rawItemName.value
              : "";
        if (itemIndex !== undefined && itemIndex !== null && itemName) {
          result.set(`${row.id}:${itemIndex}`, itemName);
        }
      }
    }
    return result;
  }
}

export const quoteAgentRepository = new TypeOrmQuoteAgentRepository();
