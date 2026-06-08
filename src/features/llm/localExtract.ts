import { getLocalModelClient, requestLocalModelJson } from "./localModelClient";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseDeepSeekExtractResult";
import { LlmExtractParams, LlmExtractResult } from "./types";

export async function extractProductConfigWithLocalModel(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const client = getLocalModelClient();
  const firstContent = await requestLocalModelJson(client, params, model);

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestLocalModelJson(client, params, model, {
      retry: true,
      previousContent: firstContent,
      parseError: error,
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
