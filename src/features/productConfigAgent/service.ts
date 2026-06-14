import path from "path";
import { DictionaryService, type LlmDictionaryContext } from "./dictionary/dictionary.service.js";
import { CandidateReviewWorkflowService } from "./dictionary/candidateReviewWorkflow.service.js";
import { getInferAiChatModel } from "./extraction/index.js";
import { NormalizationRefreshService } from "./normalization/normalizationRefresh.service.js";
import { ProductConfigAgentQueryService } from "./query/productConfigAgentQuery.service.js";
import { productConfigAgentRepository } from "./db.service.js";
import type { ProductConfigAgentRepository } from "./db.service.js";
import { PgDataSource } from "../../config/data-source.js";
import {
  DEFAULT_DICTIONARY_VERSION,
  DEFAULT_LLM_MODEL,
  DEFAULT_PROMPT_VERSION,
  markFailed,
  updateDocumentStatus,
  wrapStageError,
} from "./workflow/common.js";
import {
  BlockParsingService,
  calculateFileSha256,
  parseExcelToBlocks,
} from "./workflow/blockParsing.service.js";
import { extractWithLLM } from "./workflow/extractionWorkflow.js";
import { PendingLlmJobService } from "./workflow/pendingLlmJob.service.js";
import { PlannedExtractionService } from "./workflow/plannedExtraction.service.js";
import type {
  CandidateReviewAction,
  PendingLlmUploadJob,
  ProductConfigAgentParseAndSaveBlocksBatchResult,
  ProductConfigAgentParseAndSaveBlocksResult,
  ProductConfigAgentProcessParams,
  ProductConfigAgentProcessResult,
} from "./workflow/types.js";
import type { DictionaryExtractionResult } from "./normalization/index.js";

export { calculateFileSha256, extractWithLLM, parseExcelToBlocks };

export type {
  PendingLlmDocumentProgress,
  PendingLlmUploadJob,
  ProductConfigAgentParseAndSaveBlocksBatchError,
  ProductConfigAgentParseAndSaveBlocksBatchResult,
  ProductConfigAgentParseAndSaveBlocksBatchSuccess,
  ProductConfigAgentParseAndSaveBlocksResult,
  ProductConfigAgentProcessParams,
  ProductConfigAgentProcessResult,
} from "./workflow/types.js";

export async function normalizeExtraction(..._args: any[]) {
  throw new Error(
    "normalizeExtraction is no longer exposed as a standalone helper. Use productConfigAgentService.generateDictionaryForDocument or ProductConfigAgentService methods instead.",
  );
}

export async function submitToJiandaoyunReview(..._args: any[]) {
  throw new Error(
    "submitToJiandaoyunReview is no longer implemented by productConfigAgent.",
  );
}

export async function publishApprovedExtraction(..._args: any[]) {
  throw new Error(
    "publishApprovedExtraction is no longer implemented by productConfigAgent.",
  );
}

export class ProductConfigAgentService {
  private readonly blockParsingService: BlockParsingService;
  private readonly normalizationRefreshService: NormalizationRefreshService;
  private readonly plannedExtractionService: PlannedExtractionService;
  private readonly queryService: ProductConfigAgentQueryService;
  private readonly pendingLlmJobService: PendingLlmJobService;
  private readonly candidateReviewWorkflowService: CandidateReviewWorkflowService;

  constructor(
    private repository: ProductConfigAgentRepository = productConfigAgentRepository,
    private dictionaryService: DictionaryService = new DictionaryService(
      PgDataSource,
    ),
  ) {
    this.blockParsingService = new BlockParsingService(this.repository);
    this.normalizationRefreshService = new NormalizationRefreshService(
      PgDataSource,
      this.repository,
      this.dictionaryService,
    );
    this.plannedExtractionService = new PlannedExtractionService(
      this.repository,
      this.dictionaryService,
      this.normalizationRefreshService,
    );
    this.queryService = new ProductConfigAgentQueryService(
      this.repository,
      this.dictionaryService,
    );
    this.pendingLlmJobService = new PendingLlmJobService(
      this.repository,
      (params) => this.extractDocumentBlocksWithLlm(params),
    );
    this.candidateReviewWorkflowService = new CandidateReviewWorkflowService(
      this.repository,
      this.dictionaryService,
      (documentId) => this.generateDictionaryForDocument(documentId),
    );
  }

