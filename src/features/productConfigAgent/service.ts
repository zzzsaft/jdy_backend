import path from "path";
import {
  DictionaryService,
  type LlmDictionaryContext,
} from "./dictionary/dictionary.service.js";
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
import { DirtyDataRefreshJobService } from "./workflow/dirtyDataRefreshJob.service.js";
import { PlannedExtractionService } from "./workflow/plannedExtraction.service.js";
import { productConfigAgentArchiveService } from "./archive/contractArchive.service.js";
import {
  backgroundJobService,
  type BackgroundJobHandlerContext,
} from "../backgroundJob/index.js";
import type { BackgroundJob } from "../backgroundJob/index.js";
import { buildDuplicateDocumentReport } from "./workflow/documentDuplicateAnalysis.js";
import type {
  CandidateReviewAction,
  DirtyDataRefreshJob,
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
  private readonly dirtyDataRefreshJobService: DirtyDataRefreshJobService;
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
    this.dirtyDataRefreshJobService = new DirtyDataRefreshJobService(
      this.repository,
      (documentId) => this.refreshDirtyDocumentDictionary(documentId),
      (documentId) =>
        productConfigAgentArchiveService.refreshDirtyArchivesForDocument({
          documentId,
          editedBy: "system",
        }),
    );
    this.candidateReviewWorkflowService = new CandidateReviewWorkflowService(
      this.repository,
      this.dictionaryService,
      (documentId) => this.generateDictionaryForDocument(documentId),
    );
    backgroundJobService.registerHandler({
      type: "productConfigAgent.reviewCandidatesBatch",
      run: (job, context) =>
        this.runCandidateReviewBatchBackgroundJob(job, context),
    });
  }

  async process(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentProcessResult> {
    const promptVersion = params.promptVersion ?? DEFAULT_PROMPT_VERSION;
    const dictionaryVersion =
      params.dictionaryVersion ?? DEFAULT_DICTIONARY_VERSION;
    const llmModel = params.llmModel ?? DEFAULT_LLM_MODEL;
    const fileName = params.fileName ?? path.basename(params.filePath);

    const { document, blocks, reusedBlocks } =
      await this.parseAndSaveBlocks(params);

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

    const blocks = await this.repository.findBlocksByDocumentId(
      params.documentId,
    );
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

  async extractPlannedItemsBatchWithLlm(params: {
    llmModel?: string;
    promptVersion?: string;
    dictionaryVersion?: number;
    itemProductType?: string;
    limit?: number;
    batchSize?: number;
    concurrency?: number;
  }): Promise<any> {
    return this.plannedExtractionService.extractPlannedItemsBatchWithLlm(
      params,
    );
  }

  async parseAndSaveBlocks(
    params: ProductConfigAgentProcessParams,
  ): Promise<ProductConfigAgentParseAndSaveBlocksResult> {
    const result = await this.blockParsingService.parseAndSaveBlocks(params);
    await this.applyDuplicateMappingsForFileNames([result.document.fileName]);
    return result;
  }

  async parseAndSaveBlocksBatch(
    paramsList: ProductConfigAgentProcessParams[],
  ): Promise<ProductConfigAgentParseAndSaveBlocksBatchResult> {
    const result =
      await this.blockParsingService.parseAndSaveBlocksBatch(paramsList);
    await this.applyDuplicateMappingsForFileNames(
      result.successes.map((item) => item.fileName),
    );
    return result;
  }

  private async applyDuplicateMappingsForFileNames(fileNames: string[]) {
    const uniqueFileNames = [
      ...new Set(fileNames.filter((fileName) => fileName?.trim())),
    ];
    if (uniqueFileNames.length === 0) return;

    try {
      const candidates = await this.repository.findDuplicateDocumentCandidates({
        fileNames: uniqueFileNames,
      });
      const hydratedCandidates = candidates.map((candidate) => ({
        ...candidate,
        blocksJson: candidate.llmText
          ? { llm_text: candidate.llmText }
          : candidate.blocksJson,
      }));
      const missingLlmTextDocumentIds = hydratedCandidates
        .filter((candidate) => candidate.blocksId && !candidate.blocksJson)
        .map((candidate) => Number(candidate.documentId));

      if (missingLlmTextDocumentIds.length > 0) {
        const blocks = await this.repository.findBlocksByDocumentIds(
          missingLlmTextDocumentIds,
        );
        const blocksByDocumentId = new Map(
          blocks.map((block) => [Number(block.documentId), block.blocksJson]),
        );

        for (const candidate of hydratedCandidates) {
          if (!candidate.blocksJson) {
            candidate.blocksJson = blocksByDocumentId.get(
              Number(candidate.documentId),
            );
          }
        }
      }

      const report = buildDuplicateDocumentReport(hydratedCandidates);
      const mappings = report.flatMap((group) => group.duplicateMappings);
      if (mappings.length === 0) return;

      await this.repository.upsertDocumentDuplicates(mappings);
    } catch (error) {
      console.warn(
        `[productConfigAgent:documentDuplicates] apply failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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

  getDirtyDataRefreshJob() {
    return this.dirtyDataRefreshJobService.getDirtyDataRefreshJob();
  }

  startDirtyDataRefreshJob(params?: {
    limit?: number;
    batchSize?: number;
  }): DirtyDataRefreshJob {
    return this.dirtyDataRefreshJobService.startDirtyDataRefreshJob(params);
  }

  async renormalizeExistingExtractions(params?: {
    limit?: number;
    onlyMissingNormalized?: boolean;
  }) {
    return this.normalizationRefreshService.renormalizeExistingExtractions(
      params,
    );
  }

  async generateDictionaryForExtractionId(extractionResultId: number) {
    return this.normalizationRefreshService.generateDictionaryForExtractionId(
      extractionResultId,
    );
  }

  async countRenormalizationTargets(params?: {
    onlyMissingNormalized?: boolean;
    withPendingCandidates?: boolean;
  }) {
    return this.normalizationRefreshService.countRenormalizationTargets(params);
  }

  async renormalizeExistingExtractionsInBatches(params?: {
    limit?: number;
    batchSize?: number;
    concurrency?: number;
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

  private async refreshDirtyDocumentDictionary(documentId: number) {
    const dirtyArchiveExtractionIds =
      await productConfigAgentArchiveService.findDirtyArchiveExtractionIdsForDocument(
        documentId,
      );
    const latestResult = await this.generateDictionaryForDocument(documentId);
    const latestExtractionId = Number((latestResult as any).extraction?.id);
    const archiveExtractionIds = dirtyArchiveExtractionIds.filter(
      (extractionId) => extractionId !== latestExtractionId,
    );

    for (const extractionId of archiveExtractionIds) {
      const extraction = await this.repository.findExtractionById(extractionId);
      if (!extraction) {
        throw new Error(`Extraction not found: ${extractionId}`);
      }
      await this.normalizationRefreshService.generateDictionaryForExtraction({
        documentId,
        extraction,
      });
    }

    return latestResult;
  }

  async reviewCandidateAndRefresh(params: {
    candidateType: "term_type" | "value";
    candidateId: string;
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    action: CandidateReviewAction;
    payload: any;
  }) {
    return this.candidateReviewWorkflowService.reviewCandidateAndRefresh(
      params,
    );
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
    completedOperationResults?: Array<{
      index: number;
      result: {
        candidateType: "term_type" | "value";
        candidateId: string;
        action: string;
        status: "ok" | "failed";
        error?: string;
      };
      affectedDocumentIds?: number[];
    }>;
    onOperationProcessed?: (event: {
      operation: {
        candidateType: "term_type" | "value";
        candidateId: string;
        action: CandidateReviewAction;
        payload: any;
      };
      index: number;
      affectedDocumentIds: number[];
      result: {
        candidateType: "term_type" | "value";
        candidateId: string;
        action: string;
        status: "ok" | "failed";
        error?: string;
      };
    }) => void | Promise<void>;
  }) {
    return this.candidateReviewWorkflowService.reviewCandidatesBatch(params);
  }

  async startCandidateReviewBatchJob(params: {
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    operations: Array<{
      candidateType: "term_type" | "value";
      candidateId: string;
      action: CandidateReviewAction;
      payload: any;
    }>;
  }) {
    if (params.operations.length > 200) {
      throw new Error("operations length must be <= 200");
    }
    return backgroundJobService.enqueue({
      type: "productConfigAgent.reviewCandidatesBatch",
      payload: params,
      progress: {
        requestedCount: params.operations.length,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        operationResults: [],
      },
      maxAttempts: 3,
    });
  }

  async getBackgroundJob(jobId: string) {
    return backgroundJobService.getJob(jobId);
  }

  private async runCandidateReviewBatchBackgroundJob(
    job: BackgroundJob,
    context: BackgroundJobHandlerContext,
  ) {
    const payload = job.payload ?? {};
    const operations = Array.isArray(payload.operations)
      ? payload.operations
      : [];
    const existingOperationResults = Array.isArray(
      job.progress?.operationResults,
    )
      ? job.progress.operationResults
      : [];
    const operationResultsByIndex = new Map<number, any>();
    for (const item of existingOperationResults) {
      if (typeof item?.index === "number") {
        operationResultsByIndex.set(item.index, item);
      }
    }

    const writeProgress = async (patch?: Record<string, any>) => {
      const operationResults = [...operationResultsByIndex.values()].sort(
        (a, b) => a.index - b.index,
      );
      const successCount = operationResults.filter(
        (item) => item.result?.status === "ok",
      ).length;
      const failedCount = operationResults.filter(
        (item) => item.result?.status === "failed",
      ).length;
      await context.updateProgress({
        requestedCount: operations.length,
        processedCount: operationResults.length,
        successCount,
        failedCount,
        operationResults,
        ...(patch ?? {}),
      });
    };

    await writeProgress();
    const result = await this.reviewCandidatesBatch({
      refreshAffectedDocuments: payload.refreshAffectedDocuments === true,
      deferCandidateRecheck: payload.deferCandidateRecheck === true,
      operations,
      completedOperationResults: [...operationResultsByIndex.values()],
      onOperationProcessed: async ({
        operation,
        index,
        result,
        affectedDocumentIds,
      }) => {
        operationResultsByIndex.set(index, {
          index,
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          affectedDocumentIds,
          result,
        });
        await writeProgress({
          currentIndex: index,
          currentCandidateType: operation.candidateType,
          currentCandidateId: operation.candidateId,
          currentAction: operation.action,
        });
      },
    });
    await writeProgress({
      currentIndex: null,
      currentCandidateType: null,
      currentCandidateId: null,
      currentAction: null,
    });
    return result;
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

        await updateDocumentStatus(
          this.repository,
          params.document,
          "extracted",
        );
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
      await updateDocumentStatus(
        this.repository,
        params.document,
        "normalized",
      );
      return dictionary;
    } catch (error) {
      await markFailed(this.repository, params.document.id);
      throw wrapStageError("[productConfigAgent:dictionary]", error);
    }
  }
}

export const productConfigAgentService = new ProductConfigAgentService();

export type ProductConfigAgentExtractParams = ProductConfigAgentProcessParams;
