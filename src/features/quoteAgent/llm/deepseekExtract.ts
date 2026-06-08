import { getDeepSeekClient, requestDeepSeekJson } from "../../../llm";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseExtractResult";
import { DeepSeekExtractParams, DeepSeekExtractResult } from "./types";
import type {
  DictionaryService,
  LlmDictionaryContext,
} from "../dictionary/dictionary.service";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "./prompts";

export async function buildDictionaryContext(
  dictionaryService: DictionaryService
): Promise<LlmDictionaryContext> {
  return dictionaryService.getLlmDictionaryContext();
}

export async function extractProductConfigWithDeepSeek(
  params: DeepSeekExtractParams
): Promise<DeepSeekExtractResult> {
  const client = getDeepSeekClient();
  const firstContent = await requestDeepSeekJson({
    client,
    purpose: "quote_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
  });

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestDeepSeekJson({
      client,
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
        `DeepSeek extraction validation failed after retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`
      );
    }
  }
}

export { DeepSeekExtractParams, DeepSeekExtractResult } from "./types";
