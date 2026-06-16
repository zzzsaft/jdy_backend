import type { DictionaryExtractionField } from "../types.js";
import { createWarning } from "../warnings.js";

const NUMBER_UNIT_PART_PATTERN =
  /^(\u8f6c\u901f|\u6392\u91cf|\u4ea7\u91cf)(\u6570\u503c|\u5355\u4f4d)$/u;
const PREFIX_NUMBER_UNIT_PART_PATTERN =
  /^(\u6570\u503c|\u5355\u4f4d)(\u8f6c\u901f|\u6392\u91cf|\u4ea7\u91cf)$/u;

export function parseNumberUnitPartFieldName(
  fieldName: string,
): { baseFieldName: string; part: "value" | "unit" } | null {
  const compact = String(fieldName ?? "").replace(/\s+/g, "");
  const match = compact.match(NUMBER_UNIT_PART_PATTERN);
  if (match) {
    return {
      baseFieldName: match[1],
      part: match[2] === "\u6570\u503c" ? "value" : "unit",
    };
  }

  const prefixMatch = compact.match(PREFIX_NUMBER_UNIT_PART_PATTERN);
  if (!prefixMatch) {
    return null;
  }

  return {
    baseFieldName: prefixMatch[2],
    part: prefixMatch[1] === "\u6570\u503c" ? "value" : "unit",
  };
}

export function mergeNumberUnitPartFields(
  fields: DictionaryExtractionField[],
  itemIndex: number,
): DictionaryExtractionField[] {
  const usedIndexes = new Set<number>();
  const mergedFields: DictionaryExtractionField[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const field = fields[index];
    const part = parseNumberUnitPartFieldName(field.field_name);
    const termType = field.dictionary.term_type;
    if (!part || !termType) {
      mergedFields.push(field);
      continue;
    }

    const pairIndex = fields.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || usedIndexes.has(candidateIndex)) {
        return false;
      }
      const candidatePart = parseNumberUnitPartFieldName(candidate.field_name);
      return (
        candidatePart &&
        candidatePart.baseFieldName === part.baseFieldName &&
        candidatePart.part !== part.part &&
        candidate.dictionary.term_type === termType
      );
    });
    if (pairIndex < 0) {
      mergedFields.push(field);
      continue;
    }

    const pair = fields[pairIndex];
    const valueField = part.part === "value" ? field : pair;
    const unitField = part.part === "unit" ? field : pair;
    const mergedRawValue = mergeNumberAndUnitText(
      valueField.raw_value,
      unitField.raw_value,
    );
    const mergedWarning = createWarning({
      type: "number_unit_part_fields_merged",
      message:
        "\u6570\u503c/\u5355\u4f4d\u5b57\u6bb5\u5df2\u5408\u5e76\u4e3a\u540c\u4e00 number_unit \u5b57\u6bb5",
      itemIndex,
      fieldName: part.baseFieldName,
      rawValue: mergedRawValue,
      evidence: {
        valueFieldName: valueField.field_name,
        valueRawValue: valueField.raw_value,
        unitFieldName: unitField.field_name,
        unitRawValue: unitField.raw_value,
      },
    });

    mergedFields.push({
      ...valueField,
      field_name: part.baseFieldName,
      raw_value: mergedRawValue,
      raw_text: [valueField.raw_text, unitField.raw_text].filter(Boolean).join("\n"),
      dictionary: {
        ...valueField.dictionary,
        normalized_field_name: part.baseFieldName,
        normalized_value: mergedRawValue,
        number_unit: valueField.dictionary.number_unit
          ? {
              ...valueField.dictionary.number_unit,
              rawValue: mergedRawValue,
              normalizedValue: mergedRawValue,
              warnings: [],
            }
          : undefined,
      },
      candidate: undefined,
      warnings: [
        ...filterPartialNumberUnitWarnings(valueField.warnings),
        ...filterPartialNumberUnitWarnings(unitField.warnings),
        mergedWarning,
      ],
    });
    usedIndexes.add(index);
    usedIndexes.add(pairIndex);
  }

  return mergedFields;
}

function filterPartialNumberUnitWarnings<T extends { type: string }>(
  warnings: T[],
): T[] {
  return warnings.filter(
    (warning) =>
      warning.type !== "unit_missing" &&
      warning.type !== "number_unit_parse_failed",
  );
}

function mergeNumberAndUnitText(rawValue: string, rawUnit: string): string {
  const value = String(rawValue ?? "").trim();
  const unit = String(rawUnit ?? "").trim();
  if (!value) return unit;
  if (!unit) return value;
  if (unit.startsWith("\u6bcf")) {
    return `${value}/${unit}`;
  }
  if (/^[\u4e00-\u9fff]/u.test(unit)) {
    return `${value}${unit}`;
  }
  return `${value} ${unit}`;
}
