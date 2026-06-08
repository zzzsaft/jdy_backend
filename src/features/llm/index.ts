import { extractProductConfigWithDeepSeek } from "./deepseekExtract";
import { extractProductConfigWithLocalModel } from "./localExtract";
import { getLocalModelName } from "./localModelClient";
import { LlmExtractParams, LlmExtractResult } from "./types";

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

export { extractProductConfigWithDeepSeek } from "./deepseekExtract";
export { extractProductConfigWithLocalModel } from "./localExtract";
export {
  getLocalModelClient,
  getLocalModelName,
  requestLocalModelJson,
} from "./localModelClient";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
} from "./types";
