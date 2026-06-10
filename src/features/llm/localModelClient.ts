import OpenAI from "openai";
import {
  buildExtractionPrompt,
  DEEPSEEK_EXTRACT_RETRY_PROMPT,
  DEEPSEEK_EXTRACT_SYSTEM_PROMPT,
} from "./prompts.js";
import type { LlmExtractParams } from "./types.js";
import { finishLlmCallLog, startLlmCallLog } from "./llmCallLogger.js";

const DEFAULT_LOCAL_LLM_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_LOCAL_LLM_MODEL = "gemma4:12b";
const DEFAULT_MAX_TOKENS = 8000;

type RequestLocalModelJsonOptions = {
  retry?: boolean;
  previousContent?: string;
  parseError?: unknown;
};

export function getLocalModelClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LOCAL_LLM_API_KEY || "ollama",
    baseURL: process.env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_LLM_BASE_URL,
  });
}

export function getLocalModelName(model?: string): string {
  return model || process.env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_LLM_MODEL;
}

function buildSystemPrompt(isRetry: boolean): string {
  if (!isRetry) {
    return DEEPSEEK_EXTRACT_SYSTEM_PROMPT;
  }

  return `${DEEPSEEK_EXTRACT_SYSTEM_PROMPT}\n\n${DEEPSEEK_EXTRACT_RETRY_PROMPT}`;
}

function buildUserContent(
  params: LlmExtractParams,
  options?: RequestLocalModelJsonOptions,
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

export async function requestLocalModelJson(
  client: OpenAI,
  params: LlmExtractParams,
  model?: string,
  options?: RequestLocalModelJsonOptions,
): Promise<string> {
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  const localModel = getLocalModelName(model);
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
    provider: "local",
    model: localModel,
    purpose: options?.retry ? "quote_agent_extract_retry" : "quote_agent_extract",
    input: {
      params,
      options,
      messages,
    },
  });

  try {
    completion = await client.chat.completions.create({
      model: localModel,
      temperature: 0,
      max_tokens: DEFAULT_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages,
    });
  } catch (error) {
    await finishLlmCallLog(log, { error });
    throw new Error(
      `Local LLM API call failed (${localModel}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    await finishLlmCallLog(log, { output: completion, error: "empty content" });
    throw new Error(`Local LLM returned empty content (${localModel})`);
  }

  await finishLlmCallLog(log, { output: completion });
  return content;
}
