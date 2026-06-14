export {
  productConfigAgentRepository as quoteAgentRepository,
  TypeOrmProductConfigAgentRepository as TypeOrmQuoteAgentRepository,
} from "../productConfigAgent/index.compat.js";
export type {
  ProductConfigAgentRepository as QuoteAgentRepository,
} from "../productConfigAgent/index.compat.js";
export {
  calculateFileSha256,
  extractWithLLM,
  extractProductConfigWithDeepSeek,
  extractProductConfigWithLLM,
  extractProductConfigWithLocalModel,
  getLocalModelClient,
  getLocalModelName,
  normalizeExtraction,
  parseExcelToBlocks,
  productConfigAgentService as quoteAgentService,
  ProductConfigAgentService as QuoteAgentService,
  publishApprovedExtraction,
  resolveLlmProvider,
  submitToJiandaoyunReview,
} from "../productConfigAgent/index.compat.js";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
  LlmProvider,
  ProductConfigAgentExtractParams as QuoteAgentExtractParams,
  ProductConfigAgentParseAndSaveBlocksBatchError as QuoteAgentParseAndSaveBlocksBatchError,
  ProductConfigAgentParseAndSaveBlocksBatchResult as QuoteAgentParseAndSaveBlocksBatchResult,
  ProductConfigAgentParseAndSaveBlocksBatchSuccess as QuoteAgentParseAndSaveBlocksBatchSuccess,
  ProductConfigAgentParseAndSaveBlocksResult as QuoteAgentParseAndSaveBlocksResult,
  ProductConfigAgentProcessParams as QuoteAgentProcessParams,
  ProductConfigAgentProcessResult as QuoteAgentProcessResult,
} from "../productConfigAgent/index.compat.js";
