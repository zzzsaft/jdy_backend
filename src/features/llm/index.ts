import { extractProductConfigWithDeepSeek } from "./deepseekExtract.js";
import { extractProductConfigWithLocalModel } from "./localExtract.js";
import { getLocalModelName } from "./localModelClient.js";
import type { LlmExtractParams, LlmExtractResult } from "./types.js";

const DEEPSEEK_MODEL_PREFIX = "deepseek";

export type LlmProvider = "deepseek" | "local";

export function resolveLlmProvider(model?: string): LlmProvider {
  const selectedModel = model || getLocalModelName();

  if (selectedModel.toLowerCase().startsWith(DEEPSEEK_MODEL_PREFIX)) {
    return "deepseek";
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

  return extractProductConfigWithLocalModel(params, model);
}

export { extractProductConfigWithDeepSeek } from "./deepseekExtract.js";
export { extractProductConfigWithLocalModel } from "./localExtract.js";
export {
  getLocalModelClient,
  getLocalModelName,
  requestLocalModelJson,
} from "./localModelClient.js";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
} from "./types.js";
