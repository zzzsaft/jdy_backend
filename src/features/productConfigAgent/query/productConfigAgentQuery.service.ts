import type { ProductConfigAgentRepository } from "../db.service.js";
import type { DictionaryService } from "../dictionary/dictionary.service.js";
import { logger } from "../../../config/logger.js";
import { safeJsonByteLength } from "../workflow/common.js";

export class ProductConfigAgentQueryService {
  constructor(
    private readonly repository: ProductConfigAgentRepository,
    private readonly dictionaryService: DictionaryService,
  ) {}

  async getContract(documentId: number) {
    const document = await this.repository.findDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extraction = await this.repository.findLatestExtractionByDocumentId(
      documentId,
    );

    return {
      document,
      extraction,
      dictionary_proposals: extraction?.dictionaryProposals ?? null,
    };
  }

  async getExtractionDetail(documentId: number) {
    const startedAt = Date.now();
    const documentStartedAt = Date.now();
    const document = await this.repository.findDocumentById(documentId);
    const documentMs = Date.now() - documentStartedAt;
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extractionStartedAt = Date.now();
    const extraction =
      await this.repository.findLatestExtractionDetailByDocumentId(documentId);
    const extractionMs = Date.now() - extractionStartedAt;
    const dictionaryProposals = extraction?.dictionaryProposals ?? null;
    const normalizedExtractionJson = extraction?.normalizedExtractionJson ?? null;
    const totalMs = Date.now() - startedAt;

    logger.info(
      `[productConfigAgent:getExtractionDetail] documentId=${documentId} totalMs=${totalMs} documentMs=${documentMs} extractionMs=${extractionMs} ` +
        `extractionId=${extraction?.id ?? "none"} status=${extraction?.status ?? "none"} ` +
        `items=${dictionaryProposals?.summary?.item_count ?? dictionaryProposals?.items?.length ?? 0} ` +
        `warnings=${dictionaryProposals?.summary?.warning_count ?? dictionaryProposals?.warnings?.length ?? 0} ` +
        `termTypeCandidates=${dictionaryProposals?.summary?.term_type_candidate_count ?? 0} ` +
        `valueCandidates=${dictionaryProposals?.summary?.value_candidate_count ?? 0} ` +
        `dictionaryBytes=${safeJsonByteLength(dictionaryProposals)} normalizedBytes=${safeJsonByteLength(normalizedExtractionJson)}`,
    );

    return {
      document,
      extraction,
      dictionary_proposals: dictionaryProposals,
    };
  }

  async listExtractions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
  }) {
    return this.repository.listDocuments(params);
  }

  async getCandidates(params?: {
    status?: string;
    documentId?: number;
    recheckPendingCandidates?: boolean;
  }) {
    if (
      params?.recheckPendingCandidates === true &&
      (!params?.status || params.status === "pending") &&
      !params?.documentId
    ) {
      await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate();
    }
    const startedAt = Date.now();
    const result = await this.repository.findCandidates(params);
    logger.info(
      `[productConfigAgent:getCandidates] totalMs=${Date.now() - startedAt} status=${params?.status ?? "pending"} documentId=${params?.documentId ?? "all"} ` +
        `termTypeCandidates=${result.termTypeCandidates.length} valueCandidates=${result.valueCandidates.length}`,
    );
    return result;
  }
}
