import type { DictionaryValueKind } from "../dictionary/dictionary.types.js";
import type { MaterialPrefixSplitResult } from "../dictionary/dictionary.types.js";
import type { NormalizedNumberUnit } from "../dictionary/numberUnit.js";
import type { LlmExtractionResult } from "../extraction/types.js";
import type { ProductConfigAgentMasterDataMatch } from "../masterData.service.js";

export type DictionaryExtractionQualifierPosition =
  | "upper_die"
  | "lower_die"
  | "pre_pump"
  | "post_pump"
  | "pre_mesh"
  | "post_mesh"
  | "inlet"
  | "c_inlet";

export type DictionaryExtractionQualifierArea =
  | "body"
  | "lip"
  | "connector"
  | "insert_block"
  | "channel"
  | "external_surface"
  | "other"
  | "die_body"
  | "side_plate"
  | "feedblock"
  | "pump"
  | "overall";

export interface DictionaryExtractionQualifier {
  position?: DictionaryExtractionQualifierPosition;
  area?: DictionaryExtractionQualifierArea;
  layer?: string;
  layerIndex?: number;
  instanceIndex?: number;
  sourceText?: string;
}

export interface DictionaryExtractionRoughness {
  raw: string;
  grade?: string;
  bound?: "lt" | "lte" | "gt" | "gte";
  value?: number;
  rangeMin?: number;
  rangeMax?: number;
  unit?: "μm" | "um";
}

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
  profile?: DictionaryExtractionProfile;
}

export interface DictionaryExtractionProfile {
  enabled: true;
  totalMs: number;
  generateDictionaryTotalMs?: number;
  updateExtractionDictionaryMs?: number;
  updateDocumentStatusMs?: number;
  dictionaryCacheWarmMs: number;
  productTypeOptionsMs: number;
  manualSplitLoadMs: number;
  manualSplitDeleteMs: number;
  expandRawFieldMs: number;
  splitResolutionSaveMs: number;
  buildFieldMs: number;
  dictionaryNormalizeMs: number;
  recordOccurrenceMs: number;
  masterDataAttributeMatchMs: number;
  flushAliasUsageStatsMs: number;
  fieldsBuilt: number;
  occurrencesRecorded: number;
  splitResolutionsSaved: number;
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
    masterDataMatch?: ProductConfigAgentMasterDataMatch;
    warnings?: DictionaryExtractionWarning[];
    notes_raw?: DictionaryExtractionNote[];
    fields: Array<{
      field_name: string;
      raw_value: string;
      selected?: boolean;
      raw_text?: string;
      evidence?: unknown;
      confidence?: number;
      source?: string;
      requires_review?: boolean;
      trust_level?: "low" | "medium" | "high";
      qualifier?: DictionaryExtractionQualifier;
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
  masterDataMatch?: ProductConfigAgentMasterDataMatch;
  warnings: DictionaryExtractionWarning[];
  notes_raw?: DictionaryExtractionNote[];
  fields: DictionaryExtractionField[];
}

export interface DictionaryExtractionNote {
  field_name: string;
  raw_value: string;
  raw_text?: string;
  evidence?: unknown;
  item_index?: number;
  document_id?: string;
  extraction_result_id?: string;
}

export interface DictionaryExtractionField {
  field_name: string;
  raw_value: string;
  selected?: boolean;
  raw_text?: string;
  evidence?: unknown;
  llm_confidence?: number;
  source?: string;
  requires_review?: boolean;
  trust_level?: "low" | "medium" | "high";
  qualifier?: DictionaryExtractionQualifier;
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
    number_unit?: NormalizedNumberUnit;
    material_prefix_split?: MaterialPrefixSplitResult;
    roughness?: DictionaryExtractionRoughness;
  };
  candidate?: {
    candidate_type: "term_type" | "value" | "unit";
    candidate_id?: string;
    term_type?: string;
    raw_field_name?: string;
    raw_value?: string;
    raw_unit?: string;
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
