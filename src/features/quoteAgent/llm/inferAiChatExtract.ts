import { getInferAiChatClient, requestInferAiChatJson } from "../../../llm";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseExtractResult";
import { LlmExtractParams, LlmExtractResult } from "./types";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "./prompts";

export async function extractProductConfigWithInferAiChat(
  params: LlmExtractParams,
  model?: string
): Promise<LlmExtractResult> {
  const client = getInferAiChatClient();
  const firstContent = await requestInferAiChatJson({
    client,
    model,
    purpose: "quote_agent_extract",
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
      purpose: "quote_agent_extract_retry",
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
