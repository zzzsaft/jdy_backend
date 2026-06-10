import { extractProductConfigWithDeepSeek } from "./deepseekExtract.js";
import { extractProductConfigWithInferAiChat } from "./inferAiChatExtract.js";
import { extractProductConfigWithLocalModel } from "./localExtract.js";
import { extractProductConfigWithXh } from "./xhExtract.js";
import { extractProductConfigWithTwoStageXh } from "./twoStageExtract.js";
import { getLocalModelName } from "../../../llm/index.js";
import type { LlmExtractParams, LlmExtractResult } from "./types.js";

const DEEPSEEK_MODEL_PREFIX = "deepseek";
const INFERAI_MODEL_PREFIXES = ["inferai", "inferaichat"];
const XH_MODEL_PREFIX = "xh:";

export type LlmProvider = "deepseek" | "inferaichat" | "xh" | "local";

export function resolveLlmProvider(model?: string): LlmProvider {
  const selectedModel = model || getLocalModelName();

  if (selectedModel.toLowerCase().startsWith(DEEPSEEK_MODEL_PREFIX)) {
    return "deepseek";
  }

  if (
    INFERAI_MODEL_PREFIXES.some((prefix) =>
      selectedModel.toLowerCase().startsWith(prefix),
    )
  ) {
    return "inferaichat";
  }

  if (selectedModel.toLowerCase().startsWith(XH_MODEL_PREFIX)) {
    return "xh";
  }

  return "local";
}

export async function extractProductConfigWithLLM(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const provider = resolveLlmProvider(model);

  if (provider === "deepseek") {
    return extractProductConfigWithDeepSeek(params);
  }

  if (provider === "inferaichat") {
    return extractProductConfigWithInferAiChat(params, model);
  }

  if (provider === "xh") {
    return extractProductConfigWithXh(params, model);
  }

  return extractProductConfigWithLocalModel(params, model);
}

export { extractProductConfigWithDeepSeek } from "./deepseekExtract.js";
export { extractProductConfigWithInferAiChat } from "./inferAiChatExtract.js";
export { extractProductConfigWithLocalModel } from "./localExtract.js";
export { extractProductConfigWithXh } from "./xhExtract.js";
export {
  extractItemsFromPlanWithXh,
  extractProductConfigWithTwoStageXh,
  filterDictionaryContextForProductType,
  planDocumentWithXh,
} from "./twoStageExtract.js";
export {
  getInferAiChatClient,
  getInferAiChatModel,
  getXhClient,
  getXhModel,
  getLocalModelClient,
  getLocalModelName,
  requestInferAiChatJson,
  requestXhChatJson,
  requestLocalModelJson,
} from "../../../llm/index.js";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
} from "./types.js";