  async process(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentProcessResult> {
    const promptVersion = params.promptVersion ?? DEFAULT_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const fileName = params.fileName ?? path.basename(params.filePath);

    const { document, blocks, reusedBlocks } = await this.parseAndSaveBlocks(
      params,
    );

    const { extraction, reusedExtraction } = await this.extractBlocksWithLlm({
      document,
      blocks,
      fileName,
      promptVersion,
      dictionaryVersion,
      llmModel,
      dictionaryContext: params.dictionaryContext,
      forceReextract: params.forceReextract,
    });

    const dictionary = await this.normalizeExtractionForDocument({
      document,
      extraction,
    });

    return {
      document,
      blocks,
      extraction,
      dictionary,
      reusedBlocks,
      reusedExtraction,
    };
  }

  async extractDocumentBlocksWithLlm(params: {
    documentId: number;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    dictionaryContext?: LlmDictionaryContext;
    forceReextract?: boolean;
    onStreamProgress?: (progress: {
      contentLength: number;
      chunkCount: number;
      finishReason?: string | null;
    }) => void;
  }): Promise<ProductConfigAgentProcessResult> {
    const promptVersion = params.promptVersion ?? DEFAULT_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const document = await this.repository.findDocumentById(params.documentId);
    if (!document) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    const blocks = await this.repository.findBlocksByDocumentId(params.documentId);
    if (!blocks) {
      throw new Error(`Document blocks not found: ${params.documentId}`);
    }

    const { extraction, reusedExtraction } = await this.extractBlocksWithLlm({
      document,
      blocks,
      fileName: document.fileName,
      promptVersion,
      dictionaryVersion,
      llmModel,
      dictionaryContext: params.dictionaryContext,
      forceReextract: params.forceReextract,
      onStreamProgress: params.onStreamProgress,
    });

    const dictionary = await this.normalizeExtractionForDocument({
      document,
      extraction,
    });

    return {
      document,
      blocks,
      extraction,
      dictionary,
      reusedBlocks: true,
      reusedExtraction,
    };
  }

  async planDocumentBlocksWithLlm(params: {
    documentId: number;
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    dictionaryContext?: LlmDictionaryContext;
    forceReplan?: boolean;
  }): Promise<any> {
    return this.plannedExtractionService.planDocumentBlocksWithLlm(params);
  }

  async extractPlannedItemsWithLlm(params: {
    extractionResultId: number;
    llmModel?: string;
    itemProductType?: string;
    maxItemConcurrency?: number;
  }): Promise<any> {
    return this.plannedExtractionService.extractPlannedItemsWithLlm(params);
  }

  async parseAndSaveBlocks(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentParseAndSaveBlocksResult> {
    return this.blockParsingService.parseAndSaveBlocks(params);
  }

  async parseAndSaveBlocksBatch(
    paramsList: ProductConfigAgentProcessParams[],
  ): Promise<ProductConfigAgentParseAndSaveBlocksBatchResult> {
    return this.blockParsingService.parseAndSaveBlocksBatch(paramsList);
  }

  async extract(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentProcessResult> {
    return this.process(params);
  }

  async generateDictionaryForDocument(documentId: number) {
    return this.normalizationRefreshService.generateDictionaryForDocument(
      documentId,
    );
  }

  async getContract(documentId: number) {
    return this.queryService.getContract(documentId);
  }

  async getExtractionDetail(documentId: number) {
    return this.queryService.getExtractionDetail(documentId);
  }

  async reextractDocumentWithLlm(params: {
    documentId: number;
    llmModel?: string;
  }): Promise<ProductConfigAgentProcessResult> {
    const document = await this.repository.findDocumentById(params.documentId);
    if (!document) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    return this.extractDocumentBlocksWithLlm({
      documentId: document.id,
      llmModel: params.llmModel
        ? getInferAiChatModel(params.llmModel)
        : getInferAiChatModel(),
      forceReextract: true,
    });
  }

  async listExtractions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
  }) {
    return this.queryService.listExtractions(params);
  }

  async getCandidates(params?: {
    status?: string;
    documentId?: number;
    recheckPendingCandidates?: boolean;
  }) {
    return this.queryService.getCandidates(params);
  }

  getPendingLlmUploadJob() {
    return this.pendingLlmJobService.getPendingLlmUploadJob();
  }

  startPendingLlmUploadJob(params?: {
    limit?: number;
    llmModel?: string;
    concurrency?: number;
  }): PendingLlmUploadJob {
    return this.pendingLlmJobService.startPendingLlmUploadJob(params);
  }

  async renormalizeExistingExtractions(params?: {
    limit?: number;
    onlyMissingNormalized?: boolean;
  }) {
    return this.normalizationRefreshService.renormalizeExistingExtractions(
      params,
    );
  }

  async renormalizeExistingExtractionsInBatches(params?: {
    limit?: number;
    batchSize?: number;
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
    onProgress?: (event: {
      batchIndex: number;
      batchCount: number;
      processedCount: number;
      successCount: number;
      failedCount: number;
      cursorId?: number;
      cursorCreatedAt?: Date;
    }) => void;
  }) {
    return this.normalizationRefreshService.renormalizeExistingExtractionsInBatches(
      params,
    );
  }

  async reviewCandidateAndRefresh(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    action: CandidateReviewAction;
    payload: any;
  }) {
    return this.candidateReviewWorkflowService.reviewCandidateAndRefresh(params);
  }

