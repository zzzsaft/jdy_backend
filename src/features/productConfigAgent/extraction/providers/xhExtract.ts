import { getXhClient, requestXhChatJson } from "../../../../llm/xhClient.js";
import {
  parseJsonContent,
  validateLlmExtractionResult,
} from "../validation/parseExtractResult.js";
import type { LlmExtractParams, LlmExtractResult } from "../types.js";
import {
  buildExtractionMessages,
  buildExtractionRetryMessages,
} from "../prompts/extractionPrompts.js";
import { normalizeLlmExtractionShape } from "../twoStage/twoStageExtract.js";

function validateXhExtractionContent(content: string): LlmExtractResult {
  return validateLlmExtractionResult(
    normalizeLlmExtractionShape(parseJsonContent(content)),
  );
}

export async function extractProductConfigWithXh(
  params: LlmExtractParams,
  model?: string,
): Promise<LlmExtractResult> {
  const client = getXhClient();
  const firstContent = await requestXhChatJson({
    client,
    model,
    purpose: "product_config_agent_extract",
    messages: buildExtractionMessages(params),
    input: { params },
    responseFormat: "json_object",
    maxTokens: 200000,
  });

  try {
    return validateXhExtractionContent(firstContent);
  } catch (error) {
    const retryContent = await requestXhChatJson({
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
      maxTokens: 200000,
    });

    try {
      return validateXhExtractionContent(retryContent);
    } catch (retryError) {
      throw new Error(
        `XH extraction validation failed after retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
      );
    }
  }
}
