import type { DictionaryValueKind } from "../dictionary/dictionary.types.js";
import type { LlmExtractionResult } from "../extraction/types.js";
import type { ProductConfigAgentMasterDataMatch } from "../masterData.service.js";

export interface DictionaryExtractionResult {
  summary: {
    item_count: number;
    raw_field_count: number;
    rewritten_field_count: number;
    split_resolution_count: number;
    dictionary_matched_count: number;
    value_candidate_count: number;
    term_type_candidate_count: number;
    warning_count: number;
  };
  document_info?: unknown;
  items: DictionaryExtractionItem[];
  warnings: DictionaryExtractionWarning[];
  raw_llm_result: LlmExtractionResult;
  extraction_json: NormalizedExtractionJson;
}

export interface NormalizedExtractionJson {
  document_info?: unknown;
  items: Array<{
    item_index: number;
    item_name?: string;
    item_quantity?: string;
    itemProductTypeHint: string;
    itemProductTypeHintRawValue?: string;
    itemProductTypeHintDisplayName?: string;
    itemProductTypeHintConfidence?: number;
    warnings?: DictionaryExtractionWarning[];
    fields: Array<{
      field_name: string;
      raw_value: string;
      selected?: boolean;
      raw_text?: string;
      evidence?: unknown;
      confidence?: number;
      dictionary: DictionaryExtractionField["dictionary"];
      candidate?: DictionaryExtractionField["candidate"];
      warnings?: DictionaryExtractionWarning[];
      original?: boolean;
    }>;
  }>;
  warnings: DictionaryExtractionWarning[];
  summary: DictionaryExtractionResult["summary"];
}

export interface DictionaryExtractionItem {
  item_index: number;
  item_name?: string;
  item_quantity?: string;
  itemProductTypeHint: string;
  itemProductTypeHintRawValue?: string;
  itemProductTypeHintDisplayName?: string;
  itemProductTypeHintConfidence?: number;
  warnings: DictionaryExtractionWarning[];
  fields: DictionaryExtractionField[];
}

export interface DictionaryExtractionField {
  field_name: string;
  raw_value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  llm_confidence?: number;
  dictionary: {
    matched: boolean;
    field_matched: boolean;
    normalized_field_name?: string;
    normalized_value?: string;
    term_type?: string;
    candidate_term_types?: string[];
    canonical_value?: string;
    display_name?: string;
    confidence?: number;
    risk_level?: string;
    note?: string | null;
    value_kind?: DictionaryValueKind;
    match_method?: string;
    values?: Array<{
      canonicalValue: string;
      displayName: string;
      rawValue: string;
      confidence: number;
    }>;
    masterDataMatch?: ProductConfigAgentMasterDataMatch;
  };
  candidate?: {
    candidate_type: "term_type" | "value";
    candidate_id?: string;
    term_type?: string;
    raw_field_name?: string;
    raw_value?: string;
    source_product_type?: string;
    item_index?: number;
    status?: string;
  };
  warnings: DictionaryExtractionWarning[];
}

export interface DictionaryExtractionWarning {
  type: string;
  message: string;
  item_index?: number;
  field_name?: string;
  raw_value?: string;
  term_type?: string;
  source?: string;
  evidence?: unknown;
}
