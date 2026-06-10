import type { LlmDictionaryContext } from "../quoteAgent/dictionary/dictionary.service.js";

export interface LlmFieldValue {
  value: string;
  evidence?: unknown;
  confidence: number;
}

export interface LlmRawField {
  field_name: string;
  value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  confidence: number;
}

export interface LlmExtractionItem {
  item_index: number;
  item_name?: LlmFieldValue;
  raw_fields: LlmRawField[];
}

export interface LlmExtractionResult {
  extraction: {
    document_info?: Record<string, LlmFieldValue>;
    items: LlmExtractionItem[];
  };
  warnings?: Array<{
    type: string;
    message: string;
    evidence?: unknown;
  }>;
}

export type DeepSeekExtractParams = {
  llmText?: string;
  textBlocks?: unknown;
  dictionaryContext: LlmDictionaryContext;
  fileName?: string;
  sheetName?: string;
};

export type LlmExtractParams = DeepSeekExtractParams;

export type DeepSeekExtractResult = LlmExtractionResult;
export type LlmExtractResult = LlmExtractionResult;
