import { getXhClient, requestXhChatJson } from "../../../llm/xhClient";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseExtractResult";
import { LlmExtractParams, LlmExtractResult } from "./types";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "./prompts";

export async function extractProductConfigWithXh(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const client = getXhClient();
  const firstContent = await requestXhChatJson({
    client,
    model,
    purpose: "quote_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
    responseFormat: "json_object",
    maxTokens: 200000,
  });

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestXhChatJson({
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
      maxTokens: 200000,
    });

    try {
      return validateLlmExtractionResult(parseJsonContent(retryContent));
    } catch (retryError) {
      throw new Error(
        `XH extraction validation failed after retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
      );
    }
  }
}
