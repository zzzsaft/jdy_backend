import { getDeepSeekClient, requestDeepSeekJson } from "./deepseekClient";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "./parseDeepSeekExtractResult";
import { DeepSeekExtractParams, DeepSeekExtractResult } from "./types";
import type {
  DictionaryService,
  LlmDictionaryContext,
} from "../quoteAgent/dictionary/dictionary.service";

export async function buildDictionaryContext(
  dictionaryService: DictionaryService
): Promise<LlmDictionaryContext> {
  return dictionaryService.getLlmDictionaryContext();
}

export async function extractProductConfigWithDeepSeek(
  params: DeepSeekExtractParams
): Promise<DeepSeekExtractResult> {
  const client = getDeepSeekClient();
  const firstContent = await requestDeepSeekJson(client, params);

  try {
    return validateLlmExtractionResult(parseJsonContent(firstContent));
  } catch (error) {
    const retryContent = await requestDeepSeekJson(client, params, {
      retry: true,
      previousContent: firstContent,
      parseError: error,
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
