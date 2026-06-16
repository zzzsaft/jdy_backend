import type { DictionaryExtractionField } from "../types.js";
import { createWarning } from "../warnings.js";

const RANGE_BOUND_FIELD_PATTERN =
  /^(\u4ea7\u91cf|\u8f6c\u901f)(\u6700\u5c0f\u503c|\u6700\u5927\u503c|\u6700\u5c0f|\u6700\u5927)$/u;
const PREFIX_RANGE_BOUND_FIELD_PATTERN =
  /^(\u6700\u5c0f\u503c|\u6700\u5927\u503c|\u6700\u5c0f|\u6700\u5927)(\u4ea7\u91cf|\u8f6c\u901f)$/u;

export function mergeRangeBoundFields(
  fields: DictionaryExtractionField[],
  itemIndex: number,
): DictionaryExtractionField[] {
  const usedIndexes = new Set<number>();
  const mergedFields: DictionaryExtractionField[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const field = fields[index];
    const bound = parseRangeBoundFieldName(field.field_name);
    const termType = field.dictionary.term_type;
    if (!bound || !termType) {
      mergedFields.push(field);
      continue;
    }

    const pairIndex = fields.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || usedIndexes.has(candidateIndex)) {
        return false;
      }
      const candidateBound = parseRangeBoundFieldName(candidate.field_name);
      return (
        candidateBound &&
        candidateBound.baseFieldName === bound.baseFieldName &&
        candidateBound.bound !== bound.bound &&
        candidate.dictionary.term_type === termType
      );
    });
    if (pairIndex < 0) {
      mergedFields.push(field);
      continue;
    }

    const pair = fields[pairIndex];
    const minField = bound.bound === "min" ? field : pair;
    const maxField = bound.bound === "max" ? field : pair;
    const mergedRawValue = `${minField.raw_value} - ${maxField.raw_value}`;
    const mergedWarning = createWarning({
      type: "range_bound_fields_merged",
      message:
        "\u6700\u5927\u503c/\u6700\u5c0f\u503c\u5b57\u6bb5\u5df2\u5408\u5e76\u4e3a\u540c\u4e00\u8303\u56f4\u5b57\u6bb5",
      itemIndex,
      fieldName: bound.baseFieldName,
      rawValue: mergedRawValue,
      evidence: {
        minFieldName: minField.field_name,
        minRawValue: minField.raw_value,
        maxFieldName: maxField.field_name,
        maxRawValue: maxField.raw_value,
      },
    });
    mergedFields.push({
      ...minField,
      field_name: bound.baseFieldName,
      raw_value: mergedRawValue,
      raw_text: [minField.raw_text, maxField.raw_text].filter(Boolean).join("\n"),
      dictionary: {
        ...minField.dictionary,
        normalized_field_name: bound.baseFieldName,
        normalized_value: mergedRawValue,
        number_unit: minField.dictionary.number_unit
          ? {
              ...minField.dictionary.number_unit,
              rawValue: mergedRawValue,
              normalizedValue: mergedRawValue,
              numberKind: "range",
              rangeStart: String(minField.raw_value),
              rangeEnd: String(maxField.raw_value),
            }
          : undefined,
      },
      candidate: undefined,
      warnings: [...minField.warnings, ...pair.warnings, mergedWarning],
    });
    usedIndexes.add(index);
    usedIndexes.add(pairIndex);
  }
  return mergedFields;
}

export function parseRangeBoundFieldName(
  fieldName: string,
): { baseFieldName: string; bound: "min" | "max" } | null {
  const compact = String(fieldName ?? "").replace(/\s+/g, "");
  const match = compact.match(RANGE_BOUND_FIELD_PATTERN);
  if (match) {
    return {
      baseFieldName: match[1],
      bound: match[2].includes("\u5c0f") ? "min" : "max",
    };
  }

  const prefixMatch = compact.match(PREFIX_RANGE_BOUND_FIELD_PATTERN);
  if (!prefixMatch) {
    return null;
  }

  return {
    baseFieldName: prefixMatch[2],
    bound: prefixMatch[1].includes("\u5c0f") ? "min" : "max",
  };
}
