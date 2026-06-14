import { getLocalModelClient, requestLocalModelJson } from "../../../../llm/index.js";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "../validation/parseExtractResult.js";
import type { LlmExtractParams, LlmExtractResult } from "../types.js";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "../prompts/extractionPrompts.js";

export async function extractProductConfigWithLocalModel(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const client = getLocalModelClient();
  const firstContent = await requestLocalModelJson({
    client,
    model,
    purpose: "product_config_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
  });

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestLocalModelJson({
      client,
      model,
      purpose: "product_config_agent_extract_retry",
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
