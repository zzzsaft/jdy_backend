import type { LlmRawField } from "../extraction/types.js";
import type { DictionaryExtractionField } from "./types.js";

export function stringifyOptionalId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value);
}

export function isBlankValue(value: string): boolean {
  return value.trim() === "";
}

export function isUnknownValue(value: string): boolean {
  return ["unknown", "未知", "未识别"].includes(value.trim().toLowerCase());
}

export function isExplicitUnselectedOption(rawField: LlmRawField): boolean {
  if (rawField.selected !== false) {
    return false;
  }

  const evidenceText = isObject(rawField.evidence)
    ? String(rawField.evidence.text ?? "")
    : "";
  const rawText = rawField.raw_text ?? evidenceText;

  return /\[\s*\]|□/.test(rawText) && !/\[SEL\]|■|☑|✔|✓/.test(rawText);
}

export function createBaseField(
  rawField: LlmRawField,
): DictionaryExtractionField {
  return {
    field_name: rawField.field_name,
    raw_value: rawField.value,
    selected: rawField.selected,
    raw_text: rawField.raw_text,
    evidence: rawField.evidence,
    llm_confidence: rawField.confidence,
    dictionary: {
      matched: false,
      field_matched: false,
    },
    warnings: [],
  };
}

export function hasSplitFields(rawField: LlmRawField): boolean {
  return Array.isArray(rawField.split_fields) && rawField.split_fields.length > 0;
}

export function isOriginalRetainedField(rawField: LlmRawField): boolean {
  return (rawField as unknown as { _original?: boolean })._original === true;
}

export function splitFieldToRawField(
  parent: LlmRawField,
  splitField: NonNullable<LlmRawField["split_fields"]>[number],
): LlmRawField {
  return {
    field_name: splitField.field_name,
    value: splitField.value,
    selected: splitField.selected ?? parent.selected,
    raw_text: splitField.raw_text ?? parent.raw_text,
    evidence: splitField.evidence ?? parent.evidence,
    confidence: splitField.confidence ?? parent.confidence,
  };
}

export function manualSplitKey(params: {
  itemIndex: number;
  fieldName: string;
  rawValue: string;
}) {
  return `${params.itemIndex}|${normalizeTextForKey(params.fieldName)}|${normalizeTextForKey(params.rawValue)}`;
}

export function manualSplitValueKey(params: {
  itemIndex: number;
  rawValue: string;
}) {
  return `${params.itemIndex}|${normalizeTextForKey(params.rawValue)}`;
}

function normalizeTextForKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
