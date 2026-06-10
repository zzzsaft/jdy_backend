export {
  quoteAgentRepository,
  TypeOrmQuoteAgentRepository,
} from "./db.service.js";
export type { QuoteAgentRepository } from "./db.service.js";
export {
  calculateFileSha256,
  extractWithLLM,
  normalizeExtraction,
  parseExcelToBlocks,
  publishApprovedExtraction,
  quoteAgentService,
  QuoteAgentService,
  submitToJiandaoyunReview,
} from "./service.js";
export type {
  QuoteAgentExtractParams,
  QuoteAgentParseAndSaveBlocksBatchError,
  QuoteAgentParseAndSaveBlocksBatchResult,
  QuoteAgentParseAndSaveBlocksBatchSuccess,
  QuoteAgentParseAndSaveBlocksResult,
  QuoteAgentProcessParams,
  QuoteAgentProcessResult,
} from "./service.js";
export {
  extractProductConfigWithDeepSeek,
  extractProductConfigWithLLM,
  extractProductConfigWithLocalModel,
  getLocalModelClient,
  getLocalModelName,
  resolveLlmProvider,
} from "./llm/index.js";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
  LlmProvider,
} from "./llm/index.js";
