import type {
  DictionaryCandidate,
  DictionaryTermTypeCandidate,
} from "./entity";

export type DictionaryValueKind =
  | "enum"
  | "enums"
  | "number"
  | "number_unit"
  | "text"
  | "boolean"
  | "date"
  | "number_or_boolean";

export interface CachedValueAlias {
  termType: string;
  termId: string;
  aliasId: string;
  canonicalValue: string;
  displayName?: string;
  confidence: number;
  riskLevel: string;
  note: string | null;
}

export interface CachedTermType {
  termType: string;
  displayName: string;
  quoteDisplayName: string | null;
  category: string | null;
  sortOrder: number;
  valueKind: DictionaryValueKind;
  applicableProductTypes: string[];
}

export interface LlmDictionaryContext {
  term_types: Array<{
    term_type: string;
    display_name: string;
    quote_display_name?: string | null;
    category?: string | null;
    value_kind: DictionaryValueKind;
    applicable_product_types: string[];
    aliases: string[];
  }>;
}

export interface TermTypeMatchResult {
  matched: boolean;
  rawFieldName: string;
  normalizedFieldName: string;
  termTypes: string[];
  crossProductTermTypes?: string[];
  matchMethod: "alias_exact" | "none";
  itemProductTypeHint?: string;
  crossProductFallback?: boolean;
}

export interface ValueMatchResult {
  matched: boolean;
  termType: string;
  rawValue: string;
  normalizedValue: string;
  canonicalValue?: string;
  displayName?: string;
  termId?: string;
  aliasId?: string;
  confidence?: number;
  riskLevel?: string;
  note?: string | null;
  valueKind?: DictionaryValueKind;
  matchMethod: "alias_exact" | "term_type_only" | "none";
}

export interface NormalizedEnumValue {
  termId?: string | number;
  canonicalValue: string;
  displayName: string;
  rawValue: string;
  confidence: number;
  aliasId?: string | number;
  evidence?: unknown;
}

export interface NormalizedFieldResult {
  matched: boolean;
  fieldMatched: boolean;
  rawFieldName: string;
  normalizedFieldName: string;
  rawValue: string;
  normalizedValue: string;
  termType?: string;
  candidateTermTypes?: string[];
  canonicalValue?: string;
  displayName?: string;
  confidence?: number;
  riskLevel?: string;
  note?: string | null;
  valueKind?: DictionaryValueKind;
  values?: NormalizedEnumValue[];
  matchMethod?: "alias_exact" | "term_type_only" | "none";
  itemIndex?: number;
  itemProductTypeHint?: string;
  crossProductFallback?: boolean;
  valueCandidate?: DictionaryCandidate;
  termTypeCandidate?: DictionaryTermTypeCandidate;
  warnings: Array<{
    type: string;
    message: string;
    rawValue?: string;
    termType?: string;
  }>;
}

export interface CreateValueCandidateParams {
  documentId?: string;
  extractionResultId?: string;
  itemIndex?: number;
  sourceProductType?: string;
  sourceRawValue?: string;
  splitFromRawValue?: string;
  splitTokenIndex?: number;
  termType: string;
  termTypeDisplayName?: string;
  valueKind?: string;
  rawValue: string;
  reason?: string;
  evidence?: unknown;
  confidence?: number;
}

export interface CreateTermTypeCandidateParams {
  documentId?: string;
  extractionResultId?: string;
  itemIndex?: number;
  sourceProductType?: string;
  rawFieldName: string;
  rawValue?: string;
  proposedTermType?: string;
  reason?: string;
  evidence?: unknown;
  confidence?: number;
}

export interface NormalizeFieldParams {
  documentId?: string;
  extractionResultId?: string;
  itemIndex?: number;
  itemProductTypeHint?: string;
  fieldName: string;
  rawValue: string;
  splitRawValues?: string[];
  evidence?: unknown;
}

export interface MultiValueToken {
  value: string;
  rawText: string;
  source: "split_field" | "delimiter" | "raw_field";
  confidence: number;
}
