import { getInferAiChatClient, requestInferAiChatJson } from "../../../../llm/index.js";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "../validation/parseExtractResult.js";
import type { LlmExtractParams, LlmExtractResult } from "../types.js";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "../prompts/extractionPrompts.js";

export async function extractProductConfigWithInferAiChat(
  params: LlmExtractParams,
  model?: string
): Promise<LlmExtractResult> {
  const client = getInferAiChatClient();
  const firstContent = await requestInferAiChatJson({
    client,
    model,
    purpose: "product_config_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
    responseFormat: "json_object",
    plugins: [{ id: "response-healing" }],
    retryEmptyContent: 1,
    maxTokens: 200000,
    stream: true,
    onStreamProgress: params.onStreamProgress,
  });

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestInferAiChatJson({
      client,
      model,
      purpose: "product_config_agent_extract_retry",
      messages: buildExtractionRetryMessages(params, {
        previousContent: firstContent,
        parseError: error,
      }),
      input: {
        params,
        previousContent: firstContent,
        parseError: String(error),
      },
      responseFormat: "json_object",
      plugins: [{ id: "response-healing" }],
      retryEmptyContent: 1,
      maxTokens: 200000,
      stream: true,
      onStreamProgress: params.onStreamProgress,
    });

    try {
      return validateLlmExtractionResult(parseJsonContent(retryContent));
    } catch (retryError) {
      throw new Error(
        `InferAIChat extraction validation failed after retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`
      );
    }
  }
}
