import type { NormalizedFieldResult } from "../dictionary/dictionary.types.js";
import type { DictionaryExtractionWarning } from "./types.js";

export function createWarning(params: {
  type: string;
  message: string;
  itemIndex?: number;
  fieldName?: string;
  rawValue?: string;
  termType?: string;
  source?: string;
  evidence?: unknown;
}): DictionaryExtractionWarning {
  return {
    type: params.type,
    message: params.message,
    item_index: params.itemIndex,
    field_name: params.fieldName,
    raw_value: params.rawValue,
    term_type: params.termType,
    source: params.source,
    evidence: params.evidence,
  };
}

export function mapDictionaryWarnings(
  result: NormalizedFieldResult,
  itemIndex: number,
): DictionaryExtractionWarning[] {
  return result.warnings.map((warning) =>
    createWarning({
      type: warning.type,
      message: warning.message,
      itemIndex,
      fieldName: result.rawFieldName,
      rawValue: warning.rawValue ?? result.rawValue,
      termType: warning.termType ?? result.termType,
      source: warning.source,
    }),
  );
}
