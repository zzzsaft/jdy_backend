import type {
  LlmExtractionItem,
  LlmExtractionResult,
} from "../extraction/types.js";

export function coerceLlmExtractionResult(value: unknown): LlmExtractionResult {
  if (!isObject(value) || !isObject(value.extraction)) {
    throw new Error("LLM extraction result must contain extraction object");
  }

  if (!Array.isArray(value.extraction.items)) {
    throw new Error("LLM extraction result must contain extraction.items array");
  }

  return {
    extraction: {
      document_info: isObject(value.extraction.document_info)
        ? (value.extraction
            .document_info as LlmExtractionResult["extraction"]["document_info"])
        : undefined,
      items: value.extraction.items as LlmExtractionItem[],
    },
    warnings: Array.isArray(value.warnings)
      ? (value.warnings as LlmExtractionResult["warnings"])
      : [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
