export {
  productConfigAgentRepository,
  TypeOrmProductConfigAgentRepository,
} from "./db.service.js";
export type { ProductConfigAgentRepository } from "./db.service.js";
export {
  productConfigAgentArchiveService,
  ProductConfigAgentArchiveService,
} from "./archive/contractArchive.service.js";
export { createProductConfigAgentArchiveRoutes } from "./archive/contractArchive.routes.js";
export {
  calculateFileSha256,
  extractWithLLM,
  normalizeExtraction,
  parseExcelToBlocks,
  publishApprovedExtraction,
  productConfigAgentService,
  ProductConfigAgentService,
  submitToJiandaoyunReview,
} from "./service.js";
export type {
  ProductConfigAgentExtractParams,
  ProductConfigAgentParseAndSaveBlocksBatchError,
  ProductConfigAgentParseAndSaveBlocksBatchResult,
  ProductConfigAgentParseAndSaveBlocksBatchSuccess,
  ProductConfigAgentParseAndSaveBlocksResult,
  ProductConfigAgentProcessParams,
  ProductConfigAgentProcessResult,
} from "./service.js";
export {
  extractProductConfigWithDeepSeek,
  extractProductConfigWithLLM,
  extractProductConfigWithLocalModel,
  getLocalModelClient,
  getLocalModelName,
  resolveLlmProvider,
} from "./extraction/index.js";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
  LlmProvider,
} from "./extraction/index.js";
