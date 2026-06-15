import type { ExcelParserOptions } from "../excelParser/index.js";
import type { LlmDictionaryContext } from "../dictionary/dictionary.service.js";
import type { DictionaryExtractionResult } from "../normalization/index.js";

export type PendingLlmUploadJobStatus = "running" | "completed" | "failed";

export type PendingLlmDocumentProgress = {
  documentId: number;
  fileName: string;
  contentLength: number;
  chunkCount: number;
  status: "running" | "success" | "failed";
  finishReason?: string | null;
  error?: string;
};

export type PendingLlmUploadJob = {
  id: string;
  status: PendingLlmUploadJobStatus;
  llmModel: string;
  limit: number;
  concurrency: number;
  startedAt: string;
  finishedAt?: string;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  currentDocumentId?: number;
  currentDocumentIds?: number[];
  documentProgress: PendingLlmDocumentProgress[];
  errors: Array<{
    documentId: number;
    fileName: string;
    error: string;
  }>;
};

export type DirtyDataRefreshJobStatus = "running" | "completed" | "failed";

export type DirtyDataRefreshDocumentProgress = {
  documentId: number;
  fileName: string;
  status: "running" | "success" | "failed";
  archiveUpdatedCount: number;
  archiveVersionCount: number;
  error?: string;
};

export type DirtyDataRefreshJob = {
  id: string;
  status: DirtyDataRefreshJobStatus;
  limit: number;
  batchSize: number;
  startedAt: string;
  finishedAt?: string;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  archiveUpdatedCount: number;
  archiveVersionCount: number;
  currentDocumentId?: number;
  documentProgress: DirtyDataRefreshDocumentProgress[];
  errors: Array<{
    documentId: number;
    fileName: string;
    error: string;
  }>;
};

export type ProductConfigAgentProcessParams = {
  filePath: string;
  fileName?: string;
  source?: string;
  parserVersion?: string;
  promptVersion?: string;
  dictionaryVersion?: number;
  dictionaryContext?: LlmDictionaryContext;
  llmModel?: string;
  forceReparse?: boolean;
  forceReextract?: boolean;
  parserOptions?: ExcelParserOptions;
};

export type ProductConfigAgentProcessResult = {
  document: any;
  blocks: any;
  extraction: any;
  dictionary: DictionaryExtractionResult | null;
  reusedBlocks: boolean;
  reusedExtraction: boolean;
};

export type ProductConfigAgentParseAndSaveBlocksResult = {
  document: any;
  blocks: any;
  reusedBlocks: boolean;
};

export type ProductConfigAgentParseAndSaveBlocksBatchSuccess =
  ProductConfigAgentParseAndSaveBlocksResult & {
    fileName: string;
    filePath: string;
  };

export type ProductConfigAgentParseAndSaveBlocksBatchError = {
  fileName: string;
  filePath: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
};

export type ProductConfigAgentParseAndSaveBlocksBatchResult = {
  successes: ProductConfigAgentParseAndSaveBlocksBatchSuccess[];
  errors: ProductConfigAgentParseAndSaveBlocksBatchError[];
};

export type ExtractWithLLMParams = {
  blocksJson: any;
  dictionaryContext: LlmDictionaryContext;
  fileName?: string;
  llmModel?: string;
  promptVersion?: string;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
};

export type CandidateReviewAction =
  | "create_term_type"
  | "approve_term_type_as_alias"
  | "split_term_type"
  | "create_value"
  | "approve_value_as_alias"
  | "split_value"
  | "move_value_to_other_term_type"
  | "update_term_type_value_kind"
  | "reject";
