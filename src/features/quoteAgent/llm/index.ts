import { extractProductConfigWithDeepSeek } from "./deepseekExtract";
import { extractProductConfigWithInferAiChat } from "./inferAiChatExtract";
import { extractProductConfigWithLocalModel } from "./localExtract";
import { getLocalModelName } from "../../../llm";
import { LlmExtractParams, LlmExtractResult } from "./types";

const DEEPSEEK_MODEL_PREFIX = "deepseek";
const INFERAI_MODEL_PREFIXES = ["inferai", "inferaichat"];

export type LlmProvider = "deepseek" | "inferaichat" | "local";

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

  return extractProductConfigWithLocalModel(params, model);
}

export { extractProductConfigWithDeepSeek } from "./deepseekExtract";
export { extractProductConfigWithInferAiChat } from "./inferAiChatExtract";
export { extractProductConfigWithLocalModel } from "./localExtract";
export {
  getInferAiChatClient,
  getInferAiChatModel,
  getLocalModelClient,
  getLocalModelName,
  requestInferAiChatJson,
  requestLocalModelJson,
} from "../../../llm";
export type {
  DeepSeekExtractParams,
  DeepSeekExtractResult,
  LlmExtractParams,
  LlmExtractResult,
} from "./types";
