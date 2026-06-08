import { getLocalModelClient, requestLocalModelJson } from "../../../llm";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseExtractResult";
import { LlmExtractParams, LlmExtractResult } from "./types";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "./prompts";

export async function extractProductConfigWithLocalModel(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const client = getLocalModelClient();
  const firstContent = await requestLocalModelJson({
    client,
    model,
    purpose: "quote_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
  });

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestLocalModelJson({
      client,
      model,
      purpose: "quote_agent_extract_retry",
      messages: buildExtractionRetryMessages(params, {
        previousContent: firstContent,
        parseError: error,
      }),
      input: { params, previousContent: firstContent, parseError: String(error) },
    });

    try {
      return validateLlmExtractionResult(parseJsonContent(retryContent));
    } catch (retryError) {
      throw new Error(
        `Local LLM extraction validation failed after retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
      );
    }
  }
}
