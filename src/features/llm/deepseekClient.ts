import OpenAI from "openai";
import {
  buildExtractionPrompt,
  DEEPSEEK_EXTRACT_RETRY_PROMPT,
  DEEPSEEK_EXTRACT_SYSTEM_PROMPT,
} from "./prompts.js";
import type { DeepSeekExtractParams } from "./types.js";
import { finishLlmCallLog, startLlmCallLog } from "./llmCallLogger.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 8000;

type RequestDeepSeekJsonOptions = {
  retry?: boolean;
  previousContent?: string;
  parseError?: unknown;
};

export function getDeepSeekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  });
}

function buildSystemPrompt(isRetry: boolean): string {
  if (!isRetry) {
    return DEEPSEEK_EXTRACT_SYSTEM_PROMPT;
  }

  return `${DEEPSEEK_EXTRACT_SYSTEM_PROMPT}\n\n${DEEPSEEK_EXTRACT_RETRY_PROMPT}`;
}

function buildUserContent(
  params: DeepSeekExtractParams,
  options?: RequestDeepSeekJsonOptions
): string {
  const userContent = buildExtractionPrompt(params);

  if (!options?.retry) {
    return userContent;
  }

  return `${userContent}

上一次模型输出如下，请修正为合法 JSON：
${options.previousContent ?? ""}

JSON.parse 错误：${String(options.parseError)}`;
}

export async function requestDeepSeekJson(
  client: OpenAI,
  params: DeepSeekExtractParams,
  options?: RequestDeepSeekJsonOptions
): Promise<string> {
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  const messages = [
    {
      role: "system" as const,
      content: buildSystemPrompt(Boolean(options?.retry)),
    },
    {
      role: "user" as const,
      content: buildUserContent(params, options),
    },
  ];
  const log = await startLlmCallLog({
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    purpose: options?.retry ? "product_config_agent_extract_retry" : "product_config_agent_extract",
    input: {
      params,
      options,
      messages,
    },
  });

  try {
    completion = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      temperature: 0,
      max_tokens: DEFAULT_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages,
    });
  } catch (error) {
    await finishLlmCallLog(log, { error });
    throw new Error(
      `DeepSeek API call failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    await finishLlmCallLog(log, { output: completion, error: "empty content" });
    throw new Error("DeepSeek returned empty content");
  }

  await finishLlmCallLog(log, { output: completion });
  return content;
}