  async reviewCandidatesBatch(params: {
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    operations: Array<{
      candidateType: "term_type" | "value";
      candidateId: string;
      action: CandidateReviewAction;
      payload: any;
    }>;
  }) {
    return this.candidateReviewWorkflowService.reviewCandidatesBatch(params);
  }

  private async extractBlocksWithLlm(params: {
    document: any;
    blocks: any;
    fileName?: string;
    promptVersion: string;
    dictionaryVersion: number;
    llmModel: string;
    dictionaryContext?: LlmDictionaryContext;
    forceReextract?: boolean;
    onStreamProgress?: (progress: {
      contentLength: number;
      chunkCount: number;
      finishReason?: string | null;
    }) => void;
  }): Promise<{ extraction: any; reusedExtraction: boolean }> {
    let extraction: any | null = null;
    let reusedExtraction = false;

    try {
      if (params.forceReextract !== true) {
        extraction = await this.repository.findLatestExtraction({
          documentId: params.document.id,
          promptVersion: params.promptVersion,
          dictionaryVersion: params.dictionaryVersion,
          llmModel: params.llmModel,
        });
      }

      if (extraction) {
        reusedExtraction = true;
      } else {
        const dictionaryContext =
          params.dictionaryContext ??
          (await this.dictionaryService.getLlmDictionaryContext());
        const llmResult = await extractWithLLM({
          blocksJson: params.blocks.blocksJson,
          dictionaryContext,
          fileName: params.fileName,
          llmModel: params.llmModel,
          promptVersion: params.promptVersion,
          onStreamProgress: params.onStreamProgress,
        });

        extraction = await this.repository.createExtraction({
          documentId: params.document.id,
          extractionJson: llmResult.extraction,
          dictionaryProposals: [],
          warnings: llmResult.warnings,
          llmPlanJson: llmResult.llmPlanJson,
          llmModel: params.llmModel,
          promptVersion: params.promptVersion,
          dictionaryVersion: params.dictionaryVersion,
          status: "parsed",
        });

        await updateDocumentStatus(this.repository, params.document, "extracted");
      }
    } catch (error) {
      await markFailed(this.repository, params.document.id);
      throw wrapStageError("[productConfigAgent:llmExtract]", error);
    }

    return { extraction, reusedExtraction };
  }

  private async normalizeExtractionForDocument(params: {
    document: any;
    extraction: any;
  }): Promise<DictionaryExtractionResult> {
    try {
      const dictionary =
        await this.normalizationRefreshService.generateDictionaryForExtraction({
          documentId: params.document.id,
          extraction: params.extraction,
        });
      params.extraction.normalizedExtractionJson = dictionary.extraction_json;
      params.extraction.dictionaryProposals = dictionary;
      params.extraction.status = "normalized";
      await updateDocumentStatus(this.repository, params.document, "normalized");
      return dictionary;
    } catch (error) {
      await markFailed(this.repository, params.document.id);
      throw wrapStageError("[productConfigAgent:dictionary]", error);
    }
  }
}

export const productConfigAgentService = new ProductConfigAgentService();

export type ProductConfigAgentExtractParams = ProductConfigAgentProcessParams;
