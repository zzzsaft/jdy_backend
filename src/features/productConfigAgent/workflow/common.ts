import type { ProductConfigAgentRepository } from "../db.service.js";

export const DEFAULT_PARSER_VERSION = "v2";
export const DEFAULT_PROMPT_VERSION = "v2";
export const DEFAULT_DICTIONARY_VERSION = 1;
export const DEFAULT_LLM_MODEL = "gemma4:12b";
export const DEFAULT_PENDING_LLM_BATCH_LIMIT = 500;
export const DEFAULT_PENDING_LLM_CONCURRENCY = 3;
export const TWO_STAGE_PROMPT_VERSION = "v3-plan-item-20260616";

export function safeJsonByteLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return -1;
  }
}

export function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

export async function markFailed(
  repository: ProductConfigAgentRepository,
  documentId: number | undefined,
) {
  if (!documentId) return;
  try {
    await repository.updateDocumentStatus(documentId, "failed");
  } catch {
    return;
  }
}

export function wrapStageError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix} ${message}`);
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function updateDocumentStatus(
  repository: ProductConfigAgentRepository,
  document: any,
  status: string,
) {
  await repository.updateDocumentStatus(document.id, status);
  document.status = status;
}

export function getFirstSheetName(blocksJson: any) {
  const blocks = blocksJson?.blocks || [];
  return blocks.find((block: any) => block?.source?.sheet_name)?.source
    ?.sheet_name;
}
