import type { LlmDictionaryContext } from "../dictionary/dictionary.service";

export interface LlmFieldValue {
  value: string;
  evidence?: unknown;
  confidence: number;
}

export interface LlmProductTypeHint {
  value: string;
  raw_value?: string;
  display_name?: string;
  evidence?: unknown;
  confidence?: number;
}

export interface LlmRawField {
  field_name: string;
  value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  confidence: number;
  split_fields?: LlmSplitField[];
}

export interface LlmSplitField {
  field_name: string;
  value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  confidence?: number;
  reason?: string;
}

export interface LlmExtractionItem {
  item_index: number;
  item_name?: LlmFieldValue;
  item_quantity?: LlmFieldValue;
  item_type_hint?: LlmProductTypeHint;
  product_type_hint?: LlmProductTypeHint;
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
  llmPlanJson?: unknown;
}

export type DeepSeekExtractParams = {
  llmText?: string;
  textBlocks?: unknown;
  dictionaryContext: LlmDictionaryContext;
  fileName?: string;
  sheetName?: string;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
};

export type LlmExtractParams = DeepSeekExtractParams;

export type DeepSeekExtractResult = LlmExtractionResult;
export type LlmExtractResult = LlmExtractionResult;
